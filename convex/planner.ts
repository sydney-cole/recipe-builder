import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  cleanName,
  isRecipeLink,
  mealKey,
  MEALS,
  nameFromRecipeLink,
  normalizeMeals,
  parseSlotText,
  plannedMeals,
  type Meal,
  type SlotType,
} from "./lib/plannerRules";
import {
  addDays,
  isDateKey,
  leftoverChoices,
  resolveLeftover,
  slotOrder,
  type SlotLike,
  type SlotRef,
} from "./lib/plannerSlots";
import {
  importStatusValidator,
  leftoverFromValidator,
  mealValidator,
  slotRefValidator,
  slotTypeValidator,
  weekStartValidator,
} from "./lib/plannerValidators";
import { noteCreatedRecipe, rememberSlot } from "./lib/slotHistory";
import { insertUserRecipe } from "./lib/userRecipes";
import { canAccessRecipe } from "./lib/recipeAccess";
import { queueRecipeSource, startRecipeIngestion, type StartIngestion } from "./recipeIngestion";

const MAX_PEOPLE = 12;

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Unauthenticated");
  return userId;
}

/** Whether `userId` may read and change `planner`. One owner today; households later. */
export function canAccessPlanner(userId: Id<"users">, planner: Doc<"planners">) {
  return planner.ownerId === userId;
}

export async function requirePlanner(ctx: QueryCtx | MutationCtx, plannerId: Id<"planners">) {
  const userId = await requireUser(ctx);
  const planner = await ctx.db.get(plannerId);
  if (planner === null || !canAccessPlanner(userId, planner)) {
    throw new Error("Planner was not found");
  }
  return { userId, planner };
}

/** People cooked for: rounded and clamped to 1–12; anything else becomes 1 (§2.7). */
export function normalizePeople(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_PEOPLE, Math.max(1, Math.round(value)));
}

async function ownPlanner(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return await ctx.db
    .query("planners")
    .withIndex("by_owner", (q) => q.eq("ownerId", userId))
    .first();
}

export const mine = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      plannerId: v.id("planners"),
      weekStart: weekStartValidator,
      people: v.number(),
      /** The meals to plan, in day order. */
      meals: v.array(mealValidator),
    }),
  ),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const planner = await ownPlanner(ctx, userId);
    if (planner === null) return null;
    return {
      plannerId: planner._id,
      weekStart: planner.weekStart,
      people: planner.people,
      meals: plannedMeals(planner.meals),
    };
  },
});

export const ensure = mutation({
  args: {},
  returns: v.id("planners"),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const existing = await ownPlanner(ctx, userId);
    if (existing !== null) return existing._id;
    const now = Date.now();
    return await ctx.db.insert("planners", {
      ownerId: userId,
      weekStart: 1,
      people: 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updatePreferences = mutation({
  args: {
    plannerId: v.id("planners"),
    weekStart: v.optional(weekStartValidator),
    people: v.optional(v.number()),
    /** Meals to plan; at least one. */
    meals: v.optional(v.array(mealValidator)),
  },
  returns: v.null(),
  handler: async (ctx, { plannerId, weekStart, people, meals }) => {
    await requirePlanner(ctx, plannerId);
    const patch: Partial<Doc<"planners">> = { updatedAt: Date.now() };
    if (weekStart !== undefined) patch.weekStart = weekStart;
    if (people !== undefined) patch.people = normalizePeople(people);
    if (meals !== undefined) patch.meals = normalizeMeals(meals);
    await ctx.db.patch(plannerId, patch);
    return null;
  },
});

// ---------------------------------------------------------------------------
// Slots

const RECIPE_SCAN_LIMIT = 500;

export type SlotValue =
  | { type: "cook"; recipeId?: Id<"recipes">; name?: string; importId?: Id<"recipeImports">; importName?: string }
  | { type: "out"; mealId?: Id<"plannerMeals"> }
  | { type: "left"; from: SlotRef | "other"; mealId?: Id<"plannerMeals"> }
  | { type: "skip" };

function assertDate(date: string) {
  if (!isDateKey(date)) throw new Error("Invalid date");
}

async function slotRow(ctx: QueryCtx | MutationCtx, plannerId: Id<"planners">, ref: SlotRef) {
  return await ctx.db
    .query("planSlots")
    .withIndex("by_planner_and_date", (q) =>
      q.eq("plannerId", plannerId).eq("date", ref.date).eq("meal", ref.meal),
    )
    .unique();
}

/**
 * For a Cook slot holding a pasted link: the import, and the recipe it
 * produced once the person who pasted it has saved it to their book.
 */
async function importedRecipe(ctx: QueryCtx | MutationCtx, row: Doc<"planSlots">) {
  if (row.type !== "cook" || row.recipeId !== undefined || row.importId === undefined) return null;
  const recipeImport = await ctx.db.get(row.importId);
  if (recipeImport === null) return null;
  const recipeId = recipeImport.recipeId;
  const saved =
    recipeId === undefined
      ? null
      : await ctx.db
          .query("savedRecipes")
          .withIndex("by_user_and_recipe", (q) => q.eq("userId", row.updatedBy).eq("recipeId", recipeId))
          .unique();
  return { recipeImport, recipeId: saved === null ? undefined : recipeId };
}

/**
 * A Cook slot's recipe. `usable` is false when the recipe was removed or its
 * owner can no longer open it; the slot then behaves as unlinked: no name, so
 * it is no leftovers source and retyping the title links a recipe again.
 */
export async function cookRecipe(ctx: QueryCtx | MutationCtx, row: Doc<"planSlots">) {
  const imported = await importedRecipe(ctx, row);
  const recipeId = row.type === "cook" ? (row.recipeId ?? imported?.recipeId) : undefined;
  const recipe = recipeId === undefined ? null : await ctx.db.get(recipeId);
  // An imported recipe's id is only set once its saved row was found, which already grants access.
  const usable =
    recipe !== null &&
    recipe.deletedAt === undefined &&
    (imported?.recipeId !== undefined || (await canAccessRecipe(ctx, row.updatedBy, recipe)));
  return { imported, recipeId, recipe, usable };
}

type CookRecipe = Awaited<ReturnType<typeof cookRecipe>>;

/** The name a slot shows: its usable recipe's title or its planner meal's name. */
async function slotName(ctx: QueryCtx | MutationCtx, row: Doc<"planSlots">, cook?: CookRecipe) {
  if (row.type === "cook") {
    const { recipeId, recipe, usable } = cook ?? (await cookRecipe(ctx, row));
    if (usable && recipe !== null) return cleanName(recipe.title);
    return recipeId === undefined ? (row.importName ?? row.name ?? "") : "";
  }
  if (row.type === "out" || row.type === "left") {
    const meal = row.mealId === undefined ? null : await ctx.db.get(row.mealId);
    return meal?.name ?? "";
  }
  return "";
}

export async function toSlotLike(
  ctx: QueryCtx | MutationCtx,
  row: Doc<"planSlots">,
  cook?: CookRecipe,
): Promise<SlotLike> {
  return {
    date: row.date,
    meal: row.meal,
    type: row.type,
    name: await slotName(ctx, row, cook),
    ...(row.type === "left" ? { from: row.from } : {}),
  };
}

/**
 * Rows from `from` to `to` inclusive, as the slot rules see them. With
 * `meals`, only those meals: a meal the planner does not plan is hidden.
 */
export async function loadSlots(
  ctx: QueryCtx | MutationCtx,
  plannerId: Id<"planners">,
  from: string,
  to: string,
  meals: readonly Meal[] = MEALS,
) {
  const rows = (
    await ctx.db
      .query("planSlots")
      .withIndex("by_planner_and_date", (q) =>
        q.eq("plannerId", plannerId).gte("date", from).lte("date", to),
      )
      .take(MEALS.length * 31)
  ).filter((row) => meals.includes(row.meal));
  // The index orders meals by name ("breakfast", "dinner", "lunch"); callers want slot order.
  rows.sort((first, second) => slotOrder(first).localeCompare(slotOrder(second)));
  // Each Cook row's recipe is resolved once, for its name here and the week view.
  return await Promise.all(
    rows.map(async (row) => {
      const cook = row.type === "cook" ? await cookRecipe(ctx, row) : null;
      return { row, cook, slot: await toSlotLike(ctx, row, cook ?? undefined) };
    }),
  );
}

export async function writeSlot(
  ctx: MutationCtx,
  plannerId: Id<"planners">,
  userId: Id<"users">,
  ref: SlotRef,
  value: SlotValue | null,
) {
  const existing = await slotRow(ctx, plannerId, ref);
  if (value === null && existing === null) return;
  await rememberSlot(ctx, plannerId, userId, ref, existing);
  if (value === null) {
    if (existing !== null) await ctx.db.delete(existing._id);
    return;
  }
  const document = { plannerId, date: ref.date, meal: ref.meal, updatedBy: userId, updatedAt: Date.now(), ...value };
  if (existing === null) await ctx.db.insert("planSlots", document);
  else await ctx.db.replace(existing._id, document);
}

/** The user's saved, live recipes, newest saved first (at most RECIPE_SCAN_LIMIT). */
async function savedRecipes(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  const saved = await ctx.db
    .query("savedRecipes")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .take(RECIPE_SCAN_LIMIT);
  const recipes = await Promise.all(saved.map((item) => ctx.db.get(item.recipeId)));
  return recipes.filter((recipe): recipe is Doc<"recipes"> => recipe !== null && recipe.deletedAt === undefined);
}

/**
 * The one saved recipe whose title has the same meal key as `name`, or null
 * when there is none or more than one. Typing never creates a recipe, and an
 * ambiguous name stays a plain name until the user picks one.
 */
async function uniqueRecipeNamed(ctx: MutationCtx, userId: Id<"users">, name: string) {
  const key = mealKey(name);
  const matches = (await savedRecipes(ctx, userId)).filter((recipe) => mealKey(recipe.title) === key);
  return matches.length === 1 ? { recipeId: matches[0]._id, name: cleanName(matches[0].title) } : null;
}

/** The planner's eat-out or leftovers meal with the same key, or a new one. */
async function resolvePlannerMeal(
  ctx: MutationCtx,
  plannerId: Id<"planners">,
  userId: Id<"users">,
  name: string,
) {
  const key = mealKey(name);
  const existing = await ctx.db
    .query("plannerMeals")
    .withIndex("by_planner_and_key", (q) => q.eq("plannerId", plannerId).eq("key", key))
    .first();
  if (existing !== null) return { mealId: existing._id, name: existing.name };
  const now = Date.now();
  const mealId = await ctx.db.insert("plannerMeals", {
    plannerId,
    name,
    key,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });
  return { mealId, name };
}

/** The slots leftovers in `ref` can choose from: the planner's shown meals of the week before. */
async function leftoverSlots(ctx: MutationCtx, plannerId: Id<"planners">, ref: SlotRef) {
  const planner = await ctx.db.get(plannerId);
  const meals = plannedMeals(planner?.meals);
  return (await loadSlots(ctx, plannerId, addDays(ref.date, -6), ref.date, meals)).map(({ slot }) => slot);
}

/** The newest leftover choice for `ref`, or "other" (§2.3). */
async function defaultLeftoverSource(ctx: MutationCtx, plannerId: Id<"planners">, ref: SlotRef) {
  return leftoverChoices(await leftoverSlots(ctx, plannerId, ref), ref)[0] ?? ("other" as const);
}

/** Writes a slot of `type` named `name` (ignored for Leftovers and Skip). */
async function planSlot(
  ctx: MutationCtx,
  plannerId: Id<"planners">,
  userId: Id<"users">,
  ref: SlotRef,
  type: SlotType,
  name: string,
): Promise<{ type: SlotType; name: string }> {
  if (type === "skip") {
    await writeSlot(ctx, plannerId, userId, ref, { type: "skip" });
    return { type, name: "" };
  }
  if (type === "left") {
    const from = await defaultLeftoverSource(ctx, plannerId, ref);
    await writeSlot(ctx, plannerId, userId, ref, { type: "left", from });
    return { type, name: "" };
  }
  if (type === "cook") {
    if (!name) {
      await writeSlot(ctx, plannerId, userId, ref, { type: "cook" });
      return { type, name: "" };
    }
    const recipe = await uniqueRecipeNamed(ctx, userId, name);
    if (recipe === null) {
      await writeSlot(ctx, plannerId, userId, ref, { type: "cook", name });
      return { type, name };
    }
    await writeSlot(ctx, plannerId, userId, ref, { type: "cook", recipeId: recipe.recipeId });
    return { type, name: recipe.name };
  }
  if (!name) {
    await writeSlot(ctx, plannerId, userId, ref, { type: "out" });
    return { type, name: "" };
  }
  const meal = await resolvePlannerMeal(ctx, plannerId, userId, name);
  await writeSlot(ctx, plannerId, userId, ref, { type: "out", mealId: meal.mealId });
  return { type, name: meal.name };
}

const slotArgs = { plannerId: v.id("planners"), date: v.string(), meal: mealValidator };

/**
 * A type button: the selected type clears the slot, another replaces it (§2.3).
 * `text` is the main input's unsaved draft when the button was pressed straight
 * after typing; it becomes the name in this one change, so typing "Chipotle"
 * then pressing Eat out never makes a "Chipotle" recipe first.
 */
export const setType = mutation({
  args: { ...slotArgs, type: slotTypeValidator, text: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { plannerId, date, meal, type, text }) => {
    const { userId } = await requirePlanner(ctx, plannerId);
    assertDate(date);
    if (text !== undefined && isRecipeLink(text)) throw new Error("Paste recipe links with importLink");
    const ref = { date, meal };
    const row = await slotRow(ctx, plannerId, ref);
    if (row?.type === type) {
      await writeSlot(ctx, plannerId, userId, ref, null);
      return null;
    }
    const named = row === null || row.type === "cook" || row.type === "out";
    // A slot's own name carries: Cook's, Eat out's, and other leftovers'
    // (a leftovers source's name belongs to that earlier meal).
    const ownName = row !== null && (named || (row.type === "left" && row.from === "other"));
    const carried =
      text !== undefined && named ? cleanName(text)
      : ownName ? await slotName(ctx, row)
      : "";
    await planSlot(ctx, plannerId, userId, ref, type, carried);
    return null;
  },
});

/** Typed text committed into a slot's main input (§2.3 rules 2–6). */
export const commitText = mutation({
  args: { ...slotArgs, text: v.string() },
  returns: v.object({ type: v.union(slotTypeValidator, v.null()), name: v.string() }),
  handler: async (ctx, { plannerId, date, meal, text }) => {
    const { userId } = await requirePlanner(ctx, plannerId);
    assertDate(date);
    if (isRecipeLink(text)) throw new Error("Paste recipe links with importLink");
    const ref: SlotRef = { date, meal: meal as Meal };
    const row = await slotRow(ctx, plannerId, ref);
    if (row !== null && (row.type === "left" || row.type === "skip")) {
      throw new Error("This slot has no text");
    }
    const cook = row?.type === "cook" ? await cookRecipe(ctx, row) : null;
    const currentName = row === null ? "" : await slotName(ctx, row, cook ?? undefined);
    if (row !== null && currentName === cleanName(text)) return { type: row.type, name: currentName };
    // Retyping an attached recipe's name in another case or punctuation keeps
    // that recipe, even when another saved recipe has the same name.
    if (cook?.usable && cook.recipe !== null && cleanName(text) && mealKey(cook.recipe.title) === mealKey(text)) {
      return { type: "cook" as const, name: currentName };
    }
    const intent = parseSlotText(text, row?.type ?? null);
    if (intent.kind !== "set") return { type: row?.type ?? null, name: currentName };
    return await planSlot(ctx, plannerId, userId, ref, intent.type, intent.name);
  },
});

/** The picker's choice of a saved recipe for a slot; the slot becomes Cook. */
export const attachRecipe = mutation({
  args: { ...slotArgs, recipeId: v.id("recipes") },
  returns: v.object({ name: v.string() }),
  handler: async (ctx, { plannerId, date, meal, recipeId }) => {
    const { userId } = await requirePlanner(ctx, plannerId);
    assertDate(date);
    const recipe = await ctx.db.get(recipeId);
    if (recipe === null || recipe.deletedAt !== undefined || !(await canAccessRecipe(ctx, userId, recipe))) {
      throw new Error("Recipe was not found");
    }
    await writeSlot(ctx, plannerId, userId, { date, meal }, { type: "cook", recipeId });
    return { name: cleanName(recipe.title) };
  },
});

/** The picker's explicit Create recipe row: a bare recipe in the Recipe Book, attached. */
export const createRecipeForSlot = mutation({
  args: { ...slotArgs, name: v.string() },
  returns: v.object({ recipeId: v.id("recipes"), name: v.string() }),
  handler: async (ctx, { plannerId, date, meal, name: text }) => {
    const { userId } = await requirePlanner(ctx, plannerId);
    assertDate(date);
    if (isRecipeLink(text)) throw new Error("Paste recipe links with importLink");
    const name = cleanName(text);
    if (!name) throw new Error("A recipe needs a name");
    const recipeId = await insertUserRecipe(ctx, userId, { title: name, ingredients: [], instructions: [] });
    await writeSlot(ctx, plannerId, userId, { date, meal }, { type: "cook", recipeId });
    await noteCreatedRecipe(ctx, recipeId, name);
    return { recipeId, name };
  },
});

async function requireLeftoverSlot(ctx: MutationCtx, plannerId: Id<"planners">, ref: SlotRef) {
  const row = await slotRow(ctx, plannerId, ref);
  if (row === null || row.type !== "left") throw new Error("Slot is not leftovers");
  return row;
}

/** The Leftovers select: an earlier meal, or "other" (§2.3). */
export const setLeftoverOf = mutation({
  args: { ...slotArgs, from: leftoverFromValidator },
  returns: v.null(),
  handler: async (ctx, { plannerId, date, meal, from }) => {
    const { userId } = await requirePlanner(ctx, plannerId);
    assertDate(date);
    const ref: SlotRef = { date, meal };
    const row = await requireLeftoverSlot(ctx, plannerId, ref);
    if (from === "other") {
      // An other-leftovers name survives only if the slot was already other.
      const mealId = row.from === "other" ? row.mealId : undefined;
      await writeSlot(ctx, plannerId, userId, ref, { type: "left", from: "other", ...(mealId ? { mealId } : {}) });
      return null;
    }
    const offered = leftoverChoices(await leftoverSlots(ctx, plannerId, ref), ref).some(
      (choice) => choice.date === from.date && choice.meal === from.meal,
    );
    if (!offered) throw new Error("That meal can’t be used as leftovers here");
    await writeSlot(ctx, plannerId, userId, ref, { type: "left", from });
    return null;
  },
});

/** Text typed into the other-leftovers input (§2.3 commitOther). */
export const commitOther = mutation({
  args: { ...slotArgs, text: v.string() },
  returns: v.object({ name: v.string() }),
  handler: async (ctx, { plannerId, date, meal, text }) => {
    const { userId } = await requirePlanner(ctx, plannerId);
    assertDate(date);
    const ref: SlotRef = { date, meal };
    const row = await requireLeftoverSlot(ctx, plannerId, ref);
    const name = cleanName(text);
    const currentName = await slotName(ctx, row);
    if (row.from === "other" && currentName === name) return { name };
    if (!name) {
      await writeSlot(ctx, plannerId, userId, ref, { type: "left", from: "other" });
      return { name: "" };
    }
    const plannerMeal = await resolvePlannerMeal(ctx, plannerId, userId, name);
    await writeSlot(ctx, plannerId, userId, ref, { type: "left", from: "other", mealId: plannerMeal.mealId });
    return { name: plannerMeal.name };
  },
});

// ---------------------------------------------------------------------------
// Reading a week

/** Ingredients counted per Cook slot; past this the view says "30+". */
const INGREDIENT_COUNT_LIMIT = 30;
const SUGGESTION_LIMIT = 500;

export const slotViewValidator = v.object({
  date: v.string(),
  meal: mealValidator,
  type: slotTypeValidator,
  name: v.string(),
  recipe: v.optional(
    v.object({
      recipeId: v.id("recipes"),
      title: v.string(),
      /** At most INGREDIENT_COUNT_LIMIT; `moreIngredients` says there are more. */
      ingredientCount: v.number(),
      moreIngredients: v.optional(v.literal(true)),
      available: v.boolean(),
    }),
  ),
  from: v.optional(v.union(slotRefValidator, v.literal("other"))),
  import: v.optional(
    v.object({
      importId: v.id("recipeImports"),
      status: importStatusValidator,
      recipeId: v.optional(v.id("recipes")),
    }),
  ),
});

/**
 * The slots from six days before `start` to six days after it, so the
 * client can offer leftovers from the previous week.
 */
export const week = query({
  args: { plannerId: v.id("planners"), start: v.string() },
  returns: v.object({ slots: v.array(slotViewValidator) }),
  handler: async (ctx, { plannerId, start }) => {
    // Only the owner reads a planner, so recipe access is checked for the slot's writer (the owner).
    const { planner } = await requirePlanner(ctx, plannerId);
    assertDate(start);
    const meals = plannedMeals(planner.meals);
    const loaded = await loadSlots(ctx, plannerId, addDays(start, -6), addDays(start, 6), meals);
    const slots = await Promise.all(
      loaded.map(async ({ cook, slot }) => {
        const view: typeof slotViewValidator.type = {
          date: slot.date,
          meal: slot.meal,
          type: slot.type,
          name: slot.name,
          ...(slot.from === undefined ? {} : { from: slot.from }),
        };
        if (cook === null) return view;
        const { imported, recipeId, recipe, usable } = cook;
        if (imported !== null && imported.recipeId === undefined) {
          view.import = {
            importId: imported.recipeImport._id,
            status: imported.recipeImport.status,
            ...(imported.recipeImport.recipeId === undefined ? {} : { recipeId: imported.recipeImport.recipeId }),
          };
        }
        if (recipeId !== undefined) {
          const ingredients = usable
            ? await ctx.db
                .query("recipeIngredients")
                .withIndex("by_recipe", (q) => q.eq("recipeId", recipeId))
                .take(INGREDIENT_COUNT_LIMIT + 1)
            : [];
          const title = recipe === null ? "" : cleanName(recipe.title);
          view.recipe = {
            recipeId,
            title,
            ingredientCount: Math.min(ingredients.length, INGREDIENT_COUNT_LIMIT),
            ...(ingredients.length > INGREDIENT_COUNT_LIMIT ? { moreIngredients: true as const } : {}),
            available: usable,
          };
        }
        return view;
      }),
    );
    return { slots };
  },
});

export const todaySlotValidator = v.object({
  type: slotTypeValidator,
  /** The recipe's title, typed name, eat-out or other-leftovers name; "" if none. */
  name: v.string(),
  /** A Cook slot's usable recipe. */
  recipeId: v.optional(v.id("recipes")),
  /** A Cook slot whose recipe was removed or can no longer be opened. */
  recipeRemoved: v.optional(v.literal(true)),
  /** The earlier meal a Leftovers slot eats; `name` is that meal's name. */
  source: v.optional(
    v.object({ date: v.string(), meal: mealValidator, recipeId: v.optional(v.id("recipes")) }),
  ),
});

/**
 * The caller's plan for `date` (their local calendar date, from the browser):
 * one entry per meal they plan, in day order, with `slot` null when that
 * meal is unplanned. A user with no planner yet gets no meals.
 */
export const today = query({
  args: { date: v.string() },
  returns: v.object({
    meals: v.array(v.object({ meal: mealValidator, slot: v.union(v.null(), todaySlotValidator) })),
  }),
  handler: async (ctx, { date }) => {
    const userId = await requireUser(ctx);
    assertDate(date);
    const planner = await ownPlanner(ctx, userId);
    if (planner === null) return { meals: [] };
    const meals = plannedMeals(planner.meals);
    // Six days back, for the meals today's leftovers come from.
    const loaded = await loadSlots(ctx, planner._id, addDays(date, -6), date, meals);
    const slots = loaded.map(({ slot }) => slot);
    const usableRecipe = (ref: SlotRef) => {
      const found = loaded.find(({ slot }) => slot.date === ref.date && slot.meal === ref.meal);
      return found?.cook?.usable ? found.cook.recipeId : undefined;
    };
    return {
      meals: meals.map((meal) => {
        const found = loaded.find(({ slot }) => slot.date === date && slot.meal === meal);
        if (found === undefined) return { meal, slot: null };
        const { slot, cook } = found;
        const view: typeof todaySlotValidator.type = { type: slot.type, name: slot.name };
        if (cook !== null && cook.recipeId !== undefined) {
          if (cook.usable) view.recipeId = cook.recipeId;
          else view.recipeRemoved = true;
        }
        if (slot.type === "left") {
          const resolved = resolveLeftover(slots, slot);
          if (resolved?.kind === "source") {
            const { date: sourceDate, meal: sourceMeal } = resolved.source;
            const recipeId = usableRecipe(resolved.source);
            view.name = resolved.source.name;
            view.source = { date: sourceDate, meal: sourceMeal, ...(recipeId === undefined ? {} : { recipeId }) };
          }
        }
        return { meal, slot: view };
      }),
    };
  },
});

export const pickerRecipeValidator = v.object({
  recipeId: v.id("recipes"),
  title: v.string(),
  /** The source site, or "Manual" for a recipe typed in by hand. */
  source: v.string(),
  /** Only for recipes whose name another saved recipe shares, to tell them apart. */
  ingredientCount: v.optional(v.number()),
  moreIngredients: v.optional(v.literal(true)),
});

function recipeSource(recipe: Doc<"recipes">) {
  if (!recipe.sourceUrl) return "Manual";
  if (recipe.sourceSite) return recipe.sourceSite;
  try {
    return new URL(recipe.sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return "Web";
  }
}

/** The slot picker's choices: saved recipes and the planner's meal names. */
export const pickerOptions = query({
  args: { plannerId: v.id("planners") },
  returns: v.object({ recipes: v.array(pickerRecipeValidator), meals: v.array(v.string()) }),
  handler: async (ctx, { plannerId }) => {
    const { userId } = await requirePlanner(ctx, plannerId);
    const recipes = await savedRecipes(ctx, userId);
    const keyCounts = new Map<string, number>();
    for (const recipe of recipes) {
      const key = mealKey(recipe.title);
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
    const options = await Promise.all(
      recipes.map(async (recipe) => {
        const option: typeof pickerRecipeValidator.type = {
          recipeId: recipe._id,
          title: cleanName(recipe.title),
          source: recipeSource(recipe),
        };
        if ((keyCounts.get(mealKey(recipe.title)) ?? 0) < 2) return option;
        const ingredients = await ctx.db
          .query("recipeIngredients")
          .withIndex("by_recipe", (q) => q.eq("recipeId", recipe._id))
          .take(INGREDIENT_COUNT_LIMIT + 1);
        option.ingredientCount = Math.min(ingredients.length, INGREDIENT_COUNT_LIMIT);
        if (ingredients.length > INGREDIENT_COUNT_LIMIT) option.moreIngredients = true;
        return option;
      }),
    );
    const meals = await ctx.db
      .query("plannerMeals")
      .withIndex("by_planner_and_key", (q) => q.eq("plannerId", plannerId))
      .take(SUGGESTION_LIMIT);
    return { recipes: options, meals: meals.map((meal) => meal.name) };
  },
});

// ---------------------------------------------------------------------------
// Pasting a recipe link

/**
 * Starts the app's existing import for `url` (preview, then an explicit
 * save) and makes the slot a Cook slot waiting for that recipe.
 */
export async function startSlotImport(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: { plannerId: Id<"planners">; date: string; meal: Meal; url: string },
  startIngestion: StartIngestion = startRecipeIngestion,
): Promise<Id<"recipeImports">> {
  const planner = await ctx.db.get(args.plannerId);
  if (planner === null || !canAccessPlanner(userId, planner)) throw new Error("Planner was not found");
  assertDate(args.date);
  const url = args.url.trim();
  if (!isRecipeLink(url)) throw new Error("Not a recipe link");
  const ref = { date: args.date, meal: args.meal };
  const { importId } = await queueRecipeSource(ctx, { userId, sourceUrl: url, sourceKind: "direct" }, startIngestion);
  // A slot holding a typed name keeps it until the imported recipe is saved.
  const row = await slotRow(ctx, args.plannerId, ref);
  const typedName = row?.type === "cook" && row.recipeId === undefined ? row.name : undefined;
  await writeSlot(ctx, args.plannerId, userId, ref, {
    type: "cook",
    importId,
    importName: typedName ?? nameFromRecipeLink(url),
  });
  return importId;
}

export const importLink = mutation({
  args: { ...slotArgs, url: v.string() },
  returns: v.id("recipeImports"),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await startSlotImport(ctx, userId, args);
  },
});
