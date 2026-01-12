import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const DigestSchema = z.object({
  title: z.string().describe("Brief action-oriented title"),
  summary: z.string().describe("2-3 sentence plain English explanation"),
  category: z.enum(["feature", "bugfix", "refactor", "docs", "chore", "security"]),
});

const DIGEST_SYSTEM_PROMPT = `You are a technical writer who translates GitHub activity into clear, concise summaries for non-technical stakeholders.

Your summaries should:
- Lead with WHAT changed and WHY it matters (business impact)
- Use plain English, avoid technical jargon
- Be scannable—someone should understand the gist in 5 seconds
- Focus on user-facing impact when possible

For the title: Write a brief, action-oriented phrase (e.g., "Added dark mode support", "Fixed checkout crash on mobile")

For the summary: Write 2-3 sentences explaining:
1. What was done
2. Why it matters (if discernible)

For the category, choose the most appropriate:
- feature: New functionality for users
- bugfix: Fixing something that was broken
- refactor: Code improvement without behavior change
- docs: Documentation updates
- chore: Maintenance, dependencies, tooling
- security: Security-related changes`;

function getModel(provider: "openai" | "anthropic", apiKey: string) {
  if (provider === "openai") {
    const openai = createOpenAI({ apiKey });
    return openai("gpt-4o-mini");
  } else {
    const anthropic = createAnthropic({ apiKey });
    return anthropic("claude-3-5-haiku-latest");
  }
}

function buildEventPrompt(event: any): string {
  const { type, payload } = event;

  switch (type) {
    case "push":
      return buildPushPrompt(payload);
    case "pull_request":
      return buildPRPrompt(payload);
    case "issues":
      return buildIssuePrompt(payload);
    default:
      return `Summarize this GitHub ${type} event: ${JSON.stringify(payload)}`;
  }
}

function buildPushPrompt(payload: any): string {
  const commits = payload.commits || [];
  const ref = payload.ref || "";
  const branch = ref.replace("refs/heads/", "");
  const commitMessages = commits
    .map((c: any) => `- ${c.message}`)
    .join("\n");

  return `A developer pushed ${commits.length} commit(s) to the "${branch}" branch.

Commit messages:
${commitMessages || "No commit messages available"}

Summarize what was accomplished in this push.`;
}

function buildPRPrompt(payload: any): string {
  const { action, pull_request } = payload;
  const { title, body, additions, deletions, changed_files } = pull_request || {};

  return `A pull request was ${action}: "${title || "Untitled"}"

Description: ${body || "No description provided"}

Stats: ${additions || 0} additions, ${deletions || 0} deletions, ${changed_files || 0} files changed

Summarize this pull request for stakeholders.`;
}

function buildIssuePrompt(payload: any): string {
  const { action, issue } = payload;
  const { title, body } = issue || {};

  return `An issue was ${action}: "${title || "Untitled"}"

Description: ${body || "No description provided"}

Summarize this issue activity.`;
}

export const digestEvent = internalAction({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    // 1. Fetch event
    const event = await ctx.runQuery(internal.events.getById, {
      eventId: args.eventId,
    });

    if (!event) {
      throw new Error("Event not found");
    }

    // Update status to processing
    await ctx.runMutation(internal.events.updateStatus, {
      eventId: args.eventId,
      status: "processing",
    });

    try {
      // 2. Get repository and user
      const repository = await ctx.runQuery(internal.repositories.getById, {
        repositoryId: event.repositoryId,
      });

      if (!repository) {
        throw new Error("Repository not found");
      }

      const user = await ctx.runQuery(internal.users.getById, {
        userId: repository.userId,
      });

      if (!user) {
        throw new Error("User not found");
      }

      // 3. Get user's API key
      const apiKeys = user.apiKeys;
      if (!apiKeys) {
        await ctx.runMutation(internal.events.updateStatus, {
          eventId: args.eventId,
          status: "skipped",
          errorMessage: "No API keys configured",
        });
        return;
      }

      const preferredProvider = apiKeys.preferredProvider || "openai";
      const apiKey =
        preferredProvider === "openai"
          ? apiKeys.openai
          : apiKeys.anthropic;

      if (!apiKey) {
        await ctx.runMutation(internal.events.updateStatus, {
          eventId: args.eventId,
          status: "skipped",
          errorMessage: `No ${preferredProvider} API key configured`,
        });
        return;
      }

      // 4. Generate digest
      const model = getModel(preferredProvider, apiKey);
      const prompt = buildEventPrompt(event);

      const { object } = await generateObject({
        model,
        schema: DigestSchema,
        system: DIGEST_SYSTEM_PROMPT,
        prompt,
      });

      // 5. Extract contributors
      const contributors = [event.actorGithubUsername];

      // 6. Build metadata
      const metadata: any = {};
      if (event.type === "pull_request") {
        const pr = event.payload.pull_request;
        if (pr) {
          metadata.prNumber = pr.number;
          metadata.prUrl = pr.html_url;
          metadata.prState = pr.state;
        }
      } else if (event.type === "issues") {
        const issue = event.payload.issue;
        if (issue) {
          metadata.issueNumber = issue.number;
          metadata.issueUrl = issue.html_url;
        }
      } else if (event.type === "push") {
        metadata.commitCount = event.payload.commits?.length || 0;
        metadata.compareUrl = event.payload.compare;
        metadata.branch = event.payload.ref?.replace("refs/heads/", "");
      }

      // 7. Store digest
      await ctx.runMutation(internal.digests.create, {
        repositoryId: event.repositoryId,
        eventId: args.eventId,
        title: object.title,
        summary: object.summary,
        category: object.category,
        contributors,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        aiModel: preferredProvider,
      });

      // 8. Update event status
      await ctx.runMutation(internal.events.updateStatus, {
        eventId: args.eventId,
        status: "completed",
      });
    } catch (error) {
      console.error("Error generating digest:", error);
      await ctx.runMutation(internal.events.updateStatus, {
        eventId: args.eventId,
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },
});
