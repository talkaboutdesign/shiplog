"use node";

import { ActionCache } from "@convex-dev/action-cache";
import { components } from "../_generated/api";
import { internal } from "../_generated/api";

// Cache for impact analysis (3 days TTL)
// Key format: impact-${repositoryId}-${fileDiffHash}
// SECURITY: repositoryId in key prevents cross-repo access
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const impactCache: ActionCache<any> = new ActionCache(components.actionCache, {
  action: internal.cache.compute.computeImpact,
  name: "impact-v1",
  ttl: 1000 * 60 * 60 * 24 * 3, // 3 days
});
