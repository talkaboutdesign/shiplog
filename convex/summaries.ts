import { query, internalMutation, internalQuery, internalAction, action } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, verifyRepositoryOwnership } from "./auth";
import { Id, Doc } from "./_generated/dataModel";
import { internal, api } from "./_generated/api";
import {
  getPeriodForTimestamp,
  getPeriodEnd,
  type PeriodType,
} from "./lib/periodUtils";

/**
 * Get summary for a repository, period, and period start
 */
export const getSummary = query({
  args: {
    repositoryId: v.id("repositories"),
    period: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
    periodStart: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyRepositoryOwnership(ctx, args.repositoryId, user._id);

    return await ctx.db
      .query("summaries")
      .withIndex("by_repository_period", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("period", args.period)
          .eq("periodStart", args.periodStart)
      )
      .first();
  },
});

/**
 * Get current summaries (daily, weekly, monthly) for a repository
 */
export const getCurrentSummaries = query({
  args: {
    repositoryId: v.id("repositories"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyRepositoryOwnership(ctx, args.repositoryId, user._id);

    const now = Date.now();
    const periods: PeriodType[] = ["daily", "weekly", "monthly"];

    const summaries = await Promise.all(
      periods.map(async (period) => {
        const periodStart = getPeriodForTimestamp(now, period);
        return await ctx.db
          .query("summaries")
          .withIndex("by_repository_period", (q) =>
            q
              .eq("repositoryId", args.repositoryId)
              .eq("period", period)
              .eq("periodStart", periodStart)
          )
          .first();
      })
    );

    return {
      daily: summaries[0] || null,
      weekly: summaries[1] || null,
      monthly: summaries[2] || null,
    };
  },
});

/**
 * Internal mutation to create a new summary
 */
export const create = internalMutation({
  args: {
    repositoryId: v.id("repositories"),
    period: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
    periodStart: v.number(),
    headline: v.string(),
    accomplishments: v.string(),
    keyFeatures: v.array(v.string()),
    workBreakdown: v.object({
      bugfix: v.optional(v.object({ percentage: v.number(), count: v.number() })),
      feature: v.optional(v.object({ percentage: v.number(), count: v.number() })),
      refactor: v.optional(v.object({ percentage: v.number(), count: v.number() })),
      docs: v.optional(v.object({ percentage: v.number(), count: v.number() })),
      chore: v.optional(v.object({ percentage: v.number(), count: v.number() })),
      security: v.optional(v.object({ percentage: v.number(), count: v.number() })),
    }),
    metrics: v.optional(
      v.object({
        totalItems: v.number(),
        averageDeploymentTime: v.optional(v.number()),
        productionIncidents: v.optional(v.number()),
        testCoverage: v.optional(v.number()),
      })
    ),
    includedDigestIds: v.array(v.id("digests")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("summaries", {
      repositoryId: args.repositoryId,
      period: args.period,
      periodStart: args.periodStart,
      headline: args.headline,
      accomplishments: args.accomplishments,
      keyFeatures: args.keyFeatures,
      workBreakdown: args.workBreakdown,
      metrics: args.metrics,
      includedDigestIds: args.includedDigestIds,
      lastUpdatedAt: now,
      createdAt: now,
    });
  },
});

/**
 * Internal mutation to update an existing summary
 */
export const update = internalMutation({
  args: {
    summaryId: v.id("summaries"),
    headline: v.optional(v.string()),
    accomplishments: v.optional(v.string()),
    keyFeatures: v.optional(v.array(v.string())),
    workBreakdown: v.optional(
      v.object({
        bugfix: v.optional(v.object({ percentage: v.number(), count: v.number() })),
        feature: v.optional(v.object({ percentage: v.number(), count: v.number() })),
        refactor: v.optional(v.object({ percentage: v.number(), count: v.number() })),
        docs: v.optional(v.object({ percentage: v.number(), count: v.number() })),
        chore: v.optional(v.object({ percentage: v.number(), count: v.number() })),
        security: v.optional(v.object({ percentage: v.number(), count: v.number() })),
      })
    ),
    metrics: v.optional(
      v.object({
        totalItems: v.number(),
        averageDeploymentTime: v.optional(v.number()),
        productionIncidents: v.optional(v.number()),
        testCoverage: v.optional(v.number()),
      })
    ),
    includedDigestIds: v.optional(v.array(v.id("digests"))),
  },
  handler: async (ctx, args) => {
    const updateData: {
      headline?: string;
      accomplishments?: string;
      keyFeatures?: string[];
      workBreakdown?: any;
      metrics?: any;
      includedDigestIds?: Id<"digests">[];
      lastUpdatedAt: number;
    } = {
      lastUpdatedAt: Date.now(),
    };

    if (args.headline !== undefined) updateData.headline = args.headline;
    if (args.accomplishments !== undefined) updateData.accomplishments = args.accomplishments;
    if (args.keyFeatures !== undefined) updateData.keyFeatures = args.keyFeatures;
    if (args.workBreakdown !== undefined) updateData.workBreakdown = args.workBreakdown;
    if (args.metrics !== undefined) updateData.metrics = args.metrics;
    if (args.includedDigestIds !== undefined) updateData.includedDigestIds = args.includedDigestIds;

    await ctx.db.patch(args.summaryId, updateData);
  },
});

/**
 * Create a placeholder summary for streaming generation
 */
export const createForStreaming = internalMutation({
  args: {
    repositoryId: v.id("repositories"),
    period: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
    periodStart: v.number(),
    includedDigestIds: v.array(v.id("digests")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("summaries", {
      repositoryId: args.repositoryId,
      period: args.period,
      periodStart: args.periodStart,
      headline: "Generating summary...",
      accomplishments: "",
      keyFeatures: [],
      workBreakdown: {},
      metrics: { totalItems: args.includedDigestIds.length },
      includedDigestIds: args.includedDigestIds,
      isStreaming: true,
      lastUpdatedAt: now,
      createdAt: now,
    });
  },
});

/**
 * Update summary during streaming (partial updates)
 */
export const updateStreaming = internalMutation({
  args: {
    summaryId: v.id("summaries"),
    headline: v.optional(v.string()),
    accomplishments: v.optional(v.string()),
    keyFeatures: v.optional(v.array(v.string())),
    workBreakdown: v.optional(
      v.object({
        bugfix: v.optional(v.object({ percentage: v.number(), count: v.number() })),
        feature: v.optional(v.object({ percentage: v.number(), count: v.number() })),
        refactor: v.optional(v.object({ percentage: v.number(), count: v.number() })),
        docs: v.optional(v.object({ percentage: v.number(), count: v.number() })),
        chore: v.optional(v.object({ percentage: v.number(), count: v.number() })),
        security: v.optional(v.object({ percentage: v.number(), count: v.number() })),
      })
    ),
    metrics: v.optional(
      v.object({
        totalItems: v.number(),
        averageDeploymentTime: v.optional(v.number()),
        productionIncidents: v.optional(v.number()),
        testCoverage: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { summaryId, ...updates } = args;
    const filteredUpdates: Record<string, unknown> = { lastUpdatedAt: Date.now() };

    if (updates.headline !== undefined) filteredUpdates.headline = updates.headline;
    if (updates.accomplishments !== undefined) filteredUpdates.accomplishments = updates.accomplishments;
    if (updates.keyFeatures !== undefined) filteredUpdates.keyFeatures = updates.keyFeatures;
    if (updates.workBreakdown !== undefined) filteredUpdates.workBreakdown = updates.workBreakdown;
    if (updates.metrics !== undefined) filteredUpdates.metrics = updates.metrics;

    await ctx.db.patch(summaryId, filteredUpdates);
  },
});

/**
 * Mark streaming as finished
 */
export const finishStreaming = internalMutation({
  args: {
    summaryId: v.id("summaries"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.summaryId, {
      isStreaming: false,
      lastUpdatedAt: Date.now(),
    });
  },
});

/**
 * Mark streaming as finished and add new digest IDs
 */
export const finishStreamingWithDigests = internalMutation({
  args: {
    summaryId: v.id("summaries"),
    newDigestIds: v.array(v.id("digests")),
  },
  handler: async (ctx, args) => {
    const summary = await ctx.db.get(args.summaryId);
    if (!summary) {
      throw new Error("Summary not found");
    }

    const updatedDigestIds = [...summary.includedDigestIds, ...args.newDigestIds];

    await ctx.db.patch(args.summaryId, {
      includedDigestIds: updatedDigestIds,
      isStreaming: false,
      lastUpdatedAt: Date.now(),
    });
  },
});

/**
 * Start streaming for an existing summary (when updating with new digests)
 */
export const startStreaming = internalMutation({
  args: {
    summaryId: v.id("summaries"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.summaryId, {
      isStreaming: true,
      lastUpdatedAt: Date.now(),
    });
  },
});

/**
 * Internal query to get a summary by ID
 */
export const getById = internalQuery({
  args: {
    summaryId: v.id("summaries"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.summaryId);
  },
});

/**
 * Internal query to get summary by repository, period, and period start
 */
export const getByRepositoryPeriod = internalQuery({
  args: {
    repositoryId: v.id("repositories"),
    period: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
    periodStart: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("summaries")
      .withIndex("by_repository_period", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("period", args.period)
          .eq("periodStart", args.periodStart)
      )
      .first();
  },
});

/**
 * Internal query to get digests for a repository (no auth check)
 */
export const getDigestsForRepository = internalQuery({
  args: {
    repositoryId: v.id("repositories"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 1000;
    return await ctx.db
      .query("digests")
      .withIndex("by_repository_time", (q) =>
        q.eq("repositoryId", args.repositoryId)
      )
      .order("desc")
      .take(limit);
  },
});

/**
 * Internal action to get digests for a period
 */
export const getDigestsForPeriod = internalAction({
  args: {
    repositoryId: v.id("repositories"),
    periodStart: v.number(),
    period: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
  },
  handler: async (ctx, args): Promise<Doc<"digests">[]> => {
    const periodEnd = getPeriodEnd(args.periodStart, args.period);
    
    // Get all digests for the repository
    const digests = await ctx.runQuery(internal.summaries.getDigestsForRepository, {
      repositoryId: args.repositoryId,
      limit: 1000,
    });

    // Filter digests that fall within the period
    const filteredDigests = digests.filter(
      (digest: Doc<"digests">) => digest.createdAt >= args.periodStart && digest.createdAt < periodEnd
    );

    return filteredDigests;
  },
});

/**
 * Internal action to update summaries when a new digest is created
 * This is called automatically when a digest is created
 */
export const updateSummariesForDigest = internalAction({
  args: {
    repositoryId: v.id("repositories"),
    digestId: v.id("digests"),
    digestCreatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const periods: PeriodType[] = ["daily", "weekly", "monthly"];
    const now = Date.now();

    // For each period, check if a summary exists for the current period
    for (const period of periods) {
      const periodStart = getPeriodForTimestamp(args.digestCreatedAt, period);
      const periodEnd = getPeriodEnd(periodStart, period);

      // Only update summaries for the current period (not old periods)
      if (periodEnd <= now) {
        // This is an old period, skip it
        continue;
      }

      // Check if summary exists
      const existingSummary = await ctx.runQuery(internal.summaries.getByRepositoryPeriod, {
        repositoryId: args.repositoryId,
        period,
        periodStart,
      });

      if (existingSummary) {
        // Summary exists, update it incrementally
        try {
          // Generate updated summary using AI
          const updatedSummary = await ctx.runAction(internal.summariesAi.updateSummaryWithDigest, {
            summaryId: existingSummary._id,
            digestId: args.digestId,
          });

          // Update the summary in database
          await ctx.runMutation(internal.summaries.update, {
            summaryId: existingSummary._id,
            headline: updatedSummary.headline,
            accomplishments: updatedSummary.accomplishments,
            keyFeatures: updatedSummary.keyFeatures,
            workBreakdown: updatedSummary.workBreakdown,
            metrics: updatedSummary.metrics,
            includedDigestIds: [...existingSummary.includedDigestIds, args.digestId],
          });
        } catch (error) {
          console.error(`Error updating ${period} summary:`, error);
          // Continue with other periods even if one fails
        }
      }
      // If summary doesn't exist, skip (will be generated on-demand when first accessed)
    }
  },
});

/**
 * Internal action to generate a summary on-demand (when first accessed)
 */
export const generateSummaryOnDemand = internalAction({
  args: {
    repositoryId: v.id("repositories"),
    period: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
    periodStart: v.number(),
  },
  handler: async (ctx, args): Promise<Doc<"summaries"> | null> => {
    // Check if summary already exists (race condition check)
    const existing = await ctx.runQuery(internal.summaries.getByRepositoryPeriod, {
      repositoryId: args.repositoryId,
      period: args.period,
      periodStart: args.periodStart,
    });

    if (existing) {
      return existing;
    }

    // Get all digests for the period
    const digests = await ctx.runAction(internal.summaries.getDigestsForPeriod, {
      repositoryId: args.repositoryId,
      periodStart: args.periodStart,
      period: args.period,
    });

    if (digests.length === 0) {
      // No digests, don't create a summary
      return null;
    }

    const digestIds = digests.map((d: Doc<"digests">) => d._id);

    // Create placeholder summary for streaming
    const summaryId = await ctx.runMutation(internal.summaries.createForStreaming, {
      repositoryId: args.repositoryId,
      period: args.period,
      periodStart: args.periodStart,
      includedDigestIds: digestIds,
    });

    // Start streaming generation (this will update the summary progressively)
    await ctx.runAction(internal.summariesAi.generateSummaryStreaming, {
      summaryId,
      repositoryId: args.repositoryId,
      period: args.period,
      periodStart: args.periodStart,
      digestIds,
    });

    // Return the completed summary
    const created = await ctx.runQuery(internal.summaries.getById, { summaryId });
    if (!created) {
      throw new Error("Failed to create summary");
    }
    return created;
  },
});

/**
 * Get summary status for a repository and period
 * Returns the summary (if exists), digest count for period, and whether update is needed
 */
export const getSummaryStatus = query({
  args: {
    repositoryId: v.id("repositories"),
    period: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
    periodStart: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyRepositoryOwnership(ctx, args.repositoryId, user._id);

    // Get existing summary
    const summary = await ctx.db
      .query("summaries")
      .withIndex("by_repository_period", (q) =>
        q
          .eq("repositoryId", args.repositoryId)
          .eq("period", args.period)
          .eq("periodStart", args.periodStart)
      )
      .first();

    // Get digests for this period
    const periodEnd = getPeriodEnd(args.periodStart, args.period);
    const allDigests = await ctx.db
      .query("digests")
      .withIndex("by_repository_time", (q) =>
        q.eq("repositoryId", args.repositoryId)
      )
      .collect();

    // Filter to digests in this period
    const digestsInPeriod = allDigests.filter(
      (d) => d.createdAt >= args.periodStart && d.createdAt < periodEnd
    );

    const digestCount = digestsInPeriod.length;
    const includedCount = summary?.includedDigestIds?.length || 0;
    const hasNewDigests = digestCount > includedCount;

    return {
      summary,
      digestCount,
      includedCount,
      hasNewDigests,
      needsGeneration: summary === null && digestCount > 0,
      needsUpdate: summary !== null && hasNewDigests,
    };
  },
});

/**
 * Public action to update an existing summary with new digests
 */
export const updateSummaryPublic = action({
  args: {
    repositoryId: v.id("repositories"),
    period: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
    periodStart: v.number(),
  },
  handler: async (ctx, args): Promise<Doc<"summaries"> | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.runQuery(api.users.getCurrent);
    if (!user) {
      throw new Error("User not found");
    }

    // Verify repository ownership
    const repository = await ctx.runQuery(internal.repositories.getById, {
      repositoryId: args.repositoryId,
    });
    if (!repository) {
      throw new Error("Repository not found");
    }
    if (repository.userId !== user._id) {
      throw new Error("Repository not authorized");
    }

    // Get existing summary
    const existingSummary = await ctx.runQuery(internal.summaries.getByRepositoryPeriod, {
      repositoryId: args.repositoryId,
      period: args.period,
      periodStart: args.periodStart,
    });

    if (!existingSummary) {
      // No summary exists, generate new one with streaming
      return await ctx.runAction(internal.summaries.generateSummaryOnDemand, {
        repositoryId: args.repositoryId,
        period: args.period,
        periodStart: args.periodStart,
      });
    }

    // Get digests for this period that aren't included
    const periodDigests = await ctx.runAction(internal.summaries.getDigestsForPeriod, {
      repositoryId: args.repositoryId,
      periodStart: args.periodStart,
      period: args.period,
    });

    const includedIds = new Set(existingSummary.includedDigestIds);
    const newDigests = periodDigests.filter((d: Doc<"digests">) => !includedIds.has(d._id));

    if (newDigests.length === 0) {
      // No new digests, return existing summary
      return existingSummary;
    }

    const newDigestIds = newDigests.map((d: Doc<"digests">) => d._id);

    // Mark summary as streaming
    await ctx.runMutation(internal.summaries.startStreaming, {
      summaryId: existingSummary._id,
    });

    // Update summary with streaming (processes all new digests at once)
    await ctx.runAction(internal.summariesAi.updateSummaryStreaming, {
      summaryId: existingSummary._id,
      newDigestIds,
    });

    // Return the updated summary
    const updated = await ctx.runQuery(internal.summaries.getById, {
      summaryId: existingSummary._id,
    });

    return updated;
  },
});

/**
 * Public action to generate summary on-demand (called from frontend)
 */
export const generateSummaryOnDemandPublic = action({
  args: {
    repositoryId: v.id("repositories"),
    period: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
    periodStart: v.number(),
  },
  handler: async (ctx, args): Promise<Doc<"summaries"> | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const user = await ctx.runQuery(api.users.getCurrent);
    if (!user) {
      throw new Error("User not found");
    }

    // Verify repository ownership - get repository and check user owns it
    const repository = await ctx.runQuery(internal.repositories.getById, {
      repositoryId: args.repositoryId,
    });
    if (!repository) {
      throw new Error("Repository not found");
    }
    if (repository.userId !== user._id) {
      throw new Error("Repository not authorized");
    }

    // Call internal action
    return await ctx.runAction(internal.summaries.generateSummaryOnDemand, {
      repositoryId: args.repositoryId,
      period: args.period,
      periodStart: args.periodStart,
    });
  },
});
