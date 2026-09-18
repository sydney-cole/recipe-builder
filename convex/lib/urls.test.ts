import { describe, expect, it } from "vitest";
import {
  isPublicUrlHostname,
  isLikelyIndividualRecipePage,
  normalizeRecipeUrl,
  primaryRecipeLinkFromMessage,
  recipeLinksFromMessage,
} from "./urls";

describe("normalizeRecipeUrl", () => {
  it("normalizes whitespace, tracking parameters, fragments, and query order", () => {
    expect(
      normalizeRecipeUrl(
        " https://Example.com/pasta?z=2&utm_source=email&a=1#method ",
      ),
    ).toBe("https://example.com/pasta?a=1&z=2");
  });

  it.each(["ftp://example.com/recipe", "mailto:cook@example.com"])(
    "rejects unsupported protocols: %s",
    (url) => expect(() => normalizeRecipeUrl(url)).toThrow(/HTTP and HTTPS/),
  );

  it("rejects credentials embedded in a URL", () => {
    expect(() => normalizeRecipeUrl("https://user:pass@example.com/recipe")).toThrow(
      /credentials/,
    );
  });

  it("bounds input size", () => {
    expect(() => normalizeRecipeUrl(`https://example.com/${"a".repeat(2_100)}`)).toThrow(
      /2,048/,
    );
  });

  it.each([
    "http://localhost/recipe",
    "http://recipes.local/dinner",
    "http://service.internal/recipe",
    "http://127.0.0.1/recipe",
    "http://2130706433/recipe",
    "http://[::1]/recipe",
    "https://intranet/recipe",
  ])("rejects non-public hosts: %s", (url) => {
    expect(() => normalizeRecipeUrl(url)).toThrow(/public internet host/);
  });

  it("accepts public DNS hosts, including a trailing root label", () => {
    expect(isPublicUrlHostname("Recipes.Example.COM.")).toBe(true);
    expect(normalizeRecipeUrl("https://recipes.example.com./dinner")).toBe(
      "https://recipes.example.com./dinner",
    );
  });
});

describe("isLikelyIndividualRecipePage", () => {
  it.each([
    ["https://example.com/", "Example"],
    ["https://mypronouns.org/she", "Pronouns"],
    ["https://example.com/collection/our-best-recipes/", "Our best recipes"],
    ["https://example.com/25-most-popular-recipes-of-2025/", "25 Most Popular Recipes"],
    ["https://example.com/category/dinner/", "Dinner recipes"],
  ])("rejects roundup and listing pages: %s", (url, title) => {
    expect(isLikelyIndividualRecipePage(url, title)).toBe(false);
  });

  it.each([
    ["https://example.com/recipes/chicken-parmesan/", "Chicken Parmesan"],
    ["https://example.com/best-chocolate-chip-cookies/", "Best Chocolate Chip Cookies"],
  ])("allows plausible individual recipe pages: %s", (url, title) => {
    expect(isLikelyIndividualRecipePage(url, title)).toBe(true);
  });
});

describe("recipeLinksFromMessage", () => {
  it("extracts, sanitizes, and deduplicates links across message bodies", () => {
    expect(
      recipeLinksFromMessage({
        subject: "Dinner",
        text: "Try https://example.com/a?utm_source=mail.",
        html: '<a href="https://example.com/a">One</a> https://example.com/b!',
      }),
    ).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("ignores malformed input and limits a single message to ten links", () => {
    const text = Array.from(
      { length: 12 },
      (_, index) => `https://example.com/${index}`,
    ).join(" ");
    expect(recipeLinksFromMessage({ text })).toHaveLength(10);
    expect(recipeLinksFromMessage(null)).toEqual([]);
  });
});

describe("primaryRecipeLinkFromMessage", () => {
  it("chooses one recipe URL and ignores homepage and signature links", () => {
    expect(primaryRecipeLinkFromMessage({
      text: [
        "https://thecozycook.com/garlic-butter-pasta/",
        "http://mypronouns.org/she",
        "https://atomicobject.com/",
      ].join(" "),
    })).toEqual(["https://thecozycook.com/garlic-butter-pasta/"]);
  });
});
