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
  },
  handler: async (ctx, args) => {
    // Check if repo already exists
    const existing = await ctx.db
      .query("repositories")
      .withIndex("by_github_id", (q) => q.eq("githubId", args.githubId))
      .first();

    const now = Date.now();
    const repoData = {
      userId: args.userId,
      githubId: args.githubId,
      githubInstallationId: args.installationId,
      name: args.name,
      fullName: args.fullName,
      owner: args.owner,
      defaultBranch: args.defaultBranch,
      isPrivate: args.isPrivate,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...repoData,
        updatedAt: now,
      });
      return existing._id;
    } else {
      // Deactivate other repos for this user
      const userRepos = await ctx.db
        .query("repositories")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect();

      for (const userRepo of userRepos) {
        await ctx.db.patch(userRepo._id, { isActive: false });
      }

      return await ctx.db.insert("repositories", repoData);
    }
  },
});
