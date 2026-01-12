import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("users.get", () => {
  it("allows users to query their own clerkId", async () => {
    const t = convexTest(schema, modules);
    
    const userA = t.withIdentity({ name: "UserA", subject: "user_a_id" });
    
    // Create user A
    await userA.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "user_a_id",
        email: "usera@example.com",
        githubUsername: "usera",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    
    // User A should be able to query their own data
    const user = await userA.query(api.users.get, { clerkId: "user_a_id" });
    expect(user).toBeDefined();
    expect(user?.clerkId).toBe("user_a_id");
  });

  it("rejects queries for other users' clerkIds", async () => {
    const t = convexTest(schema, modules);
    
    const userA = t.withIdentity({ name: "UserA", subject: "user_a_id" });
    const userB = t.withIdentity({ name: "UserB", subject: "user_b_id" });
    
    // Create both users
    await userA.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "user_a_id",
        email: "usera@example.com",
        githubUsername: "usera",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    
    await userB.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "user_b_id",
        email: "userb@example.com",
        githubUsername: "userb",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    
    // User B should not be able to query User A's data
    await expect(
      userB.query(api.users.get, { clerkId: "user_a_id" })
    ).rejects.toThrowError("Unauthorized");
  });

  it("rejects unauthenticated queries", async () => {
    const t = convexTest(schema, modules);
    
    // Create a user without authentication context
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "user_a_id",
        email: "usera@example.com",
        githubUsername: "usera",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    
    // Query without authentication should fail
    await expect(
      t.query(api.users.get, { clerkId: "user_a_id" })
    ).rejects.toThrowError("Unauthorized");
  });
});

describe("users.getCurrent", () => {
  it("returns current user for authenticated user", async () => {
    const t = convexTest(schema, modules);
    
    const userA = t.withIdentity({ name: "UserA", subject: "user_a_id" });
    
    // Create user A
    await userA.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "user_a_id",
        email: "usera@example.com",
        githubUsername: "usera",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    
    const user = await userA.query(api.users.getCurrent);
    expect(user).toBeDefined();
    expect(user?.clerkId).toBe("user_a_id");
  });

  it("returns null for unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    
    const user = await t.query(api.users.getCurrent);
    expect(user).toBeNull();
  });
});

describe("users.updateApiKeys", () => {
  it("allows users to update their own API keys", async () => {
    const t = convexTest(schema, modules);
    
    const userA = t.withIdentity({ name: "UserA", subject: "user_a_id" });
    
    // Create user A
    const userId = await userA.run(async (ctx) => {
      return await ctx.db.insert("users", {
        clerkId: "user_a_id",
        email: "usera@example.com",
        githubUsername: "usera",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    
    // User A should be able to update their own keys
    await userA.mutation(api.users.updateApiKeys, {
      openai: "test-key",
    });
    
    // Verify the keys were updated
    const updatedUser = await userA.run(async (ctx) => {
      return await ctx.db.get(userId);
    });
    expect(updatedUser?.apiKeys?.openai).toBe("test-key");
  });

  it("rejects unauthenticated API key updates", async () => {
    const t = convexTest(schema, modules);
    
    await expect(
      t.mutation(api.users.updateApiKeys, { openai: "test-key" })
    ).rejects.toThrowError("Unauthorized");
  });
});
