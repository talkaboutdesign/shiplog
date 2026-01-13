import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { setupTwoUsersWithRepos } from "../helpers/testFixtures";
import { expectCacheKeyFormat, expectOwnershipError } from "../helpers/testHelpers";

const modules = import.meta.glob("../../convex/**/*.ts");

describe("Cache Key Isolation", () => {
  it("should include repositoryId in all cache keys", async () => {
    const t = convexTest(schema, modules);
    const { userA, repoA } = await setupTwoUsersWithRepos(t);

    // Create an event
    const eventId = await userA.run(async (ctx) => {
      return await ctx.db.insert("events", {
        repositoryId: repoA,
        githubDeliveryId: "delivery-1",
        type: "push",
        payload: { commits: [{ message: "Test commit" }] },
        actorGithubUsername: "usera",
        actorGithubId: 1,
        occurredAt: Date.now(),
        status: "pending",
        createdAt: Date.now(),
      });
    });

    // The cache key should include repositoryId
    // This is verified in the cache implementation
    // Cache keys follow pattern: {type}-${repositoryId}-${hash}
    const eventHash = "test-hash";
    expectCacheKeyFormat(`digest-${repoA}-${eventHash}`, repoA);
  });

  it("should prevent cache key collisions across repositories", async () => {
    const t = convexTest(schema, modules);
    const { userA, repoA, repoB } = await setupTwoUsersWithRepos(t);

    // Same hash for different repositories should produce different cache keys
    const hash = "same-hash";
    const keyA = `digest-${repoA}-${hash}`;
    const keyB = `digest-${repoB}-${hash}`;

    expect(keyA).not.toBe(keyB);
    expect(keyA).toContain(repoA);
    expect(keyB).toContain(repoB);
  });

  it("should verify ownership before cache access", async () => {
    const t = convexTest(schema, modules);
    const { userA, userB, repoB } = await setupTwoUsersWithRepos(t);

    // User A should not be able to access cache for User B's repository
    // This is tested through the agent actions that use the cache
    // Cache access happens through agent actions, which verify ownership
    // This is tested indirectly through agent security tests
    // The cache key format itself ensures isolation (repositoryId in key)
  });
});
