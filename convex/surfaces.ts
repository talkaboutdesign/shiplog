import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getCurrentUser, verifyRepositoryOwnership } from "./auth";

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
    const user = await getCurrentUser(ctx);
    
    // Verify repository ownership before returning index status
    await verifyRepositoryOwnership(ctx, args.repositoryId, user._id);
    
    const repository = await ctx.db.get("repositories", args.repositoryId);
    if (!repository) {
      return null;
    }

    // Get surface count efficiently - avoid loading all surfaces into memory
    // Convex doesn't have a native count, so we use take() with a reasonable limit
    // and indicate if there are more
    const maxCount = 1000;
    const surfaces = await ctx.db
      .query("codeSurfaces")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .take(maxCount + 1);

    const surfaceCount = surfaces.length > maxCount ? maxCount : surfaces.length;
    const hasMoreSurfaces = surfaces.length > maxCount;

    return {
      indexStatus: repository.indexStatus || "pending",
      indexedAt: repository.indexedAt,
      indexError: repository.indexError,
      surfaceCount,
      hasMoreSurfaces,
    };
  },
});

// Get surfaces for a repository with pagination
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
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    // Verify repository ownership before returning surfaces
    await verifyRepositoryOwnership(ctx, args.repositoryId, user._id);

    const limit = args.limit || 100; // Default to 100 surfaces per request

    let query = ctx.db
      .query("codeSurfaces")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId));

    if (args.surfaceType) {
      query = query.filter((q) => q.eq(q.field("surfaceType"), args.surfaceType));
    }

    return await query.take(limit);
  },
});

// Get surfaces by file paths
export const getSurfacesByPaths = internalQuery({
  args: {
    repositoryId: v.id("repositories"),
    filePaths: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Use the by_repository_path index to query each path efficiently
    // This avoids fetching all surfaces and filtering in memory
    const surfacePromises = args.filePaths.map((filePath) =>
      ctx.db
        .query("codeSurfaces")
        .withIndex("by_repository_path", (q) =>
          q.eq("repositoryId", args.repositoryId).eq("filePath", filePath)
        )
        .collect()
    );
    
    const surfaceArrays = await Promise.all(surfacePromises);
    // Flatten and deduplicate (in case of duplicates)
    const surfaces = surfaceArrays.flat();
    const uniqueSurfaces = Array.from(
      new Map(surfaces.map((s) => [s._id, s])).values()
    );
    return uniqueSurfaces;
  },
});

// Get all surfaces for a repository (used for impact analysis)
export const getSurfacesByRepositoryInternal = internalQuery({
  args: {
    repositoryId: v.id("repositories"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("codeSurfaces")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .collect();
  },
});

// Get surfaces by IDs
export const getSurfacesByIds = query({
  args: {
    surfaceIds: v.array(v.id("codeSurfaces")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    
    // Get all surfaces
    const surfaces = await Promise.all(
      args.surfaceIds.map((id) => ctx.db.get("codeSurfaces", id))
    );
    const validSurfaces = surfaces.filter((s): s is NonNullable<typeof s> => s !== null);
    
    if (validSurfaces.length === 0) {
      return [];
    }
    
    // Get all unique repository IDs from the surfaces
    const repositoryIds = Array.from(new Set(validSurfaces.map(s => s.repositoryId)));
    
    // Verify that all repositories belong to the user
    for (const repositoryId of repositoryIds) {
      await verifyRepositoryOwnership(ctx, repositoryId, user._id);
    }
    
    return validSurfaces;
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

export const createBatch = internalMutation({
  args: {
    repositoryId: v.id("repositories"),
    surfaces: v.array(
      v.object({
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
      }),
    ),
    indexedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ids = [];
    for (const surface of args.surfaces) {
      const id = await ctx.db.insert("codeSurfaces", {
        repositoryId: args.repositoryId,
        filePath: surface.filePath,
        surfaceType: surface.surfaceType,
        name: surface.name,
        dependencies: surface.dependencies,
        exports: surface.exports,
        lastSeenAt: now,
        indexedAt: args.indexedAt,
      });
      ids.push(id);
    }
    return ids;
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
      await ctx.db.delete("codeSurfaces", surface._id);
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
    const surface = await ctx.db.get("codeSurfaces", args.surfaceId);
    if (!surface) {
      return;
    }

    await ctx.db.patch("codeSurfaces", args.surfaceId, {
      lastSeenAt: Date.now(),
    });
  },
});
