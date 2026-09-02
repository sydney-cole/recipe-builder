import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";

/** Returns the signed-in user's profile, or null for an anonymous client. */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    return userId === null ? null : await ctx.db.get(userId);
  },
});
