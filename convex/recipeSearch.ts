import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import {
  MAX_SEARCH_QUERY_LENGTH,
  normalizeSearchQuery,
  selectRecipeResults,
  type RecipeSearchResult,
} from "./lib/recipeSearch";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const SEARCH_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
// More than we show, so filtering out roundups and duplicates still leaves a
// full page of results.
const REQUESTED_RESULTS = 15;
const EXCLUDED_DOMAINS = [
  "youtube.com",
  "pinterest.com",
  "tiktok.com",
  "instagram.com",
  "facebook.com",
  "reddit.com",
];

const searchResult = v.object({
  url: v.string(),
  title: v.string(),
  description: v.string(),
  source: v.string(),
});

export const cached = internalQuery({
  args: { normalizedQuery: v.string() },
  returns: v.union(v.null(), v.array(searchResult)),
  handler: async (ctx, { normalizedQuery }) => {
    const entry = await ctx.db
      .query("recipeSearchCache")
      .withIndex("by_query", (q) => q.eq("normalizedQuery", normalizedQuery))
      .unique();
    if (entry === null || entry.createdAt < Date.now() - CACHE_TTL_MS) {
      return null;
    }
    return entry.results;
  },
});

export const store = internalMutation({
  args: { normalizedQuery: v.string(), results: v.array(searchResult) },
  returns: v.null(),
  handler: async (ctx, { normalizedQuery, results }) => {
    const existing = await ctx.db
      .query("recipeSearchCache")
      .withIndex("by_query", (q) => q.eq("normalizedQuery", normalizedQuery))
      .unique();
    if (existing === null) {
      await ctx.db.insert("recipeSearchCache", {
        normalizedQuery,
        results,
        createdAt: Date.now(),
      });
    } else {
      await ctx.db.patch(existing._id, { results, createdAt: Date.now() });
    }
    return null;
  },
});

async function searchTavily(apiKey: string, normalizedQuery: string) {
  let response: Response;
  try {
    response = await fetch(TAVILY_SEARCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `${normalizedQuery} recipe`,
        search_depth: "basic",
        max_results: REQUESTED_RESULTS,
        exclude_domains: EXCLUDED_DOMAINS,
      }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
  } catch {
    throw new ConvexError({ code: "search_failed" });
  }
  // 432 and 433 are Tavily's plan-limit and pay-as-you-go-limit responses.
  if ([429, 432, 433].includes(response.status)) {
    throw new ConvexError({ code: "search_quota_exceeded" });
  }
  if (!response.ok) throw new ConvexError({ code: "search_failed" });

  try {
    const body: unknown = await response.json();
    return selectRecipeResults((body as { results?: unknown }).results);
  } catch {
    throw new ConvexError({ code: "search_failed" });
  }
}

export const search = action({
  args: { query: v.string() },
  returns: v.array(searchResult),
  handler: async (ctx, { query }): Promise<RecipeSearchResult[]> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");

    const normalizedQuery = normalizeSearchQuery(query);
    if (
      normalizedQuery.length === 0 ||
      normalizedQuery.length > MAX_SEARCH_QUERY_LENGTH
    ) {
      throw new ConvexError({ code: "search_invalid_query" });
    }

    const cachedResults: RecipeSearchResult[] | null = await ctx.runQuery(
      internal.recipeSearch.cached,
      { normalizedQuery },
    );
    if (cachedResults !== null) return cachedResults;

    const apiKey = process.env.TAVILY_API_KEY?.trim();
    if (!apiKey) throw new ConvexError({ code: "search_not_configured" });

    const results = await searchTavily(apiKey, normalizedQuery);
    await ctx.runMutation(internal.recipeSearch.store, {
      normalizedQuery,
      results,
    });
    return results;
  },
});
