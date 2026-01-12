import { QueryCtx, MutationCtx } from "./_generated/server";
import { Id, Doc } from "./_generated/dataModel";

/**
 * Get the current authenticated user from the context.
 * Throws an error if the user is not authenticated or not found.
 * Note: For actions, use ctx.runQuery(api.users.getCurrent) instead.
 */
export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx
) {
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
  return user;
}

/**
 * Verify that a repository belongs to the specified user.
 * Throws an error if the repository doesn't exist or doesn't belong to the user.
 */
export async function verifyRepositoryOwnership(
  ctx: QueryCtx | MutationCtx,
  repositoryId: Id<"repositories">,
  userId: Id<"users">
): Promise<Doc<"repositories">> {
  const repo = await ctx.db.get(repositoryId);
  if (!repo || repo.userId !== userId) {
    throw new Error("Repository not found or unauthorized");
  }
  return repo;
}
