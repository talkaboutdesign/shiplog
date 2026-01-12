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

    // For MVP, just take the first repo
    if (repos.length === 0) {
      throw new Error("No repositories found in installation");
    }

    const repo = repos[0];

    // Call internal mutation to update database
    await ctx.runMutation(internal.repositories.createOrUpdateRepository, {
      userId: args.userId,
      installationId: args.installationId,
      githubId: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      owner: repo.owner.login,
      defaultBranch: repo.default_branch,
      isPrivate: repo.private,
    });
  },
});
