import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("digests.listByRepository", () => {
  it("allows users to list digests from their own repositories", async () => {
    const t = convexTest(schema, modules);
    
    const userA = t.withIdentity({ subject: "user_a_id" });
    
    // Create user A and their repository with digest
    const { repoId } = await userA.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkId: "user_a_id",
        email: "usera@example.com",
        githubUsername: "usera",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const repoId = await ctx.db.insert("repositories", {
        userId,
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
      const eventId = await ctx.db.insert("events", {
        repositoryId: repoId,
        githubDeliveryId: "delivery-1",
        type: "push",
        payload: {},
        actorGithubUsername: "usera",
        actorGithubId: 1,
        occurredAt: Date.now(),
        status: "completed",
        createdAt: Date.now(),
      });
      await ctx.db.insert("digests", {
        repositoryId: repoId,
        eventId,
        title: "Test Digest",
        summary: "Test summary",
        contributors: ["usera"],
        createdAt: Date.now(),
      });
      return { repoId };
    });
    
    // User A should be able to list digests from their own repository
    const digests = await userA.query(api.digests.listByRepository, { repositoryId: repoId });
    expect(digests).toBeDefined();
    expect(digests.length).toBeGreaterThan(0);
  });

  it("rejects access to digests from other users' repositories", async () => {
    const t = convexTest(schema, modules);
    
    const userA = t.withIdentity({ subject: "user_a_id" });
    const userB = t.withIdentity({ subject: "user_b_id" });
    
    // Create user B first so they exist in the database
    await userB.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "user_b_id",
        email: "userb@example.com",
        githubUsername: "userb",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    
    // Create user A and their repository
    const { repoId } = await userA.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkId: "user_a_id",
        email: "usera@example.com",
        githubUsername: "usera",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const repoId = await ctx.db.insert("repositories", {
        userId,
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
      return { repoId };
    });
    
    // User B should not be able to list digests from User A's repository
    await expect(
      userB.query(api.digests.listByRepository, { repositoryId: repoId })
    ).rejects.toThrowError("Repository not found or unauthorized");
  });
});

describe("digests.listByRepositories", () => {
  it("filters out repositories the user doesn't own", async () => {
    const t = convexTest(schema, modules);
    
    const userA = t.withIdentity({ subject: "user_a_id" });
    
    // Create user A and user B with their repositories
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
      // Add digests to both repositories
      const eventIdA = await ctx.db.insert("events", {
        repositoryId: repoIdA,
        githubDeliveryId: "delivery-a",
        type: "push",
        payload: {},
        actorGithubUsername: "usera",
        actorGithubId: 1,
        occurredAt: Date.now(),
        status: "completed",
        createdAt: Date.now(),
      });
      const eventIdB = await ctx.db.insert("events", {
        repositoryId: repoIdB,
        githubDeliveryId: "delivery-b",
        type: "push",
        payload: {},
        actorGithubUsername: "userb",
        actorGithubId: 2,
        occurredAt: Date.now(),
        status: "completed",
        createdAt: Date.now(),
      });
      await ctx.db.insert("digests", {
        repositoryId: repoIdA,
        eventId: eventIdA,
        title: "Digest A",
        summary: "Summary A",
        contributors: ["usera"],
        createdAt: Date.now(),
      });
      await ctx.db.insert("digests", {
        repositoryId: repoIdB,
        eventId: eventIdB,
        title: "Digest B",
        summary: "Summary B",
        contributors: ["userb"],
        createdAt: Date.now(),
      });
      return { repoIdA, repoIdB };
    });
    
    // User A should only see digests from their own repository
    const digests = await userA.query(api.digests.listByRepositories, {
      repositoryIds: [repoIdA, repoIdB],
    });
    expect(digests).toBeDefined();
    expect(digests.length).toBe(1);
    expect(digests[0].repositoryId).toBe(repoIdA);
  });
});

describe("digests.getByEvent", () => {
  it("allows users to access digests from events in their own repositories", async () => {
    const t = convexTest(schema, modules);
    
    const userA = t.withIdentity({ subject: "user_a_id" });
    
    // Create user A and their repository with event and digest
    const { eventId } = await userA.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkId: "user_a_id",
        email: "usera@example.com",
        githubUsername: "usera",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const repoId = await ctx.db.insert("repositories", {
        userId,
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
      const eventId = await ctx.db.insert("events", {
        repositoryId: repoId,
        githubDeliveryId: "delivery-1",
        type: "push",
        payload: {},
        actorGithubUsername: "usera",
        actorGithubId: 1,
        occurredAt: Date.now(),
        status: "completed",
        createdAt: Date.now(),
      });
      await ctx.db.insert("digests", {
        repositoryId: repoId,
        eventId,
        title: "Test Digest",
        summary: "Test summary",
        contributors: ["usera"],
        createdAt: Date.now(),
      });
      return { eventId };
    });
    
    // User A should be able to access digest from their own event
    const digest = await userA.query(api.digests.getByEvent, { eventId });
    expect(digest).toBeDefined();
    expect(digest?.eventId).toBe(eventId);
  });

  it("rejects access to digests from events in other users' repositories", async () => {
    const t = convexTest(schema, modules);
    
    const userA = t.withIdentity({ subject: "user_a_id" });
    const userB = t.withIdentity({ subject: "user_b_id" });
    
    // Create user B first so they exist in the database
    await userB.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "user_b_id",
        email: "userb@example.com",
        githubUsername: "userb",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    
    // Create user A and their repository with event and digest
    const { eventId } = await userA.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkId: "user_a_id",
        email: "usera@example.com",
        githubUsername: "usera",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const repoId = await ctx.db.insert("repositories", {
        userId,
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
      const eventId = await ctx.db.insert("events", {
        repositoryId: repoId,
        githubDeliveryId: "delivery-1",
        type: "push",
        payload: {},
        actorGithubUsername: "usera",
        actorGithubId: 1,
        occurredAt: Date.now(),
        status: "completed",
        createdAt: Date.now(),
      });
      await ctx.db.insert("digests", {
        repositoryId: repoId,
        eventId,
        title: "Test Digest",
        summary: "Test summary",
        contributors: ["usera"],
        createdAt: Date.now(),
      });
      return { eventId };
    });
    
    // User B should not be able to access digest from User A's event
    await expect(
      userB.query(api.digests.getByEvent, { eventId })
    ).rejects.toThrowError("Repository not found or unauthorized");
  });
});
