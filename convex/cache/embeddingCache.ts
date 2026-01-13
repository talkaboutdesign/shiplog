"use node";

import { ActionCache } from "@convex-dev/action-cache";
import { components } from "../_generated/api";
import { internal } from "../_generated/api";

// Cache for embeddings (7 days TTL)
// Key format: embed-${repositoryId}-${codeHash}
// SECURITY: repositoryId in key prevents cross-repo access
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const embeddingCache: ActionCache<any> = new ActionCache(components.actionCache, {
  action: internal.cache.compute.computeEmbedding,
  name: "embedding-v1",
  ttl: 1000 * 60 * 60 * 24 * 7, // 7 days
});
