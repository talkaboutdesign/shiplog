"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getGitHubAppConfig, getInstallationAccessToken } from "./github";

// Helper function to determine surface type from file path
function getSurfaceType(filePath: string): "component" | "service" | "utility" | "hook" | "type" | "config" | "other" {
  const lowerPath = filePath.toLowerCase();
  
  // React components
  if (filePath.match(/\.(tsx|jsx)$/)) {
    if (lowerPath.includes("hook") || lowerPath.includes("use")) {
      return "hook";
    }
    return "component";
  }
  
  // Services
  if (filePath.match(/(Service|Api|Client)\.(ts|js)$/i)) {
    return "service";
  }
  
  // Utilities
  if (lowerPath.includes("utils/") || lowerPath.includes("lib/") || lowerPath.includes("helpers/")) {
    return "utility";
  }
  
  // Types
  if (filePath.match(/\.(d\.ts|types?\.ts)$/i) || lowerPath.includes("types/")) {
    return "type";
  }
  
  // Config
  if (lowerPath.includes("config") || lowerPath.match(/\.config\.(ts|js)$/i)) {
    return "config";
  }
  
  return "other";
}

// Extract component/service name from file path
function extractName(filePath: string): string {
  const fileName = filePath.split("/").pop() || "";
  // Remove extension
  const nameWithoutExt = fileName.replace(/\.(tsx?|jsx?)$/, "");
  // Convert kebab-case or snake_case to PascalCase
  return nameWithoutExt
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

// Fetch repository tree from GitHub
async function fetchRepositoryTree(
  token: string,
  owner: string,
  repo: string,
  branch: string = "main"
): Promise<Array<{ path: string; type: string }>> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
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

  const data = (await response.json()) as { tree: Array<{ path: string; type: string }> };
  return data.tree.filter((item) => item.type === "blob"); // Only files, not directories
}

// Fetch file contents from GitHub
async function fetchFileContents(
  token: string,
  owner: string,
  repo: string,
  path: string,
  branch: string = "main"
): Promise<string> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
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

  const data = (await response.json()) as { content: string; encoding: string };
  if (data.encoding === "base64") {
    return Buffer.from(data.content, "base64").toString("utf-8");
  }
  return data.content;
}

// Extract dependencies from file content (simple regex-based approach)
function extractDependencies(content: string, filePath: string): string[] {
  const dependencies: string[] = [];
  const lines = content.split("\n");

  // Match import statements
  const importRegex = /import\s+(?:.*\s+from\s+)?['"](\.\.?\/[^'"]+)['"]/g;
  const requireRegex = /require\(['"](\.\.?\/[^'"]+)['"]\)/g;

  for (const line of lines) {
    // Match ES6 imports
    let match;
    while ((match = importRegex.exec(line)) !== null) {
      const importPath = match[1];
      // Resolve relative path to absolute
      const resolved = resolveImportPath(importPath, filePath);
      if (resolved) {
        dependencies.push(resolved);
      }
    }

    // Match CommonJS requires
    while ((match = requireRegex.exec(line)) !== null) {
      const requirePath = match[1];
      const resolved = resolveImportPath(requirePath, filePath);
      if (resolved) {
        dependencies.push(resolved);
      }
    }
  }

  return [...new Set(dependencies)]; // Remove duplicates
}

// Resolve relative import path to absolute file path
function resolveImportPath(importPath: string, currentFilePath: string): string | null {
  // Remove file extension if present
  importPath = importPath.replace(/\.(tsx?|jsx?)$/, "");
  
  // If it's already absolute (starts with /), return as is
  if (importPath.startsWith("/")) {
    return importPath;
  }

  // Get directory of current file
  const currentDir = currentFilePath.substring(0, currentFilePath.lastIndexOf("/"));

  // Resolve relative path
  const parts = currentDir.split("/").filter(Boolean);
  const importParts = importPath.split("/").filter(Boolean);

  for (const part of importParts) {
    if (part === "..") {
      if (parts.length > 0) {
        parts.pop();
      } else {
        return null; // Invalid path
      }
    } else if (part !== ".") {
      parts.push(part);
    }
  }

  return "/" + parts.join("/");
}

// Main indexing function
export const indexRepository = internalAction({
  args: {
    repositoryId: v.id("repositories"),
  },
  handler: async (ctx, args) => {
    // Get repository
    const repository = await ctx.runQuery(internal.repositories.getById, {
      repositoryId: args.repositoryId,
    });

    if (!repository) {
      throw new Error("Repository not found");
    }

    // Update status to indexing
    await ctx.runMutation(internal.repositories.updateIndexStatus, {
      repositoryId: args.repositoryId,
      indexStatus: "indexing",
      indexError: undefined,
    });

    try {
      const config = getGitHubAppConfig();
      const token = await getInstallationAccessToken(
        config,
        repository.githubInstallationId
      );

      const [owner, repo] = repository.fullName.split("/");
      const branch = repository.defaultBranch || "main";

      // Fetch repository tree
      const tree = await fetchRepositoryTree(token, owner, repo, branch);

      // Filter relevant files (TypeScript, JavaScript, TSX, JSX)
      const relevantFiles = tree.filter(
        (item) =>
          item.path.match(/\.(tsx?|jsx?)$/) &&
          !item.path.includes("node_modules") &&
          !item.path.includes(".next") &&
          !item.path.includes("dist") &&
          !item.path.includes("build")
      );

      // Process files in batches to avoid rate limits
      const batchSize = 10;
      const surfaces: Array<{
        filePath: string;
        surfaceType: "component" | "service" | "utility" | "hook" | "type" | "config" | "other";
        name: string;
        dependencies: string[];
        exports?: string[];
      }> = [];

      for (let i = 0; i < relevantFiles.length; i += batchSize) {
        const batch = relevantFiles.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(async (file) => {
            try {
              const content = await fetchFileContents(token, owner, repo, file.path, branch);
              const dependencies = extractDependencies(content, file.path);
              const surfaceType = getSurfaceType(file.path);
              const name = extractName(file.path);

              surfaces.push({
                filePath: file.path,
                surfaceType,
                name,
                dependencies,
              });
            } catch (error) {
              console.error(`Error processing file ${file.path}:`, error);
              // Continue with other files
            }
          })
        );

        // Small delay between batches to respect rate limits
        if (i + batchSize < relevantFiles.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      // Clear existing surfaces for this repository
      await ctx.runMutation(internal.surfaces.clearRepositorySurfaces, {
        repositoryId: args.repositoryId,
      });

      // Insert new surfaces
      const now = Date.now();
      for (const surface of surfaces) {
        await ctx.runMutation(internal.surfaces.create, {
          repositoryId: args.repositoryId,
          filePath: surface.filePath,
          surfaceType: surface.surfaceType,
          name: surface.name,
          dependencies: surface.dependencies,
          exports: surface.exports,
          indexedAt: now,
        });
      }

      // Update repository index status
      await ctx.runMutation(internal.repositories.updateIndexStatus, {
        repositoryId: args.repositoryId,
        indexStatus: "completed",
        indexedAt: now,
        indexError: undefined,
      });

      return { indexed: surfaces.length };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await ctx.runMutation(internal.repositories.updateIndexStatus, {
        repositoryId: args.repositoryId,
        indexStatus: "failed",
        indexError: errorMessage,
      });
      throw error;
    }
  },
});
