import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";

const UNVERIFIED_USER_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const UNVERIFIED_USER_BATCH_SIZE = 100;

const emailPasswordMethod = v.object({
  name: v.literal("emailPassword"),
  profile: v.object({}),
});

/**
 * Convex Auth's `createUser` callback for email and password sign-up. The
 * method passes no profile data, and the row is created before the emailed
 * link is opened, so the user starts without an email (see `syncUserEmail`).
 */
export const createUserEmailPassword = internalMutation({
  args: { method: emailPasswordMethod },
  returns: v.id("users"),
  handler: async (ctx) => {
    return await ctx.db.insert("users", { createdAt: Date.now() });
  },
});

/**
 * Convex Auth's `onSignIn` callback. Copies the user's primary verified email
 * from the auth email component, so `users.email` is set only for addresses
 * whose owner opened the confirmation link.
 */
export const syncUserEmail = internalMutation({
  args: { method: emailPasswordMethod, userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    await copyVerifiedEmail(ctx, userId);
    return null;
  },
});

/**
 * Copies the user's primary verified email from the auth email component
 * onto `users.email`. Runs at every sign-in and after an email change.
 */
export async function copyVerifiedEmail(ctx: MutationCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (user === null) return;
  const primaryEmail = await ctx.runQuery(components.authEmail.verifiedEmails.getPrimaryEmail, { userId });
  // Forwarded mail is matched on the lowercased sender address.
  const email = primaryEmail?.trim().toLowerCase();
  if (email !== undefined && email !== user.email) {
    await ctx.db.patch(userId, { email, updatedAt: Date.now() });
  }
}

/**
 * Deletes accounts whose confirmation link was never opened. Sign-up creates
 * the user before the link is opened, and a new link means signing up again,
 * so these rows can never sign in once their link has expired.
 */
export const deleteUnverifiedUsers = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - UNVERIFIED_USER_MAX_AGE_MS;
    // Oldest first, so the stale rows come before any recent sign-ups.
    const candidates = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", undefined))
      .take(UNVERIFIED_USER_BATCH_SIZE);
    for (const user of candidates) {
      const createdAt = user.createdAt ?? user._creationTime;
      if (user.deletionStage === undefined && createdAt < cutoff) {
        await ctx.db.delete(user._id);
      }
    }
    return null;
  },
});

/** Returns the signed-in user's profile, or null for an anonymous client. */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    return user?.deletionRequestedAt === undefined ? user : null;
  },
});

/** Updates the editable portion of the signed-in user's profile. */
export const updateProfile = mutation({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, { name }) => {
    const userId = await requireUser(ctx);

    const normalizedName = name.trim();
    if (normalizedName.length === 0) throw new Error("Name is required");
    if (normalizedName.length > 100) throw new Error("Name is too long");

    await ctx.db.patch(userId, {
      name: normalizedName,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Starts a bounded background cleanup so large accounts can be deleted safely. */
export const deleteAccount = mutation({
  args: { confirmation: v.literal("DELETE") },
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);

    await ctx.db.patch(userId, {
      deletionRequestedAt: Date.now(),
      deletionStage: "auth",
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.users.continueAccountDeletion, { userId });
    return null;
  },
});

type DeletionStage = "auth" | "savedRecipes" | "userInboxes" | "inboundEmails" | "recipeImports" | "planner" | "groceryLists";

export const continueAccountDeletion = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (user === null || user.deletionStage === undefined) return null;
    const schedule = async () => {
      await ctx.scheduler.runAfter(0, internal.users.continueAccountDeletion, { userId });
    };
    const advance = async (stage: DeletionStage) => {
      await ctx.db.patch(userId, { deletionStage: stage, updatedAt: Date.now() });
      await schedule();
    };

    if (user.deletionStage === "auth") {
      // Revoking the sessions signs the user out everywhere, and deleting the
      // verified emails frees the address. The password component has no
      // delete function; its hash is unreachable once the emails are gone.
      const sessions = await ctx.runQuery(components.auth.public.listSessions, { userId });
      await ctx.runMutation(components.auth.public.revokeSessions, {
        sessionIds: sessions.map((session) => session.sessionId),
      });
      await ctx.runMutation(components.authEmail.verifiedEmails.deleteUser, { userId });
      await advance("savedRecipes");
      return null;
    }

    if (user.deletionStage === "savedRecipes") {
      const documents = await ctx.db.query("savedRecipes").withIndex("by_user", (q) => q.eq("userId", userId)).take(50);
      await Promise.all(documents.map((document) => ctx.db.delete(document._id)));
      if (documents.length === 0) await advance("userInboxes"); else await schedule();
      return null;
    }
    if (user.deletionStage === "userInboxes") {
      const documents = await ctx.db.query("userInboxes").withIndex("by_user", (q) => q.eq("userId", userId)).take(50);
      await Promise.all(documents.map((document) => ctx.db.delete(document._id)));
      if (documents.length === 0) await advance("inboundEmails"); else await schedule();
      return null;
    }
    if (user.deletionStage === "inboundEmails") {
      const documents = await ctx.db.query("inboundRecipeEmails").withIndex("by_user", (q) => q.eq("userId", userId)).take(50);
      await Promise.all(documents.map((document) => ctx.db.delete(document._id)));
      if (documents.length === 0) await advance("recipeImports"); else await schedule();
      return null;
    }

    if (user.deletionStage === "recipeImports") {
      const imports = await ctx.db.query("recipeImports").withIndex("by_requester", (q) => q.eq("requestedBy", userId)).take(50);
      await Promise.all(imports.map((item) => ctx.db.patch(item._id, { requestedBy: undefined })));
      if (imports.length === 0) await advance("planner"); else await schedule();
      return null;
    }

    if (user.deletionStage === "planner") {
      // A household planner would pass to another member instead; today every
      // planner has one owner, so it goes with the account.
      const planner = await ctx.db.query("planners").withIndex("by_owner", (q) => q.eq("ownerId", userId)).first();
      if (planner === null) {
        await advance("groceryLists");
        return null;
      }
      const slots = await ctx.db.query("planSlots").withIndex("by_planner_and_date", (q) => q.eq("plannerId", planner._id)).take(50);
      const meals = slots.length > 0
        ? []
        : await ctx.db.query("plannerMeals").withIndex("by_planner_and_key", (q) => q.eq("plannerId", planner._id)).take(50);
      const undo = await ctx.db.query("plannerUndo").withIndex("by_planner", (q) => q.eq("plannerId", planner._id)).take(10);
      await Promise.all([...slots, ...meals, ...undo].map((document) => ctx.db.delete(document._id)));
      if (slots.length === 0 && meals.length === 0) await ctx.db.delete(planner._id);
      await schedule();
      return null;
    }

    const list = await ctx.db.query("groceryLists").withIndex("by_user", (q) => q.eq("userId", userId)).first();
    if (list === null) {
      await ctx.db.delete(userId);
      return null;
    }
    const item = await ctx.db.query("groceryListItems").withIndex("by_list", (q) => q.eq("listId", list._id)).first();
    if (item === null) {
      await ctx.db.delete(list._id);
      await schedule();
      return null;
    }
    const sources = await ctx.db.query("groceryListItemSources").withIndex("by_grocery_list_item", (q) => q.eq("groceryListItemId", item._id)).take(50);
    await Promise.all(sources.map((source) => ctx.db.delete(source._id)));
    if (sources.length < 50) await ctx.db.delete(item._id);
    await schedule();
    return null;
  },
});
