"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  getInstallationRepos,
  getGitHubAppConfig,
} from "./github";

export const syncInstallation = internalAction({
  args: {
    userId: v.id("users"),
    installationId: v.number(),
  },
  handler: async (ctx, args) => {
    // @octokit/auth-app supports both PKCS#1 and PKCS#8 formats in Node.js
    // No conversion needed - use the key directly from getGitHubAppConfig
    const config = getGitHubAppConfig();
    const repos = await getInstallationRepos(config, args.installationId);

    if (repos.length === 0) {
      throw new Error("No repositories found in installation");
    }

    // Sync all repositories from the installation
    for (const repo of repos) {
      await ctx.runMutation(internal.repositories.createOrUpdateRepository, {
        userId: args.userId,
        installationId: args.installationId,
        githubId: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        owner: repo.owner.login,
        defaultBranch: repo.default_branch,
        isPrivate: repo.private,
        preserveIsActive: false, // On initial sync, don't preserve
      });
    }
  },
});

export const refreshInstallationRepos = internalAction({
  args: {
    userId: v.id("users"),
    installationId: v.number(),
  },
  handler: async (ctx, args) => {
    const config = getGitHubAppConfig();
    const repos = await getInstallationRepos(config, args.installationId);

    // Get existing repos for this installation to preserve isActive status
    const existingRepos = await ctx.runQuery(internal.repositories.getByInstallationForRefresh, {
      userId: args.userId,
      installationId: args.installationId,
    });

    const existingRepoMap = new Map(
      existingRepos.map((repo) => [repo.githubId, repo])
    );

    // Update or create all repos from GitHub
    for (const repo of repos) {
      const existing = existingRepoMap.get(repo.id);
      await ctx.runMutation(internal.repositories.createOrUpdateRepository, {
        userId: args.userId,
        installationId: args.installationId,
        githubId: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        owner: repo.owner.login,
        defaultBranch: repo.default_branch,
        isPrivate: repo.private,
        preserveIsActive: true, // Preserve existing isActive status when refreshing
      });
    }

    // Mark repos that no longer exist in GitHub as inactive
    const currentRepoIds = new Set(repos.map((r) => r.id));
    for (const existingRepo of existingRepos) {
      if (!currentRepoIds.has(existingRepo.githubId)) {
        // Repo was removed from GitHub, mark as inactive
        await ctx.runMutation(internal.repositories.updateRepositoryStatus, {
          repositoryId: existingRepo._id,
          isActive: false,
        });
      }
    }
  },
});
