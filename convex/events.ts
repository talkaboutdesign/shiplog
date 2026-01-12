import { mutation, internalMutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const create = internalMutation({
  args: {
    repositoryId: v.id("repositories"),
    githubDeliveryId: v.string(),
    type: v.string(),
    action: v.optional(v.string()),
    payload: v.any(),
    actorGithubUsername: v.string(),
    actorGithubId: v.number(),
    actorAvatarUrl: v.optional(v.string()),
    occurredAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Check for duplicate by delivery ID
    const existing = await ctx.db
      .query("events")
      .withIndex("by_delivery_id", (q) =>
        q.eq("githubDeliveryId", args.githubDeliveryId)
      )
      .first();

    if (existing) {
      // Already processed this event
      return existing._id;
    }

    const eventId = await ctx.db.insert("events", {
      repositoryId: args.repositoryId,
      githubDeliveryId: args.githubDeliveryId,
      type: args.type,
      action: args.action,
      payload: args.payload,
      actorGithubUsername: args.actorGithubUsername,
      actorGithubId: args.actorGithubId,
      actorAvatarUrl: args.actorAvatarUrl,
      occurredAt: args.occurredAt,
      status: "pending",
      createdAt: Date.now(),
    });

    // Schedule AI digest action
    await ctx.scheduler.runAfter(0, internal.ai.digestEvent, {
      eventId,
    });

    return eventId;
  },
});

export const updateStatus = internalMutation({
  args: {
    eventId: v.id("events"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("skipped")
    ),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventId, {
      status: args.status,
      errorMessage: args.errorMessage,
      processedAt: args.status === "completed" || args.status === "failed" || args.status === "skipped"
        ? Date.now()
        : undefined,
    });
  },
});

export const get = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.eventId);
  },
});

export const getById = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.eventId);
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
      .query("events")
      .withIndex("by_repository_time", (q) =>
        q.eq("repositoryId", args.repositoryId)
      )
      .order("desc")
      .take(limit);
  },
});

export const listByRepositories = query({
  args: {
    repositoryIds: v.array(v.id("repositories")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    const allEvents = await Promise.all(
      args.repositoryIds.map((repoId) =>
        ctx.db
          .query("events")
          .withIndex("by_repository_time", (q) => q.eq("repositoryId", repoId))
          .order("desc")
          .collect()
      )
    );
    const flattened = allEvents.flat();
    return flattened
      .sort((a, b) => b.occurredAt - a.occurredAt)
      .slice(0, limit);
  },
});
