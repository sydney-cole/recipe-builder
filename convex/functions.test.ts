import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { queueRecipeSource } from "./recipeIngestion";
import {
  emailedCode,
  fromBrowser,
  initAuthTest,
  signedInUser,
  signUp,
  TEST_PASSWORD,
  type AuthTest,
} from "./testing.helpers";

const initTest = initAuthTest;

/** A user row for tests that only need a user id, with no session. */
async function createUser(t: AuthTest, name: string) {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      name,
      email: `${name.toLowerCase()}@example.com`,
      createdAt: Date.now(),
    }),
  );
}

const sessions = new WeakMap<AuthTest, Map<Id<"users">, ReturnType<AuthTest["withIdentity"]>>>();

/**
 * A user who signed up and confirmed their email through Convex Auth, for
 * tests that call functions as them (see `sessionOf`).
 */
async function createSignedInUser(t: AuthTest, name: string) {
  const { userId, as } = await signedInUser(t, `${name.toLowerCase()}@example.com`);
  await t.run(async (ctx) => ctx.db.patch(userId, { name }));
  if (!sessions.has(t)) sessions.set(t, new Map());
  sessions.get(t)!.set(userId, as);
  return userId;
}

/** Calls functions with the session of a user from `createSignedInUser`. */
function sessionOf(t: AuthTest, userId: Id<"users">) {
  const as = sessions.get(t)?.get(userId);
  if (as === undefined) throw new Error("Create the user with createSignedInUser to call as them");
  return as;
}

async function createRecipe(
  t: AuthTest,
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

/**
 * Forwards a link the user already imported, so the forward is recorded
 * without starting a workflow. Returns the users the forward was attributed to.
 */
async function forwardKnownLink(t: AuthTest, from: string, eventId: string) {
  await t.mutation(internal.email.onMessageReceived, {
    eventId,
    thread: {},
    message: { inbox_id: "inbox-1", from, text: "https://example.com/known-recipe" },
  });
  return await t.run(async (ctx) =>
    (await ctx.db.query("inboundRecipeEmails").collect())
      .filter((email) => email.eventId === eventId)
      .map((email) => email.userId),
  );
}

async function importKnownLink(t: AuthTest, userId: Id<"users">) {
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("recipeImports", {
      requestedBy: userId,
      sourceUrl: "https://example.com/known-recipe",
      normalizedUrl: "https://example.com/known-recipe",
      sourceKind: "email",
      workflowId: "existing-workflow",
      status: "queued",
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  });
}

describe("email functions", () => {
  const configuredInbox = process.env.AGENTMAIL_INBOX_ID;

  beforeEach(() => {
    process.env.AGENTMAIL_INBOX_ID = "inbox-1";
  });

  afterEach(() => {
    if (configuredInbox === undefined) delete process.env.AGENTMAIL_INBOX_ID;
    else process.env.AGENTMAIL_INBOX_ID = configuredInbox;
  });

  it("requires authentication and deduplicates normalized URL submissions", async () => {
    const t = initTest();
    await expect(
      t.mutation(api.email.queueUrl, { sourceUrl: "https://example.com/recipe" }),
    ).rejects.toThrow(/Unauthenticated/);

    const userId = await createSignedInUser(t, "Ada");
    const asAda = sessionOf(t, userId);
    const first = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("recipeImports", {
        requestedBy: userId,
        sourceUrl: "https://example.com/recipe?a=1&b=2",
        normalizedUrl: "https://example.com/recipe?a=1&b=2",
        sourceKind: "direct",
        workflowId: "existing-workflow",
        status: "queued",
        attemptCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    });
    const second = await asAda.mutation(api.email.queueUrl, {
      sourceUrl: "https://EXAMPLE.com/recipe?utm_source=email&b=2&a=1#steps",
    });

    expect(second).toBe(first);
    expect(await asAda.query(api.email.importResult, { importId: first })).toMatchObject({
      status: "queued",
      sourceUrl: "https://example.com/recipe?a=1&b=2",
    });
    const imports = await asAda.query(api.email.recentImports);
    expect(imports).toHaveLength(1);
    expect(imports[0].normalizedUrl).toBe("https://example.com/recipe?a=1&b=2");
  });

  it("ignores duplicate links and unknown AgentMail inboxes", async () => {
    const t = initTest();
    const userId = await createSignedInUser(t, "Lin");
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("userInboxes", {
        userId,
        inboxId: "inbox-1",
        email: "recipes@example.com",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("recipeImports", {
        requestedBy: userId,
        sourceUrl: "https://example.com/dinner",
        normalizedUrl: "https://example.com/dinner",
        sourceKind: "email",
        workflowId: "existing-workflow",
        status: "queued",
        attemptCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    });

    const first = await t.mutation(internal.email.onMessageReceived, {
      eventId: "event-1",
      thread: {},
      message: {
        inbox_id: "inbox-1",
        from: "lin@example.com",
        message_id: "message-1",
        subject: "Two links",
        text: "https://example.com/dinner?utm_source=email https://example.com/dinner",
      },
    });
    expect(first).toEqual({ queued: 0 });

    const duplicateEvent = await t.mutation(internal.email.onMessageReceived, {
      eventId: "event-1",
      thread: {},
      message: { inbox_id: "inbox-1", from: "lin@example.com", text: "https://example.com/other" },
    });
    expect(duplicateEvent).toEqual({ queued: 0 });

    const repeatedUrl = await t.mutation(internal.email.onMessageReceived, {
      eventId: "event-2",
      thread: {},
      message: { inbox_id: "inbox-1", from: "lin@example.com", text: "https://example.com/dinner" },
    });
    expect(repeatedUrl).toEqual({ queued: 0 });

    const unknownInbox = await t.mutation(internal.email.onMessageReceived, {
      eventId: "event-3",
      thread: {},
      message: { inbox_id: "unknown", text: "https://example.com/other" },
    });
    expect(unknownInbox).toEqual({ queued: 0 });

    const recentEmails = await sessionOf(t, userId).query(
      api.email.recentInboundEmails,
    );
    expect(recentEmails).toHaveLength(2);
    expect(recentEmails.every((email) => email.status === "processing")).toBe(true);
    const inboundEmails = await t.run(async (ctx) =>
      ctx.db.query("inboundRecipeEmails").collect(),
    );
    expect(inboundEmails.every((email) => email.primaryImportId !== undefined)).toBe(true);
  });

  it("marks a legacy email without an explicit recipe import as failed", async () => {
    const t = initTest();
    const userId = await createSignedInUser(t, "LegacyEmail");
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("recipeImports", {
        requestedBy: userId,
        sourceUrl: "https://example.com/pasta",
        normalizedUrl: "https://example.com/pasta",
        sourceKind: "email",
        sourceEventId: "legacy-event",
        status: "needs_review",
        attemptCount: 1,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("inboundRecipeEmails", {
        userId,
        inboxId: "inbox-1",
        eventId: "legacy-event",
        receivedAt: now,
        linkCount: 3,
        queuedCount: 3,
      });
    });

    const [email] = await sessionOf(t, userId).query(
      api.email.recentInboundEmails,
    );
    expect(email.status).toBe("failed");
    expect(email.recipeId).toBeUndefined();
  });

  it("does not retry a URL by email after extraction found no recipe in Discover", async () => {
    const t = initTest();
    const userId = await createSignedInUser(t, "FailedDiscoverUrl");
    const importId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("recipeImports", {
        requestedBy: userId,
        sourceUrl: "https://example.com/blocked-recipe",
        normalizedUrl: "https://example.com/blocked-recipe",
        sourceKind: "direct",
        status: "failed",
        attemptCount: 1,
        workflowId: "failed-workflow",
        errorMessage: "The agent did not find a complete recipe",
        createdAt: now,
        updatedAt: now,
      });
    });

    expect(await t.mutation(internal.email.onMessageReceived, {
      eventId: "failed-forward-event",
      thread: {},
      message: {
        inbox_id: "inbox-1",
        from: "faileddiscoverurl@example.com",
        text: "https://example.com/blocked-recipe?utm_source=email",
      },
    })).toEqual({ queued: 0 });

    const recipeImport = await t.run(async (ctx) => ctx.db.get(importId));
    expect(recipeImport).toMatchObject({
      status: "failed",
      workflowId: "failed-workflow",
      attemptCount: 1,
    });
    const [email] = await sessionOf(t, userId).query(
      api.email.recentInboundEmails,
    );
    expect(email.status).toBe("failed");
    expect(email.recipeId).toBeUndefined();
  });

  it("retries a failed scrape on resubmission until the attempt limit", async () => {
    const t = initTest();
    const userId = await createSignedInUser(t, "RetryCook");
    const importId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("recipeImports", {
        requestedBy: userId,
        sourceUrl: "https://example.com/flaky-recipe",
        normalizedUrl: "https://example.com/flaky-recipe",
        sourceKind: "direct",
        status: "failed",
        attemptCount: 1,
        workflowId: "failed-workflow",
        errorMessage: "recipe_scrape_failed: could not reach example.com",
        finishedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });
    const start = vi.fn().mockResolvedValue("retry-workflow");

    const retried = await t.run(async (ctx) =>
      queueRecipeSource(
        ctx,
        { userId, sourceUrl: "https://example.com/flaky-recipe", sourceKind: "direct" },
        start,
      ),
    );
    expect(retried).toEqual({ importId, queued: true });
    const restarted = await t.run(async (ctx) => ctx.db.get(importId));
    expect(restarted).toMatchObject({ status: "queued", workflowId: "retry-workflow" });
    expect(restarted?.errorMessage).toBeUndefined();

    await t.run(async (ctx) =>
      ctx.db.patch(importId, { status: "failed", attemptCount: 5 }),
    );
    const exhausted = await t.run(async (ctx) =>
      queueRecipeSource(
        ctx,
        { userId, sourceUrl: "https://example.com/flaky-recipe", sourceKind: "direct" },
        start,
      ),
    );
    expect(exhausted).toEqual({ importId, queued: false });
    expect(start).toHaveBeenCalledTimes(1);

    const asOwner = sessionOf(t, userId);
    await expect(
      asOwner.mutation(api.recipeIngestion.retryImport, { importId }),
    ).rejects.toThrow(/too many times/);
    const strangerId = await createSignedInUser(t, "RetryStranger");
    await expect(
      sessionOf(t, strangerId).mutation(api.recipeIngestion.retryImport, { importId }),
    ).rejects.toThrow(/not found/);
    await expect(
      t.mutation(api.recipeIngestion.retryImport, { importId }),
    ).rejects.toThrow(/Unauthenticated/);
  });

  it("forwarded mail from an unconfirmed address is not attributed", async () => {
    const t = initTest();
    await signUp(t, "unconfirmed@example.com");

    expect(await t.mutation(internal.email.onMessageReceived, {
      eventId: "unconfirmed-forward-event",
      thread: {},
      message: {
        inbox_id: "inbox-1",
        from: "Unconfirmed <unconfirmed@example.com>",
        text: "https://example.com/some-recipe",
      },
    })).toEqual({ queued: 0 });
    expect(await t.run(async (ctx) => ctx.db.query("inboundRecipeEmails").collect())).toEqual([]);
  });

  it("forwarded mail from a confirmed address is attributed", async () => {
    const t = initTest();
    const { userId, as } = await signedInUser(t, "Confirmed@Example.com");
    // An existing import of the link keeps the forward from starting a
    // workflow, so the test only observes the attribution.
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("recipeImports", {
        requestedBy: userId,
        sourceUrl: "https://example.com/confirmed-recipe",
        normalizedUrl: "https://example.com/confirmed-recipe",
        sourceKind: "email",
        workflowId: "existing-workflow",
        status: "queued",
        attemptCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    });

    await t.mutation(internal.email.onMessageReceived, {
      eventId: "confirmed-forward-event",
      thread: {},
      message: {
        inbox_id: "inbox-1",
        from: "Confirmed <confirmed@example.com>",
        text: "https://example.com/confirmed-recipe",
      },
    });

    const inbound = await t.run(async (ctx) => ctx.db.query("inboundRecipeEmails").collect());
    expect(inbound).toHaveLength(1);
    expect(inbound[0].userId).toBe(userId);
    expect(await as.query(api.email.recentInboundEmails)).toHaveLength(1);
  });

  it("after an email change, attributes forwards from the new address only", async () => {
    const t = initTest();
    const { userId, as } = await signedInUser(t, "before@example.com");
    await importKnownLink(t, userId);

    const started = await fromBrowser(as).mutation(api.auth.startChangeEmail, {
      newEmail: "after@example.com",
      currentPassword: TEST_PASSWORD,
    });
    if (!started.success) throw new Error(JSON.stringify(started.userError));
    expect(
      await fromBrowser(as).mutation(api.auth.completeChangeEmail, {
        emailCode: await emailedCode(t, "after@example.com"),
        browserSecret: started.browserSecret,
      }),
    ).toEqual({ success: true });

    expect((await t.run(async (ctx) => ctx.db.get(userId)))?.email).toBe("after@example.com");
    expect(await forwardKnownLink(t, "before@example.com", "old-address-event")).toEqual([]);
    expect(await forwardKnownLink(t, "after@example.com", "new-address-event")).toEqual([userId]);
  });

  it("attributes to the one verified owner when several users rows share an email", async () => {
    const t = initTest();
    const { userId } = await signedInUser(t, "shared@example.com");
    // For example a v1 row of the same person, who signed up again on 2.0.
    await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "shared@example.com",
        emailVerificationTime: Date.now(),
        createdAt: Date.now(),
      }),
    );
    await importKnownLink(t, userId);

    expect(await forwardKnownLink(t, "shared@example.com", "shared-event")).toEqual([userId]);
  });

  it("reimports an emailed URL when its previous recipe was deleted", async () => {
    const t = initTest();
    const userId = await createUser(t, "DeletedEmailRecipe");
    const oldImportId = await t.run(async (ctx) => {
      const now = Date.now();
      const importId = await ctx.db.insert("recipeImports", {
        requestedBy: userId,
        sourceUrl: "https://example.com/deleted-recipe",
        normalizedUrl: "https://example.com/deleted-recipe",
        sourceKind: "direct",
        workflowId: "completed-workflow",
        status: "completed",
        attemptCount: 1,
        createdAt: now,
        updatedAt: now,
      });
      const recipeId = await ctx.db.insert("recipes", {
        importId,
        sourceUrl: "https://example.com/deleted-recipe",
        normalizedSourceUrl: "https://example.com/deleted-recipe",
        isPublic: false,
        title: "Deleted recipe",
        cuisines: [],
        categories: [],
        keywords: [],
        instructions: [],
        deletedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(importId, { recipeId });
      return importId;
    });

    const queued = await t.run(async (ctx) =>
      queueRecipeSource(
        ctx,
        {
          userId,
          sourceUrl: "https://example.com/deleted-recipe",
          sourceKind: "email",
          sourceSubject: "Import this again",
        },
        async () => "replacement-workflow",
      ),
    );
    expect(queued).toEqual({
      importId: expect.any(String),
      queued: true,
    });

    const imports = await t.run(async (ctx) =>
      ctx.db
        .query("recipeImports")
        .withIndex("by_requester_and_normalized_url", (q) =>
          q
            .eq("requestedBy", userId)
            .eq("normalizedUrl", "https://example.com/deleted-recipe"),
        )
        .collect(),
    );
    expect(imports).toHaveLength(2);
    expect(imports.find((recipeImport) => recipeImport._id !== oldImportId)).toMatchObject({
      sourceKind: "email",
      status: "queued",
    });
  });

  it("does not expose a deleted recipe through an older email record", async () => {
    const t = initTest();
    const userId = await createSignedInUser(t, "DeletedEmailPreview");
    await t.run(async (ctx) => {
      const now = Date.now();
      const importId = await ctx.db.insert("recipeImports", {
        requestedBy: userId,
        sourceUrl: "https://example.com/old-email-recipe",
        normalizedUrl: "https://example.com/old-email-recipe",
        sourceKind: "email",
        workflowId: "completed-workflow",
        status: "completed",
        attemptCount: 1,
        createdAt: now,
        updatedAt: now,
      });
      const recipeId = await ctx.db.insert("recipes", {
        importId,
        sourceUrl: "https://example.com/old-email-recipe",
        normalizedSourceUrl: "https://example.com/old-email-recipe",
        isPublic: false,
        title: "Old email recipe",
        cuisines: [],
        categories: [],
        keywords: [],
        instructions: [],
        deletedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(importId, { recipeId });
      await ctx.db.insert("inboundRecipeEmails", {
        userId,
        inboxId: "inbox-1",
        eventId: "old-email-event",
        receivedAt: now,
        linkCount: 1,
        queuedCount: 0,
        primaryImportId: importId,
      });
    });

    const [email] = await sessionOf(t, userId).query(
      api.email.recentInboundEmails,
    );
    expect(email.status).toBe("already_imported");
    expect(email.recipeId).toBeUndefined();
  });

  it("bounds webhook event identifiers before deduplication", async () => {
    process.env.AGENTMAIL_INBOX_ID = "bounded-inbox";
    const t = initTest();
    const userId = await createUser(t, "BoundedWebhook");
    const longEventId = `event-${"x".repeat(600)}`;
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("userInboxes", {
        userId,
        inboxId: "bounded-inbox",
        email: "bounded@example.com",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("inboundRecipeEmails", {
        userId,
        inboxId: "bounded-inbox",
        eventId: longEventId.slice(0, 500),
        receivedAt: now,
        linkCount: 1,
        queuedCount: 1,
      });
    });

    expect(
      await t.mutation(internal.email.onMessageReceived, {
        eventId: longEventId,
        thread: {},
        message: {
          inbox_id: "bounded-inbox",
          from: "boundedwebhook@example.com",
          text: "https://example.com/another-recipe",
        },
      }),
    ).toEqual({ queued: 0 });
  });
});

describe("user settings", () => {
  it("requires authentication and saves normalized profile settings", async () => {
    const t = initTest();
    await expect(t.mutation(api.users.updateProfile, { name: "Ada" })).rejects.toThrow(
      /Unauthenticated/,
    );

    const userId = await createSignedInUser(t, "Original");
    const asUser = sessionOf(t, userId);
    await asUser.mutation(api.users.updateProfile, { name: "  Ada Byron  " });
    expect(await asUser.query(api.users.current)).toMatchObject({
      name: "Ada Byron",
      email: "original@example.com",
    });
  });

  it("rejects blank profile names", async () => {
    const t = initTest();
    const userId = await createSignedInUser(t, "Original");
    await expect(
      sessionOf(t, userId).mutation(api.users.updateProfile, { name: "   " }),
    ).rejects.toThrow(/Name is required/);
  });

  it("deletes account-owned data and disconnects retained recipe imports", async () => {
    const t = initTest();
    const userId = await createSignedInUser(t, "DeleteMe");
    const recipeId = await createRecipe(t, "account-recipe", { requestedBy: userId });
    const records = await t.run(async (ctx) => {
      const now = Date.now();
      const savedRecipeId = await ctx.db.insert("savedRecipes", {
        userId,
        recipeId,
        isFavorite: true,
        createdAt: now,
        updatedAt: now,
      });
      const groceryListId = await ctx.db.insert("groceryLists", {
        userId,
        name: "My groceries",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const inboxId = await ctx.db.insert("userInboxes", {
        userId,
        inboxId: "delete-me-inbox",
        email: "delete-me@example.com",
        createdAt: now,
        updatedAt: now,
      });
      const plannerId = await ctx.db.insert("planners", {
        ownerId: userId,
        weekStart: 1,
        people: 2,
        createdAt: now,
        updatedAt: now,
      });
      const plannerMealId = await ctx.db.insert("plannerMeals", {
        plannerId,
        name: "Thai",
        key: "thai",
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      const cookSlotId = await ctx.db.insert("planSlots", {
        plannerId,
        date: "2026-11-16",
        meal: "lunch",
        type: "cook",
        recipeId,
        updatedBy: userId,
        updatedAt: now,
      });
      const outSlotId = await ctx.db.insert("planSlots", {
        plannerId,
        date: "2026-11-16",
        meal: "dinner",
        type: "out",
        mealId: plannerMealId,
        updatedBy: userId,
        updatedAt: now,
      });
      return { savedRecipeId, groceryListId, inboxId, plannerId, plannerMealId, cookSlotId, outSlotId };
    });

    vi.useFakeTimers();
    await sessionOf(t, userId).mutation(api.users.deleteAccount, { confirmation: "DELETE" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();

    await t.run(async (ctx) => {
      expect(await ctx.db.get(userId)).toBeNull();
      for (const id of Object.values(records)) expect(await ctx.db.get(id)).toBeNull();
      const recipe = await ctx.db.get(recipeId);
      const recipeImport = recipe?.importId ? await ctx.db.get(recipe.importId) : null;
      expect(recipeImport?.requestedBy).toBeUndefined();
    });
  });
});

describe("Convex Auth accounts", () => {
  it("sign-up then validation yields a user whose email is set", async () => {
    const t = initTest();
    const { userId, as } = await signedInUser(t, "Ana@Example.com");

    const user = await t.run(async (ctx) => ctx.db.get(userId));
    expect(user?.email).toBe("ana@example.com");
    expect(await as.query(api.users.current)).toMatchObject({
      _id: userId,
      email: "ana@example.com",
    });
  });

  it("sign-up alone leaves the user without an email", async () => {
    const t = initTest();
    await signUp(t, "pending@example.com");

    const users = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(users).toHaveLength(1);
    expect(users[0].email).toBeUndefined();
  });

  it("deleteUnverifiedUsers removes only stale rows without an email", async () => {
    vi.useFakeTimers();
    try {
      const t = initTest();
      const hour = 60 * 60 * 1000;
      const now = Date.now();
      const { stale, recent, verified } = await t.run(async (ctx) => ({
        stale: await ctx.db.insert("users", { createdAt: now - 25 * hour }),
        recent: await ctx.db.insert("users", { createdAt: now - hour }),
        verified: await ctx.db.insert("users", {
          email: "kept@example.com",
          createdAt: now - 25 * hour,
        }),
      }));

      await t.mutation(internal.users.deleteUnverifiedUsers, {});

      await t.run(async (ctx) => {
        expect(await ctx.db.get(stale)).toBeNull();
        expect(await ctx.db.get(recent)).not.toBeNull();
        expect(await ctx.db.get(verified)).not.toBeNull();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("deleteUnverifiedUsers keeps legacy rows and rows being deleted", async () => {
    const t = initTest();
    const longAgo = Date.now() - 400 * 24 * 60 * 60 * 1000;
    const { legacy, deleting } = await t.run(async (ctx) => ({
      // A verified Convex Auth v1 row, as it was written before the move.
      legacy: await ctx.db.insert("users", {
        name: "Legacy",
        email: "legacy@example.com",
        emailVerificationTime: longAgo,
        createdAt: longAgo,
      }),
      deleting: await ctx.db.insert("users", {
        createdAt: longAgo,
        deletionRequestedAt: Date.now(),
        deletionStage: "savedRecipes",
      }),
    }));

    await t.mutation(internal.users.deleteUnverifiedUsers, {});

    await t.run(async (ctx) => {
      expect(await ctx.db.get(legacy)).not.toBeNull();
      expect(await ctx.db.get(deleting)).not.toBeNull();
    });
  });

  it("account deletion revokes sessions and removes verified emails", async () => {
    const t = initTest();
    const { userId, as } = await signedInUser(t, "leaving@example.com");
    expect(await as.query(api.auth.isAuthenticated)).toBe(true);

    vi.useFakeTimers();
    await as.mutation(api.users.deleteAccount, { confirmation: "DELETE" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();

    expect(await as.query(api.auth.isAuthenticated)).toBe(false);
    expect(
      await t.run(async (ctx) =>
        ctx.runQuery(components.authEmail.verifiedEmails.getEmails, { userId }),
      ),
    ).toEqual([]);
    expect(await t.run(async (ctx) => ctx.db.get(userId))).toBeNull();
  });
});

describe("recipe authorization", () => {
  it("keeps previews out of the Recipe Book until the user saves them", async () => {
    const t = initTest();
    const adaId = await createSignedInUser(t, "Ada");
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

    const asAda = sessionOf(t, adaId);
    const visible = await asAda.query(api.recipes.listBook);
    expect(visible.map((recipe) => recipe._id)).toEqual([sharedId]);
    expect(await asAda.query(api.recipes.get, { recipeId: publicId })).toMatchObject({
      recipe: { _id: publicId },
    });
    expect(await asAda.query(api.recipes.get, { recipeId: gracePrivateId })).toBeNull();
    expect(await asAda.query(api.recipes.get, { recipeId: adaPrivateId })).toMatchObject({
      recipe: { _id: adaPrivateId },
      ingredients: [],
      saved: null,
    });

    await asAda.mutation(api.recipeCards.setCurrent, { recipeId: adaPrivateId });
    expect(await asAda.query(api.recipes.currentId)).toBe(adaPrivateId);
    expect(await asAda.query(api.recipes.current)).toMatchObject({
      _id: adaPrivateId,
      title: "ada-private",
    });
    await expect(
      asAda.mutation(api.recipeCards.setCurrent, { recipeId: gracePrivateId }),
    ).rejects.toThrow(/Forbidden/);
    await asAda.mutation(api.recipeCards.setCurrent, { recipeId: null });
    expect(await asAda.query(api.recipes.current)).toBeNull();

    await asAda.mutation(api.recipeCards.addToBook, { recipeId: adaPrivateId });
    await asAda.mutation(api.recipeCards.addToBook, { recipeId: adaPrivateId });
    expect(
      new Set((await asAda.query(api.recipes.listBook)).map((recipe) => recipe._id)),
    ).toEqual(new Set([adaPrivateId, sharedId]));
  });

  it("limits notes and favorites to saved recipes and editing to the owner", async () => {
    const t = initTest();
    const adaId = await createSignedInUser(t, "Ada");
    const publicId = await createRecipe(t, "public", { isPublic: true });
    const ownId = await createRecipe(t, "own", { requestedBy: adaId });
    const asAda = sessionOf(t, adaId);

    expect(await asAda.query(api.recipes.get, { recipeId: publicId })).toMatchObject({
      canEdit: false,
    });
    expect(await asAda.query(api.recipes.get, { recipeId: ownId })).toMatchObject({
      canEdit: true,
    });
    await expect(
      asAda.mutation(api.recipeCards.setNotes, { recipeId: ownId, notes: "Early" }),
    ).rejects.toThrow(/not in your Recipe Book/);
    await expect(
      asAda.mutation(api.recipeCards.setFavorite, { recipeId: publicId, isFavorite: true }),
    ).rejects.toThrow(/not in your Recipe Book/);

    await asAda.mutation(api.recipeCards.addToBook, { recipeId: publicId });
    await asAda.mutation(api.recipeCards.setNotes, { recipeId: publicId, notes: "Mine" });
    await asAda.mutation(api.recipeCards.setFavorite, { recipeId: publicId, isFavorite: true });
    expect(await asAda.query(api.recipes.listBook)).toMatchObject([
      { _id: publicId, isFavorite: true },
    ]);
    expect(await asAda.query(api.recipes.get, { recipeId: publicId })).toMatchObject({
      saved: { notes: "Mine", isFavorite: true },
    });

    await asAda.mutation(api.recipeCards.removeFromBook, { recipeId: publicId });
    await asAda.mutation(api.recipeCards.removeFromBook, { recipeId: publicId });
    expect(await asAda.query(api.recipes.listBook)).toEqual([]);
    expect(await asAda.query(api.recipes.get, { recipeId: publicId })).toMatchObject({
      recipe: { _id: publicId },
      saved: null,
    });
  });

  it("rejects anonymous access", async () => {
    const t = initTest();
    await expect(t.query(api.recipes.listBook)).rejects.toThrow(/Unauthenticated/);
  });
});

describe("manual recipes", () => {
  it("creates an editable recipe and explicitly adds it to the Recipe Book", async () => {
    const t = initTest();
    const userId = await createSignedInUser(t, "ManualCook");
    const asUser = sessionOf(t, userId);
    const recipeId = await asUser.mutation(api.recipeCards.createManual, {
      title: "Family pancakes",
      description: "The Sunday version.",
      sourceUrl: null,
      servings: 4,
      prepTimeMinutes: 10,
      cookTimeMinutes: 15,
      ingredients: ["2 cups flour", "2 eggs"],
      instructions: ["Mix everything.", "Cook on a griddle."],
    });

    expect(await asUser.query(api.recipes.listBook)).toEqual([
      expect.objectContaining({
        _id: recipeId,
        title: "Family pancakes",
        sourceSite: "Manual recipe",
        totalTimeMinutes: 25,
      }),
    ]);
    expect(await asUser.query(api.recipes.get, { recipeId })).toMatchObject({
      recipe: { _id: recipeId },
      ingredients: [
        { originalText: "2 cups flour", name: "flour", quantity: 2, quantityText: "2", unit: "cup" },
        { originalText: "2 eggs", name: "eggs", quantity: 2 },
      ],
      saved: { isFavorite: false },
    });
  });
});

describe("recipe scrape persistence", () => {
  it("atomically stores one agent-ready artifact and completes idempotently", async () => {
    const t = initTest();
    const userId = await createUser(t, "Mae");
    const importId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("recipeImports", {
        requestedBy: userId,
        sourceUrl: "https://example.com/soup",
        normalizedUrl: "https://example.com/soup",
        sourceKind: "agent_discovery",
        sourceQuery: "bright tomato soup",
        status: "scraping",
        attemptCount: 1,
        createdAt: now,
        updatedAt: now,
      });
    });
    const scrape = {
      markdown: "# Tomato soup\n\nTomatoes, stock, and basil.",
      recipeJsonLd: JSON.stringify({ "@type": "Recipe", name: "Tomato soup" }),
      pageTitle: "Tomato soup",
      canonicalUrl: "https://example.com/soup",
      statusCode: 200,
      truncated: false,
    };

    const first = await t.mutation(internal.recipeIngestion.persistScrape, {
      importId,
      scrape,
    });
    const second = await t.mutation(internal.recipeIngestion.persistScrape, {
      importId,
      scrape,
    });
    expect(second).toBe(first);
    await expect(
      t.query(internal.recipeIngestion.agentReadyArtifact, { importId }),
    ).resolves.toMatchObject({
      artifactId: first,
      sourceUrl: "https://example.com/soup",
      sourceKind: "agent_discovery",
      sourceQuery: "bright tomato soup",
      markdown: scrape.markdown,
    });

    await t.run(async (ctx) => {
      const recipeImport = await ctx.db.get(importId);
      const artifact = await ctx.db.get(first);
      expect(recipeImport).toMatchObject({
        status: "scraped",
        scrapeArtifactId: first,
      });
      expect(artifact).toMatchObject({
        importId,
        markdown: scrape.markdown,
        pageTitle: "Tomato soup",
      });
      const allArtifacts = await ctx.db
        .query("recipeScrapeArtifacts")
        .withIndex("by_import", (q) => q.eq("importId", importId))
        .collect();
      expect(allArtifacts).toHaveLength(1);
    });
  });

  it("ignores a stale workflow failure and records the current bounded failure", async () => {
    const t = initTest();
    const importId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("recipeImports", {
        sourceUrl: "https://example.com/failure",
        normalizedUrl: "https://example.com/failure",
        sourceKind: "agent_discovery",
        workflowId: "workflow-2",
        status: "scraping",
        attemptCount: 1,
        createdAt: now,
        updatedAt: now,
      });
    });

    await t.mutation(internal.recipeIngestion.onIngestionComplete, {
      workflowId: "workflow-1",
      context: { importId },
      result: { kind: "failed", error: "Stale workflow failed" },
    });
    await t.run(async (ctx) => {
      const recipeImport = await ctx.db.get(importId);
      expect(recipeImport?.status).toBe("scraping");
      expect(recipeImport?.errorMessage).toBeUndefined();
    });

    await t.mutation(internal.recipeIngestion.onIngestionComplete, {
      workflowId: "workflow-2",
      context: { importId },
      result: { kind: "failed", error: `Provider failed ${"x".repeat(600)}` },
    });
    await t.run(async (ctx) => {
      const recipeImport = await ctx.db.get(importId);
      expect(recipeImport?.status).toBe("failed");
      expect(recipeImport?.errorMessage).toHaveLength(500);
    });
  });
});

describe("agent-generated recipe persistence", () => {
  it("creates a recipe first and adds required ingredients only on request", async () => {
    const t = initTest();
    const userId = await createSignedInUser(t, "Mina");
    const importId = await t.run(async (ctx) => {
      const now = Date.now();
      const id = await ctx.db.insert("recipeImports", {
        requestedBy: userId,
        sourceUrl: "https://kitchen.example/lemon-pasta",
        normalizedUrl: "https://kitchen.example/lemon-pasta",
        sourceKind: "direct",
        status: "processing",
        attemptCount: 1,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("recipeScrapeArtifacts", {
        importId: id,
        sourceUrl: "https://kitchen.example/lemon-pasta",
        normalizedUrl: "https://kitchen.example/lemon-pasta",
        markdown: "# Lemon pasta",
        truncated: false,
        scrapedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return id;
    });

    const extraction = {
      title: "Lemon Pasta",
      description: "A bright pasta.",
      sourceSite: "Kitchen Example",
      sourceAuthor: "Test Kitchen",
      yieldText: "4 servings",
      servings: 4,
      prepTimeMinutes: 10,
      cookTimeMinutes: 20,
      totalTimeMinutes: 30,
      cuisines: ["Italian"],
      categories: ["Dinner"],
      keywords: ["pasta"],
      instructions: [{ position: 1, text: "Cook the pasta.", section: null }],
      ingredients: [
        {
          position: 1,
          section: null,
          originalText: "12 oz spaghetti",
          name: "Spaghetti",
          normalizedName: "spaghetti",
          quantity: 12,
          quantityText: "12",
          unit: "oz",
          preparation: null,
          notes: null,
          category: "Pantry",
          isOptional: false,
        },
        {
          position: 2,
          section: null,
          originalText: "Parmesan, optional",
          name: "Parmesan",
          normalizedName: "parmesan",
          quantity: null,
          quantityText: null,
          unit: null,
          preparation: null,
          notes: "for serving",
          category: "Dairy",
          isOptional: true,
        },
      ],
      warnings: [],
    };

    const first = await t.mutation(
      internal.recipeAgentData.persistGeneratedRecipe,
      { importId, model: "anthropic/test-model", extraction },
    );
    const second = await t.mutation(
      internal.recipeAgentData.persistGeneratedRecipe,
      { importId, model: "anthropic/test-model", extraction },
    );
    expect(second).toEqual(first);

    await t.run(async (ctx) => {
      const recipe = await ctx.db.get(first.recipeId);
      const recipeIngredients = await ctx.db
        .query("recipeIngredients")
        .withIndex("by_recipe", (q) => q.eq("recipeId", first.recipeId))
        .collect();
      const groceryLists = await ctx.db
        .query("groceryLists")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      const saved = await ctx.db
        .query("savedRecipes")
        .withIndex("by_user_and_recipe", (q) =>
          q.eq("userId", userId).eq("recipeId", first.recipeId),
        )
        .unique();
      expect(recipe).toMatchObject({
        title: "Lemon Pasta",
        sourceUrl: "https://kitchen.example/lemon-pasta",
      });
      expect(recipeIngredients).toHaveLength(2);
      expect(groceryLists).toHaveLength(0);
      expect(saved).toBeNull();
    });

    const asUser = sessionOf(t, userId);
    await asUser.mutation(api.recipeCards.addToBook, { recipeId: first.recipeId });
    await asUser.mutation(api.recipeCards.addToBook, { recipeId: first.recipeId });
    await t.run(async (ctx) => {
      const saved = await ctx.db
        .query("savedRecipes")
        .withIndex("by_user_and_recipe", (q) =>
          q.eq("userId", userId).eq("recipeId", first.recipeId),
        )
        .collect();
      expect(saved).toHaveLength(1);
    });
    await expect(
      t.mutation(api.groceryLists.createFromRecipe, {
        recipeId: first.recipeId,
      }),
    ).rejects.toThrow(/Unauthenticated/);
    const groceryListId = await asUser.mutation(
      api.groceryLists.createFromRecipe,
      { recipeId: first.recipeId },
    );
    expect(
      await asUser.mutation(api.groceryLists.createFromRecipe, {
        recipeId: first.recipeId,
      }),
    ).toBe(groceryListId);
    await t.run(async (ctx) => {
      expect(await ctx.db.get(groceryListId)).toMatchObject({
        name: "Lemon Pasta",
        sourceRecipeId: first.recipeId,
      });
      const groceryItems = await ctx.db
        .query("groceryListItems")
        .withIndex("by_list", (q) => q.eq("listId", groceryListId))
        .collect();
      expect(groceryItems).toHaveLength(1);
      expect(groceryItems[0]).toMatchObject({ name: "spaghetti", quantity: 12 });
      expect((await ctx.db.get(importId))?.generatedGroceryListId).toBe(
        groceryListId,
      );
    });
  });
});

describe("editable recipe cards", () => {
  it("lets only the owner edit fields, ingredients, notes, and removal state", async () => {
    const t = initTest();
    const ownerId = await createSignedInUser(t, "Owner");
    const otherId = await createSignedInUser(t, "Other");
    const recipeId = await createRecipe(t, "editable", { requestedBy: ownerId });
    const asOwner = sessionOf(t, ownerId);
    const asOther = sessionOf(t, otherId);

    await expect(
      asOther.mutation(api.recipeCards.updateCard, {
        recipeId,
        title: "Stolen",
      }),
    ).rejects.toThrow(/Forbidden/);

    await asOwner.mutation(api.recipeCards.updateCard, {
      recipeId,
      title: "My edited recipe",
      servings: 6,
      instructions: [{ position: 99, text: "Mix everything." }],
    });
    await asOwner.mutation(api.recipeCards.addToBook, { recipeId });
    await asOwner.mutation(api.recipeCards.setNotes, {
      recipeId,
      notes: "Use less salt next time.",
    });
    const recipeIngredientId = await asOwner.mutation(
      api.recipeCards.addIngredient,
      { recipeId, name: "Fresh basil", quantity: 2, unit: "tbsp" },
    );
    await asOwner.mutation(api.recipeCards.updateIngredient, {
      recipeIngredientId,
      quantity: 3,
      notes: "chopped",
    });

    const detail = await asOwner.query(api.recipes.get, { recipeId });
    expect(detail?.recipe).toMatchObject({
      title: "My edited recipe",
      servings: 6,
      instructions: [{ position: 1, text: "Mix everything." }],
    });
    expect(detail?.ingredients[0]).toMatchObject({
      name: "Fresh basil",
      quantity: 3,
      notes: "chopped",
    });
    expect(detail?.saved?.notes).toBe("Use less salt next time.");

    await asOwner.mutation(api.recipeCards.removeIngredient, {
      recipeIngredientId,
    });
    await asOwner.mutation(api.recipeCards.removeCard, { recipeId });
    expect(await asOwner.query(api.recipes.get, { recipeId })).toBeNull();
  });

  it("shows import review details to the owner and acknowledges review", async () => {
    const t = initTest();
    const ownerId = await createSignedInUser(t, "ReviewOwner");
    const otherId = await createSignedInUser(t, "ReviewVisitor");
    const recipeId = await createRecipe(t, "reviewable", {
      requestedBy: ownerId,
    });
    const importId = await t.run(async (ctx) => {
      const recipe = await ctx.db.get(recipeId);
      if (recipe?.importId === undefined) throw new Error("Missing import");
      await ctx.db.patch(recipe.importId, {
        status: "needs_review",
        agentWarnings: ["Check the cooking time."],
        updatedAt: Date.now(),
      });
      return recipe.importId;
    });
    const asOwner = sessionOf(t, ownerId);
    const asOther = sessionOf(t, otherId);

    expect(await asOwner.query(api.recipes.get, { recipeId })).toMatchObject({
      importReview: {
        importId,
        status: "needs_review",
        warnings: ["Check the cooking time."],
      },
    });
    await expect(
      asOther.mutation(api.recipeCards.acknowledgeReview, { recipeId }),
    ).rejects.toThrow(/Forbidden/);

    await asOwner.mutation(api.recipeCards.acknowledgeReview, { recipeId });
    await asOwner.mutation(api.recipeCards.acknowledgeReview, { recipeId });
    expect(await asOwner.query(api.recipes.get, { recipeId })).toMatchObject({
      importReview: {
        importId,
        status: "completed",
        warnings: ["Check the cooking time."],
      },
    });
  });
});

describe("recipe tags and photos", () => {
  it("normalizes tags and lets only the owner add a first photo", async () => {
    const t = initTest();
    const ownerId = await createSignedInUser(t, "TagOwner");
    const otherId = await createSignedInUser(t, "TagOther");
    const recipeId = await createRecipe(t, "taggable", { requestedBy: ownerId });
    const asOwner = sessionOf(t, ownerId);
    const asOther = sessionOf(t, otherId);

    await asOwner.mutation(api.recipeCards.updateCard, {
      recipeId,
      categories: [" Weeknight ", "weeknight", "", "One  pan"],
    });
    expect((await t.run((ctx) => ctx.db.get(recipeId)))?.categories).toEqual([
      "Weeknight",
      "One pan",
    ]);
    await expect(
      asOwner.mutation(api.recipeCards.updateCard, {
        recipeId,
        categories: Array.from({ length: 21 }, (_, index) => `tag ${index}`),
      }),
    ).rejects.toThrow(/at most 20 tags/);

    // convex-test does not record a stored blob's content type, so set it directly.
    const store = (type: string) =>
      t.run(async (ctx) => {
        const storageId = await ctx.storage.store(new NodeBlob(["image"], { type }) as Blob);
        await ctx.db.patch(storageId as never, { contentType: type } as never);
        return storageId;
      });
    const exists = async (storageId: Id<"_storage">) =>
      (await t.run((ctx) => ctx.db.system.get(storageId))) !== null;

    await expect(t.mutation(api.recipeCards.generateImageUploadUrl, {})).rejects.toThrow(
      /Unauthenticated/,
    );
    await expect(
      asOther.mutation(api.recipeCards.setImage, { recipeId, storageId: await store("image/png") }),
    ).rejects.toThrow(/Forbidden/);

    const textId = await store("text/plain");
    expect(await asOwner.mutation(api.recipeCards.setImage, { recipeId, storageId: textId })).toBe(false);
    expect(await exists(textId)).toBe(false);

    const imageId = await store("image/png");
    expect(await asOwner.mutation(api.recipeCards.setImage, { recipeId, storageId: imageId })).toBe(true);
    expect((await t.run((ctx) => ctx.db.get(recipeId)))?.imageStorageId).toBe(imageId);

    const secondId = await store("image/png");
    expect(await asOwner.mutation(api.recipeCards.setImage, { recipeId, storageId: secondId })).toBe(false);
    expect(await exists(secondId)).toBe(false);
    expect((await t.run((ctx) => ctx.db.get(recipeId)))?.imageStorageId).toBe(imageId);
  });
});

describe("editable grocery lists", () => {
  it("supports owned list and item creation, editing, and independent deletion", async () => {
    const t = initTest();
    const ownerId = await createSignedInUser(t, "Shopper");
    const otherId = await createSignedInUser(t, "Visitor");
    const asOwner = sessionOf(t, ownerId);
    const asOther = sessionOf(t, otherId);

    const listId = await asOwner.mutation(api.groceryLists.create, {
      name: "Weekend",
    });
    const itemId = await asOwner.mutation(api.groceryLists.addItem, {
      listId,
      name: "Tomatoes",
      quantity: 2,
      unit: "lb",
    });
    await expect(
      asOther.mutation(api.groceryLists.updateItem, {
        itemId,
        quantity: 10,
      }),
    ).rejects.toThrow(/Forbidden/);

    await asOwner.mutation(api.groceryLists.updateItem, {
      itemId,
      name: "Cherry tomatoes",
      quantity: 3,
      isChecked: true,
    });
    await asOwner.mutation(api.groceryLists.updateList, {
      listId,
      name: "Saturday market",
      status: "completed",
    });
    expect(await asOwner.query(api.groceryLists.get, { listId })).toMatchObject({
      list: { name: "Saturday market", status: "completed" },
      items: [{ name: "cherry tomatoes", quantity: 3, isChecked: true }],
    });

    await asOwner.mutation(api.groceryLists.removeList, { listId });
    expect(await asOwner.query(api.groceryLists.get, { listId })).toBeNull();
  });
});

describe("recipe card validation branches", () => {
  it("supports clearing optional fields and updating existing notes and ingredients", async () => {
    const t = initTest();
    const ownerId = await createSignedInUser(t, "Editor");
    const recipeId = await createRecipe(t, "branch-recipe", {
      requestedBy: ownerId,
    });
    const asOwner = sessionOf(t, ownerId);

    await expect(
      t.mutation(api.recipeCards.updateCard, { recipeId, title: "No session" }),
    ).rejects.toThrow(/Unauthenticated/);
    await expect(
      asOwner.mutation(api.recipeCards.updateCard, { recipeId, title: "   " }),
    ).rejects.toThrow(/title/);
    await expect(
      asOwner.mutation(api.recipeCards.updateCard, { recipeId, servings: -1 }),
    ).rejects.toThrow(/servings/);
    await expect(
      asOwner.mutation(api.recipeCards.updateCard, {
        recipeId,
        instructions: [{ position: 1, text: " " }],
      }),
    ).rejects.toThrow(/instruction/);

    await asOwner.mutation(api.recipeCards.updateCard, {
      recipeId,
      description: null,
      yieldText: "  ",
      servings: null,
      prepTimeMinutes: null,
      cookTimeMinutes: 12,
      totalTimeMinutes: 12,
      instructions: [
        { position: 9, text: "  Stir gently.  ", section: "  Sauce  " },
      ],
    });
    await asOwner.mutation(api.recipeCards.addToBook, { recipeId });
    await asOwner.mutation(api.recipeCards.setNotes, {
      recipeId,
      notes: "First note",
    });
    await asOwner.mutation(api.recipeCards.setNotes, {
      recipeId,
      notes: "Updated note",
    });
    await asOwner.mutation(api.recipeCards.setNotes, {
      recipeId,
      notes: null,
    });

    const firstIngredientId = await asOwner.mutation(
      api.recipeCards.addIngredient,
      {
        recipeId,
        name: "  Garlic  ",
        originalText: "2 cloves garlic",
        quantity: 2,
        quantityText: "2",
        unit: "cloves",
        section: "Sauce",
        preparation: "minced",
        notes: "fresh",
        isOptional: false,
      },
    );
    const secondIngredientId = await asOwner.mutation(
      api.recipeCards.addIngredient,
      {
        recipeId,
        name: "Garlic",
        quantity: null,
        quantityText: null,
        unit: null,
        section: null,
        preparation: null,
        notes: null,
        isOptional: true,
      },
    );
    await asOwner.mutation(api.recipeCards.updateIngredient, {
      recipeIngredientId: firstIngredientId,
      name: "Roasted garlic",
      originalText: "3 cloves roasted garlic",
      quantity: null,
      quantityText: null,
      unit: null,
      section: null,
      preparation: null,
      notes: null,
      isOptional: true,
    });

    const detail = await asOwner.query(api.recipes.get, { recipeId });
    expect(detail?.recipe).toMatchObject({
      cookTimeMinutes: 12,
      totalTimeMinutes: 12,
      instructions: [
        { position: 1, text: "Stir gently.", section: "Sauce" },
      ],
    });
    expect(detail?.recipe.description).toBeUndefined();
    expect(detail?.recipe.servings).toBeUndefined();
    expect(detail?.saved?.notes).toBeUndefined();
    expect(detail?.ingredients).toHaveLength(2);
    expect(detail?.ingredients[0]).toMatchObject({
      name: "Roasted garlic",
      isOptional: true,
    });

    await asOwner.mutation(api.recipeCards.removeIngredient, {
      recipeIngredientId: secondIngredientId,
    });
    await asOwner.mutation(api.recipeCards.removeIngredient, {
      recipeIngredientId: secondIngredientId,
    });
    await expect(
      asOwner.mutation(api.recipeCards.updateIngredient, {
        recipeIngredientId: secondIngredientId,
        quantity: 1,
      }),
    ).rejects.toThrow(/not found/);
  });

  it("rejects non-editable recipes and enforces the ingredient limit", async () => {
    const t = initTest();
    const ownerId = await createSignedInUser(t, "LimitCook");
    const asOwner = sessionOf(t, ownerId);
    const standaloneRecipeId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("recipes", {
        sourceUrl: "https://example.com/public",
        normalizedSourceUrl: "https://example.com/public",
        title: "Standalone",
        cuisines: [],
        categories: [],
        keywords: [],
        instructions: [],
        createdAt: now,
        updatedAt: now,
      });
    });
    await expect(
      asOwner.mutation(api.recipeCards.updateCard, {
        recipeId: standaloneRecipeId,
        title: "Cannot edit",
      }),
    ).rejects.toThrow(/not editable/);

    const recipeId = await createRecipe(t, "full-recipe", {
      requestedBy: ownerId,
    });
    await t.run(async (ctx) => {
      for (let position = 1; position <= 200; position += 1) {
        await ctx.db.insert("recipeIngredients", {
          recipeId,
          position,
          originalText: `Ingredient ${position}`,
          name: `Ingredient ${position}`,
          normalizedName: `ingredient ${position}`,
          isOptional: false,
        });
      }
    });
    await expect(
      asOwner.mutation(api.recipeCards.addIngredient, {
        recipeId,
        name: "One too many",
      }),
    ).rejects.toThrow(/at most 200/);

    await asOwner.mutation(api.recipeCards.removeCard, { recipeId });
    await expect(
      asOwner.mutation(api.recipeCards.updateCard, {
        recipeId,
        title: "Deleted",
      }),
    ).rejects.toThrow(/not found/);
  });
});

describe("grocery list validation branches", () => {
  it("adds recipe ingredients to an existing list without duplicating the recipe", async () => {
    const t = initTest();
    const ownerId = await createSignedInUser(t, "ExistingListCook");
    const asOwner = sessionOf(t, ownerId);
    const recipeId = await createRecipe(t, "pancakes", { requestedBy: ownerId });
    const unrelatedRecipeId = await createRecipe(t, "omelet", { requestedBy: ownerId });
    const listId = await asOwner.mutation(api.groceryLists.create, { name: "Weekend" });
    await asOwner.mutation(api.groceryLists.addItem, { listId, name: "Milk", quantity: 1, unit: "cup" });
    await asOwner.mutation(api.groceryLists.addItem, { listId, name: "Large eggs", quantity: 2 });
    await asOwner.mutation(api.groceryLists.addItem, { listId, name: "all-purpose flour", quantity: 1, unit: "cup" });
    await asOwner.mutation(api.groceryLists.addItem, { listId, name: "kosher salt", quantity: 0.5, unit: "tsp" });
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("savedRecipes", { userId: ownerId, recipeId, isFavorite: false, createdAt: now, updatedAt: now });
      await ctx.db.insert("recipeIngredients", { recipeId, position: 1, originalText: "16 tablespoons milk", name: "Milk", normalizedName: "milk", quantity: 16, unit: "tbsp", isOptional: false });
      await ctx.db.insert("recipeIngredients", { recipeId, position: 2, originalText: "1 loaf bread", name: "Bread", normalizedName: "bread", quantity: 1, isOptional: false });
      await ctx.db.insert("recipeIngredients", { recipeId, position: 3, originalText: "3 (large) eggs", name: "large eggs", normalizedName: "large eggs", quantity: 3, quantityText: "3 (large)", unit: "large eggs", isOptional: false });
      await ctx.db.insert("recipeIngredients", { recipeId, position: 4, originalText: "32 tablespoons flour", name: "flour", normalizedName: "flour", quantity: 32, unit: "tbsp", isOptional: false });
      await ctx.db.insert("recipeIngredients", { recipeId, position: 5, originalText: "1 tablespoon salt", name: "salt", normalizedName: "salt", quantity: 1, unit: "tbsp", isOptional: false });
    });

    await asOwner.mutation(api.groceryLists.addRecipeToList, { recipeId, listId });
    await asOwner.mutation(api.groceryLists.addRecipeToList, { recipeId, listId });
    await t.run(async (ctx) => {
      const bread = await ctx.db
        .query("groceryListItems")
        .withIndex("by_list", (q) => q.eq("listId", listId))
        .filter((q) => q.eq(q.field("normalizedName"), "bread"))
        .unique();
      const source = await ctx.db
        .query("groceryListItemSources")
        .withIndex("by_grocery_list_item", (q) =>
          q.eq("groceryListItemId", bread!._id),
        )
        .unique();
      // Simulate an older row that accidentally stored the grocery list's
      // original recipe while retaining the correct recipe ingredient link.
      await ctx.db.patch(source!._id, { recipeId: unrelatedRecipeId });
    });
    const result = await asOwner.query(api.groceryLists.get, { listId });
    expect(result?.list.sourceRecipeIds).toEqual([recipeId]);
    expect(result?.items).toHaveLength(5);
    expect(result?.items.find((item) => item.normalizedName === "milk")).toMatchObject({ quantity: 2, quantityText: "2", unit: "cup" });
    expect(result?.items.find((item) => item.normalizedName === "bread")).toMatchObject({ quantity: 1 });
    expect(result?.items.find((item) => item.normalizedName === "eggs")).toMatchObject({ name: "eggs", quantity: 5, quantityText: "5" });
    expect(result?.items.find((item) => item.normalizedName === "flour")).toMatchObject({ name: "flour", quantity: 3, quantityText: "3" });
    expect(result?.items.find((item) => item.normalizedName === "salt")).toMatchObject({ name: "salt", quantity: 3.5, quantityText: "3.5", unit: "tsp" });
    expect(result?.itemSources.find((source) =>
      source.itemId === result.items.find((item) => item.normalizedName === "bread")?._id
    )?.recipeTitles).toEqual(["pancakes"]);
  });

  it("scales amounts for the chosen servings and files items by store section", async () => {
    const t = initTest();
    const ownerId = await createSignedInUser(t, "ScalingCook");
    const asOwner = sessionOf(t, ownerId);
    const recipeId = await createRecipe(t, "scaled-soup", { requestedBy: ownerId });
    await t.run(async (ctx) => {
      const now = Date.now();
      const carrotId = await ctx.db.insert("ingredients", { name: "Carrots", normalizedName: "carrots", category: "Fresh vegetables", createdAt: now, updatedAt: now });
      await ctx.db.insert("recipeIngredients", { recipeId, ingredientId: carrotId, position: 1, originalText: "2 carrots", name: "Carrots", normalizedName: "carrots", quantity: 2, isOptional: false });
      await ctx.db.insert("recipeIngredients", { recipeId, position: 2, originalText: "Salt, to taste", name: "Salt", normalizedName: "salt", isOptional: false });
    });

    const listId = await asOwner.mutation(api.groceryLists.createFromRecipe, { recipeId, servingsMultiplier: 1.5 });
    const created = await asOwner.query(api.groceryLists.get, { listId });
    expect(created?.items.find((item) => item.normalizedName === "carrots")).toMatchObject({ quantity: 3, quantityText: "3", category: "Produce" });
    expect(created?.items.find((item) => item.normalizedName === "salt")?.quantity).toBeUndefined();

    const weekendId = await asOwner.mutation(api.groceryLists.create, { name: "Weekend" });
    await asOwner.mutation(api.groceryLists.addRecipeToList, { recipeId, listId: weekendId, servingsMultiplier: 2 });
    const added = await asOwner.query(api.groceryLists.get, { listId: weekendId });
    expect(added?.items.find((item) => item.normalizedName === "carrots")).toMatchObject({ quantity: 4, category: "Produce" });

    await expect(
      asOwner.mutation(api.groceryLists.createFromRecipe, { recipeId, forceNew: true, servingsMultiplier: 0 }),
    ).rejects.toThrow(/Servings multiplier/);
  });

  it("keeps items the saving client never loaded and deletes explicit removals", async () => {
    const t = initTest();
    const ownerId = await createSignedInUser(t, "StaleEditorCook");
    const asOwner = sessionOf(t, ownerId);
    const listId = await asOwner.mutation(api.groceryLists.create, { name: "Shared trip" });
    const milkId = await asOwner.mutation(api.groceryLists.addItem, { listId, name: "Milk" });
    const breadId = await asOwner.mutation(api.groceryLists.addItem, { listId, name: "Bread" });
    const addedElsewhereId = await asOwner.mutation(api.groceryLists.addItem, { listId, name: "Eggs" });

    await asOwner.mutation(api.groceryLists.save, {
      listId,
      requestId: "stale-editor-save",
      name: "Shared trip",
      removedItemIds: [breadId],
      items: [{ itemId: milkId, name: "Milk", isChecked: true, sortOrder: 1 }],
    });

    const result = await asOwner.query(api.groceryLists.get, { listId });
    expect(new Set(result?.items.map((item) => item._id))).toEqual(
      new Set([milkId, addedElsewhereId]),
    );
  });

  it("adds an imported recipe that is not in the Recipe Book to an existing list", async () => {
    const t = initTest();
    const ownerId = await createSignedInUser(t, "UnsavedImportCook");
    const otherId = await createSignedInUser(t, "OtherListCook");
    const asOwner = sessionOf(t, ownerId);
    const asOther = sessionOf(t, otherId);
    const recipeId = await createRecipe(t, "lemon-cookies", { requestedBy: ownerId });
    await t.run(async (ctx) => {
      await ctx.db.insert("recipeIngredients", { recipeId, position: 1, originalText: "2 lemons", name: "Lemons", normalizedName: "lemons", quantity: 2, isOptional: false });
    });
    const listId = await asOwner.mutation(api.groceryLists.create, { name: "Weekend" });
    const otherListId = await asOther.mutation(api.groceryLists.create, { name: "Other" });

    await asOwner.mutation(api.groceryLists.addRecipeToList, { recipeId, listId });
    const result = await asOwner.query(api.groceryLists.get, { listId });
    expect(result?.list.sourceRecipeIds).toEqual([recipeId]);
    expect(result?.items).toHaveLength(1);
    expect(result?.items[0]).toMatchObject({ normalizedName: "lemons", quantity: 2 });

    await expect(
      asOther.mutation(api.groceryLists.addRecipeToList, { recipeId, listId: otherListId }),
    ).rejects.toThrow(/Forbidden/);
  });

  it("creates a renamed idempotent merged list and removes both originals", async () => {
    const t = initTest();
    const ownerId = await createSignedInUser(t, "ListCombiner");
    const otherId = await createSignedInUser(t, "OtherCombiner");
    const asOwner = sessionOf(t, ownerId);
    const asOther = sessionOf(t, otherId);
    const firstListId = await asOwner.mutation(api.groceryLists.create, {
      name: "Dinner",
    });
    const secondListId = await asOwner.mutation(api.groceryLists.create, {
      name: "Weekend",
    });
    await asOwner.mutation(api.groceryLists.addItem, {
      listId: firstListId,
      name: "milk",
      quantity: 2,
      unit: "cup",
    });
    await asOwner.mutation(api.groceryLists.addItem, {
      listId: secondListId,
      name: "Milk",
      quantityText: "3",
      unit: "cups",
    });
    await asOwner.mutation(api.groceryLists.addItem, {
      listId: secondListId,
      name: "Bread",
      quantity: 1,
    });

    await expect(
      asOther.mutation(api.groceryLists.combineLists, {
        listId: firstListId,
        otherListId: secondListId,
        requestId: "combine-other-user",
        name: "Not yours",
      }),
    ).rejects.toThrow(/Forbidden/);
    const requestId = "combine-dinner-weekend";
    const combinedListId = await asOwner.mutation(
      api.groceryLists.combineLists,
      {
        listId: firstListId,
        otherListId: secondListId,
        requestId,
        name: "Weekly groceries",
      },
    );
    expect(
      await asOwner.mutation(api.groceryLists.combineLists, {
        listId: firstListId,
        otherListId: secondListId,
        requestId,
        name: "Weekly groceries",
      }),
    ).toBe(combinedListId);

    expect(await asOwner.query(api.groceryLists.get, { listId: firstListId }))
      .toBeNull();
    expect(await asOwner.query(api.groceryLists.get, { listId: secondListId }))
      .toBeNull();
    const combined = await asOwner.query(api.groceryLists.get, {
      listId: combinedListId,
    });
    expect(combined?.list.name).toBe("Weekly groceries");
    expect(combined?.items).toHaveLength(2);
    expect(combined?.items[0]).toMatchObject({
      name: "milk",
      quantity: 5,
      quantityText: "5",
      unit: "cup",
      isChecked: false,
    });
    expect(combined?.items[1]).toMatchObject({ name: "bread", quantity: 1 });
  });

  it("atomically saves new and existing editable lists", async () => {
    const t = initTest();
    const ownerId = await createSignedInUser(t, "ListSaver");
    const otherId = await createSignedInUser(t, "OtherSaver");
    const asOwner = sessionOf(t, ownerId);
    const asOther = sessionOf(t, otherId);
    const requestId = "request-save-list-123";

    const listId = await asOwner.mutation(api.groceryLists.save, {
      requestId,
      name: "Weekend trip",
      items: [
        {
          name: "Milk",
          quantityText: "2",
          unit: "cups",
          category: "Dairy",
          notes: null,
          isChecked: false,
          sortOrder: 1,
        },
      ],
    });
    expect(
      await asOwner.mutation(api.groceryLists.save, {
        requestId,
        name: "Weekend trip",
        items: [],
      }),
    ).toBe(listId);

    const firstItemId = await t.run(async (ctx) => {
      const items = await ctx.db
        .query("groceryListItems")
        .withIndex("by_list", (q) => q.eq("listId", listId))
        .collect();
      expect(items).toHaveLength(1);
      return items[0]._id;
    });
    await expect(
      asOther.mutation(api.groceryLists.save, {
        listId,
        requestId: "request-other-user",
        name: "Not yours",
        items: [],
      }),
    ).rejects.toThrow(/Forbidden/);

    await asOwner.mutation(api.groceryLists.save, {
      listId,
      requestId: "request-update-list",
      name: "Updated weekend trip",
      items: [
        {
          itemId: firstItemId,
          name: "Oat milk",
          quantityText: "3",
          unit: "cartons",
          category: "Dairy",
          notes: null,
          isChecked: true,
          sortOrder: 1,
        },
        {
          name: "Apples",
          quantityText: "4",
          unit: null,
          category: "Produce",
          notes: null,
          isChecked: false,
          sortOrder: 2,
        },
      ],
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(listId)).toMatchObject({
        name: "Updated weekend trip",
      });
      const items = await ctx.db
        .query("groceryListItems")
        .withIndex("by_list_and_order", (q) => q.eq("listId", listId))
        .collect();
      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({
        name: "oat milk",
        quantityText: "3",
        isChecked: true,
      });
      expect(items[1]).toMatchObject({ name: "apples" });
    });
  });

  it("covers anonymous access, nullable edits, item deletion, and validation", async () => {
    const t = initTest();
    const ownerId = await createSignedInUser(t, "ListEditor");
    const otherId = await createSignedInUser(t, "ListViewer");
    const asOwner = sessionOf(t, ownerId);
    const asOther = sessionOf(t, otherId);

    await expect(t.query(api.groceryLists.listMine)).rejects.toThrow(
      /Unauthenticated/,
    );
    await expect(
      t.mutation(api.groceryLists.create, { name: "Anonymous" }),
    ).rejects.toThrow(/Unauthenticated/);
    await expect(
      asOwner.mutation(api.groceryLists.create, { name: "  " }),
    ).rejects.toThrow(/List name/);

    const listId = await asOwner.mutation(api.groceryLists.create, {
      name: "Editable list",
    });
    expect(await asOther.query(api.groceryLists.get, { listId })).toBeNull();
    expect(await asOwner.query(api.groceryLists.listMine)).toHaveLength(1);
    await expect(
      asOwner.mutation(api.groceryLists.updateList, { listId, name: " " }),
    ).rejects.toThrow(/List name/);
    await asOwner.mutation(api.groceryLists.updateList, {
      listId,
      status: "active",
    });
    await expect(
      asOwner.mutation(api.groceryLists.addItem, { listId, name: " " }),
    ).rejects.toThrow(/Item name/);
    await expect(
      asOwner.mutation(api.groceryLists.addItem, {
        listId,
        name: "Milk",
        quantity: -1,
      }),
    ).rejects.toThrow(/Quantity/);
    await expect(
      asOwner.mutation(api.groceryLists.addItem, {
        listId,
        name: "Milk",
        unit: "x".repeat(101),
      }),
    ).rejects.toThrow(/Unit must be at most 100 characters/);
    await expect(
      asOwner.mutation(api.groceryLists.save, {
        listId,
        requestId: "bounded-list-fields",
        name: "Editable list",
        items: [
          {
            name: "Milk",
            notes: "x".repeat(501),
            isChecked: false,
            sortOrder: 1,
          },
        ],
      }),
    ).rejects.toThrow(/Notes must be at most 500 characters/);

    const firstItemId = await asOwner.mutation(api.groceryLists.addItem, {
      listId,
      name: "Milk",
    });
    const secondItemId = await asOwner.mutation(api.groceryLists.addItem, {
      listId,
      name: "Bread",
      quantity: null,
      quantityText: null,
      unit: null,
      category: null,
      notes: null,
    });
    await asOwner.mutation(api.groceryLists.updateItem, {
      itemId: firstItemId,
      quantity: null,
      quantityText: null,
      unit: null,
      category: null,
      notes: null,
      sortOrder: 4,
    });
    await expect(
      asOwner.mutation(api.groceryLists.updateItem, {
        itemId: firstItemId,
        sortOrder: -1,
      }),
    ).rejects.toThrow(/Sort order/);
    await expect(
      asOwner.mutation(api.groceryLists.updateItem, {
        itemId: firstItemId,
        quantity: Number.POSITIVE_INFINITY,
      }),
    ).rejects.toThrow();

    await asOwner.mutation(api.groceryLists.removeItem, {
      itemId: secondItemId,
    });
    await expect(
      asOwner.mutation(api.groceryLists.removeItem, {
        itemId: secondItemId,
      }),
    ).rejects.toThrow(/not found/);
  });

  it("cleans generated-list provenance and enforces the item limit", async () => {
    const t = initTest();
    const ownerId = await createSignedInUser(t, "BulkShopper");
    const asOwner = sessionOf(t, ownerId);
    const recipeId = await createRecipe(t, "list-source", {
      requestedBy: ownerId,
    });
    const { listId, sourcedItemId, importId } = await t.run(async (ctx) => {
      const recipe = await ctx.db.get(recipeId);
      if (recipe?.importId === undefined) throw new Error("Missing test import");
      const now = Date.now();
      const generatedListId = await ctx.db.insert("groceryLists", {
        userId: ownerId,
        name: "Generated",
        sourceRecipeId: recipeId,
        sourceRecipeTitle: "list-source",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const recipeIngredientId = await ctx.db.insert("recipeIngredients", {
        recipeId,
        position: 1,
        originalText: "1 apple",
        name: "Apple",
        normalizedName: "apple",
        isOptional: false,
      });
      const itemId = await ctx.db.insert("groceryListItems", {
        listId: generatedListId,
        name: "Apple",
        normalizedName: "apple",
        isChecked: false,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("groceryListItemSources", {
        groceryListItemId: itemId,
        recipeId,
        recipeIngredientId,
        servingsMultiplier: 1,
        createdAt: now,
      });
      await ctx.db.patch(recipe.importId, {
        generatedGroceryListId: generatedListId,
      });
      for (let position = 2; position <= 500; position += 1) {
        await ctx.db.insert("groceryListItems", {
          listId: generatedListId,
          name: `Item ${position}`,
          normalizedName: `item ${position}`,
          isChecked: false,
          sortOrder: position,
          createdAt: now,
          updatedAt: now,
        });
      }
      return {
        listId: generatedListId,
        sourcedItemId: itemId,
        importId: recipe.importId,
      };
    });

    await expect(
      asOwner.mutation(api.groceryLists.addItem, {
        listId,
        name: "Overflow",
      }),
    ).rejects.toThrow(/at most 500/);
    await asOwner.mutation(api.groceryLists.removeItem, {
      itemId: sourcedItemId,
    });
    await asOwner.mutation(api.groceryLists.removeList, { listId });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(importId))?.generatedGroceryListId).toBeUndefined();
    });
  });
});

describe("agent review and ingestion error branches", () => {
  it("marks truncated, uncertain output for review and reuses catalog entries", async () => {
    const t = initTest();
    const userId = await createUser(t, "Reviewer");
    const importId = await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("ingredients", {
        name: "Salt",
        normalizedName: "salt",
        createdAt: now,
        updatedAt: now,
      });
      const id = await ctx.db.insert("recipeImports", {
        requestedBy: userId,
        sourceUrl: "not-a-valid-url",
        normalizedUrl: "not-a-valid-url",
        status: "processing",
        attemptCount: 1,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("recipeScrapeArtifacts", {
        importId: id,
        sourceUrl: "not-a-valid-url",
        normalizedUrl: "not-a-valid-url",
        markdown: "A partial recipe",
        truncated: true,
        scrapedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return id;
    });
    const extraction = {
      title: "Partial Soup",
      description: null,
      sourceSite: null,
      sourceAuthor: null,
      yieldText: null,
      servings: null,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      totalTimeMinutes: null,
      cuisines: [],
      categories: [],
      keywords: [],
      instructions: [{ position: 4, text: "Simmer.", section: "Soup" }],
      ingredients: [
        {
          position: 3,
          section: "Soup",
          originalText: "Salt to taste",
          name: "Salt",
          normalizedName: "   ",
          quantity: null,
          quantityText: null,
          unit: null,
          preparation: null,
          notes: null,
          category: null,
          isOptional: false,
        },
      ],
      warnings: ["  Quantity was unclear.  ", ""],
    };

    const result = await t.mutation(
      internal.recipeAgentData.persistGeneratedRecipe,
      { importId, model: "anthropic/test-model", extraction },
    );
    expect(result.needsReview).toBe(true);
    await t.run(async (ctx) => {
      expect(await ctx.db.get(importId)).toMatchObject({
        status: "needs_review",
        agentWarnings: [
          "Quantity was unclear.",
          "The source scrape was truncated; review the generated recipe.",
        ],
      });
      expect(await ctx.db.get(result.recipeId)).toMatchObject({
        title: "Partial Soup",
        instructions: [{ position: 1, text: "Simmer.", section: "Soup" }],
      });
    });
  });

  it("rejects missing ownership, evidence, and incomplete agent output", async () => {
    const t = initTest();
    const userId = await createUser(t, "ErrorCase");
    const baseExtraction = {
      title: "Recipe",
      description: null,
      sourceSite: null,
      sourceAuthor: null,
      yieldText: null,
      servings: null,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      totalTimeMinutes: null,
      cuisines: [],
      categories: [],
      keywords: [],
      instructions: [{ position: 1, text: "Cook.", section: null }],
      ingredients: [
        {
          position: 1,
          section: null,
          originalText: "1 egg",
          name: "Egg",
          normalizedName: "egg",
          quantity: 1,
          quantityText: "1",
          unit: null,
          preparation: null,
          notes: null,
          category: null,
          isOptional: false,
        },
      ],
      warnings: [],
    };
    const { ownerlessId, noArtifactId, incompleteId } = await t.run(
      async (ctx) => {
        const now = Date.now();
        const ownerless = await ctx.db.insert("recipeImports", {
          sourceUrl: "https://example.com/ownerless",
          normalizedUrl: "https://example.com/ownerless",
          status: "processing",
          attemptCount: 1,
          createdAt: now,
          updatedAt: now,
        });
        const noArtifact = await ctx.db.insert("recipeImports", {
          requestedBy: userId,
          sourceUrl: "https://example.com/no-artifact",
          normalizedUrl: "https://example.com/no-artifact",
          status: "processing",
          attemptCount: 1,
          createdAt: now,
          updatedAt: now,
        });
        const incomplete = await ctx.db.insert("recipeImports", {
          requestedBy: userId,
          sourceUrl: "https://example.com/incomplete",
          normalizedUrl: "https://example.com/incomplete",
          status: "processing",
          attemptCount: 1,
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("recipeScrapeArtifacts", {
          importId: incomplete,
          sourceUrl: "https://example.com/incomplete",
          normalizedUrl: "https://example.com/incomplete",
          markdown: "Not complete",
          truncated: false,
          scrapedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        return {
          ownerlessId: ownerless,
          noArtifactId: noArtifact,
          incompleteId: incomplete,
        };
      },
    );

    await expect(
      t.mutation(internal.recipeAgentData.persistGeneratedRecipe, {
        importId: ownerlessId,
        model: "anthropic/test-model",
        extraction: baseExtraction,
      }),
    ).rejects.toThrow(/owning user/);
    await expect(
      t.mutation(internal.recipeAgentData.persistGeneratedRecipe, {
        importId: noArtifactId,
        model: "anthropic/test-model",
        extraction: baseExtraction,
      }),
    ).rejects.toThrow(/artifact/);
    await expect(
      t.mutation(internal.recipeAgentData.persistGeneratedRecipe, {
        importId: incompleteId,
        model: "anthropic/test-model",
        extraction: { ...baseExtraction, ingredients: [] },
      }),
    ).rejects.toThrow(/complete recipe/);

    expect(
      await t.query(internal.recipeAgentData.processingInput, {
        importId: noArtifactId,
      }),
    ).toBeNull();
    expect(
      await t.query(internal.recipeIngestion.agentReadyArtifact, {
        importId: noArtifactId,
      }),
    ).toBeNull();
  });

  it("covers import state transitions and completion outcomes", async () => {
    const t = initTest();
    const missingImportId = await t.run(async (ctx) => {
      const now = Date.now();
      const id = await ctx.db.insert("recipeImports", {
        sourceUrl: "https://example.com/deleted",
        normalizedUrl: "https://example.com/deleted",
        status: "queued",
        attemptCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.delete(id);
      return id;
    });
    expect(
      await t.query(internal.recipeIngestion.importForScrape, {
        importId: missingImportId,
      }),
    ).toBeNull();
    await expect(
      t.mutation(internal.recipeIngestion.markScraping, {
        importId: missingImportId,
      }),
    ).rejects.toThrow(/not found/);

    const importId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("recipeImports", {
        sourceUrl: "https://example.com/state",
        normalizedUrl: "https://example.com/state",
        workflowId: "workflow-state",
        status: "queued",
        attemptCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    });
    await t.mutation(internal.recipeIngestion.markScraping, { importId });
    await t.mutation(internal.recipeIngestion.markScraping, { importId });
    await t.mutation(internal.recipeIngestion.onIngestionComplete, {
      workflowId: "workflow-state",
      context: { importId },
      result: { kind: "canceled" },
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(importId)).toMatchObject({
        status: "failed",
        errorMessage: "Recipe ingestion was canceled",
      });
    });

    const completedId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("recipeImports", {
        sourceUrl: "https://example.com/completed",
        normalizedUrl: "https://example.com/completed",
        workflowId: "workflow-complete",
        status: "completed",
        attemptCount: 1,
        createdAt: now,
        updatedAt: now,
      });
    });
    await t.mutation(internal.recipeIngestion.onIngestionComplete, {
      workflowId: "workflow-complete",
      context: { importId: completedId },
      result: { kind: "failed", error: "Ignored" },
    });
    await t.mutation(internal.recipeIngestion.onIngestionComplete, {
      workflowId: "workflow-complete",
      context: { importId: completedId },
      result: { kind: "success", returnValue: null },
    });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(completedId))?.status).toBe("completed");
    });
  });
});
