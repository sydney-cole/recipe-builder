import { describe, expect, it } from "vitest";
import {
  buildRecipeScrapePayload,
  extractRecipeImageUrl,
  extractRecipeJsonLd,
} from "./recipeScrape";

describe("recipe scrape artifact preparation", () => {
  it("keeps recipe JSON-LD and useful page metadata as agent input", () => {
    const result = buildRecipeScrapePayload({
      markdown: "# Lentil stew\n\n1 cup lentils",
      html: `<script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "Lentil stew",
        image: { url: "https://cdn.example.com/lentil-stew.jpg" },
      })}</script>`,
      metadata: {
        title: "Lentil stew",
        sourceURL: "https://example.com/stew",
        statusCode: 200,
      },
    });

    expect(result).toMatchObject({
      pageTitle: "Lentil stew",
      canonicalUrl: "https://example.com/stew",
      statusCode: 200,
      truncated: false,
      imageSourceUrl: "https://cdn.example.com/lentil-stew.jpg",
    });
    expect(JSON.parse(result.recipeJsonLd ?? "{}")).toMatchObject({
      "@type": "Recipe",
      name: "Lentil stew",
    });
  });

  it("falls back to Firecrawl's Open Graph image and resolves relative URLs", () => {
    expect(
      extractRecipeImageUrl(undefined, {
        sourceURL: "https://example.com/recipes/stew",
        ogImage: "/images/stew.webp",
      }),
    ).toBe("https://example.com/images/stew.webp");
  });

  it("supports recipe image arrays and metadata fallback for malformed data", () => {
    expect(
      extractRecipeImageUrl(
        JSON.stringify({
          "@type": ["Thing", "Recipe"],
          image: [{ contentUrl: "https://cdn.example.com/array-image.jpg" }],
        }),
        {},
      ),
    ).toBe("https://cdn.example.com/array-image.jpg");
    expect(
      extractRecipeImageUrl("{malformed", {
        sourceURL: "https://example.com/recipes/stew",
        twitterImage: "/images/twitter-stew.png",
      }),
    ).toBe("https://example.com/images/twitter-stew.png");
    expect(
      extractRecipeImageUrl(
        JSON.stringify({ "@type": "Recipe", image: "data:image/png;base64,x" }),
        { image: "https://cdn.example.com/fallback.png" },
      ),
    ).toBe("https://cdn.example.com/fallback.png");
  });

  it("ignores malformed and non-recipe JSON-LD", () => {
    expect(
      extractRecipeJsonLd(
        '<script type="application/ld+json">not-json</script>',
      ),
    ).toBeUndefined();
    expect(
      extractRecipeJsonLd(
        '<script type="application/ld+json">{"@type":"Article"}</script>',
      ),
    ).toBeUndefined();
  });

  it("bounds traversal of deeply nested page-authored JSON-LD", () => {
    let nested: Record<string, unknown> = { "@type": "Recipe" };
    for (let index = 0; index < 2_100; index += 1) {
      nested = { child: nested };
    }
    const html = `<script type="application/ld+json">${JSON.stringify(nested)}</script>`;
    expect(extractRecipeJsonLd(html)).toBeUndefined();
  });

  it("rejects failed or contentless pages", () => {
    expect(() =>
      buildRecipeScrapePayload({ markdown: "", metadata: { statusCode: 200 } }),
    ).toThrow(/readable recipe content/);
    expect(() =>
      buildRecipeScrapePayload({
        markdown: "not found",
        metadata: { statusCode: 404 },
      }),
    ).toThrow(/HTTP 404/);
  });
});
