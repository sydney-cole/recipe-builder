import { describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { insertUserRecipe } from "./lib/userRecipes";
import { startSlotImport } from "./planner";
import { initAuthTest, signedInUser, type AuthTest } from "./testing.helpers";

async function plannerFor(t: AuthTest, email: string) {
  const user = await signedInUser(t, email);
  const plannerId = await user.as.mutation(api.planner.ensure, {});
  return { ...user, plannerId };
}

describe("insertUserRecipe", () => {
  it("creates a bare recipe its creator owns and can fill in", async () => {
    const t = initAuthTest();
    const ada = await signedInUser(t, "ada@example.com");
    const grace = await signedInUser(t, "grace@example.com");
    const recipeId = await t.run((ctx) =>
      insertUserRecipe(ctx, ada.userId, { title: "Chili", ingredients: [], instructions: [] }),
    );

    expect(await ada.as.query(api.recipes.listBook, {})).toEqual([
      expect.objectContaining({ _id: recipeId, title: "Chili", sourceSite: "Manual recipe" }),
    ]);
    expect(await ada.as.query(api.recipes.get, { recipeId })).toMatchObject({
      canEdit: true,
      ingredients: [],
      recipe: { instructions: [] },
    });
    await ada.as.mutation(api.recipeCards.addIngredient, { recipeId, name: "beans" });
    expect(await grace.as.query(api.recipes.get, { recipeId })).toBeNull();
  });
});

describe("planner access and preferences", () => {
  it("rejects anonymous callers", async () => {
    const t = initAuthTest();
    await expect(t.query(api.planner.mine, {})).rejects.toThrow(/Unauthenticated/);
    await expect(t.mutation(api.planner.ensure, {})).rejects.toThrow(/Unauthenticated/);
  });

  it("creates one planner per account with default preferences", async () => {
    const t = initAuthTest();
    const { as, userId } = await signedInUser(t, "ada@example.com");
    expect(await as.query(api.planner.mine, {})).toBeNull();

    const first = await as.mutation(api.planner.ensure, {});
    const second = await as.mutation(api.planner.ensure, {});
    expect(second).toBe(first);
    expect(await as.query(api.planner.mine, {})).toEqual({ plannerId: first, weekStart: 1, people: 1, meals: ["breakfast", "lunch", "dinner"] });
    await t.run(async (ctx) => {
      const planners = await ctx.db.query("planners").withIndex("by_owner", (q) => q.eq("ownerId", userId)).collect();
      expect(planners).toHaveLength(1);
    });
  });

  it("saves the week start and rounds and clamps people cooked for", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");

    await as.mutation(api.planner.updatePreferences, { plannerId, weekStart: 6 });
    expect(await as.query(api.planner.mine, {})).toMatchObject({ weekStart: 6, people: 1 });

    for (const [people, expected] of [[3.6, 4], [0, 1], [40, 12], [Number.NaN, 1]] as const) {
      await as.mutation(api.planner.updatePreferences, { plannerId, people });
      expect(await as.query(api.planner.mine, {})).toMatchObject({ weekStart: 6, people: expected });
    }
  });

  it("does not let another user change a planner", async () => {
    const t = initAuthTest();
    const { plannerId } = await plannerFor(t, "ada@example.com");
    const grace = await signedInUser(t, "grace@example.com");
    await expect(
      grace.as.mutation(api.planner.updatePreferences, { plannerId, people: 2 }),
    ).rejects.toThrow(/Planner was not found/);
  });
});

async function slotOf(t: AuthTest, plannerId: Id<"planners">, date: string, meal: "breakfast" | "lunch" | "dinner") {
  return await t.run((ctx) =>
    ctx.db
      .query("planSlots")
      .withIndex("by_planner_and_date", (q) => q.eq("plannerId", plannerId).eq("date", date).eq("meal", meal))
      .unique(),
  );
}

async function recipesOf(t: AuthTest, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    const saved = await ctx.db.query("savedRecipes").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    return await Promise.all(saved.map(async (item) => (await ctx.db.get(item.recipeId))!));
  });
}

describe("commitText", () => {
  const lunch = { date: "2026-11-18", meal: "lunch" } as const;

  it("links a saved recipe by its normalised name instead of creating one", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    const chili = await t.run((ctx) => insertUserRecipe(ctx, userId, { title: "Chili", ingredients: [], instructions: [] }));

    expect(await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "  CHILI!! " })).toEqual({ type: "cook", name: "Chili" });
    expect(await slotOf(t, plannerId, lunch.date, lunch.meal)).toMatchObject({ type: "cook", recipeId: chili });
    expect(await recipesOf(t, userId)).toHaveLength(1);
  });

  it("keeps a typed name with no recipe attached when no saved recipe has that name", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    await t.run((ctx) => insertUserRecipe(ctx, userId, { title: "Shrimp Peperonata", ingredients: [], instructions: [] }));

    expect(await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "Shrimp Pepero ata" })).toEqual({ type: "cook", name: "Shrimp Pepero ata" });
    const slot = await slotOf(t, plannerId, lunch.date, lunch.meal);
    expect(slot).toMatchObject({ type: "cook", name: "Shrimp Pepero ata" });
    expect(slot).not.toHaveProperty("recipeId");
    expect((await recipesOf(t, userId)).map((recipe) => recipe.title)).toEqual(["Shrimp Peperonata"]);
  });

  it("keeps a plain name when two saved recipes share it, and keeps an attached one on retyping", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    const first = await t.run((ctx) => insertUserRecipe(ctx, userId, { title: "Chili", ingredients: [], instructions: [] }));
    await t.run((ctx) => insertUserRecipe(ctx, userId, { title: "chili", ingredients: ["beans"], instructions: [] }));

    await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "Chili" });
    expect(await slotOf(t, plannerId, lunch.date, lunch.meal)).not.toHaveProperty("recipeId");

    await as.mutation(api.planner.attachRecipe, { plannerId, ...lunch, recipeId: first });
    expect(await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "CHILI" })).toEqual({ type: "cook", name: "Chili" });
    expect(await slotOf(t, plannerId, lunch.date, lunch.meal)).toMatchObject({ recipeId: first });
    expect(await recipesOf(t, userId)).toHaveLength(2);
  });

  it("does not match another user's recipe or a deleted one, and creates none", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    const grace = await signedInUser(t, "grace@example.com");
    await t.run((ctx) => insertUserRecipe(ctx, grace.userId, { title: "Chili", ingredients: [], instructions: [] }));
    const deleted = await t.run((ctx) => insertUserRecipe(ctx, userId, { title: "Stew", ingredients: [], instructions: [] }));
    await t.run((ctx) => ctx.db.patch(deleted, { deletedAt: Date.now() }));

    await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "Chili" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-18", meal: "dinner", text: "Stew" });
    const live = (await recipesOf(t, userId)).filter((recipe) => recipe.deletedAt === undefined);
    expect(live).toEqual([]);
    expect(await slotOf(t, plannerId, lunch.date, lunch.meal)).toMatchObject({ type: "cook", name: "Chili" });
    expect(await slotOf(t, plannerId, "2026-11-18", "dinner")).not.toHaveProperty("recipeId");
  });

  it("sets the type from typed text in an unplanned slot", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");

    expect(await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "out at Chipotle" })).toEqual({ type: "out", name: "Chipotle" });
    expect(await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-19", meal: "lunch", text: "out chipotle" })).toEqual({ type: "out", name: "Chipotle" });
    const first = await slotOf(t, plannerId, lunch.date, lunch.meal);
    const second = await slotOf(t, plannerId, "2026-11-19", "lunch");
    expect(first?.type === "out" && second?.type === "out" && first.mealId === second.mealId && first.mealId !== undefined).toBe(true);

    expect(await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-18", meal: "dinner", text: "skip" })).toEqual({ type: "skip", name: "" });
    expect(await slotOf(t, plannerId, "2026-11-18", "dinner")).toMatchObject({ type: "skip" });
  });

  it("points typed leftovers at the newest earlier meal, or other leftovers", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-17", meal: "dinner", text: "Curry" });

    await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "leftovers" });
    expect(await slotOf(t, plannerId, lunch.date, lunch.meal)).toMatchObject({ type: "left", from: { date: "2026-11-17", meal: "dinner" } });

    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-10", meal: "lunch", text: "Left over" });
    expect(await slotOf(t, plannerId, "2026-11-10", "lunch")).toMatchObject({ type: "left", from: "other" });
  });

  it("keeps the type of a planned slot, and empty text unlinks the recipe", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    const chili = await t.run((ctx) => insertUserRecipe(ctx, userId, { title: "Chili", ingredients: [], instructions: [] }));
    await as.mutation(api.planner.attachRecipe, { plannerId, ...lunch, recipeId: chili });
    expect(await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "skip" })).toEqual({ type: "cook", name: "skip" });

    expect(await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "" })).toEqual({ type: "cook", name: "" });
    const slot = await slotOf(t, plannerId, lunch.date, lunch.meal);
    expect(slot).toMatchObject({ type: "cook" });
    expect(slot?.type === "cook" && (slot.recipeId ?? slot.name)).toBeFalsy();
    expect((await recipesOf(t, userId)).map((recipe) => recipe.title)).toEqual(["Chili"]);
  });

  it("does nothing when the text equals the current name", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "Chili" });
    const before = await slotOf(t, plannerId, lunch.date, lunch.meal);
    await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: " Chili " });
    expect(await slotOf(t, plannerId, lunch.date, lunch.meal)).toEqual(before);
  });

  it("rejects links, slots without text, bad dates and other users", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    await expect(as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "https://example.com/chili" })).rejects.toThrow(/importLink/);
    await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "skip" });
    await expect(as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "Chili" })).rejects.toThrow(/no text/);
    await expect(as.mutation(api.planner.commitText, { plannerId, date: "2026-02-30", meal: "lunch", text: "Chili" })).rejects.toThrow(/Invalid date/);
    const grace = await signedInUser(t, "grace@example.com");
    await expect(grace.as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "Chili" })).rejects.toThrow(/Planner was not found/);
  });
});

describe("setType", () => {
  const lunch = { date: "2026-11-18", meal: "lunch" } as const;

  it("clears the slot when the selected type is pressed again", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.setType, { plannerId, ...lunch, type: "cook" });
    expect(await slotOf(t, plannerId, lunch.date, lunch.meal)).toMatchObject({ type: "cook" });
    await as.mutation(api.planner.setType, { plannerId, ...lunch, type: "cook" });
    expect(await slotOf(t, plannerId, lunch.date, lunch.meal)).toBeNull();
  });

  it("carries the name between Cook and Eat out", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "Chili" });
    await as.mutation(api.planner.setType, { plannerId, ...lunch, type: "out" });
    const out = await slotOf(t, plannerId, lunch.date, lunch.meal);
    expect(out?.type).toBe("out");
    const meal = await t.run(async (ctx) => (out?.type === "out" && out.mealId ? ctx.db.get(out.mealId) : null));
    expect(meal?.name).toBe("Chili");

    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-19", meal: "lunch", text: "out Tacos" });
    await as.mutation(api.planner.setType, { plannerId, date: "2026-11-19", meal: "lunch", type: "cook" });
    expect(await slotOf(t, plannerId, "2026-11-19", "lunch")).toMatchObject({ type: "cook", name: "Tacos" });
    expect(await recipesOf(t, userId)).toEqual([]);
  });

  it("carries the name of other leftovers to Cook and Eat out", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "leftovers" });
    await as.mutation(api.planner.commitOther, { plannerId, ...lunch, text: "Pizza" });
    await as.mutation(api.planner.setType, { plannerId, ...lunch, type: "out" });
    const out = await slotOf(t, plannerId, lunch.date, lunch.meal);
    const meal = await t.run(async (ctx) => (out?.type === "out" && out.mealId ? ctx.db.get(out.mealId) : null));
    expect(meal?.name).toBe("Pizza");

    await as.mutation(api.planner.setType, { plannerId, ...lunch, type: "left" });
    expect(await slotOf(t, plannerId, lunch.date, lunch.meal)).toMatchObject({ type: "left", from: "other" });
    await as.mutation(api.planner.commitOther, { plannerId, ...lunch, text: "Curry" });
    await as.mutation(api.planner.setType, { plannerId, ...lunch, type: "cook" });
    expect(await slotOf(t, plannerId, lunch.date, lunch.meal)).toMatchObject({ type: "cook", name: "Curry" });
    expect(await recipesOf(t, userId)).toEqual([]);
  });

  it("uses unsaved typed text as the name in one change, and creates no recipe", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.setType, { plannerId, ...lunch, type: "out", text: " Chipotle " });
    const out = await slotOf(t, plannerId, lunch.date, lunch.meal);
    expect(out?.type).toBe("out");
    const meal = await t.run(async (ctx) => (out?.type === "out" && out.mealId ? ctx.db.get(out.mealId) : null));
    expect(meal?.name).toBe("Chipotle");
    expect(await recipesOf(t, userId)).toEqual([]);

    // Typed text replaces the saved name; Skip ignores it.
    await as.mutation(api.planner.setType, { plannerId, ...lunch, type: "cook", text: "Burrito bowl" });
    expect(await slotOf(t, plannerId, lunch.date, lunch.meal)).toMatchObject({ type: "cook", name: "Burrito bowl" });
    expect(await recipesOf(t, userId)).toEqual([]);
    await as.mutation(api.planner.setType, { plannerId, date: "2026-11-19", meal: "lunch", type: "skip", text: "Pizza" });
    expect(await slotOf(t, plannerId, "2026-11-19", "lunch")).toMatchObject({ type: "skip" });
    await expect(
      as.mutation(api.planner.setType, { plannerId, ...lunch, type: "out", text: "https://example.com/chili" }),
    ).rejects.toThrow(/importLink/);
  });

  it("drops the name for Skip and picks the newest source for Leftovers across weeks", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-15", meal: "dinner", text: "Roast" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-16", meal: "lunch", text: "Chili" });

    await as.mutation(api.planner.setType, { plannerId, date: "2026-11-16", meal: "lunch", type: "skip" });
    expect(await slotOf(t, plannerId, "2026-11-16", "lunch")).toMatchObject({ type: "skip" });

    await as.mutation(api.planner.setType, { plannerId, date: "2026-11-16", meal: "lunch", type: "left" });
    expect(await slotOf(t, plannerId, "2026-11-16", "lunch")).toMatchObject({
      type: "left",
      from: { date: "2026-11-15", meal: "dinner" },
    });
  });
});

describe("attaching a recipe to a slot", () => {
  const lunch = { date: "2026-11-18", meal: "lunch" } as const;

  it("attaches a chosen recipe, replacing a plain name and making the slot Cook", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "out Thai" });
    const curry = await t.run((ctx) => insertUserRecipe(ctx, userId, { title: "  Green   curry ", ingredients: ["paste"], instructions: [] }));

    expect(await as.mutation(api.planner.attachRecipe, { plannerId, ...lunch, recipeId: curry })).toEqual({ name: "Green curry" });
    const slot = await slotOf(t, plannerId, lunch.date, lunch.meal);
    expect(slot).toMatchObject({ type: "cook", recipeId: curry });
    expect(slot).not.toHaveProperty("name");
    const { slots } = await as.query(api.planner.week, { plannerId, start: "2026-11-16" });
    expect(slots[0]).toMatchObject({ name: "Green curry", recipe: { recipeId: curry, ingredientCount: 1, available: true } });
  });

  it("refuses another user's recipe, a removed one, and another user's planner", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    const grace = await plannerFor(t, "grace@example.com");
    const theirs = await t.run((ctx) => insertUserRecipe(ctx, grace.userId, { title: "Secret", ingredients: [], instructions: [] }));
    const removed = await t.run((ctx) => insertUserRecipe(ctx, userId, { title: "Gone", ingredients: [], instructions: [] }));
    await as.mutation(api.recipeCards.removeCard, { recipeId: removed });
    const mine = await t.run((ctx) => insertUserRecipe(ctx, userId, { title: "Mine", ingredients: [], instructions: [] }));

    await expect(as.mutation(api.planner.attachRecipe, { plannerId, ...lunch, recipeId: theirs })).rejects.toThrow(/Recipe was not found/);
    await expect(as.mutation(api.planner.attachRecipe, { plannerId, ...lunch, recipeId: removed })).rejects.toThrow(/Recipe was not found/);
    await expect(grace.as.mutation(api.planner.attachRecipe, { plannerId, ...lunch, recipeId: mine })).rejects.toThrow(/Planner was not found/);
    await expect(as.mutation(api.planner.attachRecipe, { plannerId, date: "2026-13-01", meal: "lunch", recipeId: mine })).rejects.toThrow(/Invalid date/);
    expect(await slotOf(t, plannerId, lunch.date, lunch.meal)).toBeNull();
  });
});

describe("creating a recipe from a slot", () => {
  const lunch = { date: "2026-11-18", meal: "lunch" } as const;

  it("creates one bare recipe in the Recipe Book only when asked, and attaches it", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "Lentil soup" });
    expect(await recipesOf(t, userId)).toEqual([]);

    const created = await as.mutation(api.planner.createRecipeForSlot, { plannerId, ...lunch, name: "  Lentil   soup " });
    expect(created.name).toBe("Lentil soup");
    const recipes = await recipesOf(t, userId);
    expect(recipes.map((recipe) => [recipe._id, recipe.title])).toEqual([[created.recipeId, "Lentil soup"]]);
    expect(await slotOf(t, plannerId, lunch.date, lunch.meal)).toMatchObject({ type: "cook", recipeId: created.recipeId });
    expect(await as.query(api.recipes.get, { recipeId: created.recipeId })).toMatchObject({ canEdit: true });
  });

  it("rejects an empty name, a link and another user's planner", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    const grace = await signedInUser(t, "grace@example.com");
    await expect(as.mutation(api.planner.createRecipeForSlot, { plannerId, ...lunch, name: "   " })).rejects.toThrow(/needs a name/);
    await expect(as.mutation(api.planner.createRecipeForSlot, { plannerId, ...lunch, name: "https://example.com/chili" })).rejects.toThrow(/importLink/);
    await expect(grace.as.mutation(api.planner.createRecipeForSlot, { plannerId, ...lunch, name: "Chili" })).rejects.toThrow(/Planner was not found/);
    expect(await recipesOf(t, userId)).toEqual([]);
    expect(await recipesOf(t, grace.userId)).toEqual([]);
  });
});

describe("leftovers", () => {
  const dinner = { date: "2026-11-18", meal: "dinner" } as const;

  async function setup() {
    const t = initAuthTest();
    const user = await plannerFor(t, "ada@example.com");
    const { as, plannerId } = user;
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-18", meal: "lunch", text: "Soup" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-16", meal: "dinner", text: "Curry" });
    await as.mutation(api.planner.commitText, { plannerId, ...dinner, text: "leftovers" });
    return { t, ...user };
  }

  it("chooses an offered source", async () => {
    const { t, as, plannerId } = await setup();
    expect(await slotOf(t, plannerId, dinner.date, dinner.meal)).toMatchObject({ from: { date: "2026-11-18", meal: "lunch" } });
    await as.mutation(api.planner.setLeftoverOf, { plannerId, ...dinner, from: { date: "2026-11-16", meal: "dinner" } });
    expect(await slotOf(t, plannerId, dinner.date, dinner.meal)).toMatchObject({ from: { date: "2026-11-16", meal: "dinner" } });
  });

  it("rejects sources that are not offered", async () => {
    const { as, plannerId } = await setup();
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-11", meal: "dinner", text: "Old" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-19", meal: "lunch", text: "Later" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-17", meal: "lunch", text: "skip" });
    await as.mutation(api.planner.setType, { plannerId, date: "2026-11-17", meal: "dinner", type: "cook" });
    for (const from of [
      { date: "2026-11-11", meal: "dinner" },
      { date: "2026-11-19", meal: "lunch" },
      { date: "2026-11-17", meal: "lunch" },
      { date: "2026-11-17", meal: "dinner" },
    ] as const) {
      await expect(as.mutation(api.planner.setLeftoverOf, { plannerId, ...dinner, from })).rejects.toThrow(/can’t be used as leftovers/);
    }
  });

  it("names other leftovers and keeps that name only while the slot stays other", async () => {
    const { t, as, plannerId } = await setup();
    await as.mutation(api.planner.setLeftoverOf, { plannerId, ...dinner, from: "other" });
    expect(await slotOf(t, plannerId, dinner.date, dinner.meal)).toMatchObject({ from: "other" });

    expect(await as.mutation(api.planner.commitOther, { plannerId, ...dinner, text: "Pizza" })).toEqual({ name: "Pizza" });
    const named = await slotOf(t, plannerId, dinner.date, dinner.meal);
    expect(named?.type === "left" && named.mealId).toBeTruthy();

    await as.mutation(api.planner.setLeftoverOf, { plannerId, ...dinner, from: "other" });
    expect(await slotOf(t, plannerId, dinner.date, dinner.meal)).toEqual(expect.objectContaining({ mealId: named?.type === "left" ? named.mealId : undefined }));

    await as.mutation(api.planner.setLeftoverOf, { plannerId, ...dinner, from: { date: "2026-11-18", meal: "lunch" } });
    await as.mutation(api.planner.setLeftoverOf, { plannerId, ...dinner, from: "other" });
    const reset = await slotOf(t, plannerId, dinner.date, dinner.meal);
    expect(reset?.type === "left" && reset.mealId).toBeFalsy();

    expect(await as.mutation(api.planner.commitOther, { plannerId, ...dinner, text: "pizza" })).toEqual({ name: "Pizza" });
    const meals = await t.run((ctx) => ctx.db.query("plannerMeals").collect());
    expect(meals.map((meal) => meal.name)).toEqual(["Pizza"]);
  });

  it("only works on a leftovers slot", async () => {
    const { as, plannerId } = await setup();
    const lunch = { date: "2026-11-18", meal: "lunch" } as const;
    await expect(as.mutation(api.planner.setLeftoverOf, { plannerId, ...lunch, from: "other" })).rejects.toThrow(/not leftovers/);
    await expect(as.mutation(api.planner.commitOther, { plannerId, ...lunch, text: "Pizza" })).rejects.toThrow(/not leftovers/);
  });
});

describe("week and picker queries", () => {
  it("returns resolved slots from six days before to six days after the start", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    for (const [date, text] of [["2026-11-10", "Six before"], ["2026-11-09", "Seven before"], ["2026-11-23", "Seven after"]] as const) {
      await as.mutation(api.planner.commitText, { plannerId, date, meal: "lunch", text });
    }
    const { slots } = await as.query(api.planner.week, { plannerId, start: "2026-11-16" });
    expect(slots.map((slot) => slot.name)).toEqual(["Six before"]);
  });

  it("shows recipe details, planner meal names and leftover sources", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    const recipeId = await t.run((ctx) => insertUserRecipe(ctx, userId, { title: "Chili", ingredients: [], instructions: [] }));
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-16", meal: "lunch", text: "Chili" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-16", meal: "dinner", text: "out Thai" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-17", meal: "lunch", text: "leftovers" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-18", meal: "lunch", text: "Tacos" });
    await as.mutation(api.recipeCards.addIngredient, { recipeId, name: "beans" });
    await as.mutation(api.recipeCards.addIngredient, { recipeId, name: "tomatoes" });

    const { slots } = await as.query(api.planner.week, { plannerId, start: "2026-11-16" });
    expect(slots).toEqual([
      { date: "2026-11-16", meal: "lunch", type: "cook", name: "Chili", recipe: { recipeId, title: "Chili", ingredientCount: 2, available: true } },
      { date: "2026-11-16", meal: "dinner", type: "out", name: "Thai" },
      { date: "2026-11-17", meal: "lunch", type: "left", name: "", from: { date: "2026-11-16", meal: "dinner" } },
      { date: "2026-11-18", meal: "lunch", type: "cook", name: "Tacos" },
    ]);

  });

  it("counts ingredients up to 30 and says when there are more, without reading them all", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    const ingredients = (count: number) => Array.from({ length: count }, (_, index) => `item ${index + 1}`);
    await t.run((ctx) => insertUserRecipe(ctx, userId, { title: "Feast", ingredients: ingredients(45), instructions: [] }));
    await t.run((ctx) => insertUserRecipe(ctx, userId, { title: "Thirty", ingredients: ingredients(30), instructions: [] }));
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-16", meal: "lunch", text: "Feast" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-16", meal: "dinner", text: "Thirty" });

    const { slots } = await as.query(api.planner.week, { plannerId, start: "2026-11-16" });
    expect(slots[0].recipe).toMatchObject({ ingredientCount: 30, moreIngredients: true });
    expect(slots[1].recipe).toMatchObject({ ingredientCount: 30 });
    expect(slots[1].recipe).not.toHaveProperty("moreIngredients");
  });

  it("treats a removed recipe as unlinked: no name, no leftovers source, and retyping keeps a plain name", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    const recipeId = await t.run((ctx) => insertUserRecipe(ctx, userId, { title: "Chili", ingredients: [], instructions: [] }));
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-16", meal: "lunch", text: "Chili" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-16", meal: "dinner", text: "leftovers" });

    await as.mutation(api.recipeCards.removeCard, { recipeId });
    const { slots } = await as.query(api.planner.week, { plannerId, start: "2026-11-16" });
    expect(slots[0]).toEqual({
      date: "2026-11-16",
      meal: "lunch",
      type: "cook",
      name: "",
      recipe: { recipeId, title: "Chili", ingredientCount: 0, available: false },
    });
    await expect(
      as.mutation(api.planner.setLeftoverOf, { plannerId, date: "2026-11-16", meal: "dinner", from: { date: "2026-11-16", meal: "lunch" } }),
    ).rejects.toThrow(/can’t be used as leftovers/);

    expect(await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-16", meal: "lunch", text: "Chili" })).toEqual({ type: "cook", name: "Chili" });
    expect(await slotOf(t, plannerId, "2026-11-16", "lunch")).not.toHaveProperty("recipeId");
    const again = await as.query(api.planner.week, { plannerId, start: "2026-11-16" });
    expect(again.slots[0]).toEqual({ date: "2026-11-16", meal: "lunch", type: "cook", name: "Chili" });
    expect((await recipesOf(t, userId)).filter((recipe) => recipe.deletedAt === undefined)).toEqual([]);
  });

  it("offers saved recipes with their source, counting ingredients only where names repeat, and planner meals", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    const manual = await t.run((ctx) => insertUserRecipe(ctx, userId, { title: "Chili", ingredients: [], instructions: [] }));
    const imported = await t.run((ctx) =>
      insertUserRecipe(ctx, userId, { title: "chili!", sourceUrl: "https://www.example.com/chili", ingredients: ["beans", "onion"], instructions: ["Cook."] }),
    );
    const bao = await t.run((ctx) => insertUserRecipe(ctx, userId, { title: "Bao", ingredients: ["flour"], instructions: [] }));
    const removed = await t.run((ctx) => insertUserRecipe(ctx, userId, { title: "Gone", ingredients: [], instructions: [] }));
    await as.mutation(api.recipeCards.removeCard, { recipeId: removed });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-16", meal: "lunch", text: "out chili" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-16", meal: "dinner", text: "out Bao" });

    const options = await as.query(api.planner.pickerOptions, { plannerId });
    expect(options.meals.sort()).toEqual(["Bao", "chili"]);
    expect(options.recipes).toHaveLength(3);
    expect(options.recipes).toEqual(expect.arrayContaining([
      { recipeId: manual, title: "Chili", source: "Manual", ingredientCount: 0 },
      { recipeId: imported, title: "chili!", source: "example.com", ingredientCount: 2 },
      { recipeId: bao, title: "Bao", source: "Manual" },
    ]));
  });

  it("rejects anonymous callers and other users", async () => {
    const t = initAuthTest();
    const { plannerId } = await plannerFor(t, "ada@example.com");
    const grace = await signedInUser(t, "grace@example.com");
    await expect(t.query(api.planner.week, { plannerId, start: "2026-11-16" })).rejects.toThrow(/Unauthenticated/);
    await expect(grace.as.query(api.planner.week, { plannerId, start: "2026-11-16" })).rejects.toThrow(/Planner was not found/);
    await expect(grace.as.query(api.planner.pickerOptions, { plannerId })).rejects.toThrow(/Planner was not found/);
  });
});

describe("breakfast and meals to plan", () => {
  it("saves the meals to plan in day order and refuses none", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.updatePreferences, { plannerId, meals: ["dinner", "lunch", "dinner"] });
    expect(await as.query(api.planner.mine, {})).toMatchObject({ meals: ["lunch", "dinner"] });
    await expect(as.mutation(api.planner.updatePreferences, { plannerId, meals: [] })).rejects.toThrow(/at least one meal/);
    expect(await as.query(api.planner.mine, {})).toMatchObject({ meals: ["lunch", "dinner"] });
    const grace = await signedInUser(t, "grace@example.com");
    await expect(grace.as.mutation(api.planner.updatePreferences, { plannerId, meals: ["lunch"] })).rejects.toThrow(/Planner was not found/);
  });

  it("plans breakfast like any other meal and orders it first", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-16", meal: "dinner", text: "Stew" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-17", meal: "lunch", text: "Soup" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-17", meal: "breakfast", text: "leftovers" });
    await as.mutation(api.planner.setType, { plannerId, date: "2026-11-18", meal: "breakfast", type: "skip" });

    const { slots } = await as.query(api.planner.week, { plannerId, start: "2026-11-16" });
    expect(slots.map((slot) => `${slot.date} ${slot.meal} ${slot.type}`)).toEqual([
      "2026-11-16 dinner cook",
      "2026-11-17 breakfast left",
      "2026-11-17 lunch cook",
      "2026-11-18 breakfast skip",
    ]);
    // Breakfast's leftovers come from the night before, never the same day's lunch.
    expect(slots[1].from).toEqual({ date: "2026-11-16", meal: "dinner" });
    await expect(
      as.mutation(api.planner.setLeftoverOf, { plannerId, date: "2026-11-17", meal: "breakfast", from: { date: "2026-11-17", meal: "lunch" } }),
    ).rejects.toThrow(/can’t be used as leftovers/);
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-17", meal: "dinner", text: "leftovers" });
    expect(await slotOf(t, plannerId, "2026-11-17", "dinner")).toMatchObject({ from: { date: "2026-11-17", meal: "lunch" } });
  });

  it("hides a meal that is turned off from the week and leftovers, keeps its slots, and shows them again", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-16", meal: "dinner", text: "Stew" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-17", meal: "breakfast", text: "Pancakes" });
    await as.mutation(api.planner.updatePreferences, { plannerId, meals: ["lunch", "dinner"] });

    const hidden = await as.query(api.planner.week, { plannerId, start: "2026-11-16" });
    expect(hidden.slots.map((slot) => slot.name)).toEqual(["Stew"]);
    expect(await slotOf(t, plannerId, "2026-11-17", "breakfast")).toMatchObject({ type: "cook", name: "Pancakes" });
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-17", meal: "lunch", text: "leftovers" });
    expect(await slotOf(t, plannerId, "2026-11-17", "lunch")).toMatchObject({ from: { date: "2026-11-16", meal: "dinner" } });

    await as.mutation(api.planner.updatePreferences, { plannerId, meals: ["breakfast", "lunch", "dinner"] });
    const shown = await as.query(api.planner.week, { plannerId, start: "2026-11-16" });
    expect(shown.slots.map((slot) => slot.name)).toEqual(["Stew", "Pancakes", ""]);
  });
});

describe("today", () => {
  const date = "2026-11-18";

  it("gives a user with no planner an empty result without creating one", async () => {
    const t = initAuthTest();
    const { as } = await signedInUser(t, "ada@example.com");
    expect(await as.query(api.planner.today, { date })).toEqual({ meals: [] });
    expect(await as.query(api.planner.mine, {})).toBeNull();
  });

  it("lists every planned meal of the day in order, unplanned ones included", async () => {
    const t = initAuthTest();
    const { as } = await plannerFor(t, "ada@example.com");
    expect(await as.query(api.planner.today, { date })).toEqual({
      meals: [
        { meal: "breakfast", slot: null },
        { meal: "lunch", slot: null },
        { meal: "dinner", slot: null },
      ],
    });
  });

  it("describes each kind of slot", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    const chili = await t.run((ctx) => insertUserRecipe(ctx, userId, { title: "Chili", ingredients: [], instructions: [] }));
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-17", meal: "dinner", text: "Chili" });
    await as.mutation(api.planner.commitText, { plannerId, date, meal: "breakfast", text: "leftovers" });
    await as.mutation(api.planner.commitText, { plannerId, date, meal: "lunch", text: "out at Thai Palace" });
    await as.mutation(api.planner.commitText, { plannerId, date, meal: "dinner", text: "Grandma's soup" });

    expect((await as.query(api.planner.today, { date })).meals).toEqual([
      { meal: "breakfast", slot: { type: "left", name: "Chili", source: { date: "2026-11-17", meal: "dinner", recipeId: chili } } },
      { meal: "lunch", slot: { type: "out", name: "Thai Palace" } },
      { meal: "dinner", slot: { type: "cook", name: "Grandma's soup" } },
    ]);

    await as.mutation(api.planner.commitText, { plannerId, date, meal: "dinner", text: "" });
    await as.mutation(api.planner.attachRecipe, { plannerId, date, meal: "dinner", recipeId: chili });
    await as.mutation(api.planner.setType, { plannerId, date, meal: "lunch", type: "skip" });
    await as.mutation(api.planner.setLeftoverOf, { plannerId, date, meal: "breakfast", from: "other" });
    await as.mutation(api.planner.commitOther, { plannerId, date, meal: "breakfast", text: "Pizza" });
    expect((await as.query(api.planner.today, { date })).meals).toEqual([
      { meal: "breakfast", slot: { type: "left", name: "Pizza" } },
      { meal: "lunch", slot: { type: "skip", name: "" } },
      { meal: "dinner", slot: { type: "cook", name: "Chili", recipeId: chili } },
    ]);

    await as.mutation(api.recipeCards.removeCard, { recipeId: chili });
    expect((await as.query(api.planner.today, { date })).meals[2]).toEqual({
      meal: "dinner",
      slot: { type: "cook", name: "", recipeRemoved: true },
    });
  });

  it("leaves out meals that are not planned", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.commitText, { plannerId, date, meal: "breakfast", text: "Oats" });
    await as.mutation(api.planner.updatePreferences, { plannerId, meals: ["dinner"] });
    expect(await as.query(api.planner.today, { date })).toEqual({ meals: [{ meal: "dinner", slot: null }] });
  });

  it("shows only the caller's own planner and rejects bad dates and anonymous callers", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.commitText, { plannerId, date, meal: "lunch", text: "Secret" });
    const grace = await plannerFor(t, "grace@example.com");
    expect((await grace.as.query(api.planner.today, { date })).meals.every((meal) => meal.slot === null)).toBe(true);
    await expect(as.query(api.planner.today, { date: "2026-02-30" })).rejects.toThrow(/Invalid date/);
    await expect(t.query(api.planner.today, { date })).rejects.toThrow(/Unauthenticated/);
  });
});

describe("importing a recipe link into a slot", () => {
  const lunch = { date: "2026-11-18", meal: "lunch" } as const;
  const url = "https://www.example.com/recipes/12345-best-chili.html";

  it("starts the existing import and shows the slot as pending until the recipe is saved", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    const start = vi.fn().mockResolvedValue("workflow-1");
    const importId = await t.run((ctx) => startSlotImport(ctx, userId, { plannerId, ...lunch, url }, start));
    expect(start).toHaveBeenCalledTimes(1);
    expect(await slotOf(t, plannerId, lunch.date, lunch.meal)).toMatchObject({ type: "cook", importId, importName: "Best chili" });

    const again = await t.run((ctx) => startSlotImport(ctx, userId, { plannerId, date: "2026-11-19", meal: "lunch", url }, start));
    expect(again).toBe(importId);
    expect(start).toHaveBeenCalledTimes(1);

    let week = await as.query(api.planner.week, { plannerId, start: "2026-11-16" });
    expect(week.slots[0]).toEqual({ ...lunch, type: "cook", name: "Best chili", import: { importId, status: "queued" } });

    const recipeId = await t.run(async (ctx) => {
      const now = Date.now();
      const id = await ctx.db.insert("recipes", {
        importId,
        sourceUrl: url,
        normalizedSourceUrl: url,
        title: "The Best Chili",
        cuisines: [],
        categories: [],
        keywords: [],
        instructions: [],
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(importId, { recipeId: id, status: "completed" });
      return id;
    });
    week = await as.query(api.planner.week, { plannerId, start: "2026-11-16" });
    expect(week.slots[0]).toEqual({ ...lunch, type: "cook", name: "Best chili", import: { importId, status: "completed", recipeId } });

    await as.mutation(api.recipeCards.addToBook, { recipeId });
    week = await as.query(api.planner.week, { plannerId, start: "2026-11-16" });
    expect(week.slots[0]).toEqual({
      ...lunch,
      type: "cook",
      name: "The Best Chili",
      recipe: { recipeId, title: "The Best Chili", ingredientCount: 0, available: true },
    });
  });

  it("keeps a slot's typed name while its link imports", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "Grandma's chili" });
    const importId = await t.run((ctx) => startSlotImport(ctx, userId, { plannerId, ...lunch, url }, vi.fn().mockResolvedValue("wf")));
    expect(await slotOf(t, plannerId, lunch.date, lunch.meal)).toMatchObject({ type: "cook", importId, importName: "Grandma's chili" });
    expect(await recipesOf(t, userId)).toEqual([]);
  });

  it("lets a pending import be a leftovers source and clears it when the slot changes", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    await t.run((ctx) => startSlotImport(ctx, userId, { plannerId, ...lunch, url }, vi.fn().mockResolvedValue("wf")));
    await as.mutation(api.planner.commitText, { plannerId, date: "2026-11-18", meal: "dinner", text: "leftovers" });
    expect(await slotOf(t, plannerId, "2026-11-18", "dinner")).toMatchObject({ from: lunch });

    await as.mutation(api.planner.commitText, { plannerId, ...lunch, text: "Tacos" });
    const slot = await slotOf(t, plannerId, lunch.date, lunch.meal);
    expect(slot).not.toHaveProperty("importId");
  });

  it("rejects text that is not a link and other users' planners", async () => {
    const t = initAuthTest();
    const { userId, plannerId } = await plannerFor(t, "ada@example.com");
    const grace = await signedInUser(t, "grace@example.com");
    const start = vi.fn().mockResolvedValue("wf");
    await expect(t.run((ctx) => startSlotImport(ctx, userId, { plannerId, ...lunch, url: "Chili" }, start))).rejects.toThrow(/Not a recipe link/);
    await expect(t.run((ctx) => startSlotImport(ctx, grace.userId, { plannerId, ...lunch, url }, start))).rejects.toThrow(/Planner was not found/);
    await expect(grace.as.mutation(api.planner.importLink, { plannerId, ...lunch, url })).rejects.toThrow(/Planner was not found/);
  });
});
