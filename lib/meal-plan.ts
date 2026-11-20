import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import type { api } from "@/convex/_generated/api";

export type MealPlanEntry = FunctionReturnType<typeof api.mealPlans.listRange>[number];

export const MEAL_SLOTS = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
] as const;

export type MealSlot = (typeof MEAL_SLOTS)[number]["id"];

const WEEK_STARTS_ON = 0;

function fromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function toDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function addDays(dateKey: string, days: number) {
  const date = fromDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function startOfWeek(dateKey: string) {
  const daysIntoWeek = (fromDateKey(dateKey).getDay() - WEEK_STARTS_ON + 7) % 7;
  return addDays(dateKey, -daysIntoWeek);
}

export function weekDays(weekStart: string) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

export function formatDay(dateKey: string, options: Intl.DateTimeFormatOptions) {
  return fromDateKey(dateKey).toLocaleDateString("en-US", options);
}

export function formatWeekRange(weekStart: string) {
  const format = (dateKey: string) => formatDay(dateKey, { month: "short", day: "numeric" });
  return `${format(weekStart)} – ${format(addDays(weekStart, 6))}`;
}

export function slotLabel(slot: MealSlot) {
  return MEAL_SLOTS.find((item) => item.id === slot)!.label;
}

export function plannedServings(entry: MealPlanEntry) {
  return entry.servings ?? entry.recipe?.servings;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function weekFromParam(value: string | string[] | null | undefined) {
  return typeof value === "string" && DATE_KEY.test(value) ? startOfWeek(value) : null;
}

export function recipeHrefFromMealPlan(entry: MealPlanEntry & { recipe: NonNullable<MealPlanEntry["recipe"]> }) {
  const path = entry.recipe.isSaved ? "/app/recipe-book" : "/app/recipes";
  return `${path}/${entry.recipe.id}?mealPlanWeek=${startOfWeek(entry.date)}`;
}

export function mealPlanBackLink(mealPlanWeek: string | string[] | undefined) {
  const week = weekFromParam(mealPlanWeek);
  return week === null ? undefined : { href: `/app/meal-plan?week=${week}`, label: "Back to Meal Plan" };
}

export function mealPlanErrorMessage(error: unknown, fallback: string) {
  return error instanceof ConvexError && typeof error.data === "string" ? error.data : fallback;
}

export function parseGroceryItems(text: string) {
  return text.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
}
