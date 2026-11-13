import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

async function signedIn() {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", { name: "Ada", email: "ada@example.com" }),
  );
  return { t, asUser: t.withIdentity({ subject: userId }) };
}

function tavilyResponse(results: unknown[], status = 200) {
  return new Response(JSON.stringify({ results }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const stew = {
  title: "Smoky Lentil Stew",
  url: "https://www.example.com/recipes/smoky-lentil-stew?utm_source=search",
  content: "A   weeknight stew with lentils and paprika.",
  score: 0.9,
};

beforeEach(() => {
  vi.stubEnv("TAVILY_API_KEY", "tvly-test");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("recipe search", () => {
  it("returns cleaned individual recipe pages and drops roundups and duplicates", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      tavilyResponse([
        stew,
        { ...stew, url: "https://www.example.com/recipes/smoky-lentil-stew" },
        { title: "25 Best Lentil Recipes", url: "https://example.com/25-best-lentil-recipes", content: "" },
        { title: "Lentils", url: "https://example.com/category/lentils", content: "" },
        { title: "Local", url: "http://localhost/stew", content: "" },
        { title: "", url: "https://example.com/untitled", content: "" },
        "not a result",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { asUser } = await signedIn();

    await expect(
      asUser.action(api.recipeSearch.search, { query: "  Lentil   STEW " }),
    ).resolves.toEqual([
      {
        url: "https://www.example.com/recipes/smoky-lentil-stew",
        title: "Smoky Lentil Stew",
        description: "A weeknight stew with lentils and paprika.",
        source: "example.com",
      },
    ]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.tavily.com/search");
    expect(init.headers.Authorization).toBe("Bearer tvly-test");
    expect(JSON.parse(init.body)).toMatchObject({
      query: "lentil stew recipe",
      search_depth: "basic",
    });
  });

  it("serves a repeated query from the cache and refreshes it once stale", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => tavilyResponse([stew]));
    vi.stubGlobal("fetch", fetchMock);
    const { t, asUser } = await signedIn();

    await asUser.action(api.recipeSearch.search, { query: "lentil stew" });
    await asUser.action(api.recipeSearch.search, { query: "Lentil Stew" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await t.run(async (ctx) => {
      const entry = await ctx.db.query("recipeSearchCache").unique();
      await ctx.db.patch(entry!._id, {
        createdAt: Date.now() - 8 * 24 * 60 * 60 * 1_000,
      });
    });
    await asUser.action(api.recipeSearch.search, { query: "lentil stew" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(
      t.run(async (ctx) => (await ctx.db.query("recipeSearchCache").collect()).length),
    ).resolves.toBe(1);
  });

  it("limits results to six", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        tavilyResponse(
          Array.from({ length: 10 }, (_, index) => ({
            title: `Stew ${index}`,
            url: `https://example.com/recipes/stew-${index}`,
            content: "",
          })),
        ),
      ),
    );
    const { asUser } = await signedIn();
    await expect(
      asUser.action(api.recipeSearch.search, { query: "stew" }),
    ).resolves.toHaveLength(6);
  });

  it("requires a signed-in user and a usable query", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { t, asUser } = await signedIn();

    await expect(
      t.action(api.recipeSearch.search, { query: "stew" }),
    ).rejects.toThrow("Unauthenticated");
    await expect(
      asUser.action(api.recipeSearch.search, { query: "   " }),
    ).rejects.toThrow("search_invalid_query");
    await expect(
      asUser.action(api.recipeSearch.search, { query: "x".repeat(201) }),
    ).rejects.toThrow("search_invalid_query");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports missing configuration, quota limits, and provider failures without caching them", async () => {
    const { t, asUser } = await signedIn();
    const search = () => asUser.action(api.recipeSearch.search, { query: "stew" });

    vi.stubEnv("TAVILY_API_KEY", "");
    await expect(search()).rejects.toThrow("search_not_configured");
    vi.stubEnv("TAVILY_API_KEY", "tvly-test");

    for (const status of [429, 432, 433]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(tavilyResponse([], status)));
      await expect(search()).rejects.toThrow("search_quota_exceeded");
    }

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(tavilyResponse([], 500)));
    await expect(search()).rejects.toThrow("search_failed");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(search()).rejects.toThrow("search_failed");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>", { status: 200 })),
    );
    await expect(search()).rejects.toThrow("search_failed");

    await expect(
      t.run(async (ctx) => (await ctx.db.query("recipeSearchCache").collect()).length),
    ).resolves.toBe(0);
  });
});
