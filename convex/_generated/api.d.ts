/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agents_config from "../agents/config.js";
import type * as agents_digestAgent from "../agents/digestAgent.js";
import type * as agents_errors from "../agents/errors.js";
import type * as agents_impactAgent from "../agents/impactAgent.js";
import type * as agents_perspectiveAgent from "../agents/perspectiveAgent.js";
import type * as agents_prompts from "../agents/prompts.js";
import type * as agents_schemas from "../agents/schemas.js";
import type * as agents_summaryAgent from "../agents/summaryAgent.js";
import type * as ai from "../ai.js";
import type * as auth from "../auth.js";
import type * as cache_compute from "../cache/compute.js";
import type * as cache_digestCache from "../cache/digestCache.js";
import type * as cache_embeddingCache from "../cache/embeddingCache.js";
import type * as cache_impactCache from "../cache/impactCache.js";
import type * as cronActions from "../cronActions.js";
import type * as crons from "../crons.js";
import type * as digests from "../digests.js";
import type * as events from "../events.js";
import type * as github from "../github.js";
import type * as githubActions from "../githubActions.js";
import type * as http from "../http.js";
import type * as lib_periodUtils from "../lib/periodUtils.js";
import type * as repositories from "../repositories.js";
import type * as security_ownership from "../security/ownership.js";
import type * as summaries from "../summaries.js";
import type * as summariesAi from "../summariesAi.js";
import type * as timeline from "../timeline.js";
import type * as types from "../types.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "agents/config": typeof agents_config;
  "agents/digestAgent": typeof agents_digestAgent;
  "agents/errors": typeof agents_errors;
  "agents/impactAgent": typeof agents_impactAgent;
  "agents/perspectiveAgent": typeof agents_perspectiveAgent;
  "agents/prompts": typeof agents_prompts;
  "agents/schemas": typeof agents_schemas;
  "agents/summaryAgent": typeof agents_summaryAgent;
  ai: typeof ai;
  auth: typeof auth;
  "cache/compute": typeof cache_compute;
  "cache/digestCache": typeof cache_digestCache;
  "cache/embeddingCache": typeof cache_embeddingCache;
  "cache/impactCache": typeof cache_impactCache;
  cronActions: typeof cronActions;
  crons: typeof crons;
  digests: typeof digests;
  events: typeof events;
  github: typeof github;
  githubActions: typeof githubActions;
  http: typeof http;
  "lib/periodUtils": typeof lib_periodUtils;
  repositories: typeof repositories;
  "security/ownership": typeof security_ownership;
  summaries: typeof summaries;
  summariesAi: typeof summariesAi;
  timeline: typeof timeline;
  types: typeof types;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  actionCache: {
    crons: {
      purge: FunctionReference<
        "mutation",
        "internal",
        { expiresAt?: number },
        null
      >;
    };
    lib: {
      get: FunctionReference<
        "query",
        "internal",
        { args: any; name: string; ttl: number | null },
        { kind: "hit"; value: any } | { expiredEntry?: string; kind: "miss" }
      >;
      put: FunctionReference<
        "mutation",
        "internal",
        {
          args: any;
          expiredEntry?: string;
          name: string;
          ttl: number | null;
          value: any;
        },
        { cacheHit: boolean; deletedExpiredEntry: boolean }
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        { args: any; name: string },
        null
      >;
      removeAll: FunctionReference<
        "mutation",
        "internal",
        { batchSize?: number; before?: number; name?: string },
        null
      >;
    };
  };
};
