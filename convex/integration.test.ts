import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("Cross-user isolation", () => {
  it("ensures users cannot access data from other users' repositories", async () => {
    const t = convexTest(schema, modules);
    
    const userA = t.withIdentity({ subject: "user_a_id", name: "UserA" });
    const userB = t.withIdentity({ subject: "user_b_id", name: "UserB" });
    
    // Create both users with their repositories, events, and digests
    const { repoIdA, repoIdB, eventIdA, eventIdB } = await t.run(async (ctx) => {
      const userIdA = await ctx.db.insert("users", {
        clerkId: "user_a_id",
        email: "usera@example.com",
        githubUsername: "usera",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const userIdB = await ctx.db.insert("users", {
        clerkId: "user_b_id",
        email: "userb@example.com",
        githubUsername: "userb",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      
      const repoIdA = await ctx.db.insert("repositories", {
        userId: userIdA,
        githubId: 123,
        githubInstallationId: 456,
        name: "repo-a",
        fullName: "usera/repo-a",
        owner: "usera",
        isPrivate: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const repoIdB = await ctx.db.insert("repositories", {
        userId: userIdB,
        githubId: 789,
        githubInstallationId: 789,
        name: "repo-b",
        fullName: "userb/repo-b",
        owner: "userb",
        isPrivate: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      
      const eventIdA = await ctx.db.insert("events", {
        repositoryId: repoIdA,
        githubDeliveryId: "delivery-a",
        type: "push",
        payload: {},
        occurredAt: Date.now(),
        status: "completed",
        createdAt: Date.now(),
      });
      const eventIdB = await ctx.db.insert("events", {
        repositoryId: repoIdB,
        githubDeliveryId: "delivery-b",
        type: "push",
        payload: {},
        occurredAt: Date.now(),
        status: "completed",
        createdAt: Date.now(),
      });
      
      await ctx.db.insert("digests", {
        repositoryId: repoIdA,
        eventId: eventIdA,
        githubDeliveryId: "delivery-a",
        title: "Digest A",
        summary: "Summary A",
        contributors: ["usera"],
        metadata: { eventType: "push" },
        createdAt: Date.now(),
      });
      await ctx.db.insert("digests", {
        repositoryId: repoIdB,
        eventId: eventIdB,
        githubDeliveryId: "delivery-b",
        title: "Digest B",
        summary: "Summary B",
        contributors: ["userb"],
        metadata: { eventType: "push" },
        createdAt: Date.now(),
      });
      
      return { repoIdA, repoIdB, eventIdA, eventIdB };
    });
    
    // User A should be able to access their own data
    const eventsA = await userA.query(api.events.listByRepository, {
      repositoryId: repoIdA,
    });
    expect(eventsA.length).toBe(1);
    expect(eventsA[0].repositoryId).toBe(repoIdA);
    
    const digestsA = await userA.query(api.digests.listByRepository, {
      repositoryId: repoIdA,
    });
    expect(digestsA.length).toBe(1);
    expect(digestsA[0].repositoryId).toBe(repoIdA);
    
    // User B should be able to access their own data
    const eventsB = await userB.query(api.events.listByRepository, {
      repositoryId: repoIdB,
    });
    expect(eventsB.length).toBe(1);
    expect(eventsB[0].repositoryId).toBe(repoIdB);
    
    const digestsB = await userB.query(api.digests.listByRepository, {
      repositoryId: repoIdB,
    });
    expect(digestsB.length).toBe(1);
    expect(digestsB[0].repositoryId).toBe(repoIdB);
    
    // User A should NOT be able to access User B's data
    await expect(
      userA.query(api.events.listByRepository, { repositoryId: repoIdB })
    ).rejects.toThrowError("Repository not found or unauthorized");
    
    await expect(
      userA.query(api.digests.listByRepository, { repositoryId: repoIdB })
    ).rejects.toThrowError("Repository not found or unauthorized");
    
    await expect(
      userA.query(api.events.get, { eventId: eventIdB })
    ).rejects.toThrowError("Repository not found or unauthorized");
    
    // getByEvent query removed - events are deleted after processing

    // User B should NOT be able to access User A's data
    await expect(
      userB.query(api.events.listByRepository, { repositoryId: repoIdA })
    ).rejects.toThrowError("Repository not found or unauthorized");
    
    await expect(
      userB.query(api.digests.listByRepository, { repositoryId: repoIdA })
    ).rejects.toThrowError("Repository not found or unauthorized");
    
    await expect(
      userB.query(api.events.get, { eventId: eventIdA })
    ).rejects.toThrowError("Repository not found or unauthorized");
  });

  it("filters mixed repository arrays to only return owned resources", async () => {
    const t = convexTest(schema, modules);
    
    const userA = t.withIdentity({ subject: "user_a_id" });
    const userB = t.withIdentity({ subject: "user_b_id" });
    
    // Create both users with their repositories and events
    const { repoIdA, repoIdB } = await t.run(async (ctx) => {
      const userIdA = await ctx.db.insert("users", {
        clerkId: "user_a_id",
        email: "usera@example.com",
        githubUsername: "usera",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const userIdB = await ctx.db.insert("users", {
        clerkId: "user_b_id",
        email: "userb@example.com",
        githubUsername: "userb",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      
      const repoIdA = await ctx.db.insert("repositories", {
        userId: userIdA,
        githubId: 123,
        githubInstallationId: 456,
        name: "repo-a",
        fullName: "usera/repo-a",
        owner: "usera",
        isPrivate: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const repoIdB = await ctx.db.insert("repositories", {
        userId: userIdB,
        githubId: 789,
        githubInstallationId: 789,
        name: "repo-b",
        fullName: "userb/repo-b",
        owner: "userb",
        isPrivate: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      
      await ctx.db.insert("events", {
        repositoryId: repoIdA,
        githubDeliveryId: "delivery-a",
        type: "push",
        payload: {},
        occurredAt: Date.now(),
        status: "completed",
        createdAt: Date.now(),
      });
      await ctx.db.insert("events", {
        repositoryId: repoIdB,
        githubDeliveryId: "delivery-b",
        type: "push",
        payload: {},
        occurredAt: Date.now(),
        status: "completed",
        createdAt: Date.now(),
      });
      
      return { repoIdA, repoIdB };
    });
    
    // User A should only see events from their own repository
    const eventsA = await userA.query(api.events.listByRepositories, {
      repositoryIds: [repoIdA, repoIdB],
    });
    expect(eventsA.length).toBe(1);
    expect(eventsA[0].repositoryId).toBe(repoIdA);
    
    // User B should only see events from their own repository
    const eventsB = await userB.query(api.events.listByRepositories, {
      repositoryIds: [repoIdA, repoIdB],
    });
    expect(eventsB.length).toBe(1);
    expect(eventsB[0].repositoryId).toBe(repoIdB);
  });
});
