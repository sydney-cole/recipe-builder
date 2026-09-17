/**
 * TEMPORARY TEST MODE
 *
 * This file keeps the Firecrawl-free discovery recipes isolated. To restore
 * live discovery, set DISCOVERY_DEMO_MODE to false. Once testing is finished,
 * this file and the marked integration in DiscoverForm can be deleted.
 */
export const DISCOVERY_DEMO_MODE = true;

export type DemoDiscoveryRecipe = {
  url: string;
  title: string;
  description: string;
  source: string;
  rating: number | null;
  ratingCount: number | null;
  totalTimeMinutes: number | null;
  matchReason: string;
  matchedTerms: string[];
  ingredients: string[];
  instructions: string[];
};

export const TEMPORARY_DISCOVERY_RECIPES: DemoDiscoveryRecipe[] = [
  {
    url: "https://demo.perfectplate.example.com/recipes/creamy-tuscan-chickpeas",
    title: "Creamy Tuscan Chickpeas",
    description: "A cozy one-pan chickpea dinner with tomatoes, spinach, and a creamy garlic sauce.",
    source: "PerfectPlate Demo Kitchen",
    rating: null,
    ratingCount: null,
    totalTimeMinutes: 30,
    matchReason: "A complete vegetarian demo recipe for testing the recipe and grocery-list flow.",
    matchedTerms: ["chickpeas", "cozy", "vegetarian"],
    ingredients: [
      "1 tablespoon olive oil",
      "3 cloves garlic",
      "2 (15-ounce) cans chickpeas",
      "1 (14-ounce) can diced tomatoes",
      "1 cup coconut milk",
      "3 packed cups baby spinach",
      "1 teaspoon Italian seasoning",
      "1/2 teaspoon kosher salt",
    ],
    instructions: [
      "Warm the olive oil in a large skillet over medium heat.",
      "Cook the garlic and Italian seasoning until fragrant, about 30 seconds.",
      "Add the chickpeas, tomatoes, and coconut milk; simmer for 12 minutes.",
      "Fold in the spinach and cook until wilted. Season with salt and serve.",
    ],
  },
  {
    url: "https://demo.perfectplate.example.com/recipes/sheet-pan-lemon-herb-chicken",
    title: "Sheet-Pan Lemon Herb Chicken",
    description: "Roasted chicken thighs, potatoes, and broccoli with plenty of lemon and herbs.",
    source: "PerfectPlate Demo Kitchen",
    rating: null,
    ratingCount: null,
    totalTimeMinutes: 50,
    matchReason: "A complete sheet-pan demo recipe for testing recipe selection and list creation.",
    matchedTerms: ["chicken", "lemon", "broccoli"],
    ingredients: [
      "1 1/2 pounds boneless chicken thighs",
      "1 1/2 pounds baby potatoes",
      "1 large head broccoli",
      "1 lemon",
      "3 tablespoons olive oil",
      "3 cloves garlic",
      "2 teaspoons dried oregano",
      "1 teaspoon kosher salt",
      "1/2 teaspoon black pepper",
    ],
    instructions: [
      "Heat the oven to 425°F and line a large sheet pan.",
      "Toss the potatoes with one third of the oil and roast for 15 minutes.",
      "Coat the chicken and broccoli with the remaining oil, garlic, oregano, lemon zest, salt, and pepper.",
      "Add everything to the pan and roast until the chicken reaches 165°F, about 20 minutes. Finish with lemon juice.",
    ],
  },
  {
    url: "https://demo.perfectplate.example.com/recipes/ginger-peanut-noodles",
    title: "Ginger Peanut Noodles",
    description: "Quick noodles tossed in a savory peanut-ginger sauce and topped with scallions.",
    source: "PerfectPlate Demo Kitchen",
    rating: null,
    ratingCount: null,
    totalTimeMinutes: 20,
    matchReason: "A complete quick-meal demo recipe for testing the full recipe flow.",
    matchedTerms: ["noodles", "quick", "peanut sauce"],
    ingredients: [
      "12 ounces noodles",
      "1/2 cup creamy peanut butter",
      "3 tablespoons soy sauce",
      "2 tablespoons rice vinegar",
      "1 tablespoon sesame oil",
      "1 tablespoon maple syrup",
      "1 clove garlic",
      "1 tablespoon grated fresh ginger",
      "3 scallions",
    ],
    instructions: [
      "Cook the noodles according to their package directions; reserve one cup of cooking water.",
      "Whisk the peanut butter, soy sauce, vinegar, sesame oil, maple syrup, garlic, and ginger.",
      "Toss the hot noodles with the sauce, adding cooking water until glossy.",
      "Divide among bowls and finish with sliced scallions.",
    ],
  },
];

export function isTemporaryDemoRecipe(url: string) {
  return url.startsWith("https://demo.perfectplate.example.com/");
}
