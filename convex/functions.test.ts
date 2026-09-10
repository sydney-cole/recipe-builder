import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.test).ts");

async function createUser(
  t: ReturnType<typeof convexTest>,
  name: string,
  options: { email?: string; verified?: boolean } = {},
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      name,
      email: options.email ?? `${name.toLowerCase()}@example.com`,
      emailVerificationTime: options.verified ? Date.now() : undefined,
      createdAt: Date.now(),
    }),
  );
}

async function createRecipe(
  t: ReturnType<typeof convexTest>,
  title: string,
  options: { isPublic?: boolean; requestedBy?: Id<"users"> } = {},
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const importId = await ctx.db.insert("recipeImports", {
      requestedBy: options.requestedBy,
      sourceUrl: `https://example.com/${title}`,
      normalizedUrl: `https://example.com/${title}`,
      status: "completed",
      attemptCount: 1,
      createdAt: now,
      updatedAt: now,
    });
    const recipeId = await ctx.db.insert("recipes", {
      importId,
      sourceUrl: `https://example.com/${title}`,
      normalizedSourceUrl: `https://example.com/${title}`,
      isPublic: options.isPublic,
      title,
      cuisines: [],
      categories: [],
      keywords: [],
      instructions: [],
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(importId, { recipeId });
    return recipeId;
  });
}

describe("email functions", () => {
  it("requires authentication and deduplicates normalized URL submissions", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.email.queueUrl, { sourceUrl: "https://example.com/recipe" }),
    ).rejects.toThrow(/Unauthenticated/);

    const userId = await createUser(t, "Ada");
    const asAda = t.withIdentity({ subject: userId });
    const first = await asAda.mutation(api.email.queueUrl, {
      sourceUrl: "https://EXAMPLE.com/recipe?utm_source=email&b=2&a=1#steps",
    });
    const second = await asAda.mutation(api.email.queueUrl, {
      sourceUrl: "https://example.com/recipe?a=1&b=2",
    });

    expect(second).toBe(first);
    const imports = await asAda.query(api.email.recentImports);
    expect(imports).toHaveLength(1);
    expect(imports[0].normalizedUrl).toBe("https://example.com/recipe?a=1&b=2");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
  });

  it("routes only new links from the shared inbox and a verified sender", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const previousInboxId = process.env.AGENTMAIL_INBOX_ID;
    process.env.AGENTMAIL_INBOX_ID = "inbox-1";
    await createUser(t, "Lin", { verified: true });

    const first = await t.mutation(internal.email.onMessageReceived, {
      eventId: "event-1",
      thread: {},
      message: {
        inbox_id: "inbox-1",
        from: "Lin <LIN@example.com>",
        message_id: "message-1",
        subject: "Two links",
        text: "https://example.com/dinner?utm_source=email https://example.com/dinner",
      },
    });
    expect(first).toEqual({ queued: 1, disposition: "queued" });

    const repeatedUrl = await t.mutation(internal.email.onMessageReceived, {
      eventId: "event-2",
      thread: {},
      message: {
        inbox_id: "inbox-1",
        from: "lin@example.com",
        text: "https://example.com/dinner",
      },
    });
    expect(repeatedUrl).toEqual({ queued: 0, disposition: "duplicate" });

    const unknownInbox = await t.mutation(internal.email.onMessageReceived, {
      eventId: "event-3",
      thread: {},
      message: {
        inbox_id: "unknown",
        from: "lin@example.com",
        text: "https://example.com/other",
      },
    });
    expect(unknownInbox).toEqual({ queued: 0, disposition: "wrong_inbox" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
    process.env.AGENTMAIL_INBOX_ID = previousInboxId;
  });

  it("does not assign unknown, unverified, or ambiguous senders", async () => {
    const t = convexTest(schema, modules);
    const previousInboxId = process.env.AGENTMAIL_INBOX_ID;
    process.env.AGENTMAIL_INBOX_ID = "site-inbox";
    await createUser(t, "Unverified", {
      email: "unverified@example.com",
    });
    await createUser(t, "Duplicate A", {
      email: "duplicate@example.com",
      verified: true,
    });
    await createUser(t, "Duplicate B", {
      email: "duplicate@example.com",
      verified: true,
    });

    for (const [eventId, from] of [
      ["unknown-event", "unknown@example.com"],
      ["unverified-event", "unverified@example.com"],
      ["ambiguous-event", "duplicate@example.com"],
    ]) {
      expect(
        await t.mutation(internal.email.onMessageReceived, {
          eventId,
          thread: {},
          message: {
            inbox_id: "site-inbox",
            from,
            text: "https://example.com/recipe",
          },
        }),
      ).toEqual({ queued: 0, disposition: "unknown_sender" });
    }

    const imports = await t.run(async (ctx) =>
      ctx.db.query("recipeImports").collect(),
    );
    expect(imports).toHaveLength(0);
    process.env.AGENTMAIL_INBOX_ID = previousInboxId;
  });
});

describe("import lifecycle", () => {
  it("claims one attempt and ignores stale completion writes", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t, "Owner", { verified: true });
    const importId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("recipeImports", {
        requestedBy: userId,
        sourceUrl: "https://example.com/soup",
        normalizedUrl: "https://example.com/soup",
        status: "queued",
        attemptCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    });

    expect(await t.mutation(internal.imports.claim, { importId })).toEqual({
      attempt: 1,
      sourceUrl: "https://example.com/soup",
    });
    expect(await t.mutation(internal.imports.claim, { importId })).toBeNull();
    expect(
      await t.mutation(internal.imports.beginGeneration, {
        importId,
        attempt: 0,
      }),
    ).toBe(false);
    expect(
      await t.mutation(internal.imports.beginGeneration, {
        importId,
        attempt: 1,
      }),
    ).toBe(true);
    expect(
      await t.mutation(internal.imports.fail, {
        importId,
        attempt: 0,
        category: "provider_temporary",
      }),
    ).toBe(false);

    const recipeImport = await t.run(async (ctx) => ctx.db.get(importId));
    expect(recipeImport).toMatchObject({
      status: "scraping",
      processingStage: "generating",
      attemptCount: 1,
    });
  });

  it("persists one bounded draft and exposes it only to its owner", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await createUser(t, "Draft Owner", { verified: true });
    const otherId = await createUser(t, "Other", { verified: true });
    const importId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("recipeImports", {
        requestedBy: ownerId,
        sourceUrl: "https://example.com/stew",
        normalizedUrl: "https://example.com/stew",
        status: "scraping",
        processingStage: "generating",
        attemptCount: 2,
        createdAt: now,
        updatedAt: now,
      });
    });
    const saved = await t.mutation(internal.imports.completeGeneration, {
      importId,
      attempt: 2,
      sourceTitle: "Stew",
      sourceSite: "Example",
      draft: {
        title: "Stew",
        ingredients: [{ originalText: "1 onion", name: "onion" }],
        instructions: [{ text: "Cook it." }],
      },
      provenance: {
        modelId: "configured-model",
        promptVersion: "recipe-import-v1",
        schemaVersion: "recipe-draft-v1",
        providerRequestId: "resp_safe",
        generatedAt: Date.now(),
      },
    });
    expect(saved).toBe(true);

    const asOwner = t.withIdentity({ subject: ownerId });
    const asOther = t.withIdentity({ subject: otherId });
    expect(await asOwner.query(api.imports.review, { importId })).toMatchObject({
      recipeImport: { status: "parsed" },
      draft: { title: "Stew", modelId: "configured-model" },
    });
    expect(await asOther.query(api.imports.review, { importId })).toBeNull();
    await expect(t.query(api.imports.review, { importId })).rejects.toThrow(
      /Unauthenticated/,
    );
  });

  it("allows exactly one eligible retry and exposes safe lifecycle fields", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const ownerId = await createUser(t, "Retry Owner", { verified: true });
    const otherId = await createUser(t, "Retry Other", { verified: true });
    const importId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("recipeImports", {
        requestedBy: ownerId,
        sourceUrl: "https://example.com/retry",
        normalizedUrl: "https://example.com/retry",
        status: "failed",
        attemptCount: 1,
        errorCategory: "rate_limited",
        errorMessage: "Recipe processing is busy. Please try again shortly.",
        errorRetryable: true,
        createdAt: now,
        updatedAt: now,
      });
    });
    const asOwner = t.withIdentity({ subject: ownerId });
    const asOther = t.withIdentity({ subject: otherId });
    await expect(
      asOther.mutation(api.imports.retry, { importId }),
    ).rejects.toThrow(/not found/i);
    expect(await asOwner.mutation(api.imports.retry, { importId })).toBe(importId);
    await expect(asOwner.mutation(api.imports.retry, { importId })).rejects.toThrow(
      /cannot be retried/i,
    );
    const imports = await asOwner.query(api.email.recentImports);
    expect(imports).toMatchObject([{ status: "queued" }]);
    expect(imports[0]).not.toHaveProperty("errorMessage");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
  });

  it("denies terminal retries and returns every safe lifecycle stage reactively", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await createUser(t, "Lifecycle Owner", { verified: true });
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const rows = [
        { status: "queued" as const },
        { status: "scraping" as const, processingStage: "retrieving" as const },
        { status: "scraping" as const, processingStage: "generating" as const },
        { status: "parsed" as const },
        { status: "completed" as const },
        {
          status: "failed" as const,
          errorCategory: "configuration" as const,
          errorMessage: "Recipe importing is not configured for this deployment.",
          errorRetryable: false,
        },
      ];
      return await Promise.all(
        rows.map((row, index) =>
          ctx.db.insert("recipeImports", {
            requestedBy: ownerId,
            sourceUrl: `https://example.com/stage-${index}`,
            normalizedUrl: `https://example.com/stage-${index}`,
            attemptCount: index === 0 ? 0 : 1,
            ...row,
            createdAt: now + index,
            updatedAt: now + index,
          }),
        ),
      );
    });
    const asOwner = t.withIdentity({ subject: ownerId });
    const imports = await asOwner.query(api.email.recentImports);
    expect(
      new Set(imports.map((item) => `${item.status}:${item.processingStage ?? "none"}`)),
    ).toEqual(
      new Set([
        "queued:none",
        "scraping:retrieving",
        "scraping:generating",
        "parsed:none",
        "completed:none",
        "failed:none",
      ]),
    );
    await expect(
      asOwner.mutation(api.imports.retry, { importId: ids[5] }),
    ).rejects.toThrow(/cannot be retried/i);
  });
});

describe("recipe review save", () => {
  it("atomically saves corrections and is idempotent", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await createUser(t, "Review Owner", { verified: true });
    const otherId = await createUser(t, "Review Other", { verified: true });
    const importId = await t.run(async (ctx) => {
      const now = Date.now();
      const id = await ctx.db.insert("recipeImports", {
        requestedBy: ownerId,
        sourceUrl: "https://example.com/original",
        normalizedUrl: "https://example.com/original",
        status: "parsed",
        attemptCount: 1,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("recipeImportDrafts", {
        importId: id,
        sourceUrl: "https://example.com/original",
        sourceSite: "Example Kitchen",
        title: "Generated title",
        cuisines: [],
        categories: [],
        keywords: [],
        ingredients: [
          {
            position: 0,
            originalText: "1 onion",
            name: "onion",
            normalizedName: "onion",
            quantity: 1,
            isOptional: false,
          },
        ],
        instructions: [{ position: 0, text: "Cook it." }],
        modelId: "configured-model",
        promptVersion: "recipe-import-v1",
        schemaVersion: "recipe-draft-v1",
        generatedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return id;
    });
    const asOwner = t.withIdentity({ subject: ownerId });
    const asOther = t.withIdentity({ subject: otherId });
    const corrected = {
      title: "Corrected onion soup",
      description: null,
      ingredients: [
        { originalText: "2 onions", name: "onions", quantity: 2 },
      ],
      instructions: [{ text: "Cook until soft." }],
    };
    await expect(
      asOther.mutation(api.imports.saveReview, { importId, draft: corrected }),
    ).rejects.toThrow(/not found/i);
    const recipeId = await asOwner.mutation(api.imports.saveReview, {
      importId,
      draft: corrected,
    });
    expect(
      await asOwner.mutation(api.imports.saveReview, { importId, draft: corrected }),
    ).toBe(recipeId);

    const saved = await t.run(async (ctx) => ({
      recipe: await ctx.db.get(recipeId),
      ingredients: await ctx.db
        .query("recipeIngredients")
        .withIndex("by_recipe", (q) => q.eq("recipeId", recipeId))
        .collect(),
      relationships: await ctx.db
        .query("savedRecipes")
        .withIndex("by_user_and_recipe", (q) =>
          q.eq("userId", ownerId).eq("recipeId", recipeId),
        )
        .collect(),
      recipeImport: await ctx.db.get(importId),
    }));
    expect(saved.recipe).toMatchObject({
      title: "Corrected onion soup",
      sourceUrl: "https://example.com/original",
    });
    expect(saved.recipe).not.toHaveProperty("description");
    expect(saved.ingredients).toMatchObject([
      { originalText: "2 onions", normalizedName: "onions", quantity: 2 },
    ]);
    expect(saved.relationships).toHaveLength(1);
    expect(saved.recipeImport).toMatchObject({ status: "completed", recipeId });
  });

  it("rolls back an invalid review without exposing a partial recipe", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await createUser(t, "Invalid Review", { verified: true });
    const importId = await t.run(async (ctx) => {
      const now = Date.now();
      const id = await ctx.db.insert("recipeImports", {
        requestedBy: ownerId,
        sourceUrl: "https://example.com/invalid",
        normalizedUrl: "https://example.com/invalid",
        status: "parsed",
        attemptCount: 1,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("recipeImportDrafts", {
        importId: id,
        sourceUrl: "https://example.com/invalid",
        title: "Draft",
        cuisines: [],
        categories: [],
        keywords: [],
        ingredients: [{ position: 0, originalText: "salt", name: "salt", normalizedName: "salt", isOptional: false }],
        instructions: [{ position: 0, text: "Season." }],
        modelId: "configured-model",
        promptVersion: "recipe-import-v1",
        schemaVersion: "recipe-draft-v1",
        generatedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return id;
    });
    const asOwner = t.withIdentity({ subject: ownerId });
    await expect(
      asOwner.mutation(api.imports.saveReview, {
        importId,
        draft: { title: "", ingredients: [], instructions: [] },
      }),
    ).rejects.toThrow();
    const state = await t.run(async (ctx) => ({
      recipes: await ctx.db.query("recipes").collect(),
      saved: await ctx.db.query("savedRecipes").collect(),
      recipeImport: await ctx.db.get(importId),
    }));
    expect(state.recipes).toHaveLength(0);
    expect(state.saved).toHaveLength(0);
    expect(state.recipeImport?.status).toBe("parsed");
  });
});

describe("recipe authorization", () => {
  it("only includes explicitly saved relationships in Recipe Book", async () => {
    const t = convexTest(schema, modules);
    const adaId = await createUser(t, "Ada");
    const graceId = await createUser(t, "Grace");
    const publicId = await createRecipe(t, "public", { isPublic: true });
    const adaPrivateId = await createRecipe(t, "ada-private", { requestedBy: adaId });
    const gracePrivateId = await createRecipe(t, "grace-private", {
      requestedBy: graceId,
    });
    const sharedId = await createRecipe(t, "shared", { requestedBy: graceId });
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("savedRecipes", {
        userId: adaId,
        recipeId: adaPrivateId,
        isFavorite: false,
        createdAt: now + 1,
        updatedAt: now + 1,
      });
      await ctx.db.insert("savedRecipes", {
        userId: adaId,
        recipeId: sharedId,
        isFavorite: false,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("savedRecipes", {
        userId: adaId,
        recipeId: sharedId,
        isFavorite: true,
        createdAt: now - 1,
        updatedAt: now,
      });
    });

    const asAda = t.withIdentity({ subject: adaId });
    const visible = await asAda.query(api.recipes.list);
    expect(new Set(visible.map((recipe) => recipe._id))).toEqual(
      new Set([adaPrivateId, sharedId]),
    );
    expect(visible[0]?.savedAt).toBeTypeOf("number");
    expect(visible.map((recipe) => recipe._id)).not.toContain(publicId);
    expect(await asAda.query(api.recipes.get, { recipeId: gracePrivateId })).toBeNull();
    expect(await asAda.query(api.recipes.get, { recipeId: adaPrivateId })).toMatchObject({
      recipe: { _id: adaPrivateId },
      ingredients: [],
    });
  });

  it("rejects anonymous access", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.recipes.list)).rejects.toThrow(/Unauthenticated/);
  });
});
