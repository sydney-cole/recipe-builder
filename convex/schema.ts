import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { mealValidator, notIncludedValidator, planSlotValidator, weekStartValidator } from "./lib/plannerValidators";
import { plannerUndoFields } from "./lib/slotHistory";
import { recipeExtractionValidator } from "./lib/recipeAgentTypes";

const importStatus = v.union(
  v.literal("queued"),
  v.literal("scraping"),
  v.literal("scraped"),
  v.literal("processing"),
  v.literal("parsed"),
  v.literal("needs_review"),
  v.literal("completed"),
  v.literal("failed"),
);

const groceryListStatus = v.union(
  v.literal("active"),
  v.literal("completed"),
  v.literal("archived"),
);

export default defineSchema({
  // The app's own users. Convex Auth keeps credentials, verified emails, and
  // sessions in its components and refers to these rows by id. `email` is
  // copied from the auth email component at sign-in, so it is set only once
  // the address has been confirmed.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    // Leftovers from Convex Auth v1, kept only so rows written before the
    // move to 2.0 still validate. Current code never writes or reads them.
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    avatarUrl: v.optional(v.string()),
    currentRecipeId: v.optional(v.id("recipes")),
    deletionRequestedAt: v.optional(v.number()),
    deletionStage: v.optional(
      v.union(
        v.literal("auth"),
        v.literal("savedRecipes"),
        v.literal("userInboxes"),
        v.literal("inboundEmails"),
        v.literal("recipeImports"),
        v.literal("planner"),
        v.literal("groceryLists"),
      ),
    ),
    // Kept temporarily so existing profiles written by the retired settings
    // UI remain schema-compatible until their next migration.
    notificationPreferences: v.optional(
      v.object({
        recipeImportReady: v.boolean(),
        importNeedsReview: v.boolean(),
        subscriptionNeedsAttention: v.boolean(),
      }),
    ),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  }).index("email", ["email"]),

  // Maps each account to its AgentMail inbox. The AgentMail component keeps
  // message and thread contents in its isolated component tables.
  userInboxes: defineTable({
    userId: v.id("users"),
    inboxId: v.string(),
    email: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_inbox", ["inboxId"]),

  // A user-visible summary of each email delivered to a recipe inbox. Full
  // message bodies remain isolated inside the AgentMail component; this table
  // stores only the bounded metadata needed by the Inboxes page.
  inboundRecipeEmails: defineTable({
    userId: v.id("users"),
    inboxId: v.string(),
    eventId: v.string(),
    messageId: v.optional(v.string()),
    sender: v.optional(v.string()),
    subject: v.optional(v.string()),
    receivedAt: v.number(),
    linkCount: v.number(),
    queuedCount: v.number(),
    primaryImportId: v.optional(v.id("recipeImports")),
  })
    .index("by_user", ["userId"])
    .index("by_event", ["eventId"]),

  // One attempt to turn a URL into a recipe. Keeping jobs separate from the
  // finished recipe makes retries and user-visible scrape errors easy to track.
  recipeImports: defineTable({
    requestedBy: v.optional(v.id("users")),
    sourceUrl: v.string(),
    normalizedUrl: v.string(),
    sourceKind: v.optional(
      v.union(
        v.literal("direct"),
        v.literal("email"),
        v.literal("agent_discovery"),
      ),
    ),
    sourceQuery: v.optional(v.string()),
    setAsCurrent: v.optional(v.boolean()),
    status: importStatus,
    attemptCount: v.number(),
    workflowId: v.optional(v.string()),
    agentThreadId: v.optional(v.string()),
    agentModel: v.optional(v.string()),
    agentWarnings: v.optional(v.array(v.string())),
    scrapeArtifactId: v.optional(v.id("recipeScrapeArtifacts")),
    recipeId: v.optional(v.id("recipes")),
    generatedGroceryListId: v.optional(v.id("groceryLists")),
    errorMessage: v.optional(v.string()),
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

  // Bounded source evidence produced by the recipe page scraper. This is
  // intentionally kept separate from `recipes`: the extraction agent consumes
  // this artifact to create the final recipe card and grocery data.
  recipeScrapeArtifacts: defineTable({
    importId: v.id("recipeImports"),
    sourceUrl: v.string(),
    normalizedUrl: v.string(),
    markdown: v.string(),
    recipeJsonLd: v.optional(v.string()),
    imageSourceUrl: v.optional(v.string()),
    pageTitle: v.optional(v.string()),
    pageDescription: v.optional(v.string()),
    pageLanguage: v.optional(v.string()),
    canonicalUrl: v.optional(v.string()),
    contentType: v.optional(v.string()),
    statusCode: v.optional(v.number()),
    truncated: v.boolean(),
    scrapedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_import", ["importId"])
    .index("by_normalized_url", ["normalizedUrl"]),

  // Model output keyed by page URL, shared across users so a page another
  // user already imported does not pay for a second model call. It holds the
  // raw extraction rather than a user's recipe, which they may have edited.
  recipeExtractions: defineTable({
    normalizedUrl: v.string(),
    model: v.string(),
    extraction: recipeExtractionValidator,
    createdAt: v.number(),
  }).index("by_normalized_url", ["normalizedUrl"]),

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
    imageStorageId: v.optional(v.id("_storage")),
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
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_normalized_source_url", ["normalizedSourceUrl"])
    .index("by_public", ["isPublic"])
    .index("by_public_and_deleted_at", ["isPublic", "deletedAt"])
    .index("by_image_storage_id_and_deleted_at", ["imageStorageId", "deletedAt"])
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
    clientRequestId: v.optional(v.string()),
    needsInitialSave: v.optional(v.boolean()),
    name: v.string(),
    sourceRecipeId: v.optional(v.id("recipes")),
    sourceRecipeTitle: v.optional(v.string()),
    sourceRecipeIds: v.optional(v.array(v.id("recipes"))),
    status: groceryListStatus,
    completedAt: v.optional(v.number()),
    // Set on the one list made from a planner week (`convex/plannerGrocery.ts`):
    // the planner, the week's first day, when it was last updated from the
    // plan, a summary of the plan at that time and the meals left out.
    plannerId: v.optional(v.id("planners")),
    planWeekStart: v.optional(v.string()),
    planSyncedAt: v.optional(v.number()),
    planFingerprint: v.optional(v.string()),
    planNotIncluded: v.optional(v.array(notIncludedValidator)),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_status", ["userId", "status"])
    .index("by_user_and_client_request", ["userId", "clientRequestId"])
    .index("by_user_and_source_recipe", ["userId", "sourceRecipeId"])
    .index("by_planner_and_week_start", ["plannerId", "planWeekStart"]),

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
    // On a planner week's list, items derived from the plan carry the
    // grocery's match key and the amount the plan last wrote. An item without
    // `planKey` was added by hand and an update from the plan leaves it alone.
    planKey: v.optional(v.string()),
    planQuantityText: v.optional(v.string()),
    planUnit: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_list", ["listId"])
    .index("by_list_and_checked", ["listId", "isChecked"])
    .index("by_list_and_ingredient", ["listId", "ingredientId"])
    .index("by_list_and_order", ["listId", "sortOrder"]),

  groceryListItemSources: defineTable({
    groceryListItemId: v.id("groceryListItems"),
    recipeId: v.id("recipes"),
    recipeIngredientId: v.id("recipeIngredients"),
    servingsMultiplier: v.number(),
    quantityAdded: v.optional(v.number()),
    quantityTextAdded: v.optional(v.string()),
    // Written by an update from the plan, which replaces only these rows.
    fromPlan: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_grocery_list_item", ["groceryListItemId"])
    .index("by_recipe", ["recipeId"])
    .index("by_recipe_ingredient", ["recipeIngredientId"]),

  // A weekly meal planner. Owned by one user today; slots and planner meals
  // reference the planner rather than the user so a household can own one
  // later. Access always goes through `canAccessPlanner`.
  planners: defineTable({
    ownerId: v.id("users"),
    weekStart: weekStartValidator,
    people: v.number(),
    // "Meals to plan"; unset means every meal. Slots of a meal turned off are
    // kept and hidden, so they come back when it is turned on again.
    meals: v.optional(v.array(mealValidator)),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  // Eat-out and other-leftovers meals. Cook slots point at recipes instead.
  // `key` is `mealKey(name)` and is unique per planner.
  plannerMeals: defineTable({
    plannerId: v.id("planners"),
    name: v.string(),
    key: v.string(),
    description: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_planner_and_key", ["plannerId", "key"]),

  // At most one row per planner, date and meal; an unplanned slot has none.
  planSlots: defineTable(planSlotValidator).index("by_planner_and_date", [
    "plannerId",
    "date",
    "meal",
  ]),

  // The planner's last slot change, kept so it can be undone (one level).
  // At most one row per planner; see `convex/lib/slotHistory.ts`.
  plannerUndo: defineTable(plannerUndoFields).index("by_planner", ["plannerId"]),

  recipeSearchCache: defineTable({
    normalizedQuery: v.string(),
    results: v.array(
      v.object({
        url: v.string(),
        title: v.string(),
        description: v.string(),
        source: v.string(),
        rating: v.optional(v.number()),
        ratingCount: v.optional(v.number()),
      }),
    ),
    createdAt: v.number(),
  }).index("by_query", ["normalizedQuery"]),
});
