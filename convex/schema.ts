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
        issueNumber: v.optional(v.number()),
        issueUrl: v.optional(v.string()),
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
            explanation: v.string(),
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
    createdAt: v.number(),
  })
    .index("by_repository", ["repositoryId"])
    .index("by_repository_time", ["repositoryId", "createdAt"])
    .index("by_event", ["eventId"]),

  // ============ CODE SURFACES ============
  codeSurfaces: defineTable({
    repositoryId: v.id("repositories"),
    filePath: v.string(),
    surfaceType: v.union(
      v.literal("component"),
      v.literal("service"),
      v.literal("utility"),
      v.literal("hook"),
      v.literal("type"),
      v.literal("config"),
      v.literal("other")
    ),
    name: v.string(),
    dependencies: v.array(v.string()), // Array of file paths this surface depends on
    exports: v.optional(v.array(v.string())), // Exported names from this file
    lastSeenAt: v.number(),
    indexedAt: v.number(),
  })
    .index("by_repository", ["repositoryId"])
    .index("by_repository_path", ["repositoryId", "filePath"])
    .index("by_repository_type", ["repositoryId", "surfaceType"]),

  // ============ SURFACE IMPACTS ============
  surfaceImpacts: defineTable({
    eventId: v.id("events"),
    surfaceId: v.id("codeSurfaces"),
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
    confidence: v.number(), // 0-100
  })
    .index("by_event", ["eventId"])
    .index("by_surface", ["surfaceId"]),

  // ============ DIGEST PERSPECTIVES ============
  digestPerspectives: defineTable({
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
    confidence: v.number(), // 0-100
    createdAt: v.number(),
  })
    .index("by_digest", ["digestId"])
    .index("by_digest_perspective", ["digestId", "perspective"]),
});
