"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id, Doc } from "./_generated/dataModel";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const SummarySchema = z.object({
  headline: z.string().describe("Compelling headline summarizing the period's key achievement"),
  accomplishments: z.string().describe("2-3 paragraphs describing what was accomplished, written for stakeholders"),
  keyFeatures: z.array(z.string()).describe("List of key features/changes shipped (5-10 items)"),
  workBreakdown: z.object({
    bugfix: z.optional(z.object({ percentage: z.number(), count: z.number() })),
    feature: z.optional(z.object({ percentage: z.number(), count: z.number() })),
    refactor: z.optional(z.object({ percentage: z.number(), count: z.number() })),
    docs: z.optional(z.object({ percentage: z.number(), count: z.number() })),
    chore: z.optional(z.object({ percentage: z.number(), count: z.number() })),
    security: z.optional(z.object({ percentage: z.number(), count: z.number() })),
  }).describe("Breakdown of work by category with percentages and counts"),
  metrics: z.optional(z.object({
    totalItems: z.number(),
    averageDeploymentTime: z.optional(z.number()),
    productionIncidents: z.optional(z.number()),
    testCoverage: z.optional(z.number()),
  })),
});

type SummaryData = z.infer<typeof SummarySchema> & {
  metrics: {
    totalItems: number;
    averageDeploymentTime?: number;
    productionIncidents?: number;
    testCoverage?: number;
  };
};

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

For work breakdown: Calculate the percentage and count for each category (feature, bugfix, refactor, docs, chore, security) based on the digests provided.`;

const INCREMENTAL_UPDATE_SYSTEM_PROMPT = `You are updating an existing executive development report by incorporating a new digest.

Your task:
- Update the existing summary to include the new digest
- Preserve the structure and style of the existing summary
- Intelligently merge the new content without rewriting everything
- Update the headline if the new digest significantly changes the period's narrative
- Add the new digest's key points to accomplishments (integrate, don't just append)
- Update the key features list if the new digest introduces notable features
- Recalculate work breakdown percentages and counts with the new digest included
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

    const { object } = await generateObject({
      model,
      schema: SummarySchema,
      system: SUMMARY_SYSTEM_PROMPT,
      prompt,
    });

    // Calculate metrics
    const metrics: SummaryData["metrics"] = {
      totalItems: validDigests.length,
    };

    return {
      ...object,
      metrics,
    };
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

    let prompt: string = `Update the existing executive development report for the ${periodLabel} of ${dateStr}.\n\n`;
    prompt += `Existing Summary:\n`;
    prompt += `- Headline: ${summary.headline}\n`;
    prompt += `- Accomplishments: ${summary.accomplishments}\n`;
    prompt += `- Key Features: ${summary.keyFeatures.join(", ")}\n`;
    prompt += `- Work Breakdown: ${JSON.stringify(summary.workBreakdown)}\n`;
    prompt += `\nNew Digest to Incorporate:\n`;
    prompt += `- Title: ${digest.title}\n`;
    prompt += `- Summary: ${digest.summary}\n`;
    prompt += `- Category: ${digest.category || "unknown"}\n`;
    if (digest.whyThisMatters) {
      prompt += `- Why this matters: ${digest.whyThisMatters}\n`;
    }
    prompt += `\nUpdate the summary to include this new digest. Intelligently merge it without rewriting everything. Recalculate work breakdown to include this new digest.`;

    const { object } = await generateObject({
      model,
      schema: SummarySchema,
      system: INCREMENTAL_UPDATE_SYSTEM_PROMPT,
      prompt,
    });

    // Update metrics (increment total items)
    const metrics: SummaryData["metrics"] = {
      ...summary.metrics,
      totalItems: (summary.metrics?.totalItems || summary.includedDigestIds.length) + 1,
    };

    return {
      ...object,
      metrics,
    };
  },
});
