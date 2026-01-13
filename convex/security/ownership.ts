import { ActionCtx, QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

/**
 * Verify repository ownership in actions (where we have userId from context)
 */
export async function verifyRepositoryOwnershipInAction(
  ctx: ActionCtx,
  repositoryId: Id<"repositories">,
  userId: Id<"users">
): Promise<void> {
  const repository = await ctx.runQuery(internal.repositories.getById, {
    repositoryId,
  });
  if (!repository || repository.userId !== userId) {
    throw new Error("Repository not found or unauthorized");
  }
}

/**
 * Verify repository ownership in queries/mutations (where we get user from auth)
 */
export async function verifyRepositoryOwnershipInQuery(
  ctx: QueryCtx | MutationCtx,
  repositoryId: Id<"repositories">
): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .first();
  if (!user) {
    throw new Error("User not found");
  }
  const repository = await ctx.db.get("repositories", repositoryId);
  if (!repository || repository.userId !== user._id) {
    throw new Error("Repository not found or unauthorized");
  }
  return user._id;
}

/**
 * Get repository and verify ownership, returning both repository and userId
 */
export async function getRepositoryWithOwnership(
  ctx: ActionCtx,
  repositoryId: Id<"repositories">,
  userId: Id<"users">
): Promise<{ repository: Doc<"repositories">; userId: Id<"users"> }> {
  const repository = await ctx.runQuery(internal.repositories.getById, {
    repositoryId,
  });
  if (!repository || repository.userId !== userId) {
    throw new Error("Repository not found or unauthorized");
  }
  return { repository, userId: repository.userId };
}
