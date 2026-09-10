"use node";

import { FirecrawlClient } from "@firecrawl/firecrawl-convex";
import OpenAI from "openai";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import {
  classifyProviderError,
  generateRecipeWithOpenAI,
  importProviderConfig,
  parseFirecrawlDocument,
} from "./lib/importPipeline";

const firecrawl = new FirecrawlClient(components.firecrawl);

export const processImport = internalAction({
  args: { importId: v.id("recipeImports") },
  handler: async (ctx, { importId }) => {
    const claim = await ctx.runMutation(internal.imports.claim, { importId });
    if (claim === null) return;

    try {
      const { openAIKey, model } = importProviderConfig(process.env);

      const page = await firecrawl.scrape(ctx, claim.sourceUrl, {
        formats: ["markdown"],
        onlyMainContent: true,
        maxAge: 3_600_000,
      });
      const source = parseFirecrawlDocument(page, claim.sourceUrl);
      const current = await ctx.runMutation(internal.imports.beginGeneration, {
        importId,
        attempt: claim.attempt,
      });
      if (!current) return;

      const generated = await generateRecipeWithOpenAI(
        new OpenAI({ apiKey: openAIKey }),
        source,
        model,
      );
      await ctx.runMutation(internal.imports.completeGeneration, {
        importId,
        attempt: claim.attempt,
        sourceTitle: source.title,
        sourceSite: source.site,
        ...generated,
      });
    } catch (error) {
      console.error("Recipe import processing failed", {
        importId,
        attempt: claim.attempt,
        error,
      });
      await ctx.runMutation(internal.imports.fail, {
        importId,
        attempt: claim.attempt,
        category: classifyProviderError(error),
      });
    }
  },
});
