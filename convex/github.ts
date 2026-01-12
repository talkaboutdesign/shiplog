"use node";

import { createAppAuth } from "@octokit/auth-app";

export interface GitHubAppConfig {
  appId: string;
  privateKey: string;
  clientId: string;
  clientSecret: string;
}

export function getGitHubAppAuth(config: GitHubAppConfig) {
  return createAppAuth({
    appId: config.appId,
    privateKey: config.privateKey,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  });
}

export function getGitHubAppConfig(): GitHubAppConfig {
  const appId = process.env.GITHUB_APP_ID;
  let privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;

  if (!appId || !privateKey || !clientId || !clientSecret) {
    throw new Error("GitHub App configuration missing");
  }

  // Handle base64-encoded private key (recommended for Convex)
  // If the key doesn't start with "-----BEGIN", assume it's base64-encoded
  if (!privateKey.includes("BEGIN")) {
    try {
      privateKey = Buffer.from(privateKey, "base64").toString("utf-8");
    } catch (error) {
      throw new Error(
        `Failed to decode base64 private key: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  // Handle different private key formats:
  // Replace literal \n (backslash + n) with actual newlines
  // This handles both base64-decoded keys and directly pasted keys
  privateKey = privateKey.replace(/\\n/g, "\n");
  
  // Also handle Windows-style line endings if present
  privateKey = privateKey.replace(/\r\n/g, "\n");
  
  // Ensure proper PEM format
  if (!privateKey.includes("BEGIN") || !privateKey.includes("PRIVATE KEY")) {
    throw new Error(
      "GitHub App private key must be in PEM format (starts with -----BEGIN) or base64-encoded PEM"
    );
  }

  return {
    appId,
    privateKey,
    clientId,
    clientSecret,
  };
}


export async function getInstallationAccessToken(
  config: GitHubAppConfig,
  installationId: number
): Promise<string> {
  const auth = getGitHubAppAuth(config);
  const { token } = await auth({
    type: "installation",
    installationId,
  });
  return token;
}

export async function getInstallationRepos(
  config: GitHubAppConfig,
  installationId: number
) {
  const token = await getInstallationAccessToken(config, installationId);
  const response = await fetch(
    `https://api.github.com/installation/repositories`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  const data = (await response.json()) as {
    repositories: Array<{
      id: number;
      name: string;
      full_name: string;
      owner: { login: string };
      default_branch?: string;
      private: boolean;
    }>;
  };

  return data.repositories;
}

export async function getInstallationDetails(
  config: GitHubAppConfig,
  installationId: number
) {
  const token = await getInstallationAccessToken(config, installationId);
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return (await response.json()) as {
    id: number;
    account: { login: string };
  };
}
