"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { RAG } from "@convex-dev/rag";
import { openai } from "@ai-sdk/openai";
import { getRepositoryWithOwnership } from "../security/ownership";

// Initialize RAG instance with filter names for metadata filtering
// Note: RAG component uses its own AI SDK version internally which may differ from our AI SDK version
// For tests, the embedding model configuration may need to be handled differently
const rag = new RAG(components.rag, {
  textEmbeddingModel: openai.embedding("text-embedding-ada-002"),
  embeddingDimension: 1536,
  filterNames: ["filePath", "surfaceType", "surfaceName", "filename", "status", "type", "commitSha"],
});

/**
 * Search code surfaces in RAG with repository-scoped namespace
 * SECURITY: Verifies repository ownership and uses repository-scoped namespace
 */
export const searchCodeSurfaces = internalAction({
  args: {
    repositoryId: v.id("repositories"),
    userId: v.id("users"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Verify ownership
    await getRepositoryWithOwnership(ctx, args.repositoryId, args.userId);

    // Use repository-scoped namespace
    const namespace = `repo-${args.repositoryId}`;

    const results = await rag.search(ctx, {
      namespace,
      query: args.query,
      limit: args.limit || 10,
      vectorScoreThreshold: 0.5,
    });

    return results;
  },
});

/**
 * Search file diffs in RAG with repository-scoped namespace
 * SECURITY: Verifies repository ownership and uses repository-scoped namespace
 */
export const searchFileDiffs = internalAction({
  args: {
    repositoryId: v.id("repositories"),
    userId: v.id("users"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Verify ownership
    await getRepositoryWithOwnership(ctx, args.repositoryId, args.userId);

    // Use repository-scoped namespace
    const namespace = `repo-${args.repositoryId}`;

    const results = await rag.search(ctx, {
      namespace,
      query: args.query,
      limit: args.limit || 10,
      vectorScoreThreshold: 0.5,
      filters: [{ name: "type", value: "diff" }],
    });

    return results;
  },
});

/**
 * Search commit messages in RAG with repository-scoped namespace
 * SECURITY: Verifies repository ownership and uses repository-scoped namespace
 */
export const searchCommitMessages = internalAction({
  args: {
    repositoryId: v.id("repositories"),
    userId: v.id("users"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Verify ownership
    await getRepositoryWithOwnership(ctx, args.repositoryId, args.userId);

    // Use repository-scoped namespace
    const namespace = `repo-${args.repositoryId}`;

    const results = await rag.search(ctx, {
      namespace,
      query: args.query,
      limit: args.limit || 10,
      vectorScoreThreshold: 0.5,
      filters: [{ name: "type", value: "commit" }],
    });

    return results;
  },
});

/**
 * Search for similar changes in RAG
 * Used to find similar past changes for context in digest generation
 * SECURITY: Verifies repository ownership and uses repository-scoped namespace
 */
export const searchSimilarChanges = internalAction({
  args: {
    repositoryId: v.id("repositories"),
    userId: v.id("users"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Verify ownership
    await getRepositoryWithOwnership(ctx, args.repositoryId, args.userId);

    // Use repository-scoped namespace
    const namespace = `repo-${args.repositoryId}`;

    const results = await rag.search(ctx, {
      namespace,
      query: args.query,
      limit: args.limit || 5,
      vectorScoreThreshold: 0.6, // Higher threshold for similarity
      chunkContext: { before: 1, after: 1 }, // Include surrounding context
    });

    return results;
  },
});
