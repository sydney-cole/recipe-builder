/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as email from "../email.js";
import type * as groceryLists from "../groceryLists.js";
import type * as http from "../http.js";
import type * as lib_agentmail from "../lib/agentmail.js";
import type * as lib_recipeAgentTypes from "../lib/recipeAgentTypes.js";
import type * as lib_recipeScrape from "../lib/recipeScrape.js";
import type * as lib_urls from "../lib/urls.js";
import type * as recipeAgent from "../recipeAgent.js";
import type * as recipeAgentData from "../recipeAgentData.js";
import type * as recipeCards from "../recipeCards.js";
import type * as recipeDiscovery from "../recipeDiscovery.js";
import type * as recipeDiscoveryCache from "../recipeDiscoveryCache.js";
import type * as recipeImages from "../recipeImages.js";
import type * as recipeImagesData from "../recipeImagesData.js";
import type * as recipeIngestion from "../recipeIngestion.js";
import type * as recipes from "../recipes.js";
import type * as seed from "../seed.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  email: typeof email;
  groceryLists: typeof groceryLists;
  http: typeof http;
  "lib/agentmail": typeof lib_agentmail;
  "lib/recipeAgentTypes": typeof lib_recipeAgentTypes;
  "lib/recipeScrape": typeof lib_recipeScrape;
  "lib/urls": typeof lib_urls;
  recipeAgent: typeof recipeAgent;
  recipeAgentData: typeof recipeAgentData;
  recipeCards: typeof recipeCards;
  recipeDiscovery: typeof recipeDiscovery;
  recipeDiscoveryCache: typeof recipeDiscoveryCache;
  recipeImages: typeof recipeImages;
  recipeImagesData: typeof recipeImagesData;
  recipeIngestion: typeof recipeIngestion;
  recipes: typeof recipes;
  seed: typeof seed;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  firecrawl: import("@firecrawl/firecrawl-convex/_generated/component.js").ComponentApi<"firecrawl">;
  agentmail: import("@agentmail/convex/_generated/component.js").ComponentApi<"agentmail">;
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
