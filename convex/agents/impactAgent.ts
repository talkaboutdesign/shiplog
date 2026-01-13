"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { components } from "../_generated/api";
import { Agent } from "@convex-dev/agent";
import { getFastModelConfig } from "./config";
import { ImpactAnalysisSchema, ChangeIntentSchema } from "./schemas";
import { IMPACT_ANALYSIS_SYSTEM_PROMPT } from "./prompts";
import { createAgentTools } from "./tools";
import { getRepositoryWithOwnership } from "../security/ownership";
import { Doc } from "../_generated/dataModel";
import { isTransientError, logStructuredOutputError } from "./errors";
import { z } from "zod";

/**
 * Analyze impact of code changes using Agent component with RAG search
 * SECURITY: Verifies repository ownership, uses user's API keys
 */
export const analyzeImpact = internalAction({
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: async (ctx, args): Promise<{ impactData: any; threadId: string } | null> => {
    // Verify ownership
    await getRepositoryWithOwnership(
      ctx,
      args.repositoryId,
      args.userId
    );

    // Get user and API keys
    const user = await ctx.runQuery(internal.users.getById, {
      userId: args.userId,
    });

    if (!user || !user.apiKeys) {
      throw new Error("User or API keys not found");
    }

    // Use fast model for impact analysis
    const { model } = getFastModelConfig(user.apiKeys);

    // Create agent with tools for RAG search
    const workflowContext = {
      userId: args.userId,
      repositoryId: args.repositoryId,
    };
    const tools = createAgentTools(workflowContext);

    const agent = new Agent(components.agent, {
      name: "Impact Analysis Agent",
      languageModel: model,
      instructions: IMPACT_ANALYSIS_SYSTEM_PROMPT,
      tools,
      maxSteps: 5,
    });

    // Create thread for tracking
    const { threadId } = await agent.createThread(ctx);

    // Get surfaces for the files
    const surfaces = await ctx.runQuery(internal.surfaces.getSurfacesByPaths, {
      repositoryId: args.repositoryId,
      filePaths: args.fileDiffs.map((f) => f.filename),
    });

    if (surfaces.length === 0) {
      console.log("No surfaces found for impact analysis - skipping");
      return null;
    }

    // Pass 1: Analyze intent from commit context (if available)
    let changeIntent: z.infer<typeof ChangeIntentSchema> | null = null;
    if (args.commitMessage) {
      try {
        const { generateObject } = await import("ai");
        const intentResult = await generateObject({
          model,
          schema: ChangeIntentSchema,
          prompt: `Analyze this commit/PR to understand the developer's intent:

Commit message: "${args.commitMessage}"
${args.prTitle ? `PR title: "${args.prTitle}"` : ""}
${args.prBody && args.prBody.length < 2000 ? `PR description: "${args.prBody}"` : ""}

Extract:
1. The primary intent (bugfix, feature, refactor, security, performance, chore, docs)
2. What improvements the author claims to make
3. Expected behavior changes
4. Areas that could be affected`,
        });
        changeIntent = intentResult.object;
      } catch (error) {
        console.error("Intent analysis failed:", error);
        // Continue without intent
      }
    }

    // Build structured changes with surface context
    const surfacesByPath = new Map<string, Doc<"codeSurfaces">[]>();
    surfaces.forEach((s: Doc<"codeSurfaces">) => {
      if (!surfacesByPath.has(s.filePath)) {
        surfacesByPath.set(s.filePath, []);
      }
      surfacesByPath.get(s.filePath)!.push(s);
    });

    const structuredChanges = args.fileDiffs
      .filter((f) => f.patch)
      .map((f) => {
        const fileSurfaces = surfacesByPath.get(f.filename) || [];
        const surfaceContext = fileSurfaces.length > 0
          ? `Surfaces: ${fileSurfaces.map((s) => `${s.name} (${s.surfaceType}, ${s.dependencies.length} deps)`).join(", ")}`
          : "";

        return `### ${f.filename} (${f.status}, +${f.additions} -${f.deletions})
${surfaceContext}

\`\`\`diff
${f.patch?.substring(0, 2500)}
\`\`\``;
      })
      .join("\n\n");

    // Build intent context section if available
    const intentContext = changeIntent
      ? `## Change Intent (from commit/PR)
- **Primary intent**: ${changeIntent.primaryIntent}
- **Claimed improvements**: ${changeIntent.claimedImprovements.join(", ") || "None specified"}
- **Expected behavior changes**: ${changeIntent.expectedBehaviorChanges.join(", ") || "None specified"}

**Important**: Verify the code achieves these claims. Mark as improvement if it does. Only flag as risk if the implementation is flawed or introduces NEW problems.

`
      : "";

    // Build commit context section
    const commitContext = args.commitMessage
      ? `## Commit Context
Commit message: "${args.commitMessage}"
${args.prTitle ? `PR title: "${args.prTitle}"` : ""}

`
      : "";

    // Build impact analysis prompt
    const impactPrompt: string = `${intentContext}${commitContext}## Code Changes

${structuredChanges}

${args.fileDiffs.filter((f) => !f.patch).length > 0 ? `\n${args.fileDiffs.filter((f) => !f.patch).length} additional files changed without diff data.\n` : ""}

## Analysis Task

For each file, assess:
- Risk level (low/medium/high) - for NEW risks only
- Brief reason - explain what NEW risk is introduced (or mark as improvement)
- Whether this is an improvement (adds safety, fixes bugs, adds resilience)
- Confidence (0-100)

${changeIntent ? `Also validate: Does this code achieve the claimed intent? (${changeIntent.claimedImprovements.join(", ")})` : ""}

Provide overall risk level and 2-3 sentence summary focusing on differential analysis.`;

    // Generate impact analysis using structured output
    try {
      const { generateObject } = await import("ai");
      const result = await generateObject({
        model,
        schema: ImpactAnalysisSchema,
        system: IMPACT_ANALYSIS_SYSTEM_PROMPT,
        prompt: impactPrompt,
      });

      return {
        impactData: result.object,
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
            schema: ImpactAnalysisSchema,
            system: IMPACT_ANALYSIS_SYSTEM_PROMPT,
            prompt: impactPrompt,
          });
          return { impactData: result.object, threadId };
        } catch (retryError) {
          logStructuredOutputError(retryError, { digestId: args.digestId, provider: user.apiKeys.preferredProvider });
          return null; // Graceful failure - impact analysis is optional
        }
      } else {
        logStructuredOutputError(error, { digestId: args.digestId, provider: user.apiKeys.preferredProvider });
        return null; // Graceful failure
      }
    }
  },
});
