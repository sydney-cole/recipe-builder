import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
} from "./_generated/server";
import type { RecipeScrapePayload } from "./lib/recipeScrape";
import { normalizeRecipeUrl } from "./lib/urls";
import { requireUser } from "./lib/auth";

export const recipeIngestionWorkflow = new WorkflowManager(
  components.workflow,
  {
    workpoolOptions: {
      maxParallelism: 10,
      retryActionsByDefault: true,
      defaultRetryBehavior: {
        maxAttempts: 4,
        initialBackoffMs: 1_000,
        base: 2,
      },
    },
  },
);

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

const workflowResult = v.union(
  v.object({ kind: v.literal("success"), returnValue: v.any() }),
  v.object({ kind: v.literal("failed"), error: v.string() }),
  v.object({ kind: v.literal("canceled") }),
);

export async function startRecipeIngestion(
  ctx: MutationCtx,
  importId: Id<"recipeImports">,
) {
  return await recipeIngestionWorkflow.start(
    ctx,
    internal.recipeIngestion.ingestRecipeSource,
    { importId },
    {
      onComplete: internal.recipeIngestion.onIngestionComplete,
      context: { importId },
      startAsync: true,
    },
  );
}

type QueueRecipeSourceArgs = {
  userId: Id<"users">;
  sourceUrl: string;
  sourceKind: "direct" | "email" | "agent_discovery";
  sourceQuery?: string;
  setAsCurrent?: boolean;
  sourceMessageId?: string;
  sourceEventId?: string;
  sourceSubject?: string;
};

export type StartIngestion = (
  ctx: MutationCtx,
  importId: Id<"recipeImports">,
) => Promise<string>;

const MAX_IMPORT_ATTEMPTS = 5;

// Extraction already read the page and found no recipe; running the model on
// the same page again would spend credits for the same answer.
function isPermanentImportFailure(errorMessage: string | undefined) {
  return errorMessage?.includes("did not find a complete recipe") ?? false;
}

async function restartImport(
  ctx: MutationCtx,
  importId: Id<"recipeImports">,
  startIngestion: StartIngestion,
) {
  const workflowId = await startIngestion(ctx, importId);
  await ctx.db.patch(importId, {
    workflowId,
    status: "queued",
    errorMessage: undefined,
    finishedAt: undefined,
    updatedAt: Date.now(),
  });
}

function boundedMetadata(value: string | undefined, maximum: number) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maximum) : undefined;
}

export async function queueRecipeSource(
  ctx: MutationCtx,
  args: QueueRecipeSourceArgs,
  startIngestion: StartIngestion = startRecipeIngestion,
) {
  const normalizedUrl = normalizeRecipeUrl(args.sourceUrl);
  const existing = await ctx.db
    .query("recipeImports")
    .withIndex("by_requester_and_normalized_url", (q) =>
      q.eq("requestedBy", args.userId).eq("normalizedUrl", normalizedUrl),
    )
    .order("desc")
    .first();
  const existingRecipe = existing?.recipeId
    ? await ctx.db.get(existing.recipeId)
    : null;
  const canReuseExisting =
    existing !== null &&
    (existing.recipeId === undefined ||
      (existingRecipe !== null && existingRecipe.deletedAt === undefined));

  if (existing !== null && canReuseExisting) {
    if (args.setAsCurrent) {
      if (existing.recipeId !== undefined) {
        await ctx.db.patch(args.userId, {
          currentRecipeId: existing.recipeId,
          updatedAt: Date.now(),
        });
      } else if (existing.setAsCurrent !== true) {
        await ctx.db.patch(existing._id, {
          setAsCurrent: true,
          updatedAt: Date.now(),
        });
      }
    }
    if (existing.status === "failed") {
      if (
        isPermanentImportFailure(existing.errorMessage) ||
        existing.attemptCount >= MAX_IMPORT_ATTEMPTS
      ) {
        return { importId: existing._id, queued: false };
      }
      await restartImport(ctx, existing._id, startIngestion);
      return { importId: existing._id, queued: true };
    }
    if (existing.workflowId === undefined) {
      await restartImport(ctx, existing._id, startIngestion);
      return { importId: existing._id, queued: true };
    }
    return { importId: existing._id, queued: false };
  }

  const now = Date.now();
  const importId = await ctx.db.insert("recipeImports", {
    requestedBy: args.userId,
    sourceUrl: args.sourceUrl,
    normalizedUrl,
    sourceKind: args.sourceKind,
    sourceQuery: args.sourceQuery?.trim().slice(0, 500) || undefined,
    setAsCurrent: args.setAsCurrent,
    sourceMessageId: boundedMetadata(args.sourceMessageId, 500),
    sourceEventId: boundedMetadata(args.sourceEventId, 500),
    sourceSubject: boundedMetadata(args.sourceSubject, 1_000),
    status: "queued",
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  const workflowId = await startIngestion(ctx, importId);
  await ctx.db.patch(importId, { workflowId });
  return { importId, queued: true };
}

export const retryImport = mutation({
  args: { importId: v.id("recipeImports") },
  returns: v.null(),
  handler: async (ctx, { importId }) => {
    const userId = await requireUser(ctx);
    const recipeImport = await ctx.db.get(importId);
    if (recipeImport === null || recipeImport.requestedBy !== userId) {
      throw new Error("Recipe import was not found");
    }
    if (recipeImport.status !== "failed") return null;
    if (recipeImport.attemptCount >= MAX_IMPORT_ATTEMPTS) {
      throw new Error("This recipe link has been retried too many times");
    }
    await restartImport(ctx, importId, startRecipeIngestion);
    return null;
  },
});

export const queueAgentDiscoveredUrl = internalMutation({
  args: {
    userId: v.id("users"),
    sourceUrl: v.string(),
    sourceQuery: v.string(),
  },
  returns: v.id("recipeImports"),
  handler: async (ctx, args) => {
    if ((await ctx.db.get(args.userId)) === null) {
      throw new Error("User was not found");
    }
    const queued = await queueRecipeSource(ctx, {
      ...args,
      sourceKind: "agent_discovery",
    });
    return queued.importId;
  },
});

export const queueDiscoveredUrl = mutation({
  args: {
    sourceUrl: v.string(),
    sourceQuery: v.string(),
    setAsCurrent: v.optional(v.boolean()),
  },
  returns: v.id("recipeImports"),
  handler: async (ctx, { sourceUrl, sourceQuery, setAsCurrent }) => {
    const userId = await requireUser(ctx);
    const normalizedQuery = sourceQuery.trim();
    if (normalizedQuery.length === 0 || normalizedQuery.length > 500) {
      throw new Error("Source query must be between 1 and 500 characters");
    }
    const queued = await queueRecipeSource(ctx, {
      userId,
      sourceUrl,
      sourceQuery: normalizedQuery,
      setAsCurrent,
      sourceKind: "agent_discovery",
    });
    return queued.importId;
  },
});

export const ingestRecipeSource = recipeIngestionWorkflow.define({
  args: { importId: v.id("recipeImports") },
  returns: v.id("recipes"),
  handler: async (step, { importId }): Promise<Id<"recipes">> => {
    await step.runMutation(internal.recipeIngestion.markScraping, { importId });
    const scrape = await step.runAction(internal.recipeIngestion.scrapeRecipePage, {
      importId,
    });
    await step.runMutation(internal.recipeIngestion.persistScrape, {
      importId,
      scrape,
    });
    const imageStorageId = scrape.imageSourceUrl
      ? await step.runAction(internal.recipeImages.storeFromUrl, {
          url: scrape.imageSourceUrl,
        })
      : null;
    const processing = await step.runMutation(
      internal.recipeAgentData.ensureProcessingThread,
      { importId },
    );
    // Model calls are the costly step, and a malformed response is usually
    // repeated on retry, so this step gets one retry instead of the default.
    const generated = await step.runAction(
      internal.recipeAgent.extractRecipe,
      {
        importId,
        threadId: processing.threadId,
        userId: processing.userId,
      },
      { retry: { maxAttempts: 2, initialBackoffMs: 2_000, base: 2 } },
    );
    const persisted = await step.runMutation(
      internal.recipeAgentData.persistGeneratedRecipe,
      {
        importId,
        model: generated.model,
        extraction: generated.extraction,
        ...(imageStorageId === null ? {} : { imageStorageId }),
      },
    );
    return persisted.recipeId;
  },
});

export const importForScrape = internalQuery({
  args: { importId: v.id("recipeImports") },
  returns: v.union(
    v.null(),
    v.object({
      sourceUrl: v.string(),
      normalizedUrl: v.string(),
      status: v.union(
        v.literal("queued"),
        v.literal("scraping"),
        v.literal("scraped"),
        v.literal("processing"),
        v.literal("parsed"),
        v.literal("needs_review"),
        v.literal("completed"),
        v.literal("failed"),
      ),
    }),
  ),
  handler: async (ctx, { importId }) => {
    const recipeImport = await ctx.db.get(importId);
    if (recipeImport === null) return null;
    return {
      sourceUrl: recipeImport.sourceUrl,
      normalizedUrl: recipeImport.normalizedUrl,
      status: recipeImport.status,
    };
  },
});

export const markScraping = internalMutation({
  args: { importId: v.id("recipeImports") },
  returns: v.null(),
  handler: async (ctx, { importId }) => {
    const recipeImport = await ctx.db.get(importId);
    if (recipeImport === null) throw new Error("Recipe import was not found");
    if (
      recipeImport.status === "scraped" ||
      recipeImport.status === "processing" ||
      recipeImport.status === "parsed" ||
      recipeImport.status === "needs_review" ||
      recipeImport.status === "completed"
    ) {
      return null;
    }
    const now = Date.now();
    await ctx.db.patch(importId, {
      status: "scraping",
      attemptCount: recipeImport.attemptCount + 1,
      errorMessage: undefined,
      startedAt: recipeImport.startedAt ?? now,
      updatedAt: now,
    });
    return null;
  },
});

export const scrapeRecipePage = internalAction({
  args: { importId: v.id("recipeImports") },
  returns: scrapeResult,
  handler: async (ctx, { importId }): Promise<RecipeScrapePayload> => {
    const recipeImport: { sourceUrl: string; normalizedUrl: string; status: string } | null =
      await ctx.runQuery(internal.recipeIngestion.importForScrape, { importId });
    if (recipeImport === null) throw new Error("Recipe import was not found");

    return await ctx.runAction(internal.recipeWebScrape.scrapePage, {
      url: recipeImport.normalizedUrl,
    });
  },
});

export const persistScrape = internalMutation({
  args: {
    importId: v.id("recipeImports"),
    scrape: scrapeResult,
  },
  returns: v.id("recipeScrapeArtifacts"),
  handler: async (ctx, { importId, scrape }) => {
    const recipeImport = await ctx.db.get(importId);
    if (recipeImport === null) throw new Error("Recipe import was not found");

    const existing = await ctx.db
      .query("recipeScrapeArtifacts")
      .withIndex("by_import", (q) => q.eq("importId", importId))
      .unique();
    if (existing !== null) {
      if (recipeImport.status !== "scraped") {
        const now = Date.now();
        await ctx.db.patch(importId, {
          scrapeArtifactId: existing._id,
          status: "scraped",
          finishedAt: now,
          updatedAt: now,
        });
      }
      return existing._id;
    }

    const now = Date.now();
    const artifactId = await ctx.db.insert("recipeScrapeArtifacts", {
      importId,
      sourceUrl: recipeImport.sourceUrl,
      normalizedUrl: recipeImport.normalizedUrl,
      ...scrape,
      scrapedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(importId, {
      scrapeArtifactId: artifactId,
      status: "scraped",
      errorMessage: undefined,
      finishedAt: now,
      updatedAt: now,
    });
    return artifactId;
  },
});

// This remains a narrow inspection contract for agent operations. The agent
// receives source evidence, not a client-authored recipe or grocery list.
export const agentReadyArtifact = internalQuery({
  args: { importId: v.id("recipeImports") },
  returns: v.union(
    v.null(),
    v.object({
      artifactId: v.id("recipeScrapeArtifacts"),
      sourceUrl: v.string(),
      sourceKind: v.optional(
        v.union(
          v.literal("direct"),
          v.literal("email"),
          v.literal("agent_discovery"),
        ),
      ),
      sourceQuery: v.optional(v.string()),
      markdown: v.string(),
      recipeJsonLd: v.optional(v.string()),
      imageSourceUrl: v.optional(v.string()),
      pageTitle: v.optional(v.string()),
      pageDescription: v.optional(v.string()),
      pageLanguage: v.optional(v.string()),
      canonicalUrl: v.optional(v.string()),
      truncated: v.boolean(),
    }),
  ),
  handler: async (ctx, { importId }) => {
    const recipeImport = await ctx.db.get(importId);
    if (
      recipeImport === null ||
      !["scraped", "processing", "parsed", "needs_review", "completed"].includes(
        recipeImport.status,
      )
    ) {
      return null;
    }
    const artifact = await ctx.db
      .query("recipeScrapeArtifacts")
      .withIndex("by_import", (q) => q.eq("importId", importId))
      .unique();
    if (artifact === null) return null;
    return {
      artifactId: artifact._id,
      sourceUrl: artifact.sourceUrl,
      sourceKind: recipeImport.sourceKind,
      sourceQuery: recipeImport.sourceQuery,
      markdown: artifact.markdown,
      recipeJsonLd: artifact.recipeJsonLd,
      imageSourceUrl: artifact.imageSourceUrl,
      pageTitle: artifact.pageTitle,
      pageDescription: artifact.pageDescription,
      pageLanguage: artifact.pageLanguage,
      canonicalUrl: artifact.canonicalUrl,
      truncated: artifact.truncated,
    };
  },
});

export const onIngestionComplete = internalMutation({
  args: {
    workflowId: v.string(),
    context: v.object({ importId: v.id("recipeImports") }),
    result: workflowResult,
  },
  returns: v.null(),
  handler: async (ctx, { workflowId, context, result }) => {
    if (result.kind === "success") return null;
    const recipeImport = await ctx.db.get(context.importId);
    if (
      recipeImport === null ||
      recipeImport.status === "needs_review" ||
      recipeImport.status === "completed" ||
      recipeImport.workflowId !== workflowId
    ) {
      return null;
    }

    const rawMessage =
      result.kind === "failed" ? result.error : "Recipe ingestion was canceled";
    const errorMessage = rawMessage.slice(0, 500);
    const now = Date.now();
    await ctx.db.patch(context.importId, {
      status: "failed",
      errorMessage,
      finishedAt: now,
      updatedAt: now,
    });
    return null;
  },
});
