import { query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const create = internalMutation({
  args: {
    repositoryId: v.id("repositories"),
    eventId: v.id("events"),
    title: v.string(),
    summary: v.string(),
    category: v.optional(
      v.union(
        v.literal("feature"),
        v.literal("bugfix"),
        v.literal("refactor"),
        v.literal("docs"),
        v.literal("chore"),
        v.literal("security")
      )
    ),
    contributors: v.array(v.string()),
    metadata: v.optional(
      v.object({
        prNumber: v.optional(v.number()),
        prUrl: v.optional(v.string()),
        prState: v.optional(v.string()),
        issueNumber: v.optional(v.number()),
        issueUrl: v.optional(v.string()),
        commitCount: v.optional(v.number()),
        compareUrl: v.optional(v.string()),
        branch: v.optional(v.string()),
      })
    ),
    aiModel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("digests", {
      repositoryId: args.repositoryId,
      eventId: args.eventId,
      title: args.title,
      summary: args.summary,
      category: args.category,
      contributors: args.contributors,
      metadata: args.metadata,
      aiModel: args.aiModel,
      createdAt: Date.now(),
    });
  },
});

export const listByRepository = query({
  args: {
    repositoryId: v.id("repositories"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;

    return await ctx.db
      .query("digests")
      .withIndex("by_repository_time", (q) =>
        q.eq("repositoryId", args.repositoryId)
      )
      .order("desc")
      .take(limit);
  },
});

export const getByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("digests")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .first();
  },
});
