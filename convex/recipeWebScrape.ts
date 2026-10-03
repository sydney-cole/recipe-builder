"use node";

import { load } from "cheerio";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { buildRecipeScrapePayload } from "./lib/recipeScrape";
import { isPublicUrlHostname } from "./lib/urls";

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; PerfectPlateBot/1.0; +https://perfectplate.app)";

const scrapeResult = v.object({
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
});

function safeRecipeUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Unsupported recipe page protocol");
  }
  if (url.username || url.password) {
    throw new Error("Recipe page URL credentials are not allowed");
  }
  if (!isPublicUrlHostname(url.hostname)) {
    throw new Error("Recipe page host is not public");
  }
  return url;
}

// A lightweight markdown-ish rendering of the page's text content for the
// extraction agent. Most recipe sites also carry schema.org Recipe JSON-LD,
// which is extracted separately and is the agent's primary source; this text
// is a fallback when JSON-LD is missing or incomplete.
function htmlToMarkdown(html: string) {
  const $ = load(html);
  $("script, style, noscript, template, svg").remove();

  const parts: string[] = [];
  $("h1,h2,h3,h4,h5,h6,p,li,dt,dd,blockquote,td,th,caption").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text) return;
    const tag = el.tagName?.toLowerCase() ?? "";
    const headingLevel = /^h[1-6]$/.test(tag) ? Number(tag[1]) : 0;
    if (headingLevel > 0) {
      parts.push(`${"#".repeat(headingLevel)} ${text}`);
    } else if (tag === "li") {
      parts.push(`- ${text}`);
    } else {
      parts.push(text);
    }
  });
  return parts.join("\n").trim();
}

async function fetchHtml(url: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, accept: "text/html,*/*;q=0.8" },
    });
  } catch {
    throw new Error(`recipe_scrape_failed: could not reach ${url.hostname}`);
  } finally {
    clearTimeout(timeout);
  }

  const contentType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim();
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_RESPONSE_BYTES) {
    throw new Error("recipe_scrape_failed: response was too large");
  }
  const html = new TextDecoder("utf-8").decode(buffer);
  return {
    html,
    statusCode: response.status,
    contentType,
    finalUrl: response.url || url.toString(),
  };
}

export const scrapePage = internalAction({
  args: { url: v.string() },
  returns: scrapeResult,
  handler: async (_ctx, { url }) => {
    const safeUrl = safeRecipeUrl(url);
    const fetched = await fetchHtml(safeUrl);
    const $ = load(fetched.html);
    const title =
      $('meta[property="og:title"]').attr("content")?.trim() ||
      $("title").first().text().trim() ||
      undefined;
    const description =
      $('meta[name="description"]').attr("content")?.trim() ||
      $('meta[property="og:description"]').attr("content")?.trim() ||
      undefined;
    const language = $("html").attr("lang")?.trim() || undefined;
    const markdown = htmlToMarkdown(fetched.html);

    return buildRecipeScrapePayload({
      markdown,
      html: fetched.html,
      metadata: {
        title,
        description,
        language,
        sourceURL: fetched.finalUrl,
        statusCode: fetched.statusCode,
        contentType: fetched.contentType,
      },
    });
  },
});
