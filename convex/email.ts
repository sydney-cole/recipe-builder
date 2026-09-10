import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { resolveVerifiedSender } from "./lib/access";
import {
  normalizeRecipeUrl,
  optionalStringField,
  recipeLinksFromMessage,
  senderFromMessage,
} from "./lib/urls";

export const currentInbox = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    const email = process.env.AGENTMAIL_INBOX_EMAIL?.trim() || null;
    return {
      email,
      isConfigured: Boolean(email && process.env.AGENTMAIL_INBOX_ID?.trim()),
      isEligible: user?.emailVerificationTime !== undefined,
      accountEmail: user?.email ?? null,
    };
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

export const queueUrl = mutation({
  args: { sourceUrl: v.string() },
  handler: async (ctx, { sourceUrl }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");
    const normalizedUrl = normalizeRecipeUrl(sourceUrl);
    const existing = await ctx.db
      .query("recipeImports")
      .withIndex("by_requester_and_normalized_url", (q) =>
        q.eq("requestedBy", userId).eq("normalizedUrl", normalizedUrl),
      )
      .first();
    if (existing !== null) return existing._id;

    const now = Date.now();
    const importId = await ctx.db.insert("recipeImports", {
      requestedBy: userId,
      sourceUrl,
      normalizedUrl,
      status: "queued",
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.importProcessor.processImport, {
      importId,
    });
    return importId;
  },
});

export const onMessageReceived = internalMutation({
  args: { message: v.any(), thread: v.any(), eventId: v.string() },
  handler: async (ctx, { message, eventId }) => {
    const previous = await ctx.db
      .query("recipeInboxEvents")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .first();
    if (previous !== null) {
      return { queued: 0, disposition: "duplicate" as const };
    }

    const now = Date.now();
    const configuredInboxId = process.env.AGENTMAIL_INBOX_ID?.trim();
    const inboxId = optionalStringField(message, "inbox_id");
    if (!configuredInboxId || inboxId !== configuredInboxId) {
      await ctx.db.insert("recipeInboxEvents", {
        eventId,
        disposition: "wrong_inbox",
        queuedCount: 0,
        createdAt: now,
      });
      return { queued: 0, disposition: "wrong_inbox" as const };
    }

    const user = await resolveVerifiedSender(ctx, senderFromMessage(message));
    if (user === null) {
      await ctx.db.insert("recipeInboxEvents", {
        eventId,
        disposition: "unknown_sender",
        queuedCount: 0,
        createdAt: now,
      });
      return { queued: 0, disposition: "unknown_sender" as const };
    }

    const links = recipeLinksFromMessage(message);
    if (links.length === 0) {
      await ctx.db.insert("recipeInboxEvents", {
        eventId,
        disposition: "no_links",
        queuedCount: 0,
        createdAt: now,
      });
      return { queued: 0, disposition: "no_links" as const };
    }

    const sourceMessageId = optionalStringField(message, "message_id")?.slice(0, 200);
    const sourceSubject = optionalStringField(message, "subject")?.slice(0, 300);
    let queued = 0;
    for (const normalizedUrl of links) {
      const existing = await ctx.db
        .query("recipeImports")
        .withIndex("by_requester_and_normalized_url", (q) =>
          q.eq("requestedBy", user._id).eq("normalizedUrl", normalizedUrl),
        )
        .first();
      if (existing !== null) continue;

      const importId = await ctx.db.insert("recipeImports", {
        requestedBy: user._id,
        sourceUrl: normalizedUrl,
        normalizedUrl,
        status: "queued",
        attemptCount: 0,
        sourceMessageId,
        sourceEventId: eventId,
        sourceSubject,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.importProcessor.processImport, {
        importId,
      });
      queued += 1;
    }

    const disposition = queued > 0 ? "queued" : "duplicate";
    await ctx.db.insert("recipeInboxEvents", {
      eventId,
      disposition,
      queuedCount: queued,
      createdAt: now,
    });
    return { queued, disposition };
  },
});
