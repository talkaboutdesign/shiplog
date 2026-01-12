import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./auth";

export const get = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    
    // Only allow users to query their own clerkId to prevent user enumeration
    if (currentUser.clerkId !== args.clerkId) {
      throw new Error("Unauthorized");
    }

    return currentUser;
  },
});

export const getCurrent = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
  },
});

export const getById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

export const upsert = mutation({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    const now = Date.now();
    const userData = {
      clerkId: identity.subject,
      email: identity.email || "",
      githubUsername: identity.nickname || "",
      avatarUrl: identity.pictureUrl,
      createdAt: now,
      updatedAt: now,
    };

    if (existingUser) {
      await ctx.db.patch(existingUser._id, {
        email: userData.email,
        githubUsername: userData.githubUsername,
        avatarUrl: userData.avatarUrl,
        updatedAt: now,
      });
      return existingUser._id;
    } else {
      return await ctx.db.insert("users", userData);
    }
  },
});

export const updateApiKeys = mutation({
  args: {
    openai: v.optional(v.string()),
    anthropic: v.optional(v.string()),
    openrouter: v.optional(v.string()),
    openrouterModel: v.optional(v.string()),
    preferredProvider: v.optional(v.union(v.literal("openai"), v.literal("anthropic"), v.literal("openrouter"))),
  },
  returns: v.null(),
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

    const existingKeys = user.apiKeys || {};
    const updatedKeys = {
      openai: args.openai !== undefined ? args.openai : existingKeys.openai,
      anthropic: args.anthropic !== undefined ? args.anthropic : existingKeys.anthropic,
      openrouter: args.openrouter !== undefined ? args.openrouter : existingKeys.openrouter,
      openrouterModel: args.openrouterModel !== undefined ? args.openrouterModel : existingKeys.openrouterModel,
      preferredProvider: args.preferredProvider !== undefined
        ? args.preferredProvider
        : existingKeys.preferredProvider,
    };

    await ctx.db.patch(user._id, {
      apiKeys: updatedKeys,
      updatedAt: Date.now(),
    });
    return null;
  },
});
