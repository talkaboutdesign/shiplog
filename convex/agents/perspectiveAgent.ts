"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { getUserModelConfig } from "./config";
import { PerspectiveSchema } from "./schemas";
import { getRepositoryWithOwnership } from "../security/ownership";
import { isTransientError, logStructuredOutputError } from "./errors";

/**
 * Generate perspective for a digest using Agent component
 * SECURITY: Verifies repository ownership, uses user's API keys
 */
export const generatePerspective = internalAction({
  args: {
    digestId: v.id("digests"),
    repositoryId: v.id("repositories"),
    userId: v.id("users"),
    perspective: v.union(
      v.literal("bugfix"),
      v.literal("ui"),
      v.literal("feature"),
      v.literal("security"),
      v.literal("performance"),
      v.literal("refactor"),
      v.literal("docs")
    ),
  },
  handler: async (ctx, args) => {
    // Verify ownership
    await getRepositoryWithOwnership(ctx, args.repositoryId, args.userId);

    // Get user and API keys
    const user = await ctx.runQuery(internal.users.getById, {
      userId: args.userId,
    });

    if (!user || !user.apiKeys) {
      throw new Error("User or API keys not found");
    }

    // Get digest for context
    const digest = await ctx.runQuery(internal.digests.getById, {
      digestId: args.digestId,
    });

    if (!digest) {
      throw new Error("Digest not found");
    }

    // Get model config with user's API keys
    const { model } = getUserModelConfig(user.apiKeys);

    // Generate simple thread ID for tracking (no agent needed)
    const threadId = `perspective-${args.digestId}-${args.perspective}-${Date.now()}`;

    // Build prompt based on digest summary
    const perspectivePrompt: string = `Based on this code change summary, analyze it from a ${args.perspective} perspective:

Title: ${digest.title}
Summary: ${digest.summary}
Category: ${digest.category || "unknown"}
Why this matters: ${digest.whyThisMatters || "Not specified"}

Generate a ${args.perspective}-focused perspective on this change. Provide a title, summary, and confidence score (0-100).`;

    // Generate perspective using structured output
    try {
      const { generateObject } = await import("ai");
      const result = await generateObject({
        model,
        schema: PerspectiveSchema,
        prompt: perspectivePrompt,
      });

      return {
        perspectiveData: result.object,
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
            schema: PerspectiveSchema,
            prompt: perspectivePrompt,
          });
          return { perspectiveData: result.object, threadId };
        } catch (retryError) {
          logStructuredOutputError(retryError, { digestId: args.digestId, provider: user.apiKeys.preferredProvider });
          return null; // Graceful failure - perspectives are optional
        }
      } else {
        logStructuredOutputError(error, { digestId: args.digestId, provider: user.apiKeys.preferredProvider });
        return null; // Graceful failure
      }
    }
  },
});
