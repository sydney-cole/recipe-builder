import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { insertUserRecipe, type UserRecipeFields } from "./lib/userRecipes";
import { initAuthTest, signedInUser, type AuthTest } from "./testing.helpers";

const start = "2026-11-16";

async function plannerFor(t: AuthTest, email: string, people = 2) {
  const user = await signedInUser(t, email);
  const plannerId = await user.as.mutation(api.planner.ensure, {});
  await user.as.mutation(api.planner.updatePreferences, { plannerId, people });
  return { ...user, plannerId };
}

async function recipe(t: AuthTest, userId: Id<"users">, fields: Omit<UserRecipeFields, "instructions">) {
  return await t.run((ctx) => insertUserRecipe(ctx, userId, { instructions: [], ...fields }));
}

type Meal = "breakfast" | "lunch" | "dinner";

async function putSlot(
  t: AuthTest,
  plannerId: Id<"planners">,
  userId: Id<"users">,
  date: string,
  meal: Meal,
  value:
    | { type: "cook"; recipeId?: Id<"recipes"> }
    | { type: "left"; from: { date: string; meal: Meal } | "other" }
    | { type: "out" }
    | { type: "skip" },
) {
  await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("planSlots")
      .withIndex("by_planner_and_date", (q) => q.eq("plannerId", plannerId).eq("date", date).eq("meal", meal))
      .unique();
    if (existing !== null) await ctx.db.delete(existing._id);
    await ctx.db.insert("planSlots", { plannerId, date, meal, updatedBy: userId, updatedAt: Date.now(), ...value });
  });
}

async function clearSlot(t: AuthTest, plannerId: Id<"planners">, date: string, meal: Meal) {
  await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("planSlots")
      .withIndex("by_planner_and_date", (q) => q.eq("plannerId", plannerId).eq("date", date).eq("meal", meal))
      .unique();
    if (existing !== null) await ctx.db.delete(existing._id);
  });
}

async function listItems(as: Awaited<ReturnType<typeof plannerFor>>["as"], listId: Id<"groceryLists">) {
  const result = await as.query(api.groceryLists.get, { listId });
  return (result?.items ?? []).map((item) => ({
    id: item._id,
    name: item.name,
    quantity: item.quantityText ?? item.quantity?.toString() ?? "",
    unit: item.unit ?? "",
    checked: item.isChecked,
    meals: result!.itemSources.find((source) => source.itemId === item._id)?.recipeTitles ?? [],
  }));
}

describe("plannerGrocery.syncWeek", () => {
  it("creates one list for the week, scaled to the people cooked for", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com", 4);
    const chili = await recipe(t, userId, { title: "Chili", servings: 2, ingredients: ["1 onion", "2 cups beans"] });
    await putSlot(t, plannerId, userId, "2026-11-16", "dinner", { type: "cook", recipeId: chili });

    expect(await as.query(api.plannerGrocery.forWeek, { plannerId, start })).toEqual({ list: null });
    const result = await as.mutation(api.plannerGrocery.syncWeek, { plannerId, start });
    expect(result).toMatchObject({ created: true, notIncluded: [] });

    const again = await as.mutation(api.plannerGrocery.syncWeek, { plannerId, start });
    expect(again).toMatchObject({ listId: result.listId, created: false });

    const lists = await as.query(api.groceryLists.listMine, {});
    expect(lists).toHaveLength(1);
    expect(lists[0]).toMatchObject({ name: "Week of Nov 16", plannerId, planWeekStart: start, status: "active" });
    expect(await listItems(as, result.listId)).toEqual([
      expect.objectContaining({ name: "onion", quantity: "2", unit: "", meals: ["Chili"] }),
      expect.objectContaining({ name: "beans", quantity: "4", unit: "cup", meals: ["Chili"] }),
    ]);

    const status = await as.query(api.plannerGrocery.forWeek, { plannerId, start });
    expect(status.list).toMatchObject({ listId: result.listId, name: "Week of Nov 16", changed: false, notIncluded: [] });
    expect(status.list?.syncedAt).toEqual(expect.any(Number));
  });

  it("buys extra portions for leftovers, including leftovers in the next week", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com", 2);
    const stew = await recipe(t, userId, { title: "Stew", servings: 2, ingredients: ["1 lb beef"] });
    await putSlot(t, plannerId, userId, "2026-11-22", "dinner", { type: "cook", recipeId: stew });
    await putSlot(t, plannerId, userId, "2026-11-23", "lunch", { type: "left", from: { date: "2026-11-22", meal: "dinner" } });
    await putSlot(t, plannerId, userId, "2026-11-24", "dinner", { type: "left", from: { date: "2026-11-22", meal: "dinner" } });

    const { listId } = await as.mutation(api.plannerGrocery.syncWeek, { plannerId, start });
    expect(await listItems(as, listId)).toEqual([expect.objectContaining({ name: "beef", quantity: "3", unit: "lb" })]);
    // The next week's own list does not buy last week's stew again.
    const next = await as.mutation(api.plannerGrocery.syncWeek, { plannerId, start: "2026-11-23" });
    expect(await listItems(as, next.listId)).toEqual([]);
  });

  it("merges the same ingredient from two recipes and uses a recipe without servings as written", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com", 4);
    const shrimp = await recipe(t, userId, { title: "Shrimp Peperonata", servings: 4, ingredients: ["2 tbsp olive oil", "1 lb shrimp"] });
    const chili = await recipe(t, userId, { title: "Chili", ingredients: ["1 tbsp olive oil"] });
    await putSlot(t, plannerId, userId, "2026-11-17", "dinner", { type: "cook", recipeId: shrimp });
    await putSlot(t, plannerId, userId, "2026-11-18", "dinner", { type: "cook", recipeId: chili });

    const { listId } = await as.mutation(api.plannerGrocery.syncWeek, { plannerId, start });
    const items = await listItems(as, listId);
    expect(items).toEqual([
      expect.objectContaining({ name: "olive oil", quantity: "3", unit: "tbsp" }),
      expect.objectContaining({ name: "shrimp", quantity: "1", unit: "lb", meals: ["Shrimp Peperonata"] }),
    ]);
    expect([...items[0].meals].sort()).toEqual(["Chili", "Shrimp Peperonata"]);
  });

  it("skips non-cooking slots and reports Cook slots it could not include", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com", 2);
    const bare = await recipe(t, userId, { title: "Tacos", ingredients: [] });
    const removed = await recipe(t, userId, { title: "Old stew", ingredients: ["1 carrot"] });
    await t.run((ctx) => ctx.db.patch(removed, { deletedAt: Date.now() }));
    await putSlot(t, plannerId, userId, "2026-11-16", "lunch", { type: "out" });
    await putSlot(t, plannerId, userId, "2026-11-16", "dinner", { type: "skip" });
    await putSlot(t, plannerId, userId, "2026-11-17", "lunch", { type: "left", from: "other" });
    await putSlot(t, plannerId, userId, "2026-11-17", "dinner", { type: "cook", recipeId: bare });
    await putSlot(t, plannerId, userId, "2026-11-18", "dinner", { type: "cook", recipeId: removed });
    await putSlot(t, plannerId, userId, "2026-11-19", "dinner", { type: "cook" });

    const result = await as.mutation(api.plannerGrocery.syncWeek, { plannerId, start });
    expect(result.notIncluded).toEqual([
      { date: "2026-11-17", meal: "dinner", name: "Tacos", reason: "no-ingredients" },
      { date: "2026-11-18", meal: "dinner", name: "Old stew", reason: "recipe-unavailable" },
      { date: "2026-11-19", meal: "dinner", name: "", reason: "no-recipe" },
    ]);
    expect(await listItems(as, result.listId)).toEqual([]);
    expect((await as.query(api.plannerGrocery.forWeek, { plannerId, start })).list?.notIncluded).toEqual(result.notIncluded);
  });

  it("counts breakfast Cook slots, and leaves out meals that are not planned", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com", 2);
    const oats = await recipe(t, userId, { title: "Oats", servings: 2, ingredients: ["1 cup oats"] });
    const eggs = await recipe(t, userId, { title: "Eggs", servings: 2, ingredients: ["2 eggs"] });
    await putSlot(t, plannerId, userId, "2026-11-16", "breakfast", { type: "cook", recipeId: oats });
    await putSlot(t, plannerId, userId, "2026-11-17", "dinner", { type: "cook", recipeId: eggs });

    const first = await as.mutation(api.plannerGrocery.syncWeek, { plannerId, start });
    expect((await listItems(as, first.listId)).map((item) => item.name).sort()).toEqual(["eggs", "oats"]);

    await as.mutation(api.planner.updatePreferences, { plannerId, meals: ["lunch", "dinner"] });
    expect((await as.query(api.plannerGrocery.forWeek, { plannerId, start })).list?.changed).toBe(true);
    await as.mutation(api.plannerGrocery.syncWeek, { plannerId, start });
    expect((await listItems(as, first.listId)).map((item) => item.name)).toEqual(["eggs"]);
  });

  it("keeps hand-added items, ticks and hand-edited quantities, and re-derives the rest", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com", 2);
    const chili = await recipe(t, userId, { title: "Chili", servings: 2, ingredients: ["1 onion", "2 cups beans", "1 tsp cumin"] });
    await putSlot(t, plannerId, userId, "2026-11-16", "dinner", { type: "cook", recipeId: chili });
    const { listId } = await as.mutation(api.plannerGrocery.syncWeek, { plannerId, start });

    // The user saves the list in the editor: ticks cumin, changes beans to 3
    // cans, and adds coffee by hand.
    const before = await listItems(as, listId);
    const onion = before.find((item) => item.name === "onion")!;
    const beans = before.find((item) => item.name === "beans")!;
    const cumin = before.find((item) => item.name === "cumin")!;
    await as.mutation(api.groceryLists.save, {
      listId,
      requestId: "save-request-1",
      name: "Week of Nov 16",
      items: [
        { itemId: onion.id, name: onion.name, quantityText: onion.quantity, unit: onion.unit || null, isChecked: false, sortOrder: 1 },
        { itemId: beans.id, name: beans.name, quantityText: "3", unit: "cans", isChecked: false, sortOrder: 2 },
        { itemId: cumin.id, name: cumin.name, quantityText: cumin.quantity, unit: cumin.unit || null, isChecked: true, sortOrder: 3 },
        { name: "coffee", quantityText: "1", unit: null, isChecked: false, sortOrder: 4 },
      ],
    });

    // The plan now cooks chili twice.
    await putSlot(t, plannerId, userId, "2026-11-18", "dinner", { type: "cook", recipeId: chili });
    expect((await as.query(api.plannerGrocery.forWeek, { plannerId, start })).list?.changed).toBe(true);
    await as.mutation(api.plannerGrocery.syncWeek, { plannerId, start });
    expect((await as.query(api.plannerGrocery.forWeek, { plannerId, start })).list?.changed).toBe(false);

    const after = await listItems(as, listId);
    expect(after).toEqual([
      expect.objectContaining({ id: onion.id, name: "onion", quantity: "2", checked: false }),
      expect.objectContaining({ id: beans.id, name: "beans", quantity: "3", unit: "cans" }),
      expect.objectContaining({ id: cumin.id, name: "cumin", quantity: "2", unit: "tsp", checked: true }),
      expect.objectContaining({ name: "coffee", quantity: "1", meals: [] }),
    ]);
    // The edited item remembers what the plan now asks for.
    const stored = await t.run((ctx) => ctx.db.get(beans.id));
    expect(stored).toMatchObject({ planQuantityText: "4", planUnit: "cup" });
  });

  it("removes a meal's items when it leaves the plan, unless their amount was edited by hand", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com", 2);
    const chili = await recipe(t, userId, { title: "Chili", servings: 2, ingredients: ["1 onion", "2 cups beans"] });
    const soup = await recipe(t, userId, { title: "Soup", servings: 2, ingredients: ["1 onion", "1 leek", "1 carrot"] });
    await putSlot(t, plannerId, userId, "2026-11-16", "dinner", { type: "cook", recipeId: chili });
    await putSlot(t, plannerId, userId, "2026-11-17", "dinner", { type: "cook", recipeId: soup });
    const { listId } = await as.mutation(api.plannerGrocery.syncWeek, { plannerId, start });
    const carrot = (await listItems(as, listId)).find((item) => item.name === "carrot")!;
    await as.mutation(api.groceryLists.updateItem, { itemId: carrot.id, quantityText: "6" });

    await clearSlot(t, plannerId, "2026-11-17", "dinner");
    await as.mutation(api.plannerGrocery.syncWeek, { plannerId, start });

    expect(await listItems(as, listId)).toEqual([
      expect.objectContaining({ name: "onion", quantity: "1", meals: ["Chili"] }),
      expect.objectContaining({ name: "beans", quantity: "2" }),
      expect.objectContaining({ id: carrot.id, name: "carrot", quantity: "6", meals: [] }),
    ]);
    // The kept carrot is now an ordinary hand-added item.
    expect(await t.run((ctx) => ctx.db.get(carrot.id))).not.toHaveProperty("planKey");
  });

  it("lets only the planner's owner create, update or read the week's list", async () => {
    const t = initAuthTest();
    const { as, userId, plannerId } = await plannerFor(t, "ada@example.com");
    const grace = await signedInUser(t, "grace@example.com");
    const chili = await recipe(t, userId, { title: "Chili", ingredients: ["1 onion"] });
    await putSlot(t, plannerId, userId, "2026-11-16", "dinner", { type: "cook", recipeId: chili });

    await expect(t.mutation(api.plannerGrocery.syncWeek, { plannerId, start })).rejects.toThrow(/Unauthenticated/);
    await expect(grace.as.mutation(api.plannerGrocery.syncWeek, { plannerId, start })).rejects.toThrow(/Planner was not found/);
    await expect(grace.as.query(api.plannerGrocery.forWeek, { plannerId, start })).rejects.toThrow(/Planner was not found/);
    const { listId } = await as.mutation(api.plannerGrocery.syncWeek, { plannerId, start });
    expect(await grace.as.query(api.groceryLists.get, { listId })).toBeNull();
    expect(await grace.as.query(api.groceryLists.listMine, {})).toEqual([]);
  });

  it("rejects an invalid week start date", async () => {
    const t = initAuthTest();
    const { as, plannerId } = await plannerFor(t, "ada@example.com");
    await expect(as.mutation(api.plannerGrocery.syncWeek, { plannerId, start: "2026-13-40" })).rejects.toThrow(/Invalid date/);
  });
});
