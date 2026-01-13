"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { components } from "../_generated/api";
import { Agent } from "@convex-dev/agent";
import { getUserModelConfig } from "./config";
import { DigestSchema } from "./schemas";
import { DIGEST_SYSTEM_PROMPT } from "./prompts";
import { z } from "zod";
import { createAgentTools } from "./tools";
import { getRepositoryWithOwnership } from "../security/ownership";
import { isTransientError, generateFallbackDigest, logStructuredOutputError } from "./errors";
import { getGitHubAppConfig, getFileDiffForPush, getFileDiffForPR } from "../github";
import { createHash } from "crypto";

/**
 * Create hash of event for cache key
 */
function createEventHash(event: any): string {
  const eventContent = JSON.stringify({
    type: event.type,
    payload: {
      commits: event.payload.commits?.map((c: any) => ({ message: c.message, sha: c.sha })),
      pull_request: event.payload.pull_request ? {
        title: event.payload.pull_request.title,
        body: event.payload.pull_request.body,
        number: event.payload.pull_request.number,
      } : undefined,
    },
  });
  return createHash("sha256").update(eventContent).digest("hex").substring(0, 16);
}

/**
 * Generate digest for an event using Agent component
 * SECURITY: Verifies repository ownership, uses user's API keys
 */
export const generateDigest = internalAction({
  args: {
    eventId: v.id("events"),
    repositoryId: v.id("repositories"),
    userId: v.id("users"),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: async (ctx, args): Promise<{ digestData: any; threadId: string }> => {
    // Verify ownership
    const { repository } = await getRepositoryWithOwnership(
      ctx,
      args.repositoryId,
      args.userId
    );

    // Get user and API keys
    const user = await ctx.runQuery(internal.users.getById, {
      userId: args.userId,
    });

    if (!user || !user.apiKeys) {
      throw new Error("User or API keys not found");
    }

    // Get event
    const event = await ctx.runQuery(internal.events.getById, {
      eventId: args.eventId,
    });

    if (!event) {
      throw new Error("Event not found");
    }

    // Get model config with user's API keys
    const { model } = getUserModelConfig(user.apiKeys);

    // Create agent with tools for future use
    const workflowContext = {
      userId: args.userId,
      repositoryId: args.repositoryId,
    };
    const tools = createAgentTools(workflowContext);

    const agent = new Agent(components.agent, {
      name: "Digest Agent",
      languageModel: model,
      instructions: DIGEST_SYSTEM_PROMPT,
      tools,
      maxSteps: 5,
    });

    // Create thread for tracking
    const { threadId } = await agent.createThread(ctx);

    // Get file diffs if available
    let fileDiffs = event.fileDiffs;
    if (!fileDiffs && (event.type === "push" || event.type === "pull_request")) {
      // Try to fetch file diffs using tool
      try {
        const config = getGitHubAppConfig();
        const [owner, repo] = repository.fullName.split("/");

        if (event.type === "push") {
          const pushPayload = event.payload;
          const base = pushPayload.before;
          const head = pushPayload.after;
          if (base && head) {
            fileDiffs = await getFileDiffForPush(
              config,
              repository.githubInstallationId,
              owner,
              repo,
              base,
              head
            );
          }
        } else if (event.type === "pull_request") {
          const pr = event.payload.pull_request;
          if (pr && pr.number) {
            fileDiffs = await getFileDiffForPR(
              config,
              repository.githubInstallationId,
              owner,
              repo,
              pr.number
            );
          }
        }
      } catch (error) {
        console.error("Error fetching file diffs:", error);
        // Continue without file diffs
      }
    }

    // Build prompt from event (before cache check)
    const prompt = buildEventPrompt(event, fileDiffs);

    // Check cache first (key includes repositoryId for security)
    const eventHash = createEventHash(event);
    
    // Try to get from cache
    // Note: ActionCache automatically includes repositoryId in cache key via args
    const { digestCache } = await import("../cache/digestCache");
    let digestData: z.infer<typeof DigestSchema> | null = null;
    
    try {
      const cached = await digestCache.fetch(ctx, {
        eventId: args.eventId,
        repositoryId: args.repositoryId,
        userId: args.userId,
        eventHash,
      });
      // Cache returns the digest data directly
      digestData = cached?.digestData || null;
    } catch (error) {
      // Cache miss or error - generate fresh
      console.log("Cache miss or error, generating fresh digest:", error);
    }
    
    // Generate digest if not cached
    if (!digestData) {
      try {
        const { generateObject } = await import("ai");
        const result = await generateObject({
          model,
          schema: DigestSchema,
          system: DIGEST_SYSTEM_PROMPT,
          prompt,
        });
        
        digestData = result.object;
      } catch (error) {
        // Handle errors gracefully - single retry for transient errors only
        if (isTransientError(error)) {
          try {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const { generateObject } = await import("ai");
            const result = await generateObject({
              model,
              schema: DigestSchema,
              system: DIGEST_SYSTEM_PROMPT,
              prompt,
            });
            digestData = result.object;
          } catch (retryError) {
            logStructuredOutputError(retryError, { eventId: args.eventId, provider: user.apiKeys.preferredProvider });
            // Fallback to template-based digest
            digestData = generateFallbackDigest(event);
          }
        } else {
          logStructuredOutputError(error, { eventId: args.eventId, provider: user.apiKeys.preferredProvider });
          // Fallback to template-based digest
          digestData = generateFallbackDigest(event);
        }
      }
    }
    
    // Return digest data (cached, generated, or fallback)
    return {
      digestData: digestData!,
      threadId,
    };
  },
});

/**
 * Build prompt from event data
 * Includes file diffs if available
 */
function buildEventPrompt(event: any, fileDiffs?: any[]): string {
  const { type, payload } = event;

  if (type === "push") {
    const commits = payload.commits || [];
    const ref = payload.ref || "";
    const branch = ref.replace("refs/heads/", "");
    const commitMessages = commits
      .map((c: any) => `- ${c.message}`)
      .join("\n");

    let prompt = `A developer pushed ${commits.length} commit(s) to the "${branch}" branch.

Commit messages:
${commitMessages || "No commit messages available"}`;

    if (fileDiffs && fileDiffs.length > 0) {
      prompt += `\n\nFiles changed (${fileDiffs.length}):\n`;
      for (const file of fileDiffs.slice(0, 10)) {
        prompt += `- ${file.filename} (${file.status}): +${file.additions} -${file.deletions}\n`;
        if (file.patch && file.patch.length < 2000) {
          prompt += `  Patch:\n${file.patch.substring(0, 1000)}...\n`;
        }
      }
      if (fileDiffs.length > 10) {
        prompt += `\n... and ${fileDiffs.length - 10} more files`;
      }
    }

    if (commits.length > 1) {
      prompt += `\n\nIMPORTANT: This push contains ${commits.length} commits. Synthesize them into a single coherent summary that captures the overall change.`;
    }

    prompt += `\n\nAnalyze this push and generate a digest.`;
    return prompt;
  } else if (type === "pull_request") {
    const { action, pull_request } = payload;
    const { title, body, additions, deletions, changed_files } = pull_request || {};

    let prompt = `A pull request was ${action}: "${title || "Untitled"}"

Description: ${body || "No description provided"}

Stats: ${additions || 0} additions, ${deletions || 0} deletions, ${changed_files || 0} files changed`;

    if (fileDiffs && fileDiffs.length > 0) {
      prompt += `\n\nFiles changed (${fileDiffs.length}):\n`;
      for (const file of fileDiffs.slice(0, 10)) {
        prompt += `- ${file.filename} (${file.status}): +${file.additions} -${file.deletions}\n`;
        if (file.patch && file.patch.length < 2000) {
          prompt += `  Patch:\n${file.patch.substring(0, 1000)}...\n`;
        }
      }
      if (fileDiffs.length > 10) {
        prompt += `\n... and ${fileDiffs.length - 10} more files`;
      }
    }

    prompt += `\n\nAnalyze this pull request and generate a digest.`;
    return prompt;
  }

  return `Summarize this GitHub ${type} event: ${JSON.stringify(payload)}`;
}
