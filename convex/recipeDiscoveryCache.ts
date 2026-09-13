import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

// Bump the key when recommendation eligibility changes so stale candidates
// that were never importability-checked are replaced immediately.
const RECOMMENDATIONS_KEY = "daily_recommendations_v2";
const DAILY_CACHE_MS = 24 * 60 * 60 * 1_000;

const discoveryResultValidator = v.object({
  url: v.string(),
  title: v.string(),
  description: v.string(),
  source: v.string(),
  rating: v.union(v.number(), v.null()),
  ratingCount: v.union(v.number(), v.null()),
  totalTimeMinutes: v.union(v.number(), v.null()),
  matchReason: v.string(),
  matchedTerms: v.array(v.string()),
  ingredients: v.array(v.string()),
  instructions: v.array(v.string()),
});

const cachedRecommendationsValidator = v.object({
  query: v.string(),
  recipes: v.array(discoveryResultValidator),
});

export const claimDailyRefresh = internalMutation({
  args: {},
  returns: v.object({
    shouldRefresh: v.boolean(),
    cached: v.union(cachedRecommendationsValidator, v.null()),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("recipeDiscoveryCache")
      .withIndex("by_key", (q) => q.eq("key", RECOMMENDATIONS_KEY))
      .unique();
    const cached = existing
      ? { query: existing.query, recipes: existing.recipes }
      : null;

    if (existing && now - existing.lastAttemptAt < DAILY_CACHE_MS) {
      return { shouldRefresh: false, cached };
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastAttemptAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("recipeDiscoveryCache", {
        key: RECOMMENDATIONS_KEY,
        query: "",
        recipes: [],
        lastAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { shouldRefresh: true, cached };
  },
});

export const getDailyRecommendations = internalQuery({
  args: {},
  returns: v.union(cachedRecommendationsValidator, v.null()),
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("recipeDiscoveryCache")
      .withIndex("by_key", (q) => q.eq("key", RECOMMENDATIONS_KEY))
      .unique();
    if (!existing || existing.refreshedAt === undefined) return null;
    return { query: existing.query, recipes: existing.recipes };
  },
});

export const saveDailyRecommendations = internalMutation({
  args: {
    query: v.string(),
    recipes: v.array(discoveryResultValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("recipeDiscoveryCache")
      .withIndex("by_key", (q) => q.eq("key", RECOMMENDATIONS_KEY))
      .unique();
    if (!existing) throw new Error("Daily recommendation refresh was not claimed");
    await ctx.db.patch(existing._id, {
      query: args.query,
      recipes: args.recipes,
      refreshedAt: now,
      updatedAt: now,
    });
    return null;
  },
});
