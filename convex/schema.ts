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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_github_id", ["githubId"])
    .index("by_installation", ["githubInstallationId"]),

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
    createdAt: v.number(),
  })
    .index("by_repository", ["repositoryId"])
    .index("by_repository_time", ["repositoryId", "createdAt"])
    .index("by_event", ["eventId"]),
});
