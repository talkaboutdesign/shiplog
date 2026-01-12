"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id, Doc } from "./_generated/dataModel";
import { generateObject, streamObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { DeepPartial } from "ai";

// Simplified schema to avoid Anthropic tool-calling issues with all-optional nested objects
// The AI SDK uses tool calling for structured output, which can fail with complex optional nesting
const SummarySchema = z.object({
  headline: z.string().describe("Compelling headline summarizing the period's key achievement"),
  accomplishments: z.string().describe("2-3 paragraphs describing what was accomplished, written for stakeholders"),
  keyFeatures: z.array(z.string()).describe("List of key features/changes shipped (5-10 items)"),
  // Use array format instead of object with all-optional fields to avoid Anthropic API issues
  workBreakdownItems: z.array(z.object({
    category: z.enum(["bugfix", "feature", "refactor", "docs", "chore", "security"]).describe("Category of work"),
    percentage: z.number().describe("Percentage of total work (0-100)"),
    count: z.number().describe("Number of items in this category"),
  })).describe("Array of work breakdown items. Only include categories that have items (count > 0)."),
  totalItems: z.number().describe("Total number of items/digests included in this summary"),
});

// Output type that matches database schema (with workBreakdown as object)
type SummaryData = {
  headline: string;
  accomplishments: string;
  keyFeatures: string[];
  workBreakdown: {
    bugfix?: { percentage: number; count: number };
    feature?: { percentage: number; count: number };
    refactor?: { percentage: number; count: number };
    docs?: { percentage: number; count: number };
    chore?: { percentage: number; count: number };
    security?: { percentage: number; count: number };
  };
  metrics: {
    totalItems: number;
    averageDeploymentTime?: number;
    productionIncidents?: number;
    testCoverage?: number;
  };
};

// Helper to transform AI response (array format) to database format (object format)
function transformToSummaryData(
  aiResponse: z.infer<typeof SummarySchema>,
  digestCount: number
): SummaryData {
  // Convert workBreakdownItems array to workBreakdown object
  const workBreakdown: SummaryData["workBreakdown"] = {};
  for (const item of aiResponse.workBreakdownItems) {
    workBreakdown[item.category] = {
      percentage: item.percentage,
      count: item.count,
    };
  }

  return {
    headline: aiResponse.headline,
    accomplishments: aiResponse.accomplishments,
    keyFeatures: aiResponse.keyFeatures,
    workBreakdown,
    metrics: {
      totalItems: digestCount,
    },
  };
}

const SUMMARY_SYSTEM_PROMPT = `You are a technical writer creating executive-level development reports for stakeholders.

Your reports should:
- Lead with business impact and outcomes
- Use concrete numbers and metrics when available
- Connect work to company goals and strategy
- Use accessible language—avoid jargon; explain technical terms
- Show trends and context (what's improving, what's new)
- Focus on what matters to different stakeholders

For the headline: Write a compelling one-line summary of the period's most significant achievement or milestone.

For accomplishments: Write 2-3 paragraphs describing:
1. The major work completed this period
2. Business/user impact when clear
3. Key milestones or deliverables
4. Notable achievements or improvements

For key features: List 5-10 of the most important features/changes shipped, written as brief bullet points.

For workBreakdownItems: Provide an array of work categories with their percentage and count. Only include categories that have items (don't include categories with 0 items). Valid categories are: feature, bugfix, refactor, docs, chore, security.

For totalItems: Provide the total count of digests/items being summarized.`;

const INCREMENTAL_UPDATE_SYSTEM_PROMPT = `You are updating an existing executive development report by incorporating a new digest.

Your task:
- Update the existing summary to include the new digest
- Preserve the structure and style of the existing summary
- Intelligently merge the new content without rewriting everything
- Update the headline if the new digest significantly changes the period's narrative
- Add the new digest's key points to accomplishments (integrate, don't just append)
- Update the key features list if the new digest introduces notable features
- Recalculate workBreakdownItems with the new digest included (as an array of categories with percentage and count)
- Update totalItems to reflect the new total
- Maintain the executive-level tone and focus on business impact

Be strategic: If the new digest is minor, make minimal changes. If it's significant, update more substantially.`;

function getModel(provider: "openai" | "anthropic" | "openrouter", apiKey: string, modelName?: string) {
  if (provider === "openai") {
    const openai = createOpenAI({ apiKey });
    return openai("gpt-4o-mini");
  } else if (provider === "anthropic") {
    const anthropic = createAnthropic({ apiKey });
    return anthropic("claude-3-5-haiku-latest");
  } else {
    // openrouter
    const openrouter = createOpenAI({ 
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
    });
    return openrouter(modelName || "openai/gpt-4o-mini");
  }
}

/**
 * Generate a full summary from all digests for a period
 */
export const generateSummary = internalAction({
  args: {
    repositoryId: v.id("repositories"),
    period: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
    periodStart: v.number(),
    digestIds: v.array(v.id("digests")),
  },
  handler: async (ctx, args): Promise<SummaryData> => {
    if (args.digestIds.length === 0) {
      throw new Error("Cannot generate summary from empty digest list");
    }

    // Get repository and user to access API keys
    const repository = await ctx.runQuery(internal.repositories.getById, {
      repositoryId: args.repositoryId,
    });
    if (!repository) {
      throw new Error("Repository not found");
    }

    const user = await ctx.runQuery(internal.users.getById, {
      userId: repository.userId,
    });
    if (!user) {
      throw new Error("User not found");
    }

    const apiKeys = user.apiKeys;
    if (!apiKeys) {
      throw new Error("No API keys configured");
    }

    const preferredProvider = apiKeys.preferredProvider || "openai";
    const apiKey =
      preferredProvider === "openai"
        ? apiKeys.openai
        : preferredProvider === "anthropic"
        ? apiKeys.anthropic
        : apiKeys.openrouter;

    if (!apiKey) {
      throw new Error("No API key available for preferred provider");
    }

    const modelName = preferredProvider === "openrouter" ? apiKeys.openrouterModel : undefined;
    const model = getModel(preferredProvider, apiKey, modelName);

    // Fetch all digests
    const digests = await Promise.all(
      args.digestIds.map((digestId: Id<"digests">) =>
        ctx.runQuery(internal.digests.getById, { digestId })
      )
    );

    // Filter out nulls (shouldn't happen, but be safe)
    const validDigests = digests.filter((d: Doc<"digests"> | null): d is Doc<"digests"> => d !== null);

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

    try {
      const { object } = await generateObject({
        model,
        schema: SummarySchema,
        system: SUMMARY_SYSTEM_PROMPT,
        prompt,
      });

      // Transform AI response (array format) to database format (object format)
      return transformToSummaryData(object, validDigests.length);
    } catch (error) {
      // Log detailed error for debugging
      console.error("Error generating summary with AI:", {
        provider: preferredProvider,
        digestCount: validDigests.length,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  },
});

/**
 * Update an existing summary by merging in a new digest
 */
export const updateSummaryWithDigest = internalAction({
  args: {
    summaryId: v.id("summaries"),
    digestId: v.id("digests"),
  },
  handler: async (ctx, args): Promise<SummaryData> => {
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

    // Get repository and user to access API keys
    const repository = await ctx.runQuery(internal.repositories.getById, {
      repositoryId: summary.repositoryId,
    });
    if (!repository) {
      throw new Error("Repository not found");
    }

    const user = await ctx.runQuery(internal.users.getById, {
      userId: repository.userId,
    });
    if (!user) {
      throw new Error("User not found");
    }

    const apiKeys = user.apiKeys;
    if (!apiKeys) {
      throw new Error("No API keys configured");
    }

    const preferredProvider = apiKeys.preferredProvider || "openai";
    const apiKey =
      preferredProvider === "openai"
        ? apiKeys.openai
        : preferredProvider === "anthropic"
        ? apiKeys.anthropic
        : apiKeys.openrouter;

    if (!apiKey) {
      throw new Error("No API key available for preferred provider");
    }

    const modelName = preferredProvider === "openrouter" ? apiKeys.openrouterModel : undefined;
    const model = getModel(preferredProvider, apiKey, modelName);

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
    prompt += `\nUpdate the summary to include this new digest. Intelligently merge it without rewriting everything. Recalculate workBreakdownItems and totalItems to include this new digest.`;

    try {
      const { object } = await generateObject({
        model,
        schema: SummarySchema,
        system: INCREMENTAL_UPDATE_SYSTEM_PROMPT,
        prompt,
      });

      // Transform AI response and set correct total items count
      const newTotalItems = currentTotalItems + 1;
      return transformToSummaryData(object, newTotalItems);
    } catch (error) {
      // Log detailed error for debugging
      console.error("Error updating summary with AI:", {
        provider: preferredProvider,
        summaryId: args.summaryId,
        digestId: args.digestId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  },
});

// Helper to convert partial AI response to database-safe update
function partialToDbUpdate(
  partial: DeepPartial<z.infer<typeof SummarySchema>>,
  digestCount: number
): {
  headline?: string;
  accomplishments?: string;
  keyFeatures?: string[];
  workBreakdown?: SummaryData["workBreakdown"];
  metrics?: SummaryData["metrics"];
} {
  const update: {
    headline?: string;
    accomplishments?: string;
    keyFeatures?: string[];
    workBreakdown?: SummaryData["workBreakdown"];
    metrics?: SummaryData["metrics"];
  } = {};

  if (partial.headline) {
    update.headline = partial.headline;
  }
  if (partial.accomplishments) {
    update.accomplishments = partial.accomplishments;
  }
  if (partial.keyFeatures && partial.keyFeatures.length > 0) {
    // Filter out undefined values from the array
    update.keyFeatures = partial.keyFeatures.filter((f): f is string => typeof f === "string");
  }
  if (partial.workBreakdownItems && partial.workBreakdownItems.length > 0) {
    const workBreakdown: SummaryData["workBreakdown"] = {};
    for (const item of partial.workBreakdownItems) {
      if (item?.category && typeof item.percentage === "number" && typeof item.count === "number") {
        workBreakdown[item.category] = {
          percentage: item.percentage,
          count: item.count,
        };
      }
    }
    if (Object.keys(workBreakdown).length > 0) {
      update.workBreakdown = workBreakdown;
    }
  }
  if (partial.totalItems) {
    update.metrics = { totalItems: digestCount };
  }

  return update;
}

/**
 * Generate a summary with streaming updates to the database
 * This creates real-time updates as the AI generates content
 */
export const generateSummaryStreaming = internalAction({
  args: {
    summaryId: v.id("summaries"),
    repositoryId: v.id("repositories"),
    period: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
    periodStart: v.number(),
    digestIds: v.array(v.id("digests")),
  },
  handler: async (ctx, args): Promise<void> => {
    if (args.digestIds.length === 0) {
      throw new Error("Cannot generate summary from empty digest list");
    }

    // Get repository and user to access API keys
    const repository = await ctx.runQuery(internal.repositories.getById, {
      repositoryId: args.repositoryId,
    });
    if (!repository) {
      throw new Error("Repository not found");
    }

    const user = await ctx.runQuery(internal.users.getById, {
      userId: repository.userId,
    });
    if (!user) {
      throw new Error("User not found");
    }

    const apiKeys = user.apiKeys;
    if (!apiKeys) {
      throw new Error("No API keys configured");
    }

    const preferredProvider = apiKeys.preferredProvider || "openai";
    const apiKey =
      preferredProvider === "openai"
        ? apiKeys.openai
        : preferredProvider === "anthropic"
        ? apiKeys.anthropic
        : apiKeys.openrouter;

    if (!apiKey) {
      throw new Error("No API key available for preferred provider");
    }

    const modelName = preferredProvider === "openrouter" ? apiKeys.openrouterModel : undefined;
    const model = getModel(preferredProvider, apiKey, modelName);

    // Fetch all digests
    const digests = await Promise.all(
      args.digestIds.map((digestId: Id<"digests">) =>
        ctx.runQuery(internal.digests.getById, { digestId })
      )
    );

    const validDigests = digests.filter((d: Doc<"digests"> | null): d is Doc<"digests"> => d !== null);

    if (validDigests.length === 0) {
      throw new Error("No valid digests found");
    }

    // Build prompt
    const periodLabel = args.period === "daily" ? "day" : args.period === "weekly" ? "week" : "month";
    const dateStr = new Date(args.periodStart).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });

    let prompt = `Generate an executive development report for the ${periodLabel} of ${dateStr}.\n\n`;
    prompt += `The following ${validDigests.length} development activity summaries (digests) were completed:\n\n`;

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

    try {
      const { partialObjectStream } = streamObject({
        model,
        schema: SummarySchema,
        system: SUMMARY_SYSTEM_PROMPT,
        prompt,
      });

      let lastUpdate = Date.now();
      const UPDATE_INTERVAL = 500; // Update DB every 500ms max

      for await (const partial of partialObjectStream) {
        const now = Date.now();
        // Throttle updates to avoid hammering the database
        if (now - lastUpdate >= UPDATE_INTERVAL) {
          const dbUpdate = partialToDbUpdate(partial, validDigests.length);
          if (Object.keys(dbUpdate).length > 0) {
            await ctx.runMutation(internal.summaries.updateStreaming, {
              summaryId: args.summaryId,
              ...dbUpdate,
            });
            lastUpdate = now;
          }
        }
      }

      // Final update to ensure we have complete data and mark streaming as done
      await ctx.runMutation(internal.summaries.finishStreaming, {
        summaryId: args.summaryId,
      });
    } catch (error) {
      console.error("Error in streaming summary generation:", {
        provider: preferredProvider,
        digestCount: validDigests.length,
        error: error instanceof Error ? error.message : String(error),
      });
      // Mark streaming as failed
      await ctx.runMutation(internal.summaries.finishStreaming, {
        summaryId: args.summaryId,
      });
      throw error;
    }
  },
});

/**
 * Update a summary with streaming updates (for adding new digests)
 */
export const updateSummaryStreaming = internalAction({
  args: {
    summaryId: v.id("summaries"),
    newDigestIds: v.array(v.id("digests")),
  },
  handler: async (ctx, args): Promise<void> => {
    const summary = await ctx.runQuery(internal.summaries.getById, {
      summaryId: args.summaryId,
    });

    if (!summary) {
      throw new Error("Summary not found");
    }

    // Get repository and user
    const repository = await ctx.runQuery(internal.repositories.getById, {
      repositoryId: summary.repositoryId,
    });
    if (!repository) {
      throw new Error("Repository not found");
    }

    const user = await ctx.runQuery(internal.users.getById, {
      userId: repository.userId,
    });
    if (!user) {
      throw new Error("User not found");
    }

    const apiKeys = user.apiKeys;
    if (!apiKeys) {
      throw new Error("No API keys configured");
    }

    const preferredProvider = apiKeys.preferredProvider || "openai";
    const apiKey =
      preferredProvider === "openai"
        ? apiKeys.openai
        : preferredProvider === "anthropic"
        ? apiKeys.anthropic
        : apiKeys.openrouter;

    if (!apiKey) {
      throw new Error("No API key available for preferred provider");
    }

    const modelName = preferredProvider === "openrouter" ? apiKeys.openrouterModel : undefined;
    const model = getModel(preferredProvider, apiKey, modelName);

    // Get new digests
    const newDigests = await Promise.all(
      args.newDigestIds.map((digestId: Id<"digests">) =>
        ctx.runQuery(internal.digests.getById, { digestId })
      )
    );
    const validNewDigests = newDigests.filter((d: Doc<"digests"> | null): d is Doc<"digests"> => d !== null);

    if (validNewDigests.length === 0) {
      await ctx.runMutation(internal.summaries.finishStreaming, {
        summaryId: args.summaryId,
      });
      return;
    }

    // Build prompt
    const periodLabel = summary.period === "daily" ? "day" : summary.period === "weekly" ? "week" : "month";
    const dateStr = new Date(summary.periodStart).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });

    const existingWorkBreakdownItems = Object.entries(summary.workBreakdown || {})
      .filter(([_, value]) => value !== undefined && value !== null)
      .map(([category, value]) => ({
        category,
        percentage: (value as { percentage: number; count: number }).percentage,
        count: (value as { percentage: number; count: number }).count,
      }));

    const currentTotalItems = summary.metrics?.totalItems || summary.includedDigestIds.length;
    const newTotalItems = currentTotalItems + validNewDigests.length;

    let prompt = `Update the existing executive development report for the ${periodLabel} of ${dateStr}.\n\n`;
    prompt += `Existing Summary:\n`;
    prompt += `- Headline: ${summary.headline}\n`;
    prompt += `- Accomplishments: ${summary.accomplishments}\n`;
    prompt += `- Key Features: ${summary.keyFeatures.join(", ")}\n`;
    prompt += `- Current Work Breakdown: ${JSON.stringify(existingWorkBreakdownItems)}\n`;
    prompt += `- Current Total Items: ${currentTotalItems}\n`;
    prompt += `\nNew Digests to Incorporate (${validNewDigests.length}):\n`;

    for (let i = 0; i < validNewDigests.length; i++) {
      const digest = validNewDigests[i];
      prompt += `\nDigest ${i + 1}:\n`;
      prompt += `- Title: ${digest.title}\n`;
      prompt += `- Summary: ${digest.summary}\n`;
      prompt += `- Category: ${digest.category || "unknown"}\n`;
      if (digest.whyThisMatters) {
        prompt += `- Why this matters: ${digest.whyThisMatters}\n`;
      }
    }

    prompt += `\nUpdate the summary to include these new digests. Recalculate workBreakdownItems and set totalItems to ${newTotalItems}.`;

    try {
      const { partialObjectStream } = streamObject({
        model,
        schema: SummarySchema,
        system: INCREMENTAL_UPDATE_SYSTEM_PROMPT,
        prompt,
      });

      let lastUpdate = Date.now();
      const UPDATE_INTERVAL = 500;

      for await (const partial of partialObjectStream) {
        const now = Date.now();
        if (now - lastUpdate >= UPDATE_INTERVAL) {
          const dbUpdate = partialToDbUpdate(partial, newTotalItems);
          if (Object.keys(dbUpdate).length > 0) {
            await ctx.runMutation(internal.summaries.updateStreaming, {
              summaryId: args.summaryId,
              ...dbUpdate,
            });
            lastUpdate = now;
          }
        }
      }

      // Final update with new digest IDs
      await ctx.runMutation(internal.summaries.finishStreamingWithDigests, {
        summaryId: args.summaryId,
        newDigestIds: args.newDigestIds,
      });
    } catch (error) {
      console.error("Error in streaming summary update:", {
        provider: preferredProvider,
        summaryId: args.summaryId,
        error: error instanceof Error ? error.message : String(error),
      });
      await ctx.runMutation(internal.summaries.finishStreaming, {
        summaryId: args.summaryId,
      });
      throw error;
    }
  },
});
