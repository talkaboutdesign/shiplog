import { query } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getCurrentUser, verifyRepositoryOwnership } from "./auth";
import {
  getDailyPeriodStart,
  type PeriodType,
} from "./lib/periodUtils";

/**
 * Get timeline context for "while you were away" feature
 * Returns appropriate summaries based on how long the user has been away
 */
export const getTimelineContext = query({
  args: {
    repositoryId: v.id("repositories"),
  },
  returns: v.object({
    lastVisitAt: v.number(),
    millisAway: v.number(),
    daysAway: v.number(),
    hoursAway: v.number(),
    summariesToShow: v.array(
      v.object({
        _id: v.id("summaries"),
        period: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
        periodStart: v.number(),
        periodEnd: v.optional(v.number()),
        headline: v.string(),
        accomplishments: v.string(),
        keyFeatures: v.array(v.string()),
        stats: v.optional(v.object({ digestCount: v.number() })),
        includedDigestIds: v.array(v.id("digests")),
        createdAt: v.number(),
      })
    ),
    todayDigestCount: v.number(),
    userName: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyRepositoryOwnership(ctx, args.repositoryId, user._id);

    const now = Date.now();
    const lastVisit = user.lastVisitAt || now; // First visit = now
    const millisAway = now - lastVisit;
    const hoursAway = Math.floor(millisAway / (1000 * 60 * 60));
    const daysAway = Math.floor(millisAway / (1000 * 60 * 60 * 24));

    // Fetch appropriate summaries based on time away
    let summariesToShow: Array<{
      _id: Id<"summaries">;
      period: PeriodType;
      periodStart: number;
      periodEnd?: number;
      headline: string;
      accomplishments: string;
      keyFeatures: string[];
      stats?: { digestCount: number };
      includedDigestIds: Id<"digests">[];
      createdAt: number;
    }> = [];

    if (daysAway >= 14) {
      // Show weekly + monthly summaries
      const weeklySummaries = await ctx.db
        .query("summaries")
        .withIndex("by_repository_time", (q) => q.eq("repositoryId", args.repositoryId))
        .filter((q) => q.eq(q.field("period"), "weekly"))
        .order("desc")
        .take(2);

      const monthlySummaries = await ctx.db
        .query("summaries")
        .withIndex("by_repository_time", (q) => q.eq("repositoryId", args.repositoryId))
        .filter((q) => q.eq(q.field("period"), "monthly"))
        .order("desc")
        .take(1);

      summariesToShow = [...weeklySummaries, ...monthlySummaries].map(mapSummary);
    } else if (daysAway >= 7) {
      // Show weekly summaries
      const weeklySummaries = await ctx.db
        .query("summaries")
        .withIndex("by_repository_time", (q) => q.eq("repositoryId", args.repositoryId))
        .filter((q) => q.eq(q.field("period"), "weekly"))
        .order("desc")
        .take(2);

      summariesToShow = weeklySummaries.map(mapSummary);
    } else if (daysAway >= 1) {
      // Show daily summaries for missed days
      const dailySummaries = await ctx.db
        .query("summaries")
        .withIndex("by_repository_time", (q) => q.eq("repositoryId", args.repositoryId))
        .filter((q) =>
          q.and(
            q.eq(q.field("period"), "daily"),
            q.gte(q.field("periodStart"), lastVisit - 24 * 60 * 60 * 1000) // A day before last visit
          )
        )
        .order("desc")
        .take(7); // Max 7 daily summaries

      summariesToShow = dailySummaries.map(mapSummary);
    }
    // daysAway < 1: no summaries needed, just show feed

    // Count today's digests
    const todayStart = getDailyPeriodStart(now);
    const todayDigests = await ctx.db
      .query("digests")
      .withIndex("by_repository_time", (q) => q.eq("repositoryId", args.repositoryId))
      .filter((q) => q.gte(q.field("createdAt"), todayStart))
      .take(100);

    return {
      lastVisitAt: lastVisit,
      millisAway,
      hoursAway,
      daysAway,
      summariesToShow,
      todayDigestCount: todayDigests.length,
      userName: user.githubUsername || undefined,
    };
  },
});

/**
 * Map summary document to timeline format
 */
function mapSummary(summary: Doc<"summaries">) {
  return {
    _id: summary._id,
    period: summary.period,
    periodStart: summary.periodStart,
    periodEnd: summary.periodEnd,
    headline: summary.headline,
    accomplishments: summary.accomplishments,
    keyFeatures: summary.keyFeatures,
    stats: summary.stats,
    includedDigestIds: summary.includedDigestIds,
    createdAt: summary.createdAt,
  };
}

/**
 * Get today's feed with cursor-based pagination
 * Initially shows only today's digests, load more goes into history
 */
export const getTodayFeed = query({
  args: {
    repositoryId: v.id("repositories"),
    cursor: v.optional(v.number()), // createdAt of last item
    limit: v.optional(v.number()), // default 10
  },
  returns: v.object({
    digests: v.array(
      v.object({
        _id: v.id("digests"),
        repositoryId: v.id("repositories"),
        eventId: v.optional(v.id("events")),
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
            eventType: v.optional(v.string()),
          })
        ),
        whyThisMatters: v.optional(v.string()),
        impactAnalysis: v.optional(
          v.object({
            affectedSurfaces: v.optional(v.array(v.any())),
            overallRisk: v.union(
              v.literal("low"),
              v.literal("medium"),
              v.literal("high")
            ),
            confidence: v.number(),
            overallExplanation: v.optional(v.string()),
          })
        ),
        perspectives: v.optional(
          v.array(
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
          )
        ),
        createdAt: v.number(),
      })
    ),
    hasMore: v.boolean(),
    nextCursor: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyRepositoryOwnership(ctx, args.repositoryId, user._id);

    const limit = args.limit || 10;

    // Build query
    let digestQuery = ctx.db
      .query("digests")
      .withIndex("by_repository_time", (q) => q.eq("repositoryId", args.repositoryId))
      .order("desc");

    // Apply cursor filter if provided
    if (args.cursor !== undefined) {
      const cursorValue = args.cursor;
      digestQuery = digestQuery.filter((q) => q.lt(q.field("createdAt"), cursorValue));
    }

    // Fetch one extra to check if there are more
    const digests = await digestQuery.take(limit + 1);

    const hasMore = digests.length > limit;
    const returnDigests = hasMore ? digests.slice(0, limit) : digests;

    // Map to return schema
    const mappedDigests = returnDigests.map((d) => ({
      _id: d._id,
      repositoryId: d.repositoryId,
      eventId: d.eventId,
      title: d.title,
      summary: d.summary,
      category: d.category,
      contributors: d.contributors,
      metadata: d.metadata,
      whyThisMatters: d.whyThisMatters,
      impactAnalysis: d.impactAnalysis,
      perspectives: d.perspectives,
      createdAt: d.createdAt,
    }));

    return {
      digests: mappedDigests,
      hasMore,
      nextCursor: hasMore && returnDigests.length > 0
        ? returnDigests[returnDigests.length - 1].createdAt
        : undefined,
    };
  },
});

/**
 * Get summary with its digests for expanded view
 */
export const getSummaryWithDigests = query({
  args: {
    summaryId: v.id("summaries"),
  },
  returns: v.object({
    summary: v.object({
      _id: v.id("summaries"),
      period: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
      periodStart: v.number(),
      periodEnd: v.optional(v.number()),
      headline: v.string(),
      accomplishments: v.string(),
      keyFeatures: v.array(v.string()),
      stats: v.optional(v.object({ digestCount: v.number() })),
      includedDigestIds: v.array(v.id("digests")),
      createdAt: v.number(),
    }),
    digests: v.array(
      v.object({
        _id: v.id("digests"),
        repositoryId: v.id("repositories"),
        eventId: v.optional(v.id("events")),
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
            eventType: v.optional(v.string()),
          })
        ),
        whyThisMatters: v.optional(v.string()),
        perspectives: v.optional(
          v.array(
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
          )
        ),
        createdAt: v.number(),
      })
    ),
  }),
  handler: async (ctx, args) => {
    const summary = await ctx.db.get(args.summaryId);
    if (!summary) {
      throw new Error("Summary not found");
    }

    // Verify ownership
    const user = await getCurrentUser(ctx);
    await verifyRepositoryOwnership(ctx, summary.repositoryId, user._id);

    // Fetch the digests included in this summary
    const digestPromises = summary.includedDigestIds.map((id) => ctx.db.get(id));
    const digestResults = await Promise.all(digestPromises);
    const digests = digestResults
      .filter((d): d is Doc<"digests"> => d !== null)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((d) => ({
        _id: d._id,
        repositoryId: d.repositoryId,
        eventId: d.eventId,
        title: d.title,
        summary: d.summary,
        category: d.category,
        contributors: d.contributors,
        metadata: d.metadata,
        whyThisMatters: d.whyThisMatters,
        perspectives: d.perspectives,
        createdAt: d.createdAt,
      }));

    return {
      summary: {
        _id: summary._id,
        period: summary.period,
        periodStart: summary.periodStart,
        periodEnd: summary.periodEnd,
        headline: summary.headline,
        accomplishments: summary.accomplishments,
        keyFeatures: summary.keyFeatures,
        stats: summary.stats,
        includedDigestIds: summary.includedDigestIds,
        createdAt: summary.createdAt,
      },
      digests,
    };
  },
});

/**
 * Get recent summaries for a repository (for timeline display)
 */
export const getRecentSummaries = query({
  args: {
    repositoryId: v.id("repositories"),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("summaries"),
      period: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
      periodStart: v.number(),
      periodEnd: v.optional(v.number()),
      headline: v.string(),
      accomplishments: v.string(),
      keyFeatures: v.array(v.string()),
      stats: v.optional(v.object({ digestCount: v.number() })),
      includedDigestIds: v.array(v.id("digests")),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyRepositoryOwnership(ctx, args.repositoryId, user._id);

    const limit = args.limit || 10;

    const summaries = await ctx.db
      .query("summaries")
      .withIndex("by_repository_time", (q) => q.eq("repositoryId", args.repositoryId))
      .order("desc")
      .take(limit);

    return summaries.map(mapSummary);
  },
});
