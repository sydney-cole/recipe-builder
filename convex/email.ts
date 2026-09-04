import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";

function normalizeUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS recipe links are supported");
  }

  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || ["fbclid", "gclid"].includes(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  return url.toString();
}

function stringField(value: unknown, key: string) {
  if (typeof value !== "object" || value === null) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : undefined;
}

function linksFromMessage(message: unknown) {
  const content = [
    stringField(message, "extracted_text"),
    stringField(message, "text"),
    stringField(message, "extracted_html"),
    stringField(message, "html"),
    stringField(message, "preview"),
  ]
    .filter((value): value is string => value !== undefined)
    .join("\n");

  const matches = content.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
  const normalized = matches.flatMap((match) => {
    try {
      return [normalizeUrl(match.replace(/[.,;:!?]+$/, ""))];
    } catch {
      return [];
    }
  });
  return [...new Set(normalized)].slice(0, 10);
}

export const currentInbox = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db
      .query("userInboxes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
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
    const normalizedUrl = normalizeUrl(sourceUrl);
    const existing = await ctx.db
      .query("recipeImports")
      .withIndex("by_requester_and_normalized_url", (q) =>
        q.eq("requestedBy", userId).eq("normalizedUrl", normalizedUrl),
      )
      .first();
    if (existing !== null) return existing._id;

    const now = Date.now();
    return await ctx.db.insert("recipeImports", {
      requestedBy: userId,
      sourceUrl,
      normalizedUrl,
      status: "queued",
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const inboxForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) =>
    await ctx.db
      .query("userInboxes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique(),
});

export const saveInbox = internalMutation({
  args: {
    userId: v.id("users"),
    inboxId: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userInboxes")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing !== null) return existing;

    const claimedInbox = await ctx.db
      .query("userInboxes")
      .withIndex("by_inbox", (q) => q.eq("inboxId", args.inboxId))
      .unique();
    if (claimedInbox !== null) {
      throw new Error("This recipe inbox is already connected to an account");
    }

    const now = Date.now();
    const id = await ctx.db.insert("userInboxes", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(id);
  },
});

export const provisionInbox = action({
  args: {},
  handler: async (ctx): Promise<{ email: string }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");

    const existing = await ctx.runQuery(internal.email.inboxForUser, { userId });
    if (existing !== null) return { email: existing.email };

    const configuredInboxId = process.env.AGENTMAIL_INBOX_ID?.trim();
    if (!configuredInboxId) {
      throw new Error("AGENTMAIL_INBOX_ID is not configured");
    }

    const saved = await ctx.runMutation(internal.email.saveInbox, {
      userId,
      inboxId: configuredInboxId,
      email: configuredInboxId,
    });
    if (saved === null) throw new Error("Could not save the new inbox");
    return { email: saved.email };
  },
});

export const onMessageReceived = internalMutation({
  args: { message: v.any(), thread: v.any(), eventId: v.string() },
  handler: async (ctx, { message, eventId }) => {
    const inboxId = stringField(message, "inbox_id");
    if (inboxId === undefined) return { queued: 0 };

    const userInbox = await ctx.db
      .query("userInboxes")
      .withIndex("by_inbox", (q) => q.eq("inboxId", inboxId))
      .unique();
    if (userInbox === null) return { queued: 0 };

    const alreadyHandled = await ctx.db
      .query("recipeImports")
      .withIndex("by_source_event", (q) => q.eq("sourceEventId", eventId))
      .first();
    if (alreadyHandled !== null) return { queued: 0 };

    const sourceMessageId = stringField(message, "message_id");
    const sourceSubject = stringField(message, "subject");
    const links = linksFromMessage(message);
    const now = Date.now();

    for (const normalizedUrl of links) {
      await ctx.db.insert("recipeImports", {
        requestedBy: userInbox.userId,
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
    }

    return { queued: links.length };
  },
});
