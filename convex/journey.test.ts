import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.test).ts");

describe("import-to-grocery acceptance journey", () => {
  it("moves an owned provider fixture through review, Recipe Book, and a persistent grocery list", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const now = Date.now();
      const userId = await ctx.db.insert("users", { email: "verified@example.com", emailVerificationTime: now });
      const importId = await ctx.db.insert("recipeImports", { requestedBy: userId, sourceUrl: "https://example.com/stew", normalizedUrl: "https://example.com/stew", status: "queued", attemptCount: 0, createdAt: now, updatedAt: now });
      return { userId, importId };
    });
    const claim = await t.mutation(internal.imports.claim, { importId: seeded.importId });
    expect(claim?.attempt).toBe(1);
    await t.mutation(internal.imports.beginGeneration, { importId: seeded.importId, attempt: 1 });
    await t.mutation(internal.imports.completeGeneration, {
      importId: seeded.importId,
      attempt: 1,
      sourceTitle: "Fixture stew",
      sourceSite: "Fixture Kitchen",
      draft: {
        title: "Generated stew",
        cuisines: [], categories: ["Dinner"], keywords: [], servings: 2,
        ingredients: [{ originalText: "1 cup beans", name: "beans", quantity: 1, unit: "cup" }],
        instructions: [{ text: "Simmer." }],
      },
      provenance: { modelId: "fixture-model", promptVersion: "recipe-import-v1", schemaVersion: "recipe-draft-v1", providerRequestId: "fixture-request", generatedAt: Date.now() },
    });
    const owner = t.withIdentity({ subject: seeded.userId });
    expect((await owner.query(api.imports.review, { importId: seeded.importId }))?.draft?.title).toBe("Generated stew");
    const recipeId = await owner.mutation(api.imports.saveReview, {
      importId: seeded.importId,
      draft: { title: "Corrected stew", cuisines: [], categories: ["Dinner"], keywords: [], servings: 2, ingredients: [{ originalText: "1 cup beans", name: "beans", quantity: 1, unit: "cup" }], instructions: [{ text: "Simmer gently." }] },
    });
    expect(await owner.query(api.recipes.list)).toMatchObject([{ _id: recipeId, title: "Corrected stew" }]);
    const recipe = await owner.query(api.recipes.get, { recipeId });
    const listId = await owner.mutation(api.grocery.create, { name: "Fixture shop" });
    await owner.mutation(api.grocery.addRecipe, { listId, recipeId, ingredientIds: recipe!.ingredients.map((item) => item._id), servings: 4, requestKey: "acceptance-fixture" });
    expect((await owner.query(api.grocery.detail, { listId }))?.items[0]).toMatchObject({ name: "beans", quantity: 2, sources: [expect.objectContaining({ recipeTitle: "Corrected stew" })] });
  });
});
