import { internalMutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getCurrentUser, verifyRepositoryOwnership } from "./auth";

export const create = internalMutation({
  args: {
    repositoryId: v.id("repositories"),
    githubDeliveryId: v.string(),
    type: v.string(),
    payload: v.any(),
    occurredAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Check for duplicate by delivery ID in events table
    const existingEvent = await ctx.db
      .query("events")
      .withIndex("by_delivery_id", (q) =>
        q.eq("githubDeliveryId", args.githubDeliveryId)
      )
      .first();

    if (existingEvent) {
      // Already processed this event
      return existingEvent._id;
    }

    // Also check digests table for duplicates (events may have been deleted after processing)
    const existingDigest = await ctx.db
      .query("digests")
      .withIndex("by_delivery_id", (q) =>
        q.eq("githubDeliveryId", args.githubDeliveryId)
      )
      .first();

    if (existingDigest) {
      // Already processed - return the existing event ID if we can find it, or throw
      // Since the event was deleted, we can't return an event ID
      // Return null to indicate skip (caller should handle gracefully)
      // Actually, we need to return an ID for the scheduler call, so throw an error
      throw new Error("Event already processed (digest exists)");
    }

    const eventId = await ctx.db.insert("events", {
      repositoryId: args.repositoryId,
      githubDeliveryId: args.githubDeliveryId,
      type: args.type,
      payload: args.payload,
      occurredAt: args.occurredAt,
      status: "pending",
      createdAt: Date.now(),
    });

    // Start digest generation (replaces workflow)
    // PRESERVES WEBHOOK TRIGGER FLOW
    // Use scheduler since mutations can't call actions directly
    await ctx.scheduler.runAfter(0, internal.digests.generateDigest, {
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
    retryCount: v.optional(v.number()),
    nextRetryAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const update: {
      status: "pending" | "processing" | "completed" | "failed" | "skipped";
      errorMessage?: string;
      processedAt?: number;
      retryCount?: number;
      nextRetryAt?: number;
    } = {
      status: args.status,
    };
    
    if (args.errorMessage !== undefined) {
      update.errorMessage = args.errorMessage;
    }
    
    if (args.status === "completed" || args.status === "failed" || args.status === "skipped") {
      update.processedAt = Date.now();
    }
    
    if (args.retryCount !== undefined) {
      update.retryCount = args.retryCount;
    }
    
    if (args.nextRetryAt !== undefined) {
      update.nextRetryAt = args.nextRetryAt;
    }
    
    await ctx.db.patch("events", args.eventId, update);
  },
});

export const updateFileDiffs = internalMutation({
  args: {
    eventId: v.id("events"),
    fileDiffs: v.array(
      v.object({
        filename: v.string(),
        status: v.union(
          v.literal("added"),
          v.literal("removed"),
          v.literal("modified"),
          v.literal("renamed")
        ),
        additions: v.number(),
        deletions: v.number(),
        changes: v.number(),
        patch: v.optional(v.string()),
        previous_filename: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch("events", args.eventId, {
      fileDiffs: args.fileDiffs,
    });
  },
});

export const deleteEvent = internalMutation({
  args: {
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete("events", args.eventId);
  },
});

export const get = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const event = await ctx.db.get("events", args.eventId);
    
    if (!event) {
      throw new Error("Event not found");
    }
    
    // Verify the event belongs to a repository owned by the user
    await verifyRepositoryOwnership(ctx, event.repositoryId, user._id);
    
    return event;
  },
});

export const getById = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    return await ctx.db.get("events", args.eventId);
  },
});

/**
 * Get failed events that are ready for retry (nextRetryAt <= now)
 */
export const getFailedEventsReadyForRetry = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    // Query all events with status="failed"
    // We need to check each repository's failed events
    const allRepos = await ctx.db.query("repositories").collect();
    const failedEvents = [];
    
    for (const repo of allRepos) {
      const repoFailedEvents = await ctx.db
        .query("events")
        .withIndex("by_repository_status", (q) =>
          q.eq("repositoryId", repo._id).eq("status", "failed")
        )
        .filter((q) => q.or(
          q.eq(q.field("nextRetryAt"), undefined),
          q.lte(q.field("nextRetryAt"), now)
        ))
        .collect();
      failedEvents.push(...repoFailedEvents);
    }
    
    return failedEvents;
  },
});

export const listByRepository = query({
  args: {
    repositoryId: v.id("repositories"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    
    // Verify repository ownership before querying events
    await verifyRepositoryOwnership(ctx, args.repositoryId, user._id);
    
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
    cursor: v.optional(v.number()), // Timestamp cursor for pagination
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    
    // Get all repositories owned by the user in a single query (optimize N+1)
    const userRepositories = await ctx.db
      .query("repositories")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    
    const userRepoIdSet = new Set(userRepositories.map(r => r._id));
    
    // Filter repositoryIds to only include those owned by the user
    const ownedRepositoryIds = args.repositoryIds.filter(repoId => userRepoIdSet.has(repoId));
    
    if (ownedRepositoryIds.length === 0) {
      return [];
    }
    
    const limit = args.limit || 50;
    // Query with limit per repository to avoid over-fetching
    // We fetch limit items per repo, then merge and take final limit
    const perRepoLimit = Math.ceil(limit / ownedRepositoryIds.length) + 5; // Add buffer for better results
    const allEvents = await Promise.all(
      ownedRepositoryIds.map((repoId) =>
        ctx.db
          .query("events")
          .withIndex("by_repository_time", (q) => q.eq("repositoryId", repoId))
          .order("desc")
          .take(perRepoLimit)
      )
    );
    let flattened = allEvents.flat();
    
    // Apply cursor filter if provided
    if (args.cursor !== undefined) {
      flattened = flattened.filter((e) => e.occurredAt < args.cursor!);
    }
    
    const sorted = flattened
      .sort((a, b) => b.occurredAt - a.occurredAt)
      .slice(0, limit);
    
    return sorted;
  },
});
