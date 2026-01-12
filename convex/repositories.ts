import { query, mutation, internalMutation, internalQuery, action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";

export const getByUser = query({
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

    const repo = await ctx.db.get(args.repositoryId);
    if (!repo || repo.userId !== user._id) {
      throw new Error("Repository not found or unauthorized");
    }

    await ctx.db.patch(args.repositoryId, {
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
    return await ctx.db
      .query("repositories")
      .withIndex("by_installation", (q) =>
        q.eq("githubInstallationId", args.installationId)
      )
      .filter((q) => q.eq(q.field("isActive"), true))
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
    await ctx.db.patch(args.repositoryId, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });
  },
});

export const getById = internalQuery({
  args: { repositoryId: v.id("repositories") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.repositoryId);
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
      await ctx.db.patch(existing._id, {
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
