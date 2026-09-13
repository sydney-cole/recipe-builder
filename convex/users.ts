import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/** Returns the signed-in user's profile, or null for an anonymous client. */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    return userId === null ? null : await ctx.db.get(userId);
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

/** Saves notification choices as one value so clients cannot leave partial state. */
export const updateNotificationPreferences = mutation({
  args: {
    preferences: v.object({
      recipeImportReady: v.boolean(),
      importNeedsReview: v.boolean(),
      subscriptionNeedsAttention: v.boolean(),
    }),
  },
  returns: v.null(),
  handler: async (ctx, { preferences }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Unauthenticated");
    await ctx.db.patch(userId, {
      notificationPreferences: preferences,
      updatedAt: Date.now(),
    });
    return null;
  },
});
