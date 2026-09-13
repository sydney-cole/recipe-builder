import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

function initTest() {
  return convexTest(schema, modules);
}

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

describe("daily recipe recommendations", () => {
  it("allows one refresh and reuses the saved recommendations for the day", async () => {
    const t = initTest();
    const firstClaim = await t.mutation(
      internal.recipeDiscoveryCache.claimDailyRefresh,
      {},
    );
    expect(firstClaim).toEqual({ shouldRefresh: true, cached: null });

    const recipe = {
      url: "https://example.com/daily-recipe",
      title: "Daily recipe",
      description: "A cached recommendation.",
      source: "example.com",
      rating: 4.9,
      ratingCount: 100,
      totalTimeMinutes: 30,
      matchReason: "Highly rated and complete.",
      matchedTerms: [],
      ingredients: ["1 ingredient"],
      instructions: ["Cook it."],
    };
    await t.mutation(
      internal.recipeDiscoveryCache.saveDailyRecommendations,
      { query: "best rated recipes", recipes: [recipe] },
    );

    const secondClaim = await t.mutation(
      internal.recipeDiscoveryCache.claimDailyRefresh,
      {},
    );
    expect(secondClaim).toEqual({
      shouldRefresh: false,
      cached: { query: "best rated recipes", recipes: [recipe] },
    });
  });
});

describe("email functions", () => {
  it("requires authentication and deduplicates normalized URL submissions", async () => {
    const t = initTest();
    await expect(
      t.mutation(api.email.queueUrl, { sourceUrl: "https://example.com/recipe" }),
    ).rejects.toThrow(/Unauthenticated/);

    const userId = await createUser(t, "Ada");
    const asAda = t.withIdentity({ subject: userId });
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
    const imports = await asAda.query(api.email.recentImports);
    expect(imports).toHaveLength(1);
    expect(imports[0].normalizedUrl).toBe("https://example.com/recipe?a=1&b=2");
  });

  it("ignores duplicate links and unknown AgentMail inboxes", async () => {
    const t = initTest();
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
        message_id: "message-1",
        subject: "Two links",
        text: "https://example.com/dinner?utm_source=email https://example.com/dinner",
      },
    });
    expect(first).toEqual({ queued: 0 });

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

  it("bounds webhook event identifiers before deduplication", async () => {
    const t = initTest();
    const userId = await createUser(t, "Bounded Webhook");
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
      await ctx.db.insert("recipeImports", {
        requestedBy: userId,
        sourceUrl: "https://example.com/recipe",
        normalizedUrl: "https://example.com/recipe",
        sourceEventId: longEventId.slice(0, 500),
        status: "queued",
        attemptCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    });

    expect(
      await t.mutation(internal.email.onMessageReceived, {
        eventId: longEventId,
        thread: {},
        message: {
          inbox_id: "bounded-inbox",
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

    const userId = await createUser(t, "Original");
    const asUser = t.withIdentity({ subject: userId });
    await asUser.mutation(api.users.updateProfile, { name: "  Ada Byron  " });
    await asUser.mutation(api.users.updateNotificationPreferences, {
      preferences: {
        recipeImportReady: false,
        importNeedsReview: true,
        subscriptionNeedsAttention: false,
      },
    });

    expect(await asUser.query(api.users.current)).toMatchObject({
      name: "Ada Byron",
      email: "original@example.com",
      notificationPreferences: {
        recipeImportReady: false,
        importNeedsReview: true,
        subscriptionNeedsAttention: false,
      },
    });
  });

  it("rejects blank profile names", async () => {
    const t = initTest();
    const userId = await createUser(t, "Original");
    await expect(
      t.withIdentity({ subject: userId }).mutation(api.users.updateProfile, { name: "   " }),
    ).rejects.toThrow(/Name is required/);
  });
});

describe("recipe authorization", () => {
  it("only returns public, imported, or explicitly saved recipes", async () => {
    const t = initTest();
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
  });

  it("rejects anonymous access", async () => {
    const t = initTest();
    await expect(t.query(api.recipes.list)).rejects.toThrow(/Unauthenticated/);
  });
});

describe("manual recipes", () => {
  it("creates an editable recipe and explicitly adds it to the Recipe Book", async () => {
    const t = initTest();
    const userId = await createUser(t, "ManualCook");
    const asUser = t.withIdentity({ subject: userId });
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
    const userId = await createUser(t, "Mina");
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
      { importId, model: "openai/test-model", extraction },
    );
    const second = await t.mutation(
      internal.recipeAgentData.persistGeneratedRecipe,
      { importId, model: "openai/test-model", extraction },
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

    const asUser = t.withIdentity({ subject: userId });
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
    const ownerId = await createUser(t, "Owner");
    const otherId = await createUser(t, "Other");
    const recipeId = await createRecipe(t, "editable", { requestedBy: ownerId });
    const asOwner = t.withIdentity({ subject: ownerId });
    const asOther = t.withIdentity({ subject: otherId });

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
    const ownerId = await createUser(t, "ReviewOwner");
    const otherId = await createUser(t, "ReviewVisitor");
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
    const asOwner = t.withIdentity({ subject: ownerId });
    const asOther = t.withIdentity({ subject: otherId });

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

describe("editable grocery lists", () => {
  it("supports owned list and item creation, editing, and independent deletion", async () => {
    const t = initTest();
    const ownerId = await createUser(t, "Shopper");
    const otherId = await createUser(t, "Visitor");
    const asOwner = t.withIdentity({ subject: ownerId });
    const asOther = t.withIdentity({ subject: otherId });

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
    const ownerId = await createUser(t, "Editor");
    const recipeId = await createRecipe(t, "branch-recipe", {
      requestedBy: ownerId,
    });
    const asOwner = t.withIdentity({ subject: ownerId });

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
    const ownerId = await createUser(t, "LimitCook");
    const asOwner = t.withIdentity({ subject: ownerId });
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
    const ownerId = await createUser(t, "ExistingListCook");
    const asOwner = t.withIdentity({ subject: ownerId });
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

  it("creates a renamed idempotent merged list and removes both originals", async () => {
    const t = initTest();
    const ownerId = await createUser(t, "ListCombiner");
    const otherId = await createUser(t, "OtherCombiner");
    const asOwner = t.withIdentity({ subject: ownerId });
    const asOther = t.withIdentity({ subject: otherId });
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
    const ownerId = await createUser(t, "ListSaver");
    const otherId = await createUser(t, "OtherSaver");
    const asOwner = t.withIdentity({ subject: ownerId });
    const asOther = t.withIdentity({ subject: otherId });
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
    const ownerId = await createUser(t, "ListEditor");
    const otherId = await createUser(t, "ListViewer");
    const asOwner = t.withIdentity({ subject: ownerId });
    const asOther = t.withIdentity({ subject: otherId });

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
    const ownerId = await createUser(t, "BulkShopper");
    const asOwner = t.withIdentity({ subject: ownerId });
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
      { importId, model: "openai/test-model", extraction },
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
        model: "openai/test-model",
        extraction: baseExtraction,
      }),
    ).rejects.toThrow(/owning user/);
    await expect(
      t.mutation(internal.recipeAgentData.persistGeneratedRecipe, {
        importId: noArtifactId,
        model: "openai/test-model",
        extraction: baseExtraction,
      }),
    ).rejects.toThrow(/artifact/);
    await expect(
      t.mutation(internal.recipeAgentData.persistGeneratedRecipe, {
        importId: incompleteId,
        model: "openai/test-model",
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
