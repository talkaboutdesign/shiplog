import { query, mutation, internalMutation, internalQuery, action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { getCurrentUser, verifyRepositoryOwnership } from "./auth";

export const getByUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return null;
    }

    return await ctx.db
      .query("repositories")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();
  },
});

export const getActive = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return null;
    }

    return await ctx.db
      .query("repositories")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();
  },
});

export const getAllActive = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return [];
    }

    return await ctx.db
      .query("repositories")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

export const getAllAvailable = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!user) {
      return [];
    }

    const repos = await ctx.db
      .query("repositories")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Check if we need to refresh (no repos or stale data - older than 5 minutes)
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    const needsRefresh = repos.length === 0 || 
      repos.some((repo) => !repo.lastSyncedAt || repo.lastSyncedAt < fiveMinutesAgo);

    if (needsRefresh) {
      // Schedule a refresh in the background (non-blocking)
      // The frontend can call refreshRepos action if needed
    }

    return repos;
  },
});

export const toggleSyncStatus = mutation({
  args: {
    repositoryId: v.id("repositories"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
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

    const repo = await ctx.db.get("repositories", args.repositoryId);
    if (!repo || repo.userId !== user._id) {
      throw new Error("Repository not found or unauthorized");
    }

    await ctx.db.patch("repositories", args.repositoryId, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });
  },
});

export const syncInstallationFromCallback = action({
  args: {
    installationId: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.runQuery(api.users.getCurrent);
    if (!user) {
      throw new Error("User not found");
    }

    // Call internal action to sync (action can call internal actions)
    await ctx.runAction(internal.githubActions.syncInstallation, {
      userId: user._id,
      installationId: args.installationId,
    });
  },
});

export const refreshRepos = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.runQuery(api.users.getCurrent);
    if (!user) {
      throw new Error("User not found");
    }

    // Get all unique installation IDs for this user
    const userRepos = await ctx.runQuery(api.repositories.getAllAvailable);
    const installationIds = Array.from(
      new Set(userRepos.map((repo) => repo.githubInstallationId))
    );

    if (installationIds.length === 0) {
      // No installations yet, nothing to refresh
      return { refreshed: 0 };
    }

    // Refresh repos from all installations
    let refreshed = 0;
    for (const installationId of installationIds) {
      await ctx.runAction(internal.githubActions.refreshInstallationRepos, {
        userId: user._id,
        installationId,
      });
      refreshed++;
    }

    return { refreshed };
  },
});

export const getByInstallation = query({
  args: { installationId: v.number() },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    
    // Verify the installation belongs to the user by checking if they have any repos with this installation
    const userRepos = await ctx.db
      .query("repositories")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    
    const hasInstallation = userRepos.some(
      (repo) => repo.githubInstallationId === args.installationId
    );
    
    if (!hasInstallation) {
      throw new Error("Installation not found or unauthorized");
    }
    
    // Return the first active repository with this installation that belongs to the user
    return await ctx.db
      .query("repositories")
      .withIndex("by_installation", (q) =>
        q.eq("githubInstallationId", args.installationId)
      )
      .filter((q) => 
        q.and(
          q.eq(q.field("isActive"), true),
          q.eq(q.field("userId"), user._id)
        )
      )
      .first();
  },
});

export const getByInstallationInternal = internalQuery({
  args: { installationId: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("repositories")
      .withIndex("by_installation", (q) =>
        q.eq("githubInstallationId", args.installationId)
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();
  },
});

export const getByGithubId = internalQuery({
  args: { githubId: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("repositories")
      .withIndex("by_github_id", (q) => q.eq("githubId", args.githubId))
      .first();
  },
});

export const getByInstallationForRefresh = internalQuery({
  args: {
    userId: v.id("users"),
    installationId: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("repositories")
      .withIndex("by_installation", (q) =>
        q.eq("githubInstallationId", args.installationId)
      )
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .collect();
  },
});

export const updateRepositoryStatus = internalMutation({
  args: {
    repositoryId: v.id("repositories"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch("repositories", args.repositoryId, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });
  },
});

export const getById = internalQuery({
  args: { repositoryId: v.id("repositories") },
  handler: async (ctx, args) => {
    return await ctx.db.get("repositories", args.repositoryId);
  },
});

export const getByIdPublic = query({
  args: { repositoryId: v.id("repositories") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyRepositoryOwnership(ctx, args.repositoryId, user._id);
    const repo = await ctx.db.get("repositories", args.repositoryId);
    return repo ? { fullName: repo.fullName } : null;
  },
});

export const updateIndexStatus = internalMutation({
  args: {
    repositoryId: v.id("repositories"),
    indexStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("indexing"),
        v.literal("completed"),
        v.literal("failed")
      )
    ),
    indexedAt: v.optional(v.number()),
    indexError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const update: {
      indexStatus?: "pending" | "indexing" | "completed" | "failed";
      indexedAt?: number;
      indexError?: string;
      updatedAt: number;
    } = {
      updatedAt: Date.now(),
    };

    if (args.indexStatus !== undefined) {
      update.indexStatus = args.indexStatus;
    }
    if (args.indexedAt !== undefined) {
      update.indexedAt = args.indexedAt;
    }
    if (args.indexError !== undefined) {
      update.indexError = args.indexError;
    }

    await ctx.db.patch("repositories", args.repositoryId, update);
  },
});

export const triggerIndexing = mutation({
  args: {
    repositoryId: v.id("repositories"),
  },
  handler: async (ctx, args) => {
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

    const repo = await ctx.db.get("repositories", args.repositoryId);
    if (!repo || repo.userId !== user._id) {
      throw new Error("Repository not found or unauthorized");
    }

    // Schedule indexing action
    await ctx.scheduler.runAfter(0, internal.surfacesActions.indexRepository, {
      repositoryId: args.repositoryId,
    });

    return { triggered: true };
  },
});


export const createOrUpdateRepository = internalMutation({
  args: {
    userId: v.id("users"),
    installationId: v.number(),
    githubId: v.number(),
    name: v.string(),
    fullName: v.string(),
    owner: v.string(),
    defaultBranch: v.optional(v.string()),
    isPrivate: v.boolean(),
    preserveIsActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Check if repo already exists
    const existing = await ctx.db
      .query("repositories")
      .withIndex("by_github_id", (q) => q.eq("githubId", args.githubId))
      .first();

    const now = Date.now();
    // Determine isActive status:
    // - If repo exists: always preserve existing isActive status
    // - If repo is new: default to false (user must explicitly select)
    const isActive = existing ? existing.isActive : false;
    
    const repoData = {
      userId: args.userId,
      githubId: args.githubId,
      githubInstallationId: args.installationId,
      name: args.name,
      fullName: args.fullName,
      owner: args.owner,
      defaultBranch: args.defaultBranch,
      isPrivate: args.isPrivate,
      isActive,
      lastSyncedAt: now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch("repositories", existing._id, {
        ...repoData,
        createdAt: existing.createdAt, // Preserve original creation time
      });
      return existing._id;
    } else {
      return await ctx.db.insert("repositories", {
        ...repoData,
        createdAt: now,
      });
    }
  },
});
