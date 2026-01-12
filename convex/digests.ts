import { query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, verifyRepositoryOwnership } from "./auth";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

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
        commitCount: v.optional(v.number()),
        compareUrl: v.optional(v.string()),
        branch: v.optional(v.string()),
      })
    ),
    aiModel: v.optional(v.string()),
    whyThisMatters: v.optional(v.string()),
    impactAnalysis: v.optional(
      v.object({
        affectedSurfaces: v.array(
          v.object({
            surfaceId: v.id("codeSurfaces"),
            surfaceName: v.string(),
            impactType: v.union(
              v.literal("modified"),
              v.literal("added"),
              v.literal("deleted")
            ),
            riskLevel: v.union(
              v.literal("low"),
              v.literal("medium"),
              v.literal("high")
            ),
            confidence: v.number(),
            explanation: v.optional(v.string()),
          })
        ),
        overallRisk: v.union(
          v.literal("low"),
          v.literal("medium"),
          v.literal("high")
        ),
        confidence: v.number(),
        overallExplanation: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const digestId = await ctx.db.insert("digests", {
      repositoryId: args.repositoryId,
      eventId: args.eventId,
      title: args.title,
      summary: args.summary,
      category: args.category,
      contributors: args.contributors,
      metadata: args.metadata,
      aiModel: args.aiModel,
      whyThisMatters: args.whyThisMatters,
      impactAnalysis: args.impactAnalysis,
      createdAt: Date.now(),
    });

    // Trigger summary updates for this digest
    await ctx.scheduler.runAfter(0, internal.summaries.updateSummariesForDigest, {
      repositoryId: args.repositoryId,
      digestId,
      digestCreatedAt: Date.now(),
    });

    return digestId;
  },
});

export const update = internalMutation({
  args: {
    digestId: v.id("digests"),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
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
    whyThisMatters: v.optional(v.string()),
    impactAnalysis: v.optional(
      v.object({
        affectedSurfaces: v.array(
          v.object({
            surfaceId: v.id("codeSurfaces"),
            surfaceName: v.string(),
            impactType: v.union(
              v.literal("modified"),
              v.literal("added"),
              v.literal("deleted")
            ),
            riskLevel: v.union(
              v.literal("low"),
              v.literal("medium"),
              v.literal("high")
            ),
            confidence: v.number(),
            explanation: v.optional(v.string()),
          })
        ),
        overallRisk: v.union(
          v.literal("low"),
          v.literal("medium"),
          v.literal("high")
        ),
        confidence: v.number(),
        overallExplanation: v.optional(v.string()),
      })
    ),
    eventId: v.optional(v.id("events")),
    updateTimestamp: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const update: {
      title?: string;
      summary?: string;
      category?: "feature" | "bugfix" | "refactor" | "docs" | "chore" | "security";
      whyThisMatters?: string;
      impactAnalysis?: any;
      eventId?: Id<"events">;
      createdAt?: number;
    } = {};

    if (args.title !== undefined) {
      update.title = args.title;
    }
    if (args.summary !== undefined) {
      update.summary = args.summary;
    }
    if (args.category !== undefined) {
      update.category = args.category;
    }
    if (args.whyThisMatters !== undefined) {
      update.whyThisMatters = args.whyThisMatters;
    }
    if (args.impactAnalysis !== undefined) {
      update.impactAnalysis = args.impactAnalysis;
    }
    if (args.eventId !== undefined) {
      update.eventId = args.eventId;
    }
    // Update timestamp to move to top of feed
    if (args.updateTimestamp) {
      update.createdAt = Date.now();
    }

    await ctx.db.patch(args.digestId, update);
  },
});

export const listByRepository = query({
  args: {
    repositoryId: v.id("repositories"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    
    // Verify repository ownership before querying digests
    await verifyRepositoryOwnership(ctx, args.repositoryId, user._id);
    
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

export const listByRepositories = query({
  args: {
    repositoryIds: v.array(v.id("repositories")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    
    // Filter repositoryIds to only include those owned by the user
    const ownedRepositoryIds: Id<"repositories">[] = [];
    for (const repoId of args.repositoryIds) {
      try {
        await verifyRepositoryOwnership(ctx, repoId, user._id);
        ownedRepositoryIds.push(repoId);
      } catch {
        // Skip repositories the user doesn't own
        continue;
      }
    }
    
    if (ownedRepositoryIds.length === 0) {
      return [];
    }
    
    const limit = args.limit || 50;
    const allDigests = await Promise.all(
      ownedRepositoryIds.map((repoId) =>
        ctx.db
          .query("digests")
          .withIndex("by_repository_time", (q) => q.eq("repositoryId", repoId))
          .order("desc")
          .collect()
      )
    );
    const flattened = allDigests.flat();
    return flattened
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  },
});

export const getByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    
    // Get the event to check repository ownership
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new Error("Event not found");
    }
    
    // Verify the event belongs to a repository owned by the user
    await verifyRepositoryOwnership(ctx, event.repositoryId, user._id);
    
    return await ctx.db
      .query("digests")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .first();
  },
});

export const getById = internalQuery({
  args: { digestId: v.id("digests") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.digestId);
  },
});

export const createPerspective = internalMutation({
  args: {
    digestId: v.id("digests"),
    perspective: v.union(
      v.literal("bugfix"),
      v.literal("ui"),
      v.literal("feature"),
      v.literal("security"),
      v.literal("performance"),
      v.literal("refactor"),
      v.literal("docs")
    ),
    title: v.string(),
    summary: v.string(),
    confidence: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("digestPerspectives", {
      digestId: args.digestId,
      perspective: args.perspective,
      title: args.title,
      summary: args.summary,
      confidence: args.confidence,
      createdAt: Date.now(),
    });
  },
});

export const createPerspectivesBatch = internalMutation({
  args: {
    digestId: v.id("digests"),
    perspectives: v.array(
      v.object({
        perspective: v.union(
          v.literal("bugfix"),
          v.literal("ui"),
          v.literal("feature"),
          v.literal("security"),
          v.literal("performance"),
          v.literal("refactor"),
          v.literal("docs")
        ),
        title: v.string(),
        summary: v.string(),
        confidence: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ids = [];
    for (const perspective of args.perspectives) {
      const id = await ctx.db.insert("digestPerspectives", {
        digestId: args.digestId,
        perspective: perspective.perspective,
        title: perspective.title,
        summary: perspective.summary,
        confidence: perspective.confidence,
        createdAt: now,
      });
      ids.push(id);
    }
    return ids;
  },
});

export const getPerspectivesByDigest = query({
  args: { digestId: v.id("digests") },
  handler: async (ctx, args) => {
    const digest = await ctx.db.get(args.digestId);
    if (!digest) {
      return [];
    }

    // Verify repository ownership
    const user = await getCurrentUser(ctx);
    await verifyRepositoryOwnership(ctx, digest.repositoryId, user._id);

    return await ctx.db
      .query("digestPerspectives")
      .withIndex("by_digest", (q) => q.eq("digestId", args.digestId))
      .collect();
  },
});

export const getEventByDigest = query({
  args: { digestId: v.id("digests") },
  handler: async (ctx, args) => {
    const digest = await ctx.db.get(args.digestId);
    if (!digest) {
      return null;
    }

    // Verify repository ownership
    const user = await getCurrentUser(ctx);
    await verifyRepositoryOwnership(ctx, digest.repositoryId, user._id);

    return await ctx.db.get(digest.eventId);
  },
});
