import { Blob as NodeBlob } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { insertUserRecipe } from "./lib/userRecipes";
import { initAuthTest, signedInUser, type AuthTest } from "./testing.helpers";

describe("listBook", () => {
  it("says which recipes the user owns, so the list can remove them", async () => {
    const t = initAuthTest();
    const ada = await signedInUser(t, "ada@example.com");
    const grace = await signedInUser(t, "grace@example.com");
    const mine = await t.run((ctx) => insertUserRecipe(ctx, ada.userId, { title: "Mine", ingredients: [], instructions: [] }));
    const shared = await t.run(async (ctx) => {
      const id = await insertUserRecipe(ctx, grace.userId, { title: "Shared", ingredients: [], instructions: [] });
      await ctx.db.patch(id, { isPublic: true });
      return id;
    });
    await ada.as.mutation(api.recipeCards.addToBook, { recipeId: shared });

    const book = await ada.as.query(api.recipes.listBook, {});
    expect(Object.fromEntries(book.map((recipe) => [recipe._id, recipe.canEdit]))).toEqual({ [mine]: true, [shared]: false });

    // Removing someone else's recipe only unsaves it; removing one's own is refused to others.
    await expect(ada.as.mutation(api.recipeCards.removeCard, { recipeId: shared })).rejects.toThrow(/Forbidden/);
    await ada.as.mutation(api.recipeCards.removeFromBook, { recipeId: shared });
    expect((await ada.as.query(api.recipes.listBook, {})).map((recipe) => recipe._id)).toEqual([mine]);
    expect(await grace.as.query(api.recipes.get, { recipeId: shared })).not.toBeNull();
  });
});

/** An import the user started, finished with a draft recipe as the pipeline leaves it (not in the book). */
async function finishedImport(
  t: AuthTest,
  userId: Id<"users">,
  sourceUrl = "https://www.example.com/best-chili",
  status: "completed" | "needs_review" = "completed",
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const importId = await ctx.db.insert("recipeImports", {
      requestedBy: userId,
      sourceUrl,
      normalizedUrl: sourceUrl,
      sourceKind: "direct",
      status,
      attemptCount: 1,
      agentWarnings: status === "needs_review" ? ["Check the cooking time."] : [],
      createdAt: now,
      updatedAt: now,
    });
    const imageStorageId = await ctx.storage.store(new NodeBlob(["image"], { type: "image/png" }) as unknown as Blob);
    const draftId = await ctx.db.insert("recipes", {
      importId,
      sourceUrl,
      normalizedSourceUrl: sourceUrl,
      isPublic: false,
      sourceSite: "example.com",
      sourceAuthor: "Sam",
      title: "The Best Chili",
      description: "Smoky and rich.",
      imageStorageId,
      yieldText: "6 bowls",
      servings: 6,
      prepTimeMinutes: 15,
      cookTimeMinutes: 60,
      totalTimeMinutes: 75,
      cuisines: ["Tex-Mex"],
      categories: ["Dinner"],
      keywords: [],
      instructions: [{ position: 1, text: "Brown the beef." }, { position: 2, text: "Simmer.", section: "Cook" }],
      createdAt: now,
      updatedAt: now,
    });
    for (const [index, name] of ["beef", "beans"].entries()) {
      await ctx.db.insert("recipeIngredients", {
        recipeId: draftId,
        position: index + 1,
        originalText: `1 lb ${name}`,
        name,
        normalizedName: name,
        quantity: 1,
        unit: "lb",
        isOptional: false,
      });
    }
    await ctx.db.patch(importId, { recipeId: draftId });
    return { importId, draftId, imageStorageId };
  });
}

async function ingredientsOf(t: AuthTest, recipeId: Id<"recipes">) {
  return await t.run((ctx) =>
    ctx.db.query("recipeIngredients").withIndex("by_recipe_and_position", (q) => q.eq("recipeId", recipeId)).collect(),
  );
}

describe("importing a link into an existing recipe", () => {
  const url = "https://www.example.com/best-chili";

  it("starts the usual import for the owner, and refuses someone else's recipe or a non-link", async () => {
    const t = initAuthTest();
    const ada = await signedInUser(t, "ada@example.com");
    const grace = await signedInUser(t, "grace@example.com");
    const chili = await t.run((ctx) => insertUserRecipe(ctx, ada.userId, { title: "Chili", ingredients: [], instructions: [] }));
    const { startRecipeFill } = await import("./recipeCards");
    const start = vi.fn().mockResolvedValue("workflow-1");

    await expect(t.run((ctx) => startRecipeFill(ctx, grace.userId, { recipeId: chili, sourceUrl: url }, start))).rejects.toThrow(/Forbidden/);
    await expect(grace.as.mutation(api.recipeCards.importIntoRecipe, { recipeId: chili, sourceUrl: url })).rejects.toThrow(/Forbidden/);

    await expect(t.run((ctx) => startRecipeFill(ctx, ada.userId, { recipeId: chili, sourceUrl: "chili" }, start))).rejects.toThrow(/link/);
    const importId = await t.run((ctx) => startRecipeFill(ctx, ada.userId, { recipeId: chili, sourceUrl: ` ${url} ` }, start));
    expect(start).toHaveBeenCalledTimes(1);
    expect(await t.run((ctx) => ctx.db.get(importId))).toMatchObject({ requestedBy: ada.userId, sourceUrl: url, status: "queued" });
  });

  it("fills the same recipe from the import, keeping its id, its planner slots and its title unless accepted", async () => {
    const t = initAuthTest();
    const ada = await signedInUser(t, "ada@example.com");
    const chili = await t.run((ctx) => insertUserRecipe(ctx, ada.userId, { title: "Chili", ingredients: [], instructions: [] }));
    const plannerId = await ada.as.mutation(api.planner.ensure, {});
    await ada.as.mutation(api.planner.attachRecipe, { plannerId, date: "2026-11-18", meal: "dinner", recipeId: chili });
    const { importId, draftId, imageStorageId } = await finishedImport(t, ada.userId);

    await ada.as.mutation(api.recipeCards.fillFromImport, { recipeId: chili, importId, useImportedTitle: false, replaceExisting: false });

    const filled = await ada.as.query(api.recipes.get, { recipeId: chili });
    expect(filled?.recipe).toMatchObject({
      _id: chili,
      title: "Chili",
      sourceUrl: url,
      normalizedSourceUrl: url,
      sourceSite: "example.com",
      sourceAuthor: "Sam",
      description: "Smoky and rich.",
      servings: 6,
      yieldText: "6 bowls",
      prepTimeMinutes: 15,
      cookTimeMinutes: 60,
      totalTimeMinutes: 75,
      categories: ["Dinner"],
      cuisines: ["Tex-Mex"],
      instructions: [{ position: 1, text: "Brown the beef." }, { position: 2, text: "Simmer.", section: "Cook" }],
    });
    expect(filled?.recipe.imageUrl).toBeTruthy();
    expect(filled?.canEdit).toBe(true);
    expect(filled?.saved).not.toBeNull();
    expect((await ingredientsOf(t, chili)).map((item) => [item.position, item.originalText])).toEqual([[1, "1 lb beef"], [2, "1 lb beans"]]);
    expect(await t.run((ctx) => ctx.db.get(chili))).toMatchObject({ imageStorageId });

    // The draft the import made is discarded rather than left as a second recipe.
    expect(await t.run((ctx) => ctx.db.get(draftId))).toMatchObject({ deletedAt: expect.any(Number) });
    expect((await ada.as.query(api.recipes.listBook, {})).map((recipe) => recipe._id)).toEqual([chili]);

    const { slots } = await ada.as.query(api.planner.week, { plannerId, start: "2026-11-16" });
    expect(slots[0]).toMatchObject({ name: "Chili", recipe: { recipeId: chili, ingredientCount: 2, available: true } });
  });

  it("takes the imported title only when accepted, and refuses to replace contents without consent", async () => {
    const t = initAuthTest();
    const ada = await signedInUser(t, "ada@example.com");
    const chili = await t.run((ctx) => insertUserRecipe(ctx, ada.userId, { title: "Chili", ingredients: ["old beans"], instructions: ["Old step."] }));
    const { importId } = await finishedImport(t, ada.userId);

    await expect(
      ada.as.mutation(api.recipeCards.fillFromImport, { recipeId: chili, importId, useImportedTitle: true, replaceExisting: false }),
    ).rejects.toThrow(/already has ingredients or instructions/);
    expect((await ingredientsOf(t, chili)).map((item) => item.originalText)).toEqual(["old beans"]);

    await ada.as.mutation(api.recipeCards.fillFromImport, { recipeId: chili, importId, useImportedTitle: true, replaceExisting: true });
    const filled = await ada.as.query(api.recipes.get, { recipeId: chili });
    expect(filled?.recipe.title).toBe("The Best Chili");
    expect(filled?.recipe.instructions.map((step) => step.text)).toEqual(["Brown the beef.", "Simmer."]);
    expect((await ingredientsOf(t, chili)).map((item) => item.originalText)).toEqual(["1 lb beef", "1 lb beans"]);
  });

  it("only lets the owner fill their own recipe from their own finished import", async () => {
    const t = initAuthTest();
    const ada = await signedInUser(t, "ada@example.com");
    const grace = await signedInUser(t, "grace@example.com");
    const adaChili = await t.run((ctx) => insertUserRecipe(ctx, ada.userId, { title: "Chili", ingredients: [], instructions: [] }));
    const graceChili = await t.run((ctx) => insertUserRecipe(ctx, grace.userId, { title: "Chili", ingredients: [], instructions: [] }));
    const adaImport = await finishedImport(t, ada.userId);
    const args = { useImportedTitle: false, replaceExisting: true };

    await expect(grace.as.mutation(api.recipeCards.fillFromImport, { recipeId: adaChili, importId: adaImport.importId, ...args })).rejects.toThrow(/Forbidden/);
    await expect(grace.as.mutation(api.recipeCards.fillFromImport, { recipeId: graceChili, importId: adaImport.importId, ...args })).rejects.toThrow(/import was not found/);
    await expect(ada.as.mutation(api.recipeCards.fillFromImport, { recipeId: adaImport.draftId, importId: adaImport.importId, ...args })).rejects.toThrow(/itself/);

    const pending = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("recipeImports", {
        requestedBy: ada.userId, sourceUrl: "https://example.com/x", normalizedUrl: "https://example.com/x", status: "processing", attemptCount: 1, createdAt: now, updatedAt: now,
      });
    });
    await expect(ada.as.mutation(api.recipeCards.fillFromImport, { recipeId: adaChili, importId: pending, ...args })).rejects.toThrow(/not ready/);
    expect(await ingredientsOf(t, graceChili)).toEqual([]);
    expect(await ingredientsOf(t, adaChili)).toEqual([]);
  });

  it("keeps an imported recipe the user already saved, copying from it instead of discarding it", async () => {
    const t = initAuthTest();
    const ada = await signedInUser(t, "ada@example.com");
    const chili = await t.run((ctx) => insertUserRecipe(ctx, ada.userId, { title: "Chili", ingredients: [], instructions: [] }));
    const { importId, draftId } = await finishedImport(t, ada.userId);
    await ada.as.mutation(api.recipeCards.addToBook, { recipeId: draftId });

    await ada.as.mutation(api.recipeCards.fillFromImport, { recipeId: chili, importId, useImportedTitle: false, replaceExisting: false });
    expect(await t.run((ctx) => ctx.db.get(draftId))).not.toHaveProperty("deletedAt");
    expect((await ingredientsOf(t, draftId))).toHaveLength(2);
    expect((await ingredientsOf(t, chili))).toHaveLength(2);
    const [draft, filled] = await t.run((ctx) => Promise.all([ctx.db.get(draftId), ctx.db.get(chili)]));
    expect(draft?.imageStorageId).toBeDefined();
    expect(filled?.imageStorageId).toBe(draft?.imageStorageId);
  });
});
