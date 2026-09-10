export const RECIPE_DRAFT_LIMITS = {
  title: 200,
  description: 4_000,
  sourceText: 80_000,
  sourceTitle: 300,
  imageUrl: 2_048,
  yieldText: 120,
  tag: 80,
  tags: 30,
  ingredients: 200,
  instructions: 100,
  ingredientText: 500,
  instructionText: 2_000,
  optionalText: 300,
} as const;

export const LIST_LIMITS = {
  name: 120,
  itemName: 200,
  quantityText: 80,
  unit: 40,
  notes: 1_000,
  requestKey: 200,
} as const;

export const RECIPE_PROMPT_VERSION = "recipe-import-v1";
export const RECIPE_SCHEMA_VERSION = "recipe-draft-v1";

export type ImportErrorCategory =
  | "invalid_source"
  | "no_recipe"
  | "provider_temporary"
  | "rate_limited"
  | "model_refusal"
  | "incomplete_response"
  | "invalid_output"
  | "configuration";

export type RecipeDraftInput = {
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  yieldText?: string | null;
  servings?: number | null;
  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;
  totalTimeMinutes?: number | null;
  cuisines?: string[];
  categories?: string[];
  keywords?: string[];
  ingredients: Array<{
    section?: string | null;
    originalText: string;
    name: string;
    quantity?: number | null;
    quantityText?: string | null;
    unit?: string | null;
    preparation?: string | null;
    notes?: string | null;
    isOptional?: boolean;
  }>;
  instructions: Array<{ text: string; section?: string | null }>;
};

function requiredText(value: unknown, label: string, max: number) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  const normalized = value.trim();
  if (normalized.length > max) throw new Error(`${label} is too long`);
  return normalized;
}

function optionalText(value: unknown, label: string, max: number) {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredText(value, label, max);
}

function optionalNonNegativeNumber(value: unknown, label: string) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number`);
  }
  return value;
}

function boundedTags(values: unknown, label: string) {
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.length > RECIPE_DRAFT_LIMITS.tags) {
    throw new Error(`${label} has too many values`);
  }
  return values.map((value) =>
    requiredText(value, label, RECIPE_DRAFT_LIMITS.tag),
  );
}

export function normalizeIngredientName(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function normalizeGroceryUnit(value: string | undefined) {
  const unit = value?.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  return unit || undefined;
}

export function validateRecipeDraft(input: RecipeDraftInput) {
  if (!Array.isArray(input.ingredients) || input.ingredients.length === 0) {
    throw new Error("At least one ingredient is required");
  }
  if (input.ingredients.length > RECIPE_DRAFT_LIMITS.ingredients) {
    throw new Error("Recipe has too many ingredients");
  }
  if (!Array.isArray(input.instructions) || input.instructions.length === 0) {
    throw new Error("At least one instruction is required");
  }
  if (input.instructions.length > RECIPE_DRAFT_LIMITS.instructions) {
    throw new Error("Recipe has too many instructions");
  }

  return {
    title: requiredText(input.title, "Recipe title", RECIPE_DRAFT_LIMITS.title),
    description: optionalText(
      input.description,
      "Description",
      RECIPE_DRAFT_LIMITS.description,
    ),
    imageUrl: optionalText(input.imageUrl, "Image URL", RECIPE_DRAFT_LIMITS.imageUrl),
    yieldText: optionalText(
      input.yieldText,
      "Yield",
      RECIPE_DRAFT_LIMITS.yieldText,
    ),
    servings: optionalNonNegativeNumber(input.servings, "Servings"),
    prepTimeMinutes: optionalNonNegativeNumber(input.prepTimeMinutes, "Prep time"),
    cookTimeMinutes: optionalNonNegativeNumber(input.cookTimeMinutes, "Cook time"),
    totalTimeMinutes: optionalNonNegativeNumber(input.totalTimeMinutes, "Total time"),
    cuisines: boundedTags(input.cuisines, "Cuisine"),
    categories: boundedTags(input.categories, "Category"),
    keywords: boundedTags(input.keywords, "Keyword"),
    ingredients: input.ingredients.map((ingredient, position) => {
      const name = requiredText(
        ingredient.name,
        "Ingredient name",
        RECIPE_DRAFT_LIMITS.ingredientText,
      );
      return {
        position,
        section: optionalText(
          ingredient.section,
          "Ingredient section",
          RECIPE_DRAFT_LIMITS.optionalText,
        ),
        originalText: requiredText(
          ingredient.originalText,
          "Ingredient text",
          RECIPE_DRAFT_LIMITS.ingredientText,
        ),
        name,
        normalizedName: normalizeIngredientName(name),
        quantity: optionalNonNegativeNumber(ingredient.quantity, "Ingredient quantity"),
        quantityText: optionalText(
          ingredient.quantityText,
          "Ingredient quantity text",
          RECIPE_DRAFT_LIMITS.optionalText,
        ),
        unit: normalizeGroceryUnit(
          optionalText(
            ingredient.unit,
            "Ingredient unit",
            RECIPE_DRAFT_LIMITS.optionalText,
          ),
        ),
        preparation: optionalText(
          ingredient.preparation,
          "Ingredient preparation",
          RECIPE_DRAFT_LIMITS.optionalText,
        ),
        notes: optionalText(
          ingredient.notes,
          "Ingredient notes",
          RECIPE_DRAFT_LIMITS.optionalText,
        ),
        isOptional: ingredient.isOptional ?? false,
      };
    }),
    instructions: input.instructions.map((instruction, position) => ({
      position,
      text: requiredText(
        instruction.text,
        "Instruction",
        RECIPE_DRAFT_LIMITS.instructionText,
      ),
      section: optionalText(
        instruction.section,
        "Instruction section",
        RECIPE_DRAFT_LIMITS.optionalText,
      ),
    })),
  };
}

export function normalizeEmailAddress(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const bracketed = trimmed.match(/<([^<>]+)>$/)?.[1] ?? trimmed;
  const normalized = bracketed.trim().toLocaleLowerCase();
  if (
    normalized.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

export function normalizeListName(value: string) {
  return requiredText(value, "List name", LIST_LIMITS.name);
}

export function normalizeListItem(input: {
  name: string;
  quantity?: number;
  quantityText?: string;
  unit?: string;
  notes?: string;
}) {
  const name = requiredText(input.name, "Item name", LIST_LIMITS.itemName);
  return {
    name,
    normalizedName: normalizeIngredientName(name),
    quantity: optionalNonNegativeNumber(input.quantity, "Item quantity"),
    quantityText: optionalText(
      input.quantityText,
      "Item quantity text",
      LIST_LIMITS.quantityText,
    ),
    unit: normalizeGroceryUnit(
      optionalText(input.unit, "Item unit", LIST_LIMITS.unit),
    ),
    notes: optionalText(input.notes, "Item notes", LIST_LIMITS.notes),
  };
}

export function normalizeRequestKey(value: string) {
  return requiredText(value, "Request key", LIST_LIMITS.requestKey);
}

export function safeImportError(category: ImportErrorCategory) {
  const retryable = new Set<ImportErrorCategory>([
    "provider_temporary",
    "rate_limited",
    "model_refusal",
    "incomplete_response",
  ]).has(category);
  const messages: Record<ImportErrorCategory, string> = {
    invalid_source: "That page could not be used as a recipe source.",
    no_recipe: "We could not find a complete recipe on that page.",
    provider_temporary: "Recipe processing is temporarily unavailable.",
    rate_limited: "Recipe processing is busy. Please try again shortly.",
    model_refusal: "A recipe draft could not be generated from this page.",
    incomplete_response: "The generated recipe draft was incomplete.",
    invalid_output: "The generated recipe needs to be processed again.",
    configuration: "Recipe importing is not configured for this deployment.",
  };
  return { category, message: messages[category], retryable };
}
