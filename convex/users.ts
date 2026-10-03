import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";

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
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");

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
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");

    await ctx.db.patch(userId, {
      deletionRequestedAt: Date.now(),
      deletionStage: "authAccounts",
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.users.continueAccountDeletion, { userId });
    return null;
  },
});

type DeletionStage = "authAccounts" | "authSessions" | "savedRecipes" | "userInboxes" | "inboundEmails" | "recipeImports" | "groceryLists";

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

    if (user.deletionStage === "authAccounts") {
      const account = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", userId)).first();
      if (account === null) {
        await advance("authSessions");
        return null;
      }
      const codes = await ctx.db.query("authVerificationCodes").withIndex("accountId", (q) => q.eq("accountId", account._id)).take(50);
      await Promise.all(codes.map((code) => ctx.db.delete(code._id)));
      if (codes.length < 50) await ctx.db.delete(account._id);
      await schedule();
      return null;
    }

    if (user.deletionStage === "authSessions") {
      const session = await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", userId)).first();
      if (session === null) {
        await advance("savedRecipes");
        return null;
      }
      const [tokens, verifiers] = await Promise.all([
        ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", session._id)).take(50),
        ctx.db.query("authVerifiers").filter((q) => q.eq(q.field("sessionId"), session._id)).take(50),
      ]);
      await Promise.all([...tokens.map((token) => ctx.db.delete(token._id)), ...verifiers.map((verifier) => ctx.db.delete(verifier._id))]);
      if (tokens.length < 50 && verifiers.length < 50) await ctx.db.delete(session._id);
      await schedule();
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
      if (imports.length === 0) await advance("groceryLists"); else await schedule();
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
