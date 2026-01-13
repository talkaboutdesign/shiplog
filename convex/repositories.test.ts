import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("repositories.getByInstallation", () => {
  it("allows users to query repositories by their own installation ID", async () => {
    const t = convexTest(schema, modules);
    
    const userA = t.withIdentity({ subject: "user_a_id" });
    
    // Create user A and their repository
    const { installationId } = await userA.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkId: "user_a_id",
        email: "usera@example.com",
        githubUsername: "usera",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const installationId = 456;
      await ctx.db.insert("repositories", {
        userId,
        githubId: 123,
        githubInstallationId: installationId,
        name: "repo-a",
        fullName: "usera/repo-a",
        owner: "usera",
        isPrivate: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return { installationId };
    });
    
    // User A should be able to query by their own installation ID
    const repo = await userA.query(api.repositories.getByInstallation, {
      installationId,
    });
    expect(repo).toBeDefined();
    expect(repo?.githubInstallationId).toBe(installationId);
  });

  it("rejects access to repositories by other users' installation IDs", async () => {
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
    const { installationId } = await userA.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkId: "user_a_id",
        email: "usera@example.com",
        githubUsername: "usera",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const installationId = 456;
      await ctx.db.insert("repositories", {
        userId,
        githubId: 123,
        githubInstallationId: installationId,
        name: "repo-a",
        fullName: "usera/repo-a",
        owner: "usera",
        isPrivate: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return { installationId };
    });
    
    // User B should not be able to query by User A's installation ID
    await expect(
      userB.query(api.repositories.getByInstallation, { installationId })
    ).rejects.toThrowError("Installation not found or unauthorized");
  });
});

describe("repositories.toggleSyncStatus", () => {
  it("allows users to toggle sync status of their own repositories", async () => {
    const t = convexTest(schema, modules);
    
    const userA = t.withIdentity({ subject: "user_a_id" });
    
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
    
    // User A should be able to toggle sync status
    await userA.mutation(api.repositories.toggleSyncStatus, {
      repositoryId: repoId,
      isActive: false,
    });
    
    // Verify the status was updated
    const updatedRepo = await userA.run(async (ctx) => {
      return await ctx.db.get("repositories", repoId);
    });
    expect(updatedRepo?.isActive).toBe(false);
  });

  it("rejects updates to other users' repositories", async () => {
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
    
    // User B should not be able to toggle User A's repository
    await expect(
      userB.mutation(api.repositories.toggleSyncStatus, {
        repositoryId: repoId,
        isActive: false,
      })
    ).rejects.toThrowError("Repository not found or unauthorized");
  });
});

describe("repositories.getAllActive", () => {
  it("only returns repositories owned by the authenticated user", async () => {
    const t = convexTest(schema, modules);
    
    const userA = t.withIdentity({ subject: "user_a_id" });
    const userB = t.withIdentity({ subject: "user_b_id" });
    
    // Create both users with repositories
    await t.run(async (ctx) => {
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
      await ctx.db.insert("repositories", {
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
      await ctx.db.insert("repositories", {
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
    });
    
    // User A should only see their own repositories
    const reposA = await userA.query(api.repositories.getAllActive);
    expect(reposA).toBeDefined();
    expect(reposA.length).toBe(1);
    expect(reposA[0].owner).toBe("usera");
    
    // User B should only see their own repositories
    const reposB = await userB.query(api.repositories.getAllActive);
    expect(reposB).toBeDefined();
    expect(reposB.length).toBe(1);
    expect(reposB[0].owner).toBe("userb");
  });
});
