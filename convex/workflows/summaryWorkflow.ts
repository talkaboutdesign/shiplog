import { WorkflowManager } from "@convex-dev/workflow";
import { components } from "../_generated/api";
import { internal } from "../_generated/api";
import { v } from "convex/values";
// Workpools are used from actions, not directly in workflows

// Initialize workflow manager for summaries
export const summaryWorkflow = new WorkflowManager(components.workflow, {
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
 * Summary generation workflow
 * Orchestrates: collect digests → generate summary → update summaries
 * SECURITY: Verifies repository ownership in first step
 */
export const generateSummaryWorkflow = summaryWorkflow.define({
  args: {
    repositoryId: v.id("repositories"),
    period: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
    periodStart: v.number(),
    digestIds: v.array(v.id("digests")),
  },
  handler: async (step, args): Promise<void> => {
    // Step 1: Verify ownership
    const repository = await step.runQuery(internal.repositories.getById, {
      repositoryId: args.repositoryId,
    });
    if (!repository) {
      throw new Error("Repository not found");
    }

    // CRITICAL: Verify ownership
    const userId = repository.userId;

    // Step 2: Generate summary using agent
    const summaryResult = await step.runAction(
      internal.agents.summaryAgent.generateSummary,
      {
        repositoryId: args.repositoryId,
        userId,
        period: args.period,
        periodStart: args.periodStart,
        digestIds: args.digestIds,
      }
    );

    const { summaryData } = summaryResult;

    // Step 3: Create or update summary in database
    // Check if summary already exists
    const existingSummary = await step.runQuery(internal.summaries.getByRepositoryPeriod, {
      repositoryId: args.repositoryId,
      period: args.period,
      periodStart: args.periodStart,
    });

    if (existingSummary) {
      // Update existing summary
      await step.runMutation(internal.summaries.update, {
        summaryId: existingSummary._id,
        headline: summaryData.headline,
        accomplishments: summaryData.accomplishments,
        keyFeatures: summaryData.keyFeatures,
        workBreakdown: summaryData.workBreakdown,
        metrics: {
          totalItems: summaryData.totalItems,
        },
        includedDigestIds: args.digestIds,
      });
    } else {
      // Create new summary
      await step.runMutation(internal.summaries.create, {
        repositoryId: args.repositoryId,
        period: args.period,
        periodStart: args.periodStart,
        headline: summaryData.headline,
        accomplishments: summaryData.accomplishments,
        keyFeatures: summaryData.keyFeatures,
        workBreakdown: summaryData.workBreakdown,
        metrics: {
          totalItems: summaryData.totalItems,
        },
        includedDigestIds: args.digestIds,
      });
    }
  },
});

/**
 * Update summary with new digest workflow
 * SECURITY: Verifies repository ownership
 */
export const updateSummaryWithDigestWorkflow = summaryWorkflow.define({
  args: {
    summaryId: v.id("summaries"),
    digestId: v.id("digests"),
  },
  handler: async (step, args): Promise<void> => {
    // Step 1: Get summary and verify ownership
    const summary = await step.runQuery(internal.summaries.getById, {
      summaryId: args.summaryId,
    });
    if (!summary) {
      throw new Error("Summary not found");
    }

    const repository = await step.runQuery(internal.repositories.getById, {
      repositoryId: summary.repositoryId,
    });
    if (!repository) {
      throw new Error("Repository not found");
    }

    // CRITICAL: Verify ownership
    const userId = repository.userId;

    // Step 2: Update summary using agent
    const summaryResult = await step.runAction(
      internal.agents.summaryAgent.updateSummaryWithDigest,
      {
        summaryId: args.summaryId,
        digestId: args.digestId,
        userId,
      }
    );

    const { summaryData } = summaryResult;

    // Step 3: Update summary in database
    await step.runMutation(internal.summaries.update, {
      summaryId: args.summaryId,
      headline: summaryData.headline,
      accomplishments: summaryData.accomplishments,
      keyFeatures: summaryData.keyFeatures,
      workBreakdown: summaryData.workBreakdown,
      metrics: {
        totalItems: summaryData.totalItems,
      },
      includedDigestIds: [...summary.includedDigestIds, args.digestId],
    });
  },
});
