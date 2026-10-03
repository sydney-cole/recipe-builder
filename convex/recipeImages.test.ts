import { convexTest } from "convex-test";
import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

// Match the proven backend-test glob so a clean checkout includes Convex's
// checked-in generated JavaScript modules as well as the function modules.
const modules = import.meta.glob("./**/*.*s");

function initTest() {
  return convexTest(schema, modules);
}

async function insertRecipe(
  t: ReturnType<typeof convexTest>,
  title: string,
  options: { deleted?: boolean; imageStorageId?: Id<"_storage"> } = {},
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("recipes", {
      sourceUrl: `https://example.com/${title}`,
      normalizedSourceUrl: `https://example.com/${title}`,
      title,
      cuisines: [],
      categories: [],
      keywords: [],
      instructions: [],
      ...(options.deleted ? { deletedAt: now } : {}),
      ...(options.imageStorageId ? { imageStorageId: options.imageStorageId } : {}),
      createdAt: now,
      updatedAt: now,
    });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal("Blob", NodeBlob);
});

describe("recipe image download", () => {
  it("stores a bounded public raster image after following a redirect", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://cdn.example.com/meal.webp" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: {
            "content-type": "image/webp; charset=binary",
            "content-length": "3",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const t = initTest();
    const storageId = await t.action(internal.recipeImages.storeFromUrl, {
      url: "https://recipes.example.com/meal",
    });

    expect(storageId).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(
      t.run(async (ctx) => (await ctx.storage.get(storageId!))?.size),
    ).resolves.toBe(3);
  });

  it("keeps default artwork for unsafe or unusable image responses", async () => {
    const t = initTest();

    await expect(
      t.action(internal.recipeImages.storeFromUrl, {
        url: "http://localhost/private.jpg",
      }),
    ).resolves.toBeNull();
    await expect(
      t.action(internal.recipeImages.storeFromUrl, {
        url: "https://user:secret@example.com/private.jpg",
      }),
    ).resolves.toBeNull();
    await expect(
      t.action(internal.recipeImages.storeFromUrl, {
        url: "ftp://cdn.example.com/image.jpg",
      }),
    ).resolves.toBeNull();
    await expect(
      t.action(internal.recipeImages.storeFromUrl, {
        url: "https://127.0.0.1/private.jpg",
      }),
    ).resolves.toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 302 })),
    );
    await expect(
      t.action(internal.recipeImages.storeFromUrl, {
        url: "https://cdn.example.com/missing-redirect.jpg",
      }),
    ).resolves.toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    );
    await expect(
      t.action(internal.recipeImages.storeFromUrl, {
        url: "https://cdn.example.com/missing.jpg",
      }),
    ).resolves.toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("not an image", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      ),
    );
    await expect(
      t.action(internal.recipeImages.storeFromUrl, {
        url: "https://cdn.example.com/not-image.txt",
      }),
    ).resolves.toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1]), {
          status: 200,
          headers: {
            "content-type": "image/jpeg",
            "content-length": String(8 * 1024 * 1024 + 1),
          },
        }),
      ),
    );
    await expect(
      t.action(internal.recipeImages.storeFromUrl, {
        url: "https://cdn.example.com/too-large.jpg",
      }),
    ).resolves.toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      ),
    );
    await expect(
      t.action(internal.recipeImages.storeFromUrl, {
        url: "https://cdn.example.com/empty.png",
      }),
    ).resolves.toBeNull();
  });
});

describe("recipe image attachment", () => {
  it("lists only active missing images and attaches one exactly once", async () => {
    const t = initTest();
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob([new Uint8Array([1])], { type: "image/png" })),
    );
    const missingId = await insertRecipe(t, "missing");
    const deletedId = await insertRecipe(t, "deleted", { deleted: true });
    await insertRecipe(t, "complete", { imageStorageId: storageId });

    await expect(
      t.query(internal.recipeImagesData.listMissing, {}),
    ).resolves.toEqual([
      { recipeId: missingId, sourceUrl: "https://example.com/missing" },
    ]);
    await expect(
      t.mutation(internal.recipeImagesData.attach, {
        recipeId: missingId,
        imageStorageId: storageId,
      }),
    ).resolves.toBe(true);
    await expect(
      t.mutation(internal.recipeImagesData.attach, {
        recipeId: missingId,
        imageStorageId: storageId,
      }),
    ).resolves.toBe(false);
    await expect(
      t.mutation(internal.recipeImagesData.attach, {
        recipeId: deletedId,
        imageStorageId: storageId,
      }),
    ).resolves.toBe(false);
    await expect(
      t.query(internal.recipeImagesData.listMissing, {}),
    ).resolves.toEqual([]);
  });
});
