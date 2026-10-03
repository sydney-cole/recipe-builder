import type { GroceryItem, Recipe, RecipeImport } from "./types";

export const recipes: Recipe[] = [
  {
    id: "lemon-herb-orzo",
    title: "Lemon herb orzo with spring greens",
    description: "A bright one-pan dinner with tender greens, herbs, and creamy orzo.",
    totalMinutes: 30,
    servings: 4,
    source: "Harvest Table",
    tags: ["Weeknight", "Vegetarian"],
    art: "garden",
  },
  {
    id: "tomato-white-bean",
    title: "Roasted tomato and white bean skillet",
    description: "Jammy tomatoes, white beans, and toasted sourdough for an easy pantry meal.",
    totalMinutes: 40,
    servings: 4,
    source: "Everyday Pantry",
    tags: ["Pantry", "High protein"],
    art: "tomato",
  },
  {
    id: "citrus-salmon",
    title: "Citrus glazed salmon bowls",
    description: "Caramelized salmon with rice, cucumber, and a punchy citrus dressing.",
    totalMinutes: 35,
    servings: 2,
    source: "Sunday Simmer",
    tags: ["Seafood", "Gluten free"],
    art: "citrus",
  },
  {
    id: "berry-oats",
    title: "Berry cardamom baked oats",
    description: "A make-ahead breakfast with tart berries and warm cardamom.",
    totalMinutes: 50,
    servings: 6,
    source: "Morning Kitchen",
    tags: ["Breakfast", "Make ahead"],
    art: "berry",
  },
];

export const suggestions: Recipe[] = [
  {
    ...recipes[0],
    id: "suggested-orzo",
    matchReason: "Uses your spinach and lemon, and fits a cozy-but-light mood.",
    missingIngredients: ["orzo", "parmesan"],
  },
  {
    ...recipes[1],
    id: "suggested-beans",
    matchReason: "Built around pantry staples and ready in under 45 minutes.",
    missingIngredients: ["sourdough"],
  },
  {
    ...recipes[2],
    id: "suggested-salmon",
    matchReason: "A fresh dinner option with the cucumber you already have.",
    missingIngredients: ["salmon", "rice"],
  },
];

export const imports: RecipeImport[] = [
  {
    id: "import-1",
    subject: "Pasta recipe for this week",
    source: "Email received 4 minutes ago",
    status: "scraping",
    detail: "Extracting ingredients and instructions",
  },
  {
    id: "import-2",
    subject: "Roasted tomato and white bean skillet",
    source: "Everyday Pantry",
    status: "ready",
    detail: "Ready to review",
  },
  {
    id: "import-3",
    subject: "Weekend brunch ideas",
    source: "Email received yesterday",
    status: "attention",
    detail: "Choose one of 3 recipe links",
  },
];

export const groceryItems: GroceryItem[] = [
  { id: "g1", name: "Baby spinach", quantity: "5", unit: "oz", category: "Produce", source: "Lemon herb orzo", checked: false },
  { id: "g2", name: "Lemons", quantity: "3", unit: "", category: "Produce", source: "2 recipes", checked: false },
  { id: "g3", name: "Cherry tomatoes", quantity: "2", unit: "pints", category: "Produce", source: "Tomato bean skillet", checked: true },
  { id: "g4", name: "Orzo", quantity: "12", unit: "oz", category: "Pantry", source: "Lemon herb orzo", checked: false },
  { id: "g5", name: "Cannellini beans", quantity: "2", unit: "cans", category: "Pantry", source: "Tomato bean skillet", checked: false },
  { id: "g6", name: "Parmesan", quantity: "4", unit: "oz", category: "Dairy", source: "Lemon herb orzo", checked: false },
];
