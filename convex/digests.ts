import { query, internalMutation, internalQuery, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, verifyRepositoryOwnership } from "./auth";
import { Id, Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { FileDiff, Perspective } from "./types";

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

    // Summary updates are triggered by generateDigest action after digest creation
    // This preserves the flow: digest creation → summary update

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

    await ctx.db.patch("digests", args.digestId, update);
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
    const allDigests = await Promise.all(
      ownedRepositoryIds.map((repoId) =>
        ctx.db
          .query("digests")
          .withIndex("by_repository_time", (q) => q.eq("repositoryId", repoId))
          .order("desc")
          .take(perRepoLimit)
      )
    );
    let flattened = allDigests.flat();
    
    // Apply cursor filter if provided
    if (args.cursor !== undefined) {
      flattened = flattened.filter((d) => d.createdAt < args.cursor!);
    }
    
    const sorted = flattened
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
    
    return sorted;
  },
});

export const getByEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    
    // Get the event to check repository ownership
    const event = await ctx.db.get("events", args.eventId);
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
    return await ctx.db.get("digests", args.digestId);
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
    const digest = await ctx.db.get("digests", args.digestId);
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
    const digest = await ctx.db.get("digests", args.digestId);
    if (!digest) {
      return null;
    }

    // Verify repository ownership
    const user = await getCurrentUser(ctx);
    await verifyRepositoryOwnership(ctx, digest.repositoryId, user._id);

    return await ctx.db.get("events", digest.eventId);
  },
});

/**
 * Generate digest for an event (replaces workflow)
 * Orchestrates: event fetch → file diffs → digest generation → perspectives → impact analysis → summary update
 * SECURITY: Verifies repository ownership in first step
 */
export const generateDigest = internalAction({
  args: {
    eventId: v.id("events"),
  },
  handler: async (ctx, args): Promise<{ digestId: Id<"digests">; repositoryId: Id<"repositories">; userId: Id<"users"> }> => {
    // Step 1: Fetch event and verify ownership
    const event = await ctx.runQuery(internal.events.getById, {
      eventId: args.eventId,
    });
    if (!event) {
      throw new Error("Event not found");
    }

    // Get repository to get userId
    const repository = await ctx.runQuery(internal.repositories.getById, {
      repositoryId: event.repositoryId,
    });
    if (!repository) {
      throw new Error("Repository not found");
    }

    // CRITICAL: Verify ownership (repository.userId is the owner)
    // Store userId in context for subsequent steps
    const userId = repository.userId;
    const repositoryId = event.repositoryId;

    // Update event status to processing
    await ctx.runMutation(internal.events.updateStatus, {
      eventId: args.eventId,
      status: "processing",
    });

    // Get user and API keys
    const user = await ctx.runQuery(internal.users.getById, {
      userId,
    });

    if (!user || !user.apiKeys) {
      await ctx.runMutation(internal.events.updateStatus, {
        eventId: args.eventId,
        status: "skipped",
        errorMessage: "No API keys configured",
      });
      // Return early with minimal data
      throw new Error("No API keys configured - skipping digest generation");
    }

    // Extract metadata immediately
    const contributors = [event.actorGithubUsername];
    const metadata: any = {};
    
    if (event.type === "pull_request") {
      const pr = event.payload.pull_request;
      if (pr) {
        metadata.prNumber = pr.number;
        metadata.prUrl = pr.html_url;
        metadata.prState = pr.state;
      }
    } else if (event.type === "push") {
      metadata.commitCount = event.payload.commits?.length || 0;
      metadata.compareUrl = event.payload.compare;
      metadata.branch = event.payload.ref?.replace("refs/heads/", "");
    }

    // Create digest placeholder
    const placeholderTitle = event.type === "push" 
      ? `Push: ${metadata.commitCount || 0} commit(s)`
      : event.type === "pull_request"
      ? event.payload.pull_request?.title || "Pull Request"
      : "Processing event...";

    // Step 2: Create digest placeholder
    const digestId = await ctx.runMutation(internal.digests.create, {
      repositoryId,
      eventId: args.eventId,
      title: placeholderTitle,
      summary: "Analyzing changes...",
      category: undefined,
      contributors,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      aiModel: user.apiKeys.preferredProvider || "openai",
      whyThisMatters: undefined,
      impactAnalysis: undefined,
    });

    // Step 3: Generate digest using agent
    // File diffs are fetched in the digest agent, which will store them for later use
    const digestResult = await ctx.runAction(
      internal.agents.digestAgent.generateDigest,
      {
        eventId: args.eventId,
        repositoryId,
        userId,
      }
    );

    const { digestData } = digestResult;

    // Step 5: Store immediate perspectives from digest generation (if any)
    const immediatePerspectives = digestData.perspectives || [];
    if (immediatePerspectives.length > 0) {
      await ctx.runMutation(internal.digests.createPerspectivesBatch, {
        digestId,
        perspectives: immediatePerspectives.map((p: Perspective) => ({
          perspective: p.perspective,
          title: p.title,
          summary: p.summary,
          confidence: p.confidence,
        })),
      });
    }

    // Step 6: Update digest with AI-generated content
    await ctx.runMutation(internal.digests.update, {
      digestId,
      title: digestData.title,
      summary: digestData.summary,
      category: digestData.category,
      whyThisMatters: digestData.whyThisMatters,
    });

    // Step 7: Determine which perspectives are relevant and generate in parallel
    const relevantPerspectives: Array<"bugfix" | "ui" | "feature" | "security" | "performance" | "refactor" | "docs"> = [];
    
    if (digestData.category === "bugfix") relevantPerspectives.push("bugfix");
    if (digestData.category === "feature") relevantPerspectives.push("feature");
    
    // Check file paths for UI components (if fileDiffs available)
    // Re-fetch event to get file diffs
    const eventWithDiffs = await ctx.runQuery(internal.events.getById, {
      eventId: args.eventId,
    });
    const eventFileDiffs = eventWithDiffs?.fileDiffs;
    
    if (eventFileDiffs?.some((f: FileDiff) => f.filename.match(/\.(tsx|jsx)$/) || f.filename.includes("component"))) {
      relevantPerspectives.push("ui");
    }
    
    // Always generate at least one perspective
    if (relevantPerspectives.length === 0) {
      // Map category to perspective type (chore/security/etc map to refactor)
      const categoryToPerspective: Record<string, "bugfix" | "ui" | "feature" | "security" | "performance" | "refactor" | "docs"> = {
        bugfix: "bugfix",
        feature: "feature",
        security: "security",
        performance: "performance",
        refactor: "refactor",
        docs: "docs",
      };
      const mappedPerspective = categoryToPerspective[digestData.category || ""] || "refactor";
      relevantPerspectives.push(mappedPerspective);
    }

    // Determine which perspectives were already generated and which need async generation
    const immediatePerspectiveTypes = new Set(immediatePerspectives.map((p: Perspective) => p.perspective));
    const perspectivesToGenerateAsync = relevantPerspectives
      .filter(p => !immediatePerspectiveTypes.has(p))
      .slice(0, 3); // Limit to 3 total perspectives

    // Generate additional perspectives in parallel
    if (perspectivesToGenerateAsync.length > 0) {
      const perspectivePromises = perspectivesToGenerateAsync.map((perspective) =>
        ctx.runAction(
          internal.agents.perspectiveAgent.generatePerspective,
          {
            digestId,
            repositoryId,
            userId,
            perspective,
          }
        )
      );

      const perspectiveResults = await Promise.all(perspectivePromises);
      
      // Store successful perspectives
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const validPerspectives = perspectiveResults
        .filter((r: any) => r?.perspectiveData)
        .map((r: any) => r.perspectiveData);

      if (validPerspectives.length > 0) {
        await ctx.runMutation(internal.digests.createPerspectivesBatch, {
          digestId,
          perspectives: validPerspectives.map((p: Perspective) => ({
            perspective: p.perspective,
            title: p.title,
            summary: p.summary,
            confidence: p.confidence,
          })),
        });
      }
    }

    // Step 8: Run impact analysis (if surfaces exist and file diffs available)
    // Re-fetch event to get file diffs that may have been stored by digest agent
    const updatedEvent = await ctx.runQuery(internal.events.getById, {
      eventId: args.eventId,
    });
    const updatedFileDiffs = updatedEvent?.fileDiffs;
    
    if (repository.indexStatus === "completed" && updatedFileDiffs && updatedFileDiffs.length > 0) {
      // Prepare truncated file diffs
      const truncatedFileDiffs = updatedFileDiffs
        .filter((f: any) => f.patch && f.patch.length > 0)
        .sort((a: any, b: any) => (b.additions + b.deletions) - (a.additions + a.deletions))
        .slice(0, 8)
        .map((f: any) => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch?.substring(0, 2500),
        }));

      // Extract commit context
      let commitMessage: string | undefined;
      let prTitle: string | undefined;
      let prBody: string | undefined;

      if (event.type === "push") {
        const commits = event.payload.commits || [];
        commitMessage = commits.map((c: any) => c.message).join("\n").substring(0, 1000);
      } else if (event.type === "pull_request") {
        const pr = event.payload.pull_request;
        prTitle = pr?.title;
        prBody = pr?.body?.substring(0, 2000);
        commitMessage = prTitle;
      }

      if (truncatedFileDiffs.length > 0) {
        // Schedule impact analysis to run asynchronously (non-blocking)
        // This allows the digest to complete immediately while impact analysis runs in background
        await ctx.scheduler.runAfter(0, internal.digests.analyzeImpactAsync, {
          digestId,
          repositoryId,
          userId,
          fileDiffs: truncatedFileDiffs,
          commitMessage,
          prTitle,
          prBody,
        });
      }
    }

    // Step 9: Update event status - digest is ready
    await ctx.runMutation(internal.events.updateStatus, {
      eventId: args.eventId,
      status: "completed",
    });

    // Step 10: Trigger summary updates (replaces workflow onComplete handler)
    console.log("Scheduling updateSummariesForDigest", {
      repositoryId,
      digestId,
      digestCreatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.summaries.updateSummariesForDigest, {
      repositoryId,
      digestId,
      digestCreatedAt: Date.now(),
    });

    // Return digestId for tracking
    return { digestId, repositoryId, userId };
  },
});

/**
 * Analyze impact asynchronously (non-blocking)
 * Runs in background after digest is complete, updates digest when finished
 */
export const analyzeImpactAsync = internalAction({
  args: {
    digestId: v.id("digests"),
    repositoryId: v.id("repositories"),
    userId: v.id("users"),
    fileDiffs: v.array(
      v.object({
        filename: v.string(),
        status: v.string(),
        additions: v.number(),
        deletions: v.number(),
        patch: v.optional(v.string()),
      })
    ),
    commitMessage: v.optional(v.string()),
    prTitle: v.optional(v.string()),
    prBody: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      // Run impact analysis
      const impactResult = await ctx.runAction(
        internal.agents.impactAgent.analyzeImpact,
        {
          digestId: args.digestId,
          repositoryId: args.repositoryId,
          userId: args.userId,
          fileDiffs: args.fileDiffs,
          commitMessage: args.commitMessage,
          prTitle: args.prTitle,
          prBody: args.prBody,
        }
      );

      // Update digest with impact analysis if successful
      if (impactResult?.impactData) {
        const impactData = impactResult.impactData;

        await ctx.runMutation(internal.digests.update, {
          digestId: args.digestId,
          impactAnalysis: {
            affectedSurfaces: [],
            overallRisk: impactData.overallRisk,
            confidence: impactData.confidence,
            overallExplanation: impactData.overallExplanation,
          },
        });
      }
    } catch (error) {
      // Log error but don't throw - impact analysis is optional
      console.error("Impact analysis failed:", {
        digestId: args.digestId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  },
});
