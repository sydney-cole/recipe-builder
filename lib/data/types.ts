export type Recipe = {
  id: string;
  title: string;
  description: string;
  totalMinutes: number;
  servings: number;
  source: string;
  tags: string[];
  art: "garden" | "citrus" | "tomato" | "berry";
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

export type Subscription = {
  id: string;
  name: string;
  domain: string;
  status: "active" | "pending" | "paused" | "attention";
  lastReceived: string;
  recipeCount: number;
};

export type GroceryItem = {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  category: string;
  source?: string;
  checked: boolean;
};
