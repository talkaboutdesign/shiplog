import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("events.get", () => {
  it("allows users to access events from their own repositories", async () => {
    const t = convexTest(schema, modules);
    
    const userA = t.withIdentity({ subject: "user_a_id" });
    
    // Create user A and their repository
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
      return { eventId };
    });
    
    // User A should be able to access their own event
    const event = await userA.query(api.events.get, { eventId });
    expect(event).toBeDefined();
    expect(event?._id).toBe(eventId);
  });

  it("rejects access to events from other users' repositories", async () => {
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
      return { eventId };
    });
    
    // User B should not be able to access User A's event
    await expect(
      userB.query(api.events.get, { eventId })
    ).rejects.toThrowError("Repository not found or unauthorized");
  });
});

describe("events.listByRepository", () => {
  it("allows users to list events from their own repositories", async () => {
    const t = convexTest(schema, modules);
    
    const userA = t.withIdentity({ subject: "user_a_id" });
    
    // Create user A and their repository with events
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
      await ctx.db.insert("events", {
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
      return { repoId };
    });
    
    // User A should be able to list events from their own repository
    const events = await userA.query(api.events.listByRepository, { repositoryId: repoId });
    expect(events).toBeDefined();
    expect(events.length).toBeGreaterThan(0);
  });

  it("rejects access to events from other users' repositories", async () => {
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
    
    // User B should not be able to list events from User A's repository
    await expect(
      userB.query(api.events.listByRepository, { repositoryId: repoId })
    ).rejects.toThrowError("Repository not found or unauthorized");
  });
});

describe("events.listByRepositories", () => {
  it("filters out repositories the user doesn't own", async () => {
    const t = convexTest(schema, modules);
    
    const userA = t.withIdentity({ subject: "user_a_id" });
    const userB = t.withIdentity({ subject: "user_b_id" });
    
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
      // Add events to both repositories
      await ctx.db.insert("events", {
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
      await ctx.db.insert("events", {
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
      return { repoIdA, repoIdB };
    });
    
    // User A should only see events from their own repository
    const events = await userA.query(api.events.listByRepositories, {
      repositoryIds: [repoIdA, repoIdB],
    });
    expect(events).toBeDefined();
    expect(events.length).toBe(1);
    expect(events[0].repositoryId).toBe(repoIdA);
  });

  it("returns empty array when user doesn't own any of the repositories", async () => {
    const t = convexTest(schema, modules);
    
    const userA = t.withIdentity({ subject: "user_a_id" });
    const userB = t.withIdentity({ subject: "user_b_id" });
    
    // Create user A first so they exist in the database
    await userA.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "user_a_id",
        email: "usera@example.com",
        githubUsername: "usera",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    
    // Create user B and their repository
    const { repoIdB } = await userB.run(async (ctx) => {
      const userIdB = await ctx.db.insert("users", {
        clerkId: "user_b_id",
        email: "userb@example.com",
        githubUsername: "userb",
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
      return { repoIdB };
    });
    
    // User A should get empty array when querying User B's repository
    const events = await userA.query(api.events.listByRepositories, {
      repositoryIds: [repoIdB],
    });
    expect(events).toEqual([]);
  });
});
