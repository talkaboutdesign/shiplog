"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { buildEventPrompt } from "../agents/digestAgent";

/**
 * Compute embedding for text (used by embeddingCache)
 * SECURITY: Cache key includes repositoryId to prevent cross-repo access
 */
export const computeEmbedding = internalAction({
  args: {
    text: v.string(),
    repositoryId: v.id("repositories"), // Included for cache key isolation
    apiKey: v.string(), // User's API key
  },
  handler: async (_ctx, args) => {
    // Use OpenAI embedding API directly via fetch
    // Generate embedding
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify({
        input: args.text,
        model: "text-embedding-3-small",
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    return { embedding: data.data[0].embedding, repositoryId: args.repositoryId };
  },
});

/**
 * Compute digest for event (used by digestCache)
 * SECURITY: Cache key includes repositoryId to prevent cross-repo access
 * This does the actual digest generation work (called by cache on miss)
 * Note: ActionCache uses args to create cache key, so repositoryId in args ensures isolation
 * IMPORTANT: This must NOT call generateDigest to avoid circular dependency
 */
export const computeDigest = internalAction({
  args: {
    eventId: v.id("events"),
    repositoryId: v.id("repositories"), // Included for cache key isolation
    userId: v.id("users"),
    eventHash: v.string(), // Hash of event content for cache key
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: async (ctx, args): Promise<any> => {
    // Get event, user, and repository
    const [event, user, repository] = await Promise.all([
      ctx.runQuery(internal.events.getById, { eventId: args.eventId }),
      ctx.runQuery(internal.users.getById, { userId: args.userId }),
      ctx.runQuery(internal.repositories.getById, { repositoryId: args.repositoryId }),
    ]);

    if (!event) {
      throw new Error("Event not found");
    }
    if (!user || !user.apiKeys) {
      throw new Error("User or API keys not found");
    }
    if (!repository) {
      throw new Error("Repository not found");
    }

    // Get model config
    const { getUserModelConfig } = await import("../agents/config");
    const { model } = getUserModelConfig(user.apiKeys);

    // Get file diffs if available
    const { getGitHubAppConfig, getFileDiffForPush, getFileDiffForPR } = await import("../github");
    let fileDiffs = event.fileDiffs;
    if (!fileDiffs && (event.type === "push" || event.type === "pull_request")) {
      try {
        const config = getGitHubAppConfig();
        const [owner, repo] = repository.fullName.split("/");

        if (event.type === "push") {
          const pushPayload = event.payload;
          const base = pushPayload.before;
          const head = pushPayload.after;
          if (base && head) {
            fileDiffs = await getFileDiffForPush(
              config,
              repository.githubInstallationId,
              owner,
              repo,
              base,
              head
            );
          }
        } else if (event.type === "pull_request") {
          const pr = event.payload.pull_request;
          if (pr && pr.number) {
            fileDiffs = await getFileDiffForPR(
              config,
              repository.githubInstallationId,
              owner,
              repo,
              pr.number
            );
          }
        }
      } catch (error) {
        console.error("Error fetching file diffs:", error);
        // Continue without file diffs
      }
    }

    // Build prompt
    const prompt = buildEventPrompt(event, fileDiffs);

    // Generate digest (core logic without cache check)
    const { DigestSchema } = await import("../agents/schemas");
    const { DIGEST_SYSTEM_PROMPT } = await import("../agents/prompts");
    const { generateObject } = await import("ai");
    const { isTransientError, generateFallbackDigest, logStructuredOutputError } = await import("../agents/errors");

    let digestData;
    try {
      const result = await generateObject({
        model,
        schema: DigestSchema,
        system: DIGEST_SYSTEM_PROMPT,
        prompt,
      });
      digestData = result.object;
    } catch (error) {
      // Handle errors gracefully - single retry for transient errors only
      if (isTransientError(error)) {
        try {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const result = await generateObject({
            model,
            schema: DigestSchema,
            system: DIGEST_SYSTEM_PROMPT,
            prompt,
          });
          digestData = result.object;
        } catch (retryError) {
          logStructuredOutputError(retryError, { eventId: args.eventId, provider: user.apiKeys.preferredProvider });
          digestData = generateFallbackDigest(event);
        }
      } else {
        logStructuredOutputError(error, { eventId: args.eventId, provider: user.apiKeys.preferredProvider });
        digestData = generateFallbackDigest(event);
      }
    }

    // Return result in same format as generateDigest (but without threadId)
    return { digestData };
  },
});

/**
 * Compute impact analysis (used by impactCache)
 * SECURITY: Cache key includes repositoryId to prevent cross-repo access
 * This is a wrapper that calls the impact agent
 * Note: ActionCache uses args to create cache key, so repositoryId in args ensures isolation
 */
export const computeImpact = internalAction({
  args: {
    digestId: v.id("digests"),
    repositoryId: v.id("repositories"), // Included for cache key isolation
    userId: v.id("users"),
    fileDiffs: v.array(v.any()),
    fileDiffHash: v.string(), // Hash of file diffs for cache key
    commitMessage: v.optional(v.string()),
    prTitle: v.optional(v.string()),
    prBody: v.optional(v.string()),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: async (ctx, args): Promise<any> => {
    // Call the impact agent to generate the impact analysis
    const result = await ctx.runAction(internal.agents.impactAgent.analyzeImpact, {
      digestId: args.digestId,
      repositoryId: args.repositoryId,
      userId: args.userId,
      fileDiffs: args.fileDiffs,
      commitMessage: args.commitMessage,
      prTitle: args.prTitle,
      prBody: args.prBody,
    });

    return result; // Return the full result with impactData
  },
});
