export type Recipe = {
  id: string;
  title: string;
  description: string;
  totalMinutes?: number;
  servings?: number;
  source: string;
  tags: string[];
  art: "garden" | "citrus" | "tomato" | "berry";
  imageUrl?: string;
  isFavorite?: boolean;
  /** Whether the user owns the recipe (removing it deletes it rather than unsaving it). */
  canEdit?: boolean;
  matchReason?: string;
  missingIngredients?: string[];
};

export type RecipeImport = {
  id: string;
  subject: string;
  source: string;
  status: "received" | "scraping" | "ready" | "attention";
  detail: string;
};

export type GroceryItem = {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  category: string;
  source?: string;
  /** On a planner week's list: what the plan now asks for, when the amount was edited by hand. */
  planAmount?: string;
  checked: boolean;
};
