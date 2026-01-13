"use node";

import { ActionCache } from "@convex-dev/action-cache";
import { components } from "../_generated/api";
import { internal } from "../_generated/api";

// Cache for digest generation (1 day TTL)
// Key format: digest-${repositoryId}-${eventHash}
// SECURITY: repositoryId in key prevents cross-repo access
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const digestCache: ActionCache<any> = new ActionCache(components.actionCache, {
  action: internal.cache.compute.computeDigest,
  name: "digest-v1",
  ttl: 1000 * 60 * 60 * 24, // 1 day
});
