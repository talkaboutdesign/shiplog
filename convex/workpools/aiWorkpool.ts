import { Workpool } from "@convex-dev/workpool";
import { components } from "../_generated/api";

// General AI operations workpool
export const aiWorkpool = new Workpool(components.aiWorkpool, {
  maxParallelism: 10,
  retryActionsByDefault: true,
  defaultRetryBehavior: {
    maxAttempts: 3,
    initialBackoffMs: 1000,
    base: 2,
  },
});

// Impact analysis workpool (lower priority, fewer concurrent)
export const impactAnalysisWorkpool = new Workpool(components.impactAnalysisWorkpool, {
  maxParallelism: 5,
  retryActionsByDefault: true,
  defaultRetryBehavior: {
    maxAttempts: 3,
    initialBackoffMs: 1000,
    base: 2,
  },
});

// Perspective generation workpool
export const perspectiveWorkpool = new Workpool(components.perspectiveWorkpool, {
  maxParallelism: 10,
  retryActionsByDefault: true,
  defaultRetryBehavior: {
    maxAttempts: 3,
    initialBackoffMs: 1000,
    base: 2,
  },
});

// Summary generation workpool (higher priority, fewer concurrent for quality)
export const summaryWorkpool = new Workpool(components.summaryWorkpool, {
  maxParallelism: 3,
  retryActionsByDefault: true,
  defaultRetryBehavior: {
    maxAttempts: 3,
    initialBackoffMs: 1000,
    base: 2,
  },
});
