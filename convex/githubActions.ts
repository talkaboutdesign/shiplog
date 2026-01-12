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
    const rawConfig = getGitHubAppConfig();
    
    // Convert key to PKCS#8 format if needed (GitHub generates PKCS#1)
    // universal-github-app-jwt requires PKCS#8 (-----BEGIN PRIVATE KEY-----)
    let privateKey = rawConfig.privateKey;
    
    if (privateKey.includes("BEGIN RSA PRIVATE KEY")) {
      try {
        const { createPrivateKey } = require("crypto");
        // Try to create the key object - this will validate the format
        const keyObject = createPrivateKey(privateKey);
        privateKey = keyObject.export({
          type: "pkcs8",
          format: "pem",
        }) as string;
      } catch (error) {
        console.error("Error converting private key:", error);
        console.error("Private key preview (first 100 chars):", privateKey.substring(0, 100));
        console.error("Private key preview (last 100 chars):", privateKey.substring(privateKey.length - 100));
        throw new Error(
          `Failed to convert private key from PKCS#1 to PKCS#8: ${error instanceof Error ? error.message : "Unknown error"}. ` +
          `Please ensure the GITHUB_APP_PRIVATE_KEY environment variable is set correctly (base64-encoded or with \\n for newlines).`
        );
      }
    }
    
    const config = {
      ...rawConfig,
      privateKey,
    };
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
