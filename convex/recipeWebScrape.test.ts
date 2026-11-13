import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

function initTest() {
  return convexTest(schema, modules);
}

function htmlResponse(html: string, status = 200) {
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function redirectTo(location: string) {
  return new Response(null, { status: 302, headers: { location } });
}

const recipeJsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Lentil stew",
  image: "https://cdn.example.com/json-ld.jpg",
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recipe page scrape", () => {
  it("returns page text, JSON-LD, and metadata from a recipe page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        htmlResponse(`<html lang="en"><head>
          <title>Fallback title</title>
          <meta property="og:title" content="Lentil stew" />
          <meta name="description" content="A weeknight stew" />
          <script type="application/ld+json">${recipeJsonLd}</script>
          <style>.hidden { display: none }</style>
        </head><body>
          <h1>Lentil stew</h1>
          <p>Serves   four.</p>
          <ul><li>1 cup lentils</li></ul>
          <script>window.tracking = true</script>
        </body></html>`),
      ),
    );

    const result = await initTest().action(internal.recipeWebScrape.scrapePage, {
      url: "https://example.com/stew",
    });

    expect(result).toMatchObject({
      markdown: "# Lentil stew\nServes four.\n- 1 cup lentils",
      pageTitle: "Lentil stew",
      pageDescription: "A weeknight stew",
      pageLanguage: "en",
      canonicalUrl: "https://example.com/stew",
      contentType: "text/html",
      statusCode: 200,
      imageSourceUrl: "https://cdn.example.com/json-ld.jpg",
      truncated: false,
    });
    expect(JSON.parse(result.recipeJsonLd ?? "{}")).toMatchObject({
      name: "Lentil stew",
    });
  });

  it("falls back to the Open Graph or Twitter image without JSON-LD", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        htmlResponse(`<head><meta property="og:image" content="/images/stew.jpg" /></head>
          <body><p>1 cup lentils</p></body>`),
      )
      .mockResolvedValueOnce(
        htmlResponse(`<head><meta name="twitter:image" content="https://cdn.example.com/tw.jpg" /></head>
          <body><p>1 cup lentils</p></body>`),
      );
    vi.stubGlobal("fetch", fetchMock);
    const t = initTest();

    await expect(
      t.action(internal.recipeWebScrape.scrapePage, {
        url: "https://example.com/recipes/stew",
      }),
    ).resolves.toMatchObject({
      imageSourceUrl: "https://example.com/images/stew.jpg",
    });
    await expect(
      t.action(internal.recipeWebScrape.scrapePage, {
        url: "https://example.com/recipes/stew",
      }),
    ).resolves.toMatchObject({
      imageSourceUrl: "https://cdn.example.com/tw.jpg",
    });
  });

  it("follows public redirects and reports the final URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectTo("/final-stew"))
      .mockResolvedValueOnce(htmlResponse("<p>1 cup lentils</p>"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await initTest().action(internal.recipeWebScrape.scrapePage, {
      url: "https://example.com/stew",
    });

    expect(result.canonicalUrl).toBe("https://example.com/final-stew");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  });

  it("refuses redirects to non-public hosts without requesting them", async () => {
    const t = initTest();
    for (const location of [
      "http://localhost/admin",
      "http://169.254.169.254/latest/meta-data",
      "https://user:secret@example.com/stew",
      "ftp://example.com/stew",
    ]) {
      const fetchMock = vi.fn().mockResolvedValueOnce(redirectTo(location));
      vi.stubGlobal("fetch", fetchMock);
      await expect(
        t.action(internal.recipeWebScrape.scrapePage, {
          url: "https://example.com/stew",
        }),
      ).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("stops on redirect loops and redirects without a location", async () => {
    const t = initTest();
    const loop = vi
      .fn()
      .mockImplementation(async () => redirectTo("https://example.com/loop"));
    vi.stubGlobal("fetch", loop);
    await expect(
      t.action(internal.recipeWebScrape.scrapePage, {
        url: "https://example.com/stew",
      }),
    ).rejects.toThrow("recipe_scrape_failed");
    expect(loop).toHaveBeenCalledTimes(6);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 302 })),
    );
    await expect(
      t.action(internal.recipeWebScrape.scrapePage, {
        url: "https://example.com/stew",
      }),
    ).rejects.toThrow("recipe_scrape_failed");
  });

  it("rejects unsafe source URLs before any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const t = initTest();
    for (const url of [
      "http://localhost/stew",
      "https://127.0.0.1/stew",
      "https://user:secret@example.com/stew",
      "ftp://example.com/stew",
    ]) {
      await expect(
        t.action(internal.recipeWebScrape.scrapePage, { url }),
      ).rejects.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails clearly on network errors, HTTP errors, and empty pages", async () => {
    const t = initTest();
    const scrape = () =>
      t.action(internal.recipeWebScrape.scrapePage, {
        url: "https://example.com/stew",
      });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    await expect(scrape()).rejects.toThrow(
      "recipe_scrape_failed: could not reach example.com",
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(htmlResponse("<p>Forbidden</p>", 403)),
    );
    await expect(scrape()).rejects.toThrow("HTTP 403");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(htmlResponse("<div id='root'></div>")),
    );
    await expect(scrape()).rejects.toThrow("readable recipe content");
  });
});
