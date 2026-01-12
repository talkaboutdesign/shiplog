import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// Check if repository needs indexing and trigger if needed
export const checkAndIndexIfNeeded = internalAction({
  args: {
    repositoryId: v.id("repositories"),
  },
  handler: async (ctx, args) => {
    const repository = await ctx.runQuery(internal.repositories.getById, {
      repositoryId: args.repositoryId,
    });

    if (!repository) {
      return { indexed: false, reason: "Repository not found" };
    }

    // Check if index exists and is complete
    if (repository.indexStatus === "completed" && repository.indexedAt) {
      return { indexed: true, reason: "Index already exists" };
    }

    // If already indexing, don't trigger again
    if (repository.indexStatus === "indexing") {
      return { indexed: false, reason: "Indexing in progress" };
    }

    // Trigger indexing (async, non-blocking)
    await ctx.scheduler.runAfter(0, internal.surfacesActions.indexRepository, {
      repositoryId: args.repositoryId,
    });

    return { indexed: false, reason: "Indexing triggered" };
  },
});

// Query to get repository index status
export const getRepositoryIndexStatus = query({
  args: { repositoryId: v.id("repositories") },
  handler: async (ctx, args) => {
    const repository = await ctx.db.get(args.repositoryId);
    if (!repository) {
      return null;
    }

    // Get surface count
    const surfaces = await ctx.db
      .query("codeSurfaces")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .collect();

    return {
      indexStatus: repository.indexStatus || "pending",
      indexedAt: repository.indexedAt,
      indexError: repository.indexError,
      surfaceCount: surfaces.length,
    };
  },
});

// Get surfaces for a repository
export const getSurfacesByRepository = query({
  args: {
    repositoryId: v.id("repositories"),
    surfaceType: v.optional(
      v.union(
        v.literal("component"),
        v.literal("service"),
        v.literal("utility"),
        v.literal("hook"),
        v.literal("type"),
        v.literal("config"),
        v.literal("other")
      )
    ),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("codeSurfaces")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId));

    if (args.surfaceType) {
      query = query.filter((q) => q.eq(q.field("surfaceType"), args.surfaceType));
    }

    return await query.collect();
  },
});

// Get surfaces by file paths
export const getSurfacesByPaths = internalQuery({
  args: {
    repositoryId: v.id("repositories"),
    filePaths: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const surfaces = await ctx.db
      .query("codeSurfaces")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .collect();

    return surfaces.filter((surface) => args.filePaths.includes(surface.filePath));
  },
});

// Get surfaces by IDs
export const getSurfacesByIds = query({
  args: {
    surfaceIds: v.array(v.id("codeSurfaces")),
  },
  handler: async (ctx, args) => {
    const surfaces = await Promise.all(
      args.surfaceIds.map((id) => ctx.db.get(id))
    );
    return surfaces.filter((s): s is NonNullable<typeof s> => s !== null);
  },
});

// Internal mutations
export const create = internalMutation({
  args: {
    repositoryId: v.id("repositories"),
    filePath: v.string(),
    surfaceType: v.union(
      v.literal("component"),
      v.literal("service"),
      v.literal("utility"),
      v.literal("hook"),
      v.literal("type"),
      v.literal("config"),
      v.literal("other")
    ),
    name: v.string(),
    dependencies: v.array(v.string()),
    exports: v.optional(v.array(v.string())),
    indexedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("codeSurfaces", {
      repositoryId: args.repositoryId,
      filePath: args.filePath,
      surfaceType: args.surfaceType,
      name: args.name,
      dependencies: args.dependencies,
      exports: args.exports,
      lastSeenAt: now,
      indexedAt: args.indexedAt,
    });
  },
});

export const clearRepositorySurfaces = internalMutation({
  args: {
    repositoryId: v.id("repositories"),
  },
  handler: async (ctx, args) => {
    const surfaces = await ctx.db
      .query("codeSurfaces")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .collect();

    for (const surface of surfaces) {
      await ctx.db.delete(surface._id);
    }

    return { deleted: surfaces.length };
  },
});

// Update surface last seen time (for incremental updates)
export const updateSurfaceLastSeen = internalMutation({
  args: {
    surfaceId: v.id("codeSurfaces"),
  },
  handler: async (ctx, args) => {
    const surface = await ctx.db.get(args.surfaceId);
    if (!surface) {
      return;
    }

    await ctx.db.patch(args.surfaceId, {
      lastSeenAt: Date.now(),
    });
  },
});
