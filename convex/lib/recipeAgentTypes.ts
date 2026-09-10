import { v } from "convex/values";

export const extractedInstructionValidator = v.object({
  position: v.number(),
  text: v.string(),
  section: v.union(v.string(), v.null()),
});

export const extractedIngredientValidator = v.object({
  position: v.number(),
  section: v.union(v.string(), v.null()),
  originalText: v.string(),
  name: v.string(),
  normalizedName: v.string(),
  quantity: v.union(v.number(), v.null()),
  quantityText: v.union(v.string(), v.null()),
  unit: v.union(v.string(), v.null()),
  preparation: v.union(v.string(), v.null()),
  notes: v.union(v.string(), v.null()),
  category: v.union(v.string(), v.null()),
  isOptional: v.boolean(),
});

export const recipeExtractionValidator = v.object({
  title: v.string(),
  description: v.union(v.string(), v.null()),
  sourceSite: v.union(v.string(), v.null()),
  sourceAuthor: v.union(v.string(), v.null()),
  yieldText: v.union(v.string(), v.null()),
  servings: v.union(v.number(), v.null()),
  prepTimeMinutes: v.union(v.number(), v.null()),
  cookTimeMinutes: v.union(v.number(), v.null()),
  totalTimeMinutes: v.union(v.number(), v.null()),
  cuisines: v.array(v.string()),
  categories: v.array(v.string()),
  keywords: v.array(v.string()),
  instructions: v.array(extractedInstructionValidator),
  ingredients: v.array(extractedIngredientValidator),
  warnings: v.array(v.string()),
});

export type RecipeExtraction = {
  title: string;
  description: string | null;
  sourceSite: string | null;
  sourceAuthor: string | null;
  yieldText: string | null;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  totalTimeMinutes: number | null;
  cuisines: string[];
  categories: string[];
  keywords: string[];
  instructions: Array<{
    position: number;
    text: string;
    section: string | null;
  }>;
  ingredients: Array<{
    position: number;
    section: string | null;
    originalText: string;
    name: string;
    normalizedName: string;
    quantity: number | null;
    quantityText: string | null;
    unit: string | null;
    preparation: string | null;
    notes: string | null;
    category: string | null;
    isOptional: boolean;
  }>;
  warnings: string[];
};
