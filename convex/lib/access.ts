import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { normalizeEmailAddress } from "./validation";

type ReadCtx = QueryCtx | MutationCtx;

export async function requireUserId(ctx: ReadCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Unauthenticated");
  return userId;
}

export async function ownedImport(
  ctx: ReadCtx,
  userId: Id<"users">,
  importId: Id<"recipeImports">,
) {
  const recipeImport = await ctx.db.get(importId);
  return recipeImport?.requestedBy === userId ? recipeImport : null;
}

export async function ownedDraft(
  ctx: ReadCtx,
  userId: Id<"users">,
  importId: Id<"recipeImports">,
) {
  if ((await ownedImport(ctx, userId, importId)) === null) return null;
  return await ctx.db
    .query("recipeImportDrafts")
    .withIndex("by_import", (q) => q.eq("importId", importId))
    .unique();
}

export async function ownedList(
  ctx: ReadCtx,
  userId: Id<"users">,
  listId: Id<"groceryLists">,
) {
  const list = await ctx.db.get(listId);
  return list?.userId === userId ? list : null;
}

export async function ownedListItem(
  ctx: ReadCtx,
  userId: Id<"users">,
  itemId: Id<"groceryListItems">,
) {
  const item = await ctx.db.get(itemId);
  if (item === null || (await ownedList(ctx, userId, item.listId)) === null) {
    return null;
  }
  return item;
}

export async function accessibleRecipe(
  ctx: ReadCtx,
  userId: Id<"users">,
  recipeId: Id<"recipes">,
) {
  const recipe = await ctx.db.get(recipeId);
  if (recipe === null) return null;
  if (recipe.isPublic === true) return recipe;
  const saved = await ctx.db
    .query("savedRecipes")
    .withIndex("by_user_and_recipe", (q) =>
      q.eq("userId", userId).eq("recipeId", recipeId),
    )
    .first();
  if (saved !== null) return recipe;
  if (recipe.importId === undefined) return null;
  const recipeImport = await ctx.db.get(recipe.importId);
  return recipeImport?.requestedBy === userId ? recipe : null;
}

export async function resolveVerifiedSender(
  ctx: ReadCtx,
  rawSender: unknown,
): Promise<Doc<"users"> | null> {
  const email = normalizeEmailAddress(rawSender);
  if (email === null) return null;
  const matches = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .collect();
  const verified = matches.filter(
    (user) => user.emailVerificationTime !== undefined,
  );
  return verified.length === 1 ? verified[0] : null;
}
