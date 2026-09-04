import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.test).ts");

async function createUser(t: ReturnType<typeof convexTest>, name: string) {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      name,
      email: `${name.toLowerCase()}@example.com`,
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
  });

  it("routes only new, valid links from the connected AgentMail inbox", async () => {
    const t = convexTest(schema, modules);
    const userId = await createUser(t, "Lin");
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("userInboxes", {
        userId,
        inboxId: "inbox-1",
        email: "recipes@example.com",
        createdAt: now,
        updatedAt: now,
      });
    });

    const first = await t.mutation(internal.email.onMessageReceived, {
      eventId: "event-1",
      thread: {},
      message: {
        inbox_id: "inbox-1",
        message_id: "message-1",
        subject: "Two links",
        text: "https://example.com/dinner?utm_source=email https://example.com/dinner",
      },
    });
    expect(first).toEqual({ queued: 1 });

    const repeatedUrl = await t.mutation(internal.email.onMessageReceived, {
      eventId: "event-2",
      thread: {},
      message: { inbox_id: "inbox-1", text: "https://example.com/dinner" },
    });
    expect(repeatedUrl).toEqual({ queued: 0 });

    const unknownInbox = await t.mutation(internal.email.onMessageReceived, {
      eventId: "event-3",
      thread: {},
      message: { inbox_id: "unknown", text: "https://example.com/other" },
    });
    expect(unknownInbox).toEqual({ queued: 0 });
  });
});

describe("recipe authorization", () => {
  it("only returns public, imported, or explicitly saved recipes", async () => {
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
        recipeId: sharedId,
        isFavorite: false,
        createdAt: now,
        updatedAt: now,
      });
    });

    const asAda = t.withIdentity({ subject: adaId });
    const visible = await asAda.query(api.recipes.list);
    expect(new Set(visible.map((recipe) => recipe._id))).toEqual(
      new Set([publicId, adaPrivateId, sharedId]),
    );
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
