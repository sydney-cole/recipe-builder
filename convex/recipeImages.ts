import { FirecrawlClient } from "@firecrawl/firecrawl-convex";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { buildRecipeScrapePayload } from "./lib/recipeScrape";
import { isPublicUrlHostname } from "./lib/urls";

const firecrawl = new FirecrawlClient(components.firecrawl);

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function safeImageUrl(value: string) {
  const url = new URL(value);
  if (!(["http:", "https:"] as string[]).includes(url.protocol)) {
    throw new Error("Unsupported recipe image protocol");
  }
  if (url.username || url.password) throw new Error("Image URL credentials are not allowed");
  if (!isPublicUrlHostname(url.hostname)) {
    throw new Error("Recipe image host is not public");
  }
  return url;
}

async function storeImageFromUrl(
  ctx: ActionCtx,
  url: string,
): Promise<Id<"_storage"> | null> {
  try {
    let currentUrl = safeImageUrl(url.slice(0, 2_000));
    let response: Response | undefined;
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      response = await fetch(currentUrl, { redirect: "manual" });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) return null;
      currentUrl = safeImageUrl(new URL(location, currentUrl).toString());
    }
    if (!response?.ok) return null;

    const contentType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (!contentType || !ALLOWED_IMAGE_TYPES.has(contentType)) return null;
    const announcedSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(announcedSize) && announcedSize > MAX_IMAGE_BYTES) {
      return null;
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
    return await ctx.storage.store(new Blob([bytes], { type: contentType }));
  } catch {
    // Image retrieval is optional. The UI retains its default artwork.
    return null;
  }
}

export const storeFromUrl = internalAction({
  args: { url: v.string() },
  returns: v.union(v.id("_storage"), v.null()),
  handler: async (ctx, { url }) => await storeImageFromUrl(ctx, url),
});

export const backfillMissing = internalAction({
  args: {},
  returns: v.object({
    scanned: v.number(),
    stored: v.number(),
  }),
  handler: async (ctx): Promise<{ scanned: number; stored: number }> => {
    const recipes = await ctx.runQuery(internal.recipeImagesData.listMissing, {});
    let stored = 0;
    for (const recipe of recipes) {
      try {
        const document = await firecrawl.scrape(ctx, recipe.sourceUrl, {
          formats: ["markdown", "html"],
          onlyMainContent: false,
          blockAds: true,
          removeBase64Images: true,
          maxAge: 86_400_000,
          timeout: 60_000,
        });
        const scrape = buildRecipeScrapePayload(
          document as Record<string, unknown>,
        );
        if (!scrape.imageSourceUrl) continue;
        const imageStorageId = await storeImageFromUrl(ctx, scrape.imageSourceUrl);
        if (imageStorageId === null) continue;
        const attached = await ctx.runMutation(internal.recipeImagesData.attach, {
          recipeId: recipe.recipeId,
          imageStorageId,
        });
        if (attached) stored += 1;
      } catch {
        // One unavailable publisher should not prevent other recipes backfilling.
      }
    }
    return { scanned: recipes.length, stored };
  },
});
