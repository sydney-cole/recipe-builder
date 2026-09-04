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
import {
  normalizeRecipeUrl,
  optionalStringField,
  recipeLinksFromMessage,
} from "./lib/urls";
import { agentmail } from "./lib/agentmail";

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
    const normalizedUrl = normalizeRecipeUrl(sourceUrl);
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

    const remoteInbox = (await agentmail.getInbox(ctx, configuredInboxId)) as {
      inbox_id?: unknown;
      email?: unknown;
    };
    if (
      typeof remoteInbox.inbox_id !== "string" ||
      typeof remoteInbox.email !== "string"
    ) {
      throw new Error("AgentMail returned invalid inbox metadata");
    }

    const saved = await ctx.runMutation(internal.email.saveInbox, {
      userId,
      inboxId: remoteInbox.inbox_id,
      email: remoteInbox.email,
    });
    if (saved === null) throw new Error("Could not save the new inbox");
    return { email: saved.email };
  },
});

export const onMessageReceived = internalMutation({
  args: { message: v.any(), thread: v.any(), eventId: v.string() },
  handler: async (ctx, { message, eventId }) => {
    const inboxId = optionalStringField(message, "inbox_id");
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

    const sourceMessageId = optionalStringField(message, "message_id");
    const sourceSubject = optionalStringField(message, "subject");
    const links = recipeLinksFromMessage(message);
    const now = Date.now();
    let queued = 0;

    for (const normalizedUrl of links) {
      const existing = await ctx.db
        .query("recipeImports")
        .withIndex("by_requester_and_normalized_url", (q) =>
          q
            .eq("requestedBy", userInbox.userId)
            .eq("normalizedUrl", normalizedUrl),
        )
        .first();
      if (existing !== null) continue;

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
      queued += 1;
    }

    return { queued };
  },
});
