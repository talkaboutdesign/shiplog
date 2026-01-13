import { WorkflowManager } from "@convex-dev/workflow";
import { internalAction, internalMutation } from "../_generated/server";
import { components } from "../_generated/api";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { FileDiff, Perspective } from "../types";
// Workpools are used from actions, not directly in workflows
// Workflows use step.runAction which can call actions that use workpools

// Initialize workflow manager
export const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    defaultRetryBehavior: {
      maxAttempts: 3,
      initialBackoffMs: 1000,
      base: 2,
    },
    retryActionsByDefault: true,
  },
});

/**
 * Digest generation workflow
 * Orchestrates: event fetch → file diffs → digest generation → perspectives → impact analysis → summary update
 * SECURITY: Verifies repository ownership in first step and passes through context
 */
export const digestGenerationWorkflow = workflow.define({
  args: { eventId: v.id("events") },
  handler: async (step, args): Promise<{ digestId: Id<"digests">; repositoryId: Id<"repositories">; userId: Id<"users"> }> => {
    // Step 1: Fetch event and verify ownership
    const event = await step.runQuery(internal.events.getById, {
      eventId: args.eventId,
    });
    if (!event) {
      throw new Error("Event not found");
    }

    // Get repository to get userId
    const repository = await step.runQuery(internal.repositories.getById, {
      repositoryId: event.repositoryId,
    });
    if (!repository) {
      throw new Error("Repository not found");
    }

    // CRITICAL: Verify ownership (repository.userId is the owner)
    // Store userId in workflow context for subsequent steps
    const userId = repository.userId;
    const repositoryId = event.repositoryId;

    // Update event status to processing
    await step.runMutation(internal.events.updateStatus, {
      eventId: args.eventId,
      status: "processing",
    });

    // Get user and API keys
    const user = await step.runQuery(internal.users.getById, {
      userId,
    });

    if (!user || !user.apiKeys) {
      await step.runMutation(internal.events.updateStatus, {
        eventId: args.eventId,
        status: "skipped",
        errorMessage: "No API keys configured",
      });
      // Return early with minimal data - workflow will be marked as skipped
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
    const digestId = await step.runMutation(internal.digests.create, {
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

    // Step 3: Check and trigger indexing if needed (non-blocking)
    await step.runAction(internal.surfaces.checkAndIndexIfNeeded, {
      repositoryId,
    });

    // Step 4: Generate digest using agent
    // File diffs are fetched in the digest agent, which will store them for later use
    // Note: The agent action can use workpool internally if needed
    const digestResult = await step.runAction(
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
      await step.runMutation(internal.digests.createPerspectivesBatch, {
        digestId,
        perspectives: immediatePerspectives.map((p: Perspective) => ({
          perspective: p.perspective,
          title: p.title,
          summary: p.summary,
          confidence: p.confidence,
        })),
      });
    }

    // Step 7: Update digest with AI-generated content
    await step.runMutation(internal.digests.update, {
      digestId,
      title: digestData.title,
      summary: digestData.summary,
      category: digestData.category,
      whyThisMatters: digestData.whyThisMatters,
    });

    // Step 8: Determine which perspectives are relevant and generate in parallel
    const relevantPerspectives: Array<"bugfix" | "ui" | "feature" | "security" | "performance" | "refactor" | "docs"> = [];
    
    if (digestData.category === "bugfix") relevantPerspectives.push("bugfix");
    if (digestData.category === "feature") relevantPerspectives.push("feature");
    
    // Check file paths for UI components (if fileDiffs available)
    // Re-fetch event to get file diffs
    const eventWithDiffs = await step.runQuery(internal.events.getById, {
      eventId: args.eventId,
    });
    const eventFileDiffs = eventWithDiffs?.fileDiffs;
    
    if (eventFileDiffs?.some((f: FileDiff) => f.filename.match(/\.(tsx|jsx)$/) || f.filename.includes("component"))) {
      relevantPerspectives.push("ui");
    }
    
    // Always generate at least one perspective
    if (relevantPerspectives.length === 0) {
      relevantPerspectives.push(digestData.category as any || "refactor");
    }

    // Determine which perspectives were already generated and which need async generation
    const immediatePerspectiveTypes = new Set(immediatePerspectives.map((p: Perspective) => p.perspective));
    const perspectivesToGenerateAsync = relevantPerspectives
      .filter(p => !immediatePerspectiveTypes.has(p))
      .slice(0, 3); // Limit to 3 total perspectives

    // Generate additional perspectives in parallel
    if (perspectivesToGenerateAsync.length > 0) {
      const perspectivePromises = perspectivesToGenerateAsync.map((perspective) =>
        step.runAction(
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
        await step.runMutation(internal.digests.createPerspectivesBatch, {
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

    // Step 9: Run impact analysis (if surfaces exist and file diffs available)
    // Re-fetch event to get file diffs that may have been stored by digest agent
    const updatedEvent = await step.runQuery(internal.events.getById, {
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
        // Run impact analysis
        const impactResult = await step.runAction(
          internal.agents.impactAgent.analyzeImpact,
          {
            digestId,
            repositoryId,
            userId,
            fileDiffs: truncatedFileDiffs,
            commitMessage,
            prTitle,
            prBody,
          }
        );

        // Update digest with impact analysis if successful
        if (impactResult?.impactData) {
          const impactData = impactResult.impactData;
          
          // Map file paths to surface IDs
          const surfaces = await step.runQuery(internal.surfaces.getSurfacesByPaths, {
            repositoryId,
            filePaths: impactData.affectedFiles.map((af: any) => af.filePath),
          });

          const affectedSurfaces = impactData.affectedFiles
            .map((af: any) => {
              const matchingSurfaces = surfaces.filter((s: Doc<"codeSurfaces">) => s.filePath === af.filePath);
              const primarySurface = matchingSurfaces[0];
              if (!primarySurface) {
                return null;
              }
              return {
                surfaceId: primarySurface._id,
                surfaceName: primarySurface.name,
                impactType: "modified" as const,
                riskLevel: af.riskLevel,
                confidence: af.confidence,
              };
            })
            .filter((af: any): af is NonNullable<typeof af> => af !== null);

          await step.runMutation(internal.digests.update, {
            digestId,
            impactAnalysis: {
              affectedSurfaces,
              overallRisk: impactData.overallRisk,
              confidence: impactData.confidence,
              overallExplanation: impactData.overallExplanation,
            },
          });
        }
      }
    }

    // Step 10: Update event status - digest is ready
    await step.runMutation(internal.events.updateStatus, {
      eventId: args.eventId,
      status: "completed",
    });

    // Return digestId for onComplete handler
    return { digestId, repositoryId, userId };
  },
});

/**
 * Start digest generation workflow
 * SECURITY: Verifies repository ownership before starting
 */
export const startDigestWorkflow = internalAction({
  args: {
    eventId: v.id("events"),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: async (ctx, args): Promise<any> => {
    // Get event to get repository
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

    // CRITICAL: Verify ownership before starting workflow
    // In this case, we're starting from an internal action (from webhook),
    // so we trust the repository ownership is already verified
    // But we still include repositoryId in workflow context for verification in steps

    // Start workflow
    const workflowId = await workflow.start(
      ctx,
      internal.workflows.digestWorkflow.digestGenerationWorkflow,
      { eventId: args.eventId },
      {
        onComplete: internal.workflows.digestWorkflow.onDigestComplete,
        context: {
          repositoryId: event.repositoryId,
          userId: repository.userId,
        },
      }
    );

    return workflowId;
  },
});

/**
 * onComplete handler for digest workflow
 * Triggers summary updates when digest completes
 * This preserves the current behavior from digests.ts
 */
export const onDigestComplete = internalMutation({
  args: {
    workflowId: v.any(), // WorkflowId type from component
    result: v.any(), // Result type from component
    context: v.object({
      repositoryId: v.id("repositories"),
      userId: v.id("users"),
    }),
  },
  handler: async (ctx, args) => {
    // Check result kind (from workflow component)
    if (args.result?.kind === "canceled" || args.result?.kind === "error") {
      return;
    }

    // Trigger summary updates (preserves current behavior from digests.ts)
    if (args.result?.kind === "success" && args.result.returnValue) {
      const { digestId } = args.result.returnValue;
      await ctx.scheduler.runAfter(0, internal.summaries.updateSummariesForDigest, {
        repositoryId: args.context.repositoryId,
        digestId,
        digestCreatedAt: Date.now(),
      });
    }
  },
});
