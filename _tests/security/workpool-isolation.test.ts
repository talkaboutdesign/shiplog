import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { setupTwoUsersWithRepos } from "../helpers/testFixtures";
import { expectOwnershipError } from "../helpers/testHelpers";

const modules = import.meta.glob("../../convex/**/*.ts");

describe("Workpool Isolation", () => {
  it("should prevent users from enqueueing work for other users' repositories", async () => {
    const t = convexTest(schema, modules);
    const { userA, userB, repoB } = await setupTwoUsersWithRepos(t);

    // Create a digest for repo B
    const eventId = await userB.run(async (ctx) => {
      return await ctx.db.insert("events", {
        repositoryId: repoB,
        githubDeliveryId: "delivery-1",
        type: "push",
        payload: { commits: [{ message: "Test commit" }] },
        actorGithubUsername: "userb",
        actorGithubId: 2,
        occurredAt: Date.now(),
        status: "completed",
        createdAt: Date.now(),
      });
    });

    const digestId = await userB.run(async (ctx) => {
      return await ctx.db.insert("digests", {
        repositoryId: repoB,
        eventId,
        title: "Test Digest",
        summary: "Test summary",
        contributors: ["userb"],
        createdAt: Date.now(),
      });
    });

    // Set up user A with API keys
    await userA.run(async (ctx) => {
      const u = await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", "user_a_id")).first();
      if (u) {
        await ctx.db.patch("users", u._id, {
          apiKeys: {
            openai: "test-key",
            preferredProvider: "openai",
          },
        });
      }
    });
    
    const userAId = await userA.run(async (ctx) => {
      return (await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", "user_a_id")).first())!._id;
    });

    // User A should not be able to generate perspective for User B's digest
    await expectOwnershipError(
      userA.action(internal.agents.perspectiveAgent.generatePerspective, {
        digestId,
        repositoryId: repoB, // User B's repository
        userId: userAId, // User A's ID (should fail)
        perspective: "feature",
      })
    );
  });
});
