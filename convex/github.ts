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

  // Debug: Log initial key state (only first/last 50 chars for security)
  console.log("Raw key from env - length:", privateKey.length);
  console.log("Raw key from env - first 50:", privateKey.substring(0, 50));
  console.log("Raw key from env - has BEGIN:", privateKey.includes("BEGIN"));
  console.log("Raw key from env - has literal \\n:", privateKey.includes("\\n"));
  console.log("Raw key from env - has actual \\n:", privateKey.includes("\n"));

  // Handle base64-encoded private key (recommended for Convex)
  // If the key doesn't start with "-----BEGIN", assume it's base64-encoded
  if (!privateKey.includes("BEGIN")) {
    try {
      console.log("Decoding base64 key...");
      privateKey = Buffer.from(privateKey, "base64").toString("utf-8");
      console.log("Base64 decoded - has BEGIN:", privateKey.includes("BEGIN"));
    } catch (error) {
      throw new Error(
        `Failed to decode base64 private key: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  // Handle different private key formats:
  // Replace literal \n (backslash + n) with actual newlines
  // This handles both base64-decoded keys and directly pasted keys
  // Need to handle both escaped and double-escaped cases
  const beforeReplace = privateKey;
  privateKey = privateKey.replace(/\\n/g, "\n");
  privateKey = privateKey.replace(/\\\\n/g, "\n"); // Handle double-escaped
  
  if (beforeReplace !== privateKey) {
    console.log("Replaced literal \\n with actual newlines");
  }
  
  // Trim whitespace that might cause issues
  privateKey = privateKey.trim();
  
  // Also handle Windows-style line endings if present
  privateKey = privateKey.replace(/\r\n/g, "\n");
  
  console.log("After processing - has actual newlines:", privateKey.includes("\n"));
  console.log("After processing - line count:", privateKey.split("\n").length);
  
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
