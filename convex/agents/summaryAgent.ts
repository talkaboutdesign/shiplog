"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { getUserModelConfig } from "./config";
import { SummarySchema } from "./schemas";
import { SUMMARY_SYSTEM_PROMPT, INCREMENTAL_UPDATE_SYSTEM_PROMPT } from "./prompts";
import { getRepositoryWithOwnership } from "../security/ownership";
import { Id } from "../_generated/dataModel";
import { isTransientError, logStructuredOutputError } from "./errors";
import { z } from "zod";

/**
 * Generate summary for a period using Agent component with streaming
 * SECURITY: Verifies repository ownership, uses user's API keys
 */
export const generateSummary = internalAction({
  args: {
    repositoryId: v.id("repositories"),
    userId: v.id("users"),
    period: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
    periodStart: v.number(),
    digestIds: v.array(v.id("digests")),
  },
  handler: async (ctx, args): Promise<{
    summaryData: z.infer<typeof SummarySchema>;
    threadId: string;
  }> => {
    // Verify ownership
    await getRepositoryWithOwnership(ctx, args.repositoryId, args.userId);

    // Get user and API keys
    const user = await ctx.runQuery(internal.users.getById, {
      userId: args.userId,
    });

    if (!user || !user.apiKeys) {
      throw new Error("User or API keys not found");
    }

    if (args.digestIds.length === 0) {
      throw new Error("Cannot generate summary from empty digest list");
    }

    // Get model config with user's API keys
    const { model } = getUserModelConfig(user.apiKeys);

    // Generate simple thread ID for tracking (no agent needed)
    const threadId = `summary-${args.repositoryId}-${args.period}-${Date.now()}`;

    // Fetch all digests
    const digests = await Promise.all(
      args.digestIds.map((digestId: Id<"digests">) =>
        ctx.runQuery(internal.digests.getById, { digestId })
      )
    );

    const validDigests = digests.filter((d: (typeof digests)[number]): d is NonNullable<typeof d> => d !== null);

    if (validDigests.length === 0) {
      throw new Error("No valid digests found");
    }

    // Build prompt with all digests
    const periodLabel = args.period === "daily" ? "day" : args.period === "weekly" ? "week" : "month";
    const dateStr = new Date(args.periodStart).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });

    let prompt = `Generate an executive development report for the ${periodLabel} of ${dateStr}.\n\n`;
    prompt += `The following ${validDigests.length} development activity summaries (digests) were completed:\n\n`;

    // Add each digest
    for (let i = 0; i < validDigests.length; i++) {
      const digest = validDigests[i];
      prompt += `Digest ${i + 1}:\n`;
      prompt += `- Title: ${digest.title}\n`;
      prompt += `- Summary: ${digest.summary}\n`;
      prompt += `- Category: ${digest.category || "unknown"}\n`;
      if (digest.whyThisMatters) {
        prompt += `- Why this matters: ${digest.whyThisMatters}\n`;
      }
      prompt += `\n`;
    }

    prompt += `\nGenerate a comprehensive executive report based on these digests. Focus on business impact and key achievements.`;

    // Generate summary using structured output
    try {
      const { generateObject } = await import("ai");
      const result = await generateObject({
        model,
        schema: SummarySchema,
        system: SUMMARY_SYSTEM_PROMPT,
        prompt,
      });

      return {
        summaryData: result.object,
        threadId,
      };
    } catch (error) {
      // Handle errors gracefully
      if (isTransientError(error)) {
        try {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const { generateObject } = await import("ai");
          const result = await generateObject({
            model,
            schema: SummarySchema,
            system: SUMMARY_SYSTEM_PROMPT,
            prompt,
          });
          return { summaryData: result.object, threadId };
        } catch (retryError) {
          logStructuredOutputError(retryError, {
            repositoryId: args.repositoryId,
            period: args.period,
            provider: user.apiKeys.preferredProvider,
          });
          throw retryError;
        }
      } else {
        logStructuredOutputError(error, {
          repositoryId: args.repositoryId,
          period: args.period,
          provider: user.apiKeys.preferredProvider,
        });
        throw error;
      }
    }
  },
});

/**
 * Update existing summary with new digest using Agent component with streaming
 * SECURITY: Verifies repository ownership, uses user's API keys
 */
export const updateSummaryWithDigest = internalAction({
  args: {
    summaryId: v.id("summaries"),
    digestId: v.id("digests"),
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<{
    summaryData: z.infer<typeof SummarySchema>;
    threadId: string;
  }> => {
    // Get summary and digest
    const [summary, digest] = await Promise.all([
      ctx.runQuery(internal.summaries.getById, { summaryId: args.summaryId }),
      ctx.runQuery(internal.digests.getById, { digestId: args.digestId }),
    ]);

    if (!summary) {
      throw new Error("Summary not found");
    }
    if (!digest) {
      throw new Error("Digest not found");
    }

    // Verify ownership
    await getRepositoryWithOwnership(ctx, summary.repositoryId, args.userId);

    // Get user and API keys
    const user = await ctx.runQuery(internal.users.getById, {
      userId: args.userId,
    });

    if (!user || !user.apiKeys) {
      throw new Error("User or API keys not found");
    }

    // Get model config with user's API keys
    const { model } = getUserModelConfig(user.apiKeys);

    // Generate simple thread ID for tracking (no agent needed)
    const threadId = `summary-update-${args.summaryId}-${Date.now()}`;

    // Build prompt with existing summary and new digest
    const periodLabel: string = summary.period === "daily" ? "day" : summary.period === "weekly" ? "week" : "month";
    const dateStr = new Date(summary.periodStart).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });

    // Convert existing workBreakdown object to array format for the prompt
    const existingWorkBreakdownItems = Object.entries(summary.workBreakdown || {})
      .filter(([_, value]) => value !== undefined && value !== null)
      .map(([category, value]) => ({
        category,
        percentage: (value as { percentage: number; count: number }).percentage,
        count: (value as { percentage: number; count: number }).count,
      }));

    const currentTotalItems = summary.metrics?.totalItems || summary.includedDigestIds.length;

    let prompt: string = `Update the existing executive development report for the ${periodLabel} of ${dateStr}.\n\n`;
    prompt += `Existing Summary:\n`;
    prompt += `- Headline: ${summary.headline}\n`;
    prompt += `- Accomplishments: ${summary.accomplishments}\n`;
    prompt += `- Key Features: ${summary.keyFeatures.join(", ")}\n`;
    prompt += `- Current Work Breakdown: ${JSON.stringify(existingWorkBreakdownItems)}\n`;
    prompt += `- Current Total Items: ${currentTotalItems}\n`;
    prompt += `\nNew Digest to Incorporate:\n`;
    prompt += `- Title: ${digest.title}\n`;
    prompt += `- Summary: ${digest.summary}\n`;
    prompt += `- Category: ${digest.category || "unknown"}\n`;
    if (digest.whyThisMatters) {
      prompt += `- Why this matters: ${digest.whyThisMatters}\n`;
    }
    prompt += `\nUpdate the summary to include this new digest. Intelligently merge it without rewriting everything. Recalculate workBreakdown and set totalItems to ${currentTotalItems + 1}.`;

    // Generate updated summary using structured output
    try {
      const { generateObject } = await import("ai");
      const result = await generateObject({
        model,
        schema: SummarySchema,
        system: INCREMENTAL_UPDATE_SYSTEM_PROMPT,
        prompt,
      });

      return {
        summaryData: result.object,
        threadId,
      };
    } catch (error) {
      // Handle errors gracefully
      if (isTransientError(error)) {
        try {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const { generateObject } = await import("ai");
          const result = await generateObject({
            model,
            schema: SummarySchema,
            system: INCREMENTAL_UPDATE_SYSTEM_PROMPT,
            prompt,
          });
          return { summaryData: result.object, threadId };
        } catch (retryError) {
          logStructuredOutputError(retryError, {
            summaryId: args.summaryId,
            digestId: args.digestId,
            provider: user.apiKeys.preferredProvider,
          });
          throw retryError;
        }
      } else {
        logStructuredOutputError(error, {
          summaryId: args.summaryId,
          digestId: args.digestId,
          provider: user.apiKeys.preferredProvider,
        });
        throw error;
      }
    }
  },
});
