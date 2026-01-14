import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ============ USERS ============
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    githubUsername: v.string(),
    avatarUrl: v.optional(v.string()),
    apiKeys: v.optional(
      v.object({
        openai: v.optional(v.string()),
        anthropic: v.optional(v.string()),
        openrouter: v.optional(v.string()),
        openrouterModel: v.optional(v.string()),
        preferredProvider: v.optional(
          v.union(v.literal("openai"), v.literal("anthropic"), v.literal("openrouter"))
        ),
      })
    ),
    lastVisitAt: v.optional(v.number()), // Track last visit for "while you were away" feature
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_github_username", ["githubUsername"]),

  // ============ REPOSITORIES ============
  repositories: defineTable({
    userId: v.id("users"),
    githubId: v.number(),
    githubInstallationId: v.number(),
    name: v.string(),
    fullName: v.string(),
    owner: v.string(),
    defaultBranch: v.optional(v.string()),
    isPrivate: v.boolean(),
    isActive: v.boolean(),
    lastSyncedAt: v.optional(v.number()),
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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_github_id", ["githubId"])
    .index("by_installation", ["githubInstallationId"])
    .index("by_index_status", ["indexStatus"]),

  // ============ EVENTS ============
  events: defineTable({
    repositoryId: v.id("repositories"),
    githubDeliveryId: v.string(),
    type: v.string(),
    action: v.optional(v.string()),
    payload: v.any(),
    actorGithubUsername: v.string(),
    actorGithubId: v.number(),
    actorAvatarUrl: v.optional(v.string()),
    occurredAt: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("skipped")
    ),
    errorMessage: v.optional(v.string()),
    processedAt: v.optional(v.number()),
    fileDiffs: v.optional(
      v.array(
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
      )
    ),
    createdAt: v.number(),
  })
    .index("by_repository", ["repositoryId"])
    .index("by_repository_time", ["repositoryId", "occurredAt"])
    .index("by_repository_status", ["repositoryId", "status"])
    .index("by_delivery_id", ["githubDeliveryId"]),

  // ============ DIGESTS ============
  digests: defineTable({
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
        affectedSurfaces: v.optional(v.array(v.any())), // Deprecated - kept for backward compatibility, will be removed
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
          confidence: v.number(), // 0-100
        })
      )
    ), // Perspectives are now stored directly on digest (no separate table needed)
    createdAt: v.number(),
  })
    .index("by_repository", ["repositoryId"])
    .index("by_repository_time", ["repositoryId", "createdAt"])
    .index("by_event", ["eventId"]),

  // ============ SUMMARIES ============
  summaries: defineTable({
    repositoryId: v.id("repositories"),
    period: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
    periodStart: v.number(), // UTC timestamp for period start
    periodEnd: v.optional(v.number()), // UTC timestamp for period end (NEW for timeline)
    headline: v.string(),
    accomplishments: v.string(), // Main body text
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
    // Stats for quick display in timeline (NEW)
    stats: v.optional(
      v.object({
        digestCount: v.number(),
      })
    ),
    includedDigestIds: v.array(v.id("digests")), // Tracks which digests are included
    // Streaming status for real-time updates during generation
    isStreaming: v.optional(v.boolean()),
    generatedAt: v.optional(v.number()), // When cron generated this (NEW for timeline)
    lastUpdatedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_repository_period", ["repositoryId", "period", "periodStart"])
    .index("by_repository_time", ["repositoryId", "periodStart"]),
});
