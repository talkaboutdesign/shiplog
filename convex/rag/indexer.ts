"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
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
 * Index code surfaces into RAG with repository-scoped namespace
 * SECURITY: Verifies repository ownership before indexing
 */
export const indexCodeSurfaces = internalAction({
  args: {
    repositoryId: v.id("repositories"),
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<{ indexed: number; namespace: string }> => {
    // Verify ownership
    await getRepositoryWithOwnership(
      ctx,
      args.repositoryId,
      args.userId
    );

    // Get all code surfaces for this repository
    const surfaces = await ctx.runQuery(internal.surfaces.getSurfacesByRepositoryInternal, {
      repositoryId: args.repositoryId,
    });

    if (surfaces.length === 0) {
      return { indexed: 0, namespace: `repo-${args.repositoryId}` };
    }

    const namespace = `repo-${args.repositoryId}`;

    // Index each surface with its context
    for (const surface of surfaces) {
      // Build text content for embedding
      const text = `Code Surface: ${surface.name}
Type: ${surface.surfaceType}
File: ${surface.filePath}
Dependencies: ${surface.dependencies.join(", ")}
${surface.exports ? `Exports: ${surface.exports.join(", ")}` : ""}`;

      // Add to RAG with repository-scoped namespace
      await rag.add(ctx, {
        namespace,
        text,
        filterValues: [
          { name: "filePath", value: surface.filePath },
          { name: "surfaceType", value: surface.surfaceType },
          { name: "surfaceName", value: surface.name },
        ],
      });
    }

    return { indexed: surfaces.length, namespace };
  },
});

/**
 * Index file diff into RAG with repository-scoped namespace
 * SECURITY: Verifies repository ownership before indexing
 */
export const indexFileDiff = internalAction({
  args: {
    repositoryId: v.id("repositories"),
    userId: v.id("users"),
    fileDiff: v.object({
      filename: v.string(),
      status: v.union(
        v.literal("added"),
        v.literal("removed"),
        v.literal("modified"),
        v.literal("renamed")
      ),
      additions: v.number(),
      deletions: v.number(),
      patch: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    // Verify ownership
    await getRepositoryWithOwnership(ctx, args.repositoryId, args.userId);

    const namespace = `repo-${args.repositoryId}`;
    const text = `File: ${args.fileDiff.filename}
Status: ${args.fileDiff.status}
Changes: +${args.fileDiff.additions} -${args.fileDiff.deletions}
${args.fileDiff.patch ? `\nDiff:\n${args.fileDiff.patch.substring(0, 5000)}` : ""}`;

    await rag.add(ctx, {
      namespace,
      text,
      filterValues: [
        { name: "filename", value: args.fileDiff.filename },
        { name: "status", value: args.fileDiff.status },
      ],
    });

    return { indexed: true, namespace };
  },
});

/**
 * Index commit message into RAG with repository-scoped namespace
 * SECURITY: Verifies repository ownership before indexing
 */
export const indexCommitMessage = internalAction({
  args: {
    repositoryId: v.id("repositories"),
    userId: v.id("users"),
    commitMessage: v.string(),
    commitSha: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Verify ownership
    await getRepositoryWithOwnership(ctx, args.repositoryId, args.userId);

    const namespace = `repo-${args.repositoryId}`;
    const text = `Commit: ${args.commitSha || "unknown"}
Message: ${args.commitMessage}`;

    await rag.add(ctx, {
      namespace,
      text,
      filterValues: [
        { name: "type", value: "commit" },
        ...(args.commitSha ? [{ name: "commitSha", value: args.commitSha }] : []),
      ],
    });

    return { indexed: true, namespace };
  },
});

/**
 * Index multiple file diffs in batch
 * SECURITY: Verifies repository ownership before indexing
 */
export const indexFileDiffsBatch = internalAction({
  args: {
    repositoryId: v.id("repositories"),
    userId: v.id("users"),
    fileDiffs: v.array(
      v.object({
        filename: v.string(),
        status: v.union(
          v.literal("added"),
          v.literal("removed"),
          v.literal("modified"),
          v.literal("renamed")
        ),
        additions: v.number(),
        deletions: v.number(),
        patch: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Verify ownership
    await getRepositoryWithOwnership(ctx, args.repositoryId, args.userId);

    const namespace = `repo-${args.repositoryId}`;

    // Index all diffs
    for (const fileDiff of args.fileDiffs) {
      const text = `File: ${fileDiff.filename}
Status: ${fileDiff.status}
Changes: +${fileDiff.additions} -${fileDiff.deletions}
${fileDiff.patch ? `\nDiff:\n${fileDiff.patch.substring(0, 5000)}` : ""}`;

      await rag.add(ctx, {
        namespace,
        text,
        filterValues: [
          { name: "filename", value: fileDiff.filename },
          { name: "status", value: fileDiff.status },
        ],
      });
    }

    return { indexed: args.fileDiffs.length, namespace };
  },
});
