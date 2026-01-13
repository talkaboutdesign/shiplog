"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

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
 * This is a wrapper that calls the digest agent
 * Note: ActionCache uses args to create cache key, so repositoryId in args ensures isolation
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
    // Call the digest agent to generate the digest
    // Note: We need to get the event first to pass to agent
    const event = await ctx.runQuery(internal.events.getById, {
      eventId: args.eventId,
    });

    if (!event) {
      throw new Error("Event not found");
    }

    // Generate digest using agent (this will handle file diffs, etc.)
    const result = await ctx.runAction(internal.agents.digestAgent.generateDigest, {
      eventId: args.eventId,
      repositoryId: args.repositoryId,
      userId: args.userId,
    });

    return result; // Return the full result with digestData
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
