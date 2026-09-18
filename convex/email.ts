import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  optionalStringField,
  primaryRecipeLinkFromMessage,
} from "./lib/urls";
import { queueRecipeSource } from "./recipeIngestion";

const inboundEmailStatus = v.union(
  v.literal("received"),
  v.literal("processing"),
  v.literal("imported"),
  v.literal("needs_review"),
  v.literal("failed"),
  v.literal("no_links"),
  v.literal("already_imported"),
);

function boundedField(value: unknown, key: string, maxLength: number) {
  return optionalStringField(value, key)?.trim().slice(0, maxLength) || undefined;
}

function messageTimestamp(message: unknown) {
  const timestamp = optionalStringField(message, "timestamp");
  if (timestamp === undefined) return Date.now();
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function senderEmail(message: unknown) {
  const rawSender = optionalStringField(message, "from")?.trim().toLowerCase();
  if (!rawSender) return undefined;
  const bracketedAddress = rawSender.match(/<([^<>]+)>/)?.[1]?.trim();
  const address = bracketedAddress ?? rawSender;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? address : undefined;
}

export const currentInbox = query({
  args: {},
  returns: v.union(v.null(), v.object({ email: v.string() })),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const email = process.env.AGENTMAIL_INBOX_ID?.trim();
    return email ? { email } : null;
  },
});

export const recentInboundEmails = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("inboundRecipeEmails"),
      subject: v.optional(v.string()),
      sender: v.optional(v.string()),
      receivedAt: v.number(),
      linkCount: v.number(),
      status: inboundEmailStatus,
      recipeId: v.optional(v.id("recipes")),
    }),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    const emails = await ctx.db
      .query("inboundRecipeEmails")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);

    return await Promise.all(
      emails.map(async (email) => {
        // Only expose a recipe through the import explicitly selected for this
        // email. Older multi-link events may contain unrelated successful or
        // failed attempts and must not borrow a button from event history.
        const primaryImport = email.primaryImportId === undefined
          ? null
          : await ctx.db.get(email.primaryImportId);
        const ownedPrimaryImport = primaryImport?.requestedBy === userId
          ? primaryImport
          : null;
        const recipeId = ownedPrimaryImport?.recipeId;
        let status:
          | "received"
          | "processing"
          | "imported"
          | "needs_review"
          | "failed"
          | "no_links"
          | "already_imported";

        if (email.linkCount === 0) status = "no_links";
        else if (ownedPrimaryImport?.status === "failed") status = "failed";
        else if (ownedPrimaryImport !== null && !["completed", "needs_review"].includes(ownedPrimaryImport.status)) status = "processing";
        else if (email.queuedCount === 0) status = "already_imported";
        else if (ownedPrimaryImport === null) status = "failed";
        else if (ownedPrimaryImport.status === "needs_review" && recipeId !== undefined) status = "needs_review";
        else if (ownedPrimaryImport.status === "completed" && recipeId !== undefined) status = "imported";
        else status = "failed";

        return {
          _id: email._id,
          subject: email.subject,
          sender: email.sender,
          receivedAt: email.receivedAt,
          linkCount: email.linkCount,
          status,
          recipeId,
        };
      }),
    );
  },
});

export const recentImports = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("recipeImports")
      .withIndex("by_requester", (q) => q.eq("requestedBy", userId))
      .order("desc")
      .take(20);
  },
});

export const importResult = query({
  args: { importId: v.id("recipeImports") },
  returns: v.union(
    v.null(),
    v.object({
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
      recipeId: v.optional(v.id("recipes")),
      title: v.optional(v.string()),
      description: v.optional(v.string()),
      sourceUrl: v.string(),
      errorMessage: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, { importId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");
    const recipeImport = await ctx.db.get(importId);
    if (recipeImport === null || recipeImport.requestedBy !== userId) return null;
    const recipe =
      recipeImport.recipeId === undefined
        ? null
        : await ctx.db.get(recipeImport.recipeId);
    return {
      status: recipeImport.status,
      recipeId: recipeImport.recipeId,
      title: recipe?.title,
      description: recipe?.description,
      sourceUrl: recipeImport.sourceUrl,
      errorMessage: recipeImport.errorMessage,
    };
  },
});

export const queueUrl = mutation({
  args: {
    sourceUrl: v.string(),
  },
  returns: v.id("recipeImports"),
  handler: async (ctx, { sourceUrl }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");
    const queued = await queueRecipeSource(ctx, {
      userId,
      sourceUrl,
      sourceKind: "direct",
    });
    return queued.importId;
  },
});

export const onMessageReceived = internalMutation({
  args: { message: v.any(), thread: v.any(), eventId: v.string() },
  returns: v.object({ queued: v.number() }),
  handler: async (ctx, { message, eventId }) => {
    const sourceEventId = eventId.trim().slice(0, 500);
    if (sourceEventId.length === 0) return { queued: 0 };
    const inboxId = optionalStringField(message, "inbox_id");
    if (inboxId === undefined) return { queued: 0 };

    const configuredInboxId = process.env.AGENTMAIL_INBOX_ID?.trim();
    if (!configuredInboxId || inboxId.toLowerCase() !== configuredInboxId.toLowerCase()) {
      return { queued: 0 };
    }

    const fromAddress = senderEmail(message);
    if (fromAddress === undefined) return { queued: 0 };
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", fromAddress))
      .unique();
    if (user === null) return { queued: 0 };

    const alreadyHandled = await ctx.db
      .query("inboundRecipeEmails")
      .withIndex("by_event", (q) => q.eq("eventId", sourceEventId))
      .unique();
    if (alreadyHandled !== null) return { queued: 0 };

    const sourceMessageId = boundedField(message, "message_id", 500);
    const sourceSubject = boundedField(message, "subject", 300);
    // Forwarded messages commonly contain unrelated links in signatures and
    // footers. Import only the first plausible recipe page from each email.
    const links = primaryRecipeLinkFromMessage(message);
    let queued = 0;
    let primaryImportId: Id<"recipeImports"> | undefined;

    for (const normalizedUrl of links) {
      const result = await queueRecipeSource(ctx, {
        userId: user._id,
        sourceUrl: normalizedUrl,
        sourceKind: "email",
        sourceMessageId,
        sourceEventId,
        sourceSubject,
      });
      primaryImportId ??= result.importId;
      if (result.queued) queued += 1;
    }

    await ctx.db.insert("inboundRecipeEmails", {
      userId: user._id,
      inboxId,
      eventId: sourceEventId,
      messageId: sourceMessageId,
      sender: boundedField(message, "from", 320),
      subject: sourceSubject,
      receivedAt: messageTimestamp(message),
      linkCount: links.length,
      queuedCount: queued,
      primaryImportId,
    });

    return { queued };
  },
});
