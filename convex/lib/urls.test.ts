import { describe, expect, it } from "vitest";
import { normalizeRecipeUrl, recipeLinksFromMessage } from "./urls";

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
