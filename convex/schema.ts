import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const importStatus = v.union(
  v.literal("queued"),
  v.literal("scraping"),
  v.literal("parsed"),
  v.literal("completed"),
  v.literal("failed"),
);

const importProcessingStage = v.union(
  v.literal("retrieving"),
  v.literal("generating"),
);

const importErrorCategory = v.union(
  v.literal("invalid_source"),
  v.literal("no_recipe"),
  v.literal("provider_temporary"),
  v.literal("rate_limited"),
  v.literal("model_refusal"),
  v.literal("incomplete_response"),
  v.literal("invalid_output"),
  v.literal("configuration"),
);

const groceryListStatus = v.union(
  v.literal("active"),
  v.literal("completed"),
  v.literal("archived"),
);

export default defineSchema({
  ...authTables,

  // This extends Convex Auth's users table with optional application profile
  // fields. Auth providers are not required to supply the custom fields.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    avatarUrl: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  // Deprecated deployment bridge. The migration clears these obsolete
  // per-user mappings; keeping the table temporarily permits a safe rollout.
  userInboxes: defineTable({
    userId: v.id("users"),
    inboxId: v.string(),
    email: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_inbox", ["inboxId"]),

  // One attempt to turn a URL into a recipe. Keeping jobs separate from the
  // finished recipe makes retries and user-visible scrape errors easy to track.
  recipeImports: defineTable({
    requestedBy: v.optional(v.id("users")),
    sourceUrl: v.string(),
    normalizedUrl: v.string(),
    status: importStatus,
    attemptCount: v.number(),
    processingStage: v.optional(importProcessingStage),
    recipeId: v.optional(v.id("recipes")),
    errorMessage: v.optional(v.string()),
    errorCategory: v.optional(importErrorCategory),
    errorRetryable: v.optional(v.boolean()),
    sourceMessageId: v.optional(v.string()),
    sourceEventId: v.optional(v.string()),
    sourceSubject: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_normalized_url", ["normalizedUrl"])
    .index("by_status", ["status"])
    .index("by_requester", ["requestedBy"])
    .index("by_requester_and_normalized_url", ["requestedBy", "normalizedUrl"])
    .index("by_source_event", ["sourceEventId"])
    .index("by_requester_and_status", ["requestedBy", "status"]),

  // Idempotency and safe disposition tracking for the shared inbox. Message
  // bodies and sender addresses remain in AgentMail's isolated component.
  recipeInboxEvents: defineTable({
    eventId: v.string(),
    disposition: v.union(
      v.literal("queued"),
      v.literal("duplicate"),
      v.literal("wrong_inbox"),
      v.literal("unknown_sender"),
      v.literal("no_links"),
    ),
    queuedCount: v.number(),
    createdAt: v.number(),
  }).index("by_event", ["eventId"]),

  // Model output remains isolated from canonical recipes until its owner
  // explicitly reviews and saves it.
  recipeImportDrafts: defineTable({
    importId: v.id("recipeImports"),
    sourceUrl: v.string(),
    sourceTitle: v.optional(v.string()),
    sourceSite: v.optional(v.string()),
    title: v.string(),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    yieldText: v.optional(v.string()),
    servings: v.optional(v.number()),
    prepTimeMinutes: v.optional(v.number()),
    cookTimeMinutes: v.optional(v.number()),
    totalTimeMinutes: v.optional(v.number()),
    cuisines: v.array(v.string()),
    categories: v.array(v.string()),
    keywords: v.array(v.string()),
    ingredients: v.array(
      v.object({
        position: v.number(),
        section: v.optional(v.string()),
        originalText: v.string(),
        name: v.string(),
        normalizedName: v.string(),
        quantity: v.optional(v.number()),
        quantityText: v.optional(v.string()),
        unit: v.optional(v.string()),
        preparation: v.optional(v.string()),
        notes: v.optional(v.string()),
        isOptional: v.boolean(),
      }),
    ),
    instructions: v.array(
      v.object({
        position: v.number(),
        text: v.string(),
        section: v.optional(v.string()),
      }),
    ),
    modelId: v.string(),
    promptVersion: v.string(),
    schemaVersion: v.string(),
    providerRequestId: v.optional(v.string()),
    generatedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_import", ["importId"])
    .index("by_generated_at", ["generatedAt"]),

  // Canonical recipe content parsed from the source page. User-specific state
  // such as notes and favorites belongs in `savedRecipes` below.
  recipes: defineTable({
    importId: v.optional(v.id("recipeImports")),
    sourceUrl: v.string(),
    normalizedSourceUrl: v.string(),
    isPublic: v.optional(v.boolean()),
    sourceSite: v.optional(v.string()),
    sourceAuthor: v.optional(v.string()),
    title: v.string(),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    yieldText: v.optional(v.string()),
    servings: v.optional(v.number()),
    prepTimeMinutes: v.optional(v.number()),
    cookTimeMinutes: v.optional(v.number()),
    totalTimeMinutes: v.optional(v.number()),
    cuisines: v.array(v.string()),
    categories: v.array(v.string()),
    keywords: v.array(v.string()),
    instructions: v.array(
      v.object({
        position: v.number(),
        text: v.string(),
        section: v.optional(v.string()),
      }),
    ),
    nutrition: v.optional(
      v.object({
        servingSize: v.optional(v.string()),
        calories: v.optional(v.string()),
        protein: v.optional(v.string()),
        carbohydrates: v.optional(v.string()),
        fat: v.optional(v.string()),
        fiber: v.optional(v.string()),
        sugar: v.optional(v.string()),
        sodium: v.optional(v.string()),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_normalized_source_url", ["normalizedSourceUrl"])
    .index("by_public", ["isPublic"])
    .index("by_import", ["importId"])
    .searchIndex("search_recipes", {
      searchField: "title",
      filterFields: ["sourceSite"],
    }),

  // A normalized ingredient catalog used to recognize equivalent ingredients
  // across recipes (for example, "scallions" and "green onions").
  ingredients: defineTable({
    name: v.string(),
    normalizedName: v.string(),
    category: v.optional(v.string()),
    defaultUnit: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_normalized_name", ["normalizedName"])
    .index("by_category", ["category"])
    .searchIndex("search_ingredients", { searchField: "name" }),

  // Parsed recipe lines. `originalText` preserves what the source displayed;
  // the structured fields power scaling, matching, and grocery aggregation.
  recipeIngredients: defineTable({
    recipeId: v.id("recipes"),
    ingredientId: v.optional(v.id("ingredients")),
    position: v.number(),
    section: v.optional(v.string()),
    originalText: v.string(),
    name: v.string(),
    normalizedName: v.string(),
    quantity: v.optional(v.number()),
    quantityText: v.optional(v.string()),
    unit: v.optional(v.string()),
    preparation: v.optional(v.string()),
    notes: v.optional(v.string()),
    isOptional: v.boolean(),
  })
    .index("by_recipe", ["recipeId"])
    .index("by_recipe_and_position", ["recipeId", "position"])
    .index("by_ingredient", ["ingredientId"]),

  // The many-to-many relationship between users and canonical recipes.
  savedRecipes: defineTable({
    userId: v.id("users"),
    recipeId: v.id("recipes"),
    customTitle: v.optional(v.string()),
    notes: v.optional(v.string()),
    isFavorite: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_recipe", ["recipeId"])
    .index("by_user_and_recipe", ["userId", "recipeId"])
    .index("by_user_and_favorite", ["userId", "isFavorite"]),

  groceryLists: defineTable({
    userId: v.id("users"),
    name: v.string(),
    status: groceryListStatus,
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_status", ["userId", "status"]),

  // An item may combine the same ingredient from several recipes. The source
  // rows in `groceryListItemSources` retain that provenance.
  groceryListItems: defineTable({
    listId: v.id("groceryLists"),
    ingredientId: v.optional(v.id("ingredients")),
    name: v.string(),
    normalizedName: v.string(),
    quantity: v.optional(v.number()),
    quantityText: v.optional(v.string()),
    unit: v.optional(v.string()),
    category: v.optional(v.string()),
    notes: v.optional(v.string()),
    isChecked: v.boolean(),
    sortOrder: v.number(),
    removedAt: v.optional(v.number()),
    removalExpiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_list", ["listId"])
    .index("by_list_and_checked", ["listId", "isChecked"])
    .index("by_list_and_ingredient", ["listId", "ingredientId"])
    .index("by_list_and_order", ["listId", "sortOrder"]),

  // A durable request key prevents a retried recipe-to-list confirmation from
  // adding the same batch twice.
  groceryListAdditions: defineTable({
    listId: v.id("groceryLists"),
    recipeId: v.id("recipes"),
    requestKey: v.string(),
    itemIds: v.array(v.id("groceryListItems")),
    createdAt: v.number(),
  })
    .index("by_list", ["listId"])
    .index("by_list_and_request", ["listId", "requestKey"]),

  groceryListItemSources: defineTable({
    groceryListItemId: v.id("groceryListItems"),
    recipeId: v.id("recipes"),
    recipeIngredientId: v.id("recipeIngredients"),
    servingsMultiplier: v.number(),
    quantityAdded: v.optional(v.number()),
    quantityTextAdded: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_grocery_list_item", ["groceryListItemId"])
    .index("by_recipe", ["recipeId"])
    .index("by_recipe_ingredient", ["recipeIngredientId"]),
});
