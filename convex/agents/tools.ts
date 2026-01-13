"use node";

import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../_generated/api";
import { getFileDiffForPush, getFileDiffForPR, getGitHubAppConfig } from "../github";
import { getRepositoryWithOwnership } from "../security/ownership";
import { Id } from "../_generated/dataModel";

/**
 * Create tools with workflow context for security
 * Tools receive workflowContext with userId and repositoryId for ownership verification
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAgentTools(workflowContext: { userId: Id<"users">; repositoryId: Id<"repositories"> }): Record<string, any> {
  /**
   * Agent tool: Get file diff for a push event
   * SECURITY: Verifies repository ownership before fetching
   */
  const getFileDiffTool = createTool({
    description: "Get file diff for a push or pull request event",
    args: z.object({
      eventType: z.enum(["push", "pull_request"]).describe("Type of event"),
      pushBase: z.string().optional().describe("Base SHA for push events"),
      pushHead: z.string().optional().describe("Head SHA for push events"),
      prNumber: z.number().optional().describe("PR number for pull request events"),
    }),
    handler: async (ctx, args) => {
      // CRITICAL: Verify ownership using workflow context
      const { repository } = await getRepositoryWithOwnership(
        ctx,
        workflowContext.repositoryId,
        workflowContext.userId
      );

      const config = getGitHubAppConfig();
      const [owner, repo] = repository.fullName.split("/");

      if (args.eventType === "push" && args.pushBase && args.pushHead) {
        return await getFileDiffForPush(
          config,
          repository.githubInstallationId,
          owner,
          repo,
          args.pushBase,
          args.pushHead
        );
      } else if (args.eventType === "pull_request" && args.prNumber) {
        return await getFileDiffForPR(
          config,
          repository.githubInstallationId,
          owner,
          repo,
          args.prNumber
        );
      }

      throw new Error("Invalid arguments for getFileDiff");
    },
  });

  return {
    getFileDiff: getFileDiffTool,
  };
}
