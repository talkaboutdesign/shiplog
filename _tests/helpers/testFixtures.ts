import { Id } from "../../convex/_generated/dataModel";

/**
 * Test fixtures and helpers for common test setup
 */

/**
 * Register Convex components for testing
 */
export function registerTestComponents(t: any) {
  // Component registration can be added here as needed
}

export interface TestUser {
  clerkId: string;
  email: string;
  githubUsername: string;
}

export interface TestRepository {
  userId: Id<"users">;
  githubId: number;
  githubInstallationId: number;
  name: string;
  fullName: string;
  owner: string;
  isPrivate: boolean;
  isActive: boolean;
}

/**
 * Create a test user in the database
 */
export async function createTestUser(
  ctx: any,
  userData: TestUser
): Promise<Id<"users">> {
  const now = Date.now();
  return await ctx.db.insert("users", {
    clerkId: userData.clerkId,
    email: userData.email,
    githubUsername: userData.githubUsername,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Create a test repository in the database
 */
export async function createTestRepository(
  ctx: any,
  repoData: TestRepository
): Promise<Id<"repositories">> {
  const now = Date.now();
  return await ctx.db.insert("repositories", {
    userId: repoData.userId,
    githubId: repoData.githubId,
    githubInstallationId: repoData.githubInstallationId,
    name: repoData.name,
    fullName: repoData.fullName,
    owner: repoData.owner,
    isPrivate: repoData.isPrivate,
    isActive: repoData.isActive,
    defaultBranch: "main",
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Create a test event in the database
 */
export async function createTestEvent(
  ctx: any,
  repositoryId: Id<"repositories">,
  eventData: {
    type: string;
    payload: any;
    actorGithubUsername: string;
    actorGithubId: number;
  }
): Promise<Id<"events">> {
  const now = Date.now();
  return await ctx.db.insert("events", {
    repositoryId,
    githubDeliveryId: `delivery-${now}`,
    type: eventData.type,
    payload: eventData.payload,
    actorGithubUsername: eventData.actorGithubUsername,
    actorGithubId: eventData.actorGithubId,
    occurredAt: now,
    status: "pending",
    createdAt: now,
  });
}

/**
 * Create a test digest in the database
 */
export async function createTestDigest(
  ctx: any,
  repositoryId: Id<"repositories">,
  eventId: Id<"events">,
  digestData: {
    title: string;
    summary: string;
    category?: "feature" | "bugfix" | "refactor" | "docs" | "chore" | "security";
  }
): Promise<Id<"digests">> {
  const now = Date.now();
  return await ctx.db.insert("digests", {
    repositoryId,
    eventId,
    title: digestData.title,
    summary: digestData.summary,
    category: digestData.category,
    contributors: ["test-user"],
    createdAt: now,
  });
}

/**
 * Set up two users with repositories for isolation tests
 */
export async function setupTwoUsersWithRepos(t: any): Promise<{
  userA: any; // Test identity with .run(), .query(), .action() methods
  userB: any; // Test identity with .run(), .query(), .action() methods
  userIdA: Id<"users">;
  userIdB: Id<"users">;
  repoA: Id<"repositories">;
  repoB: Id<"repositories">;
}> {
  const userA = t.withIdentity({ subject: "user_a_id", name: "UserA" });
  const userB = t.withIdentity({ subject: "user_b_id", name: "UserB" });

  // Create both users
  const userIdA = await userA.run(async (ctx) => {
    return await ctx.db.insert("users", {
      clerkId: "user_a_id",
      email: "usera@example.com",
      githubUsername: "usera",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  const userIdB = await userB.run(async (ctx) => {
    return await ctx.db.insert("users", {
      clerkId: "user_b_id",
      email: "userb@example.com",
      githubUsername: "userb",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  // Create repositories
  const repoA = await userA.run(async (ctx) => {
    return await ctx.db.insert("repositories", {
      userId: userIdA,
      githubId: 123,
      githubInstallationId: 456,
      name: "repo-a",
      fullName: "usera/repo-a",
      owner: "usera",
      isPrivate: false,
      isActive: true,
      defaultBranch: "main",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  const repoB = await userB.run(async (ctx) => {
    return await ctx.db.insert("repositories", {
      userId: userIdB,
      githubId: 789,
      githubInstallationId: 789,
      name: "repo-b",
      fullName: "userb/repo-b",
      owner: "userb",
      isPrivate: false,
      isActive: true,
      defaultBranch: "main",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  return {
    userA,
    userB,
    userIdA,
    userIdB,
    repoA,
    repoB,
  };
}
