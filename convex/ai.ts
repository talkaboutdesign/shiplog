"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import {
  getGitHubAppConfig,
  getFileDiffForPush,
  getFileDiffForPR,
} from "./github";

const DigestSchema = z.object({
  title: z.string().describe("Brief action-oriented title"),
  summary: z.string().describe("2-3 sentence plain English explanation"),
  category: z.enum(["feature", "bugfix", "refactor", "docs", "chore", "security"]),
  whyThisMatters: z.string().describe("1-2 sentence explanation of business/user impact"),
});

const PerspectiveSchema = z.object({
  perspective: z.enum(["bugfix", "ui", "feature", "security", "performance", "refactor", "docs"]),
  title: z.string(),
  summary: z.string(),
  confidence: z.number().min(0).max(100),
});

const ImpactAnalysisSchema = z.object({
  affectedSurfaces: z.array(
    z.object({
      filePath: z.string(),
      surfaceName: z.string(),
      impactType: z.enum(["modified", "added", "deleted"]),
      riskLevel: z.enum(["low", "medium", "high"]),
      confidence: z.number().min(0).max(100),
    })
  ),
  overallRisk: z.enum(["low", "medium", "high"]),
  confidence: z.number().min(0).max(100),
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

function getModel(provider: "openai" | "anthropic" | "openrouter", apiKey: string, modelName?: string) {
  if (provider === "openai") {
    const openai = createOpenAI({ apiKey });
    return openai("gpt-4o-mini");
  } else if (provider === "anthropic") {
    const anthropic = createAnthropic({ apiKey });
    return anthropic("claude-3-5-haiku-latest");
  } else {
    // openrouter - use OpenAI SDK provider with OpenRouter baseURL
    const openrouter = createOpenAI({ 
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
    });
    return openrouter(modelName || "openai/gpt-4o-mini");
  }
}

function buildEventPrompt(event: any, fileDiffs?: any[]): string {
  const { type, payload } = event;

  switch (type) {
    case "push":
      return buildPushPrompt(payload, fileDiffs);
    case "pull_request":
      return buildPRPrompt(payload, fileDiffs);
    case "issues":
      return buildIssuePrompt(payload);
    default:
      return `Summarize this GitHub ${type} event: ${JSON.stringify(payload)}`;
  }
}

function buildPushPrompt(payload: any, fileDiffs?: any[]): string {
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
    for (const file of fileDiffs.slice(0, 10)) { // Limit to first 10 files
      prompt += `- ${file.filename} (${file.status}): +${file.additions} -${file.deletions}\n`;
      if (file.patch && file.patch.length < 2000) { // Include small patches
        prompt += `  Patch:\n${file.patch.substring(0, 1000)}...\n`;
      }
    }
    if (fileDiffs.length > 10) {
      prompt += `\n... and ${fileDiffs.length - 10} more files`;
    }
  }

  prompt += `\n\nSummarize what was accomplished in this push, focusing on the actual code changes.`;
  return prompt;
}

function buildPRPrompt(payload: any, fileDiffs?: any[]): string {
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

  prompt += `\n\nSummarize this pull request for stakeholders, focusing on the actual code changes.`;
  return prompt;
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
          : preferredProvider === "anthropic"
          ? apiKeys.anthropic
          : apiKeys.openrouter;

      if (!apiKey) {
        await ctx.runMutation(internal.events.updateStatus, {
          eventId: args.eventId,
          status: "skipped",
          errorMessage: `No ${preferredProvider} API key configured`,
        });
        return;
      }

      // 4. Check if repository has index, trigger if needed
      const indexCheck = await ctx.runAction(internal.surfaces.checkAndIndexIfNeeded, {
        repositoryId: event.repositoryId,
      });

      // 5. Fetch file diffs if not already stored
      let fileDiffs = event.fileDiffs;
      if (!fileDiffs && (event.type === "push" || event.type === "pull_request")) {
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

          // Store file diffs in event
          if (fileDiffs) {
            await ctx.runMutation(internal.events.updateFileDiffs, {
              eventId: args.eventId,
              fileDiffs: fileDiffs.map((f) => ({
                filename: f.filename,
                status: f.status,
                additions: f.additions,
                deletions: f.deletions,
                changes: f.changes,
                patch: f.patch?.substring(0, 50000), // Limit patch size
                previous_filename: f.previous_filename,
              })),
            });
          }
        } catch (error) {
          console.error("Error fetching file diffs:", error);
          // Continue without file diffs
        }
      }

      // 6. Generate digest with enhanced prompt
      const modelName = preferredProvider === "openrouter" ? apiKeys.openrouterModel : undefined;
      const model = getModel(preferredProvider, apiKey, modelName);
      const prompt = buildEventPrompt(event, fileDiffs);

      const { object } = await generateObject({
        model,
        schema: DigestSchema,
        system: DIGEST_SYSTEM_PROMPT,
        prompt,
      });

      // 7. Analyze impact if index is available
      let impactAnalysis = undefined;
      const repositoryWithIndex = await ctx.runQuery(internal.repositories.getById, {
        repositoryId: event.repositoryId,
      });
      
      if (repositoryWithIndex?.indexStatus === "completed" && fileDiffs && fileDiffs.length > 0) {
        try {
          const surfaces = await ctx.runQuery(internal.surfaces.getSurfacesByPaths, {
            repositoryId: event.repositoryId,
            filePaths: fileDiffs.map((f) => f.filename),
          });

          if (surfaces.length > 0) {
            // Use AI to analyze impact
            const impactPrompt = `Analyze the impact of these code changes:

Files changed:
${fileDiffs.map((f) => `- ${f.filename} (${f.status}): +${f.additions} -${f.deletions}`).join("\n")}

Known code surfaces:
${surfaces.map((s) => `- ${s.name} (${s.surfaceType}): ${s.filePath}`).join("\n")}

Determine which surfaces are affected, the impact type (modified/added/deleted), risk level (low/medium/high), and your confidence (0-100).`;

            const { object: impact } = await generateObject({
              model,
              schema: ImpactAnalysisSchema,
              prompt: impactPrompt,
            });

            // Map file paths to surface IDs
            const affectedSurfaces = impact.affectedSurfaces
              .map((af) => {
                const surface = surfaces.find((s) => s.filePath === af.filePath);
                if (!surface) {
                  return null; // Skip if no matching surface found
                }
                return {
                  surfaceId: surface._id,
                  surfaceName: af.surfaceName || surface.name,
                  impactType: af.impactType,
                  riskLevel: af.riskLevel,
                  confidence: af.confidence,
                };
              })
              .filter((af): af is NonNullable<typeof af> => af !== null);

            if (affectedSurfaces.length > 0) {
              impactAnalysis = {
                affectedSurfaces,
                overallRisk: impact.overallRisk,
                confidence: impact.confidence,
              };
            }
          }
        } catch (error) {
          console.error("Error analyzing impact:", error);
          // Continue without impact analysis
        }
      }

      // 8. Generate multi-perspective summaries
      const perspectives: Array<{
        perspective: "bugfix" | "ui" | "feature" | "security" | "performance" | "refactor" | "docs";
        title: string;
        summary: string;
        confidence: number;
      }> = [];

      // Determine which perspectives are relevant
      const relevantPerspectives: Array<"bugfix" | "ui" | "feature" | "security" | "performance" | "refactor" | "docs"> = [];
      
      if (object.category === "bugfix") relevantPerspectives.push("bugfix");
      if (object.category === "feature") relevantPerspectives.push("feature");
      
      // Check file paths for UI components
      if (fileDiffs?.some((f) => f.filename.match(/\.(tsx|jsx)$/) || f.filename.includes("component"))) {
        relevantPerspectives.push("ui");
      }
      
      // Always generate at least one perspective
      if (relevantPerspectives.length === 0) {
        relevantPerspectives.push(object.category as any || "refactor");
      }

      for (const perspective of relevantPerspectives.slice(0, 3)) { // Limit to 3 perspectives
        try {
          const perspectivePrompt = `Analyze this code change from a ${perspective} perspective:

${prompt}

Generate a ${perspective}-focused summary.`;

          const { object: persp } = await generateObject({
            model,
            schema: PerspectiveSchema,
            prompt: perspectivePrompt,
          });

          perspectives.push({
            perspective,
            title: persp.title,
            summary: persp.summary,
            confidence: persp.confidence,
          });
        } catch (error) {
          console.error(`Error generating ${perspective} perspective:`, error);
        }
      }

      // 9. Extract contributors
      const contributors = [event.actorGithubUsername];

      // 10. Build metadata
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

      // 11. Store digest
      const digestId = await ctx.runMutation(internal.digests.create, {
        repositoryId: event.repositoryId,
        eventId: args.eventId,
        title: object.title,
        summary: object.summary,
        category: object.category,
        whyThisMatters: object.whyThisMatters,
        contributors,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        impactAnalysis,
        aiModel: preferredProvider,
      });

      // 12. Store perspectives
      for (const perspective of perspectives) {
        await ctx.runMutation(internal.digests.createPerspective, {
          digestId,
          perspective: perspective.perspective,
          title: perspective.title,
          summary: perspective.summary,
          confidence: perspective.confidence,
        });
      }

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
