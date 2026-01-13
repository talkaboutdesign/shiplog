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

const PerspectiveSchema = z.object({
  perspective: z.enum(["bugfix", "ui", "feature", "security", "performance", "refactor", "docs"]),
  title: z.string(),
  summary: z.string(),
  confidence: z.number().min(0).max(100),
});

const DigestSchema = z.object({
  title: z.string().describe("Brief action-oriented title"),
  summary: z.string().describe("2-3 sentence plain English explanation"),
  category: z.enum(["feature", "bugfix", "refactor", "docs", "chore", "security"]),
  whyThisMatters: z.string().describe("1-2 sentence explanation of business/user impact"),
  perspectives: z.array(PerspectiveSchema).max(2).optional().describe("1-2 key perspectives on this change (e.g., bugfix, ui, feature, security, performance, refactor, docs). Only include the most relevant perspectives."),
});

// Schema for intent detection (Pass 1 of two-pass analysis)
const ChangeIntentSchema = z.object({
  primaryIntent: z.enum(["bugfix", "feature", "refactor", "security", "performance", "chore", "docs"]),
  claimedImprovements: z.array(z.string()).describe("What the commit claims to fix or improve"),
  expectedBehaviorChanges: z.array(z.string()).describe("Expected changes in system behavior"),
  riskAreas: z.array(z.string()).describe("Areas that could be affected by this change"),
});

// Simplified schema - file-level analysis, backend maps to surfaces
const ImpactAnalysisSchema = z.object({
  affectedFiles: z.array(
    z.object({
      filePath: z.string().describe("The file path from the diff"),
      riskLevel: z.enum(["low", "medium", "high"]),
      briefReason: z.string().describe("One-line explanation of NEW risk introduced"),
      confidence: z.number().min(0).max(100),
      isImprovement: z.boolean().describe("True if this change improves the code (adds safety, fixes bugs)"),
    })
  ).max(10),
  overallRisk: z.enum(["low", "medium", "high"]),
  confidence: z.number().min(0).max(100),
  overallExplanation: z.string().describe("2-3 sentence senior engineer summary in markdown. Use **bold** for critical issues, `code` for function names. Focus on NEW risks, acknowledge improvements."),
  intentValidation: z.object({
    claimsVerified: z.boolean().describe("Whether the commit achieves what it claims"),
    explanation: z.string().describe("Brief explanation of whether intent was achieved"),
  }).optional(),
});

const IMPACT_ANALYSIS_SYSTEM_PROMPT = `You are a senior engineer performing DIFFERENTIAL code review. Your job is to identify NEW risks introduced by changes, not flag existing patterns or improvements.

## Core Principle: Differential Analysis
Ask "What NEW risks does this change introduce?" - NOT "What risks exist in this code?"

## Risk Categories (only flag NEW issues)
1. SECURITY: New vulnerabilities introduced (not existing ones being handled)
2. CRITICAL BUGS: New code paths that could fail unexpectedly
3. BREAKING CHANGES: Behavior changes that could break existing functionality

## Pattern Recognition - DO NOT flag these as risks:
- **Retry loops with catch blocks**: This is resilience, not silent failure
- **Fallback returns after retries exhausted**: This is graceful degradation
- **Error logging before returning**: This is observable failure, not silent
- **Try-catch blocks**: This is error handling, an improvement
- **Null checks / optional chaining**: This is defensive programming
- **Default values**: This is safe fallback behavior

## What TO flag as risks:
- Removed error handling that existed before
- New external API calls without error handling
- Logic changes that alter behavior unexpectedly
- New code paths that could throw without catching
- Security-sensitive operations without validation

## Confidence Guidelines:
- High (80-100): Clear evidence of new risk or clear improvement
- Medium (50-79): Potential concern, needs human review
- Low (20-49): Uncertain, limited context

## Intent Validation:
If commit context is provided, verify the code achieves its claimed purpose.
A change that successfully adds retry logic should be marked as an improvement, not a risk.

FORMATTING RULES:
- Never use emojis
- Never use emdash - use regular dash (-) or comma instead
- Use markdown: **bold** for critical findings, \`code\` for function/variable names
- Acknowledge improvements, don't just list problems`;

const DIGEST_SYSTEM_PROMPT = `You are a technical writer who translates GitHub activity into clear, concise summaries for non-technical stakeholders.

IMPORTANT: You MUST respond with valid JSON only. Do not include any text before or after the JSON object.

REQUIRED JSON FIELDS (use these exact field names):
- "title": Brief action-oriented phrase
- "summary": 2-3 sentence explanation
- "category": One of: "feature", "bugfix", "refactor", "docs", "chore", "security"
- "whyThisMatters": 1-2 sentence explanation of business/user impact (REQUIRED - do NOT use "impact" as the field name)
- "perspectives": Optional array of 1-2 key perspectives (max 2). Each perspective should have: perspective type, title, summary, and confidence (0-100).

Your summaries should:
- Lead with WHAT changed and WHY it matters (business impact)
- Use plain English, avoid technical jargon
- Be scannable - someone should understand the gist in 5 seconds
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
- security: Security-related changes

For whyThisMatters: Write 1-2 sentences explaining the business or user impact. This field is REQUIRED.

For perspectives: Include 1-2 of the most relevant perspectives from: bugfix, ui, feature, security, performance, refactor, docs. Each perspective should have a focused title and summary from that perspective's viewpoint. Only include perspectives that are clearly relevant to this change.

When multiple commits are present, synthesize them into a single coherent summary that captures the overall change.

FORMATTING RULES:
- Never use emojis in any field
- Never use emdash (-) - use regular dash (-) or comma instead
- Keep language professional and scannable`;

function getModel(provider: "openai" | "anthropic" | "openrouter", apiKey: string, modelName?: string) {
  if (provider === "openai") {
    const openai = createOpenAI({ apiKey });
    return openai("gpt-4o-mini");
  } else if (provider === "anthropic") {
    const anthropic = createAnthropic({ apiKey });
    return anthropic("claude-3-5-haiku-latest");
  } else {
    // openrouter
    const model = modelName || "openai/gpt-4o-mini";

    // For Anthropic models through OpenRouter, use Anthropic SDK with OpenRouter baseURL
    // This ensures proper structured output support (tool calling works correctly)
    // Reference: https://ai-sdk.dev/docs/guides/providers/anthropic
    if (model.startsWith("anthropic/")) {
      const anthropic = createAnthropic({
        apiKey,
        baseURL: "https://openrouter.ai/api/v1",
      });
      // Keep the full model name with prefix when using OpenRouter
      // OpenRouter expects the full model identifier (e.g., "anthropic/claude-3-5-haiku")
      return anthropic(model);
    }

    // For OpenAI and other models, use OpenAI SDK provider with OpenRouter baseURL
    // Reference: https://openrouter.ai/docs/quickstart
    const openrouter = createOpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
    });
    return openrouter(model);
  }
}

/**
 * Get the fastest model for the given provider - used for impact analysis
 * ALWAYS uses the fastest available model regardless of user's selection
 * - OpenAI: gpt-4o-mini
 * - Anthropic: claude-3-5-haiku-latest
 * - OpenRouter: openai/gpt-4o-mini (fastest + most reliable for structured output)
 */
function getFastModel(
  provider: "openai" | "anthropic" | "openrouter",
  apiKey: string
) {
  if (provider === "openai") {
    const openai = createOpenAI({ apiKey });
    return openai("gpt-4o-mini");
  } else if (provider === "anthropic") {
    const anthropic = createAnthropic({ apiKey });
    return anthropic("claude-3-5-haiku-latest");
  } else {
    // OpenRouter - use gpt-4o-mini for fastest + most reliable structured output
    // Uses OpenAI SDK with OpenRouter baseURL
    const openrouter = createOpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
    });
    return openrouter("openai/gpt-4o-mini");
  }
}

function buildEventPrompt(
  event: any, 
  fileDiffs?: any[]
): string {
  const { type, payload } = event;

  switch (type) {
    case "push":
      return buildPushPrompt(payload, fileDiffs);
    case "pull_request":
      return buildPRPrompt(payload, fileDiffs);
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

  if (commits.length > 1) {
    prompt += `\n\nIMPORTANT: This push contains ${commits.length} commits. Synthesize them into a single coherent summary that captures the overall change. Focus on the combined impact rather than listing each commit individually.`;
  }

  prompt += `\n\nSummarize what was accomplished in this push, focusing on the actual code changes. Return your response as valid JSON matching the required schema.`;
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
      // 2. Get repository and user (repository first, then user in parallel with index check)
      const repository = await ctx.runQuery(internal.repositories.getById, {
        repositoryId: event.repositoryId,
      });

      if (!repository) {
        throw new Error("Repository not found");
      }

      // Fetch user and check index in parallel since they're independent
      const [user, _indexCheck] = await Promise.all([
        ctx.runQuery(internal.users.getById, {
          userId: repository.userId,
        }),
        ctx.runAction(internal.surfaces.checkAndIndexIfNeeded, {
          repositoryId: event.repositoryId,
        }),
      ]);

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

      // 3. Extract metadata immediately (available synchronously from event payload)
      const contributors = [event.actorGithubUsername];
      const metadata: any = {};
      
      if (event.type === "pull_request") {
        const pr = event.payload.pull_request;
        if (pr) {
          metadata.prNumber = pr.number;
          metadata.prUrl = pr.html_url;
          metadata.prState = pr.state;
        }
      } else if (event.type === "push") {
        metadata.commitCount = event.payload.commits?.length || 0;
        metadata.compareUrl = event.payload.compare;
        metadata.branch = event.payload.ref?.replace("refs/heads/", "");
      }

      // 4. Create digest placeholder immediately with available data
      const placeholderTitle = event.type === "push" 
        ? `Push: ${metadata.commitCount || 0} commit(s)`
        : event.type === "pull_request"
        ? event.payload.pull_request?.title || "Pull Request"
        : "Processing event...";

      // 5. Create new digest
      const digestId = await ctx.runMutation(internal.digests.create, {
        repositoryId: event.repositoryId,
        eventId: args.eventId,
        title: placeholderTitle,
        summary: "Analyzing changes...",
        category: undefined,
        contributors,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        aiModel: preferredProvider,
        whyThisMatters: undefined,
        impactAnalysis: undefined,
      });

      // 6. Fetch file diffs if not already stored (indexCheck already done above)
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

      // 6. Generate digest with enhanced prompt (needed first to determine perspectives)
      const modelName = preferredProvider === "openrouter" ? apiKeys.openrouterModel : undefined;
      const model = getModel(preferredProvider, apiKey, modelName);
      const prompt = buildEventPrompt(event, fileDiffs);

      // Helper function to fix common field name mismatches
      const fixFieldNames = (obj: any): any => {
        if (!obj || typeof obj !== "object") return obj;
        
        // Map "impact" to "whyThisMatters" if present
        if ("impact" in obj && !("whyThisMatters" in obj)) {
          obj.whyThisMatters = obj.impact;
          delete obj.impact;
        }
        
        return obj;
      };

      // Helper function to parse text response as fallback
      const parseTextResponse = (text: string): z.infer<typeof DigestSchema> | null => {
        try {
          // Try to extract JSON from text if it's wrapped
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const fixed = fixFieldNames(parsed);
            return DigestSchema.parse(fixed);
          }
          
          // Try to parse structured text format
          const titleMatch = text.match(/Title:\s*(.+?)(?:\n|$)/i);
          const categoryMatch = text.match(/Category:\s*(\w+)/i);
          const summaryMatch = text.match(/Summary:\s*([\s\S]+?)(?:\n\n|Key Changes:|$)/i);
          const whyMatch = text.match(/(?:Why|Impact).*?:\s*([\s\S]+?)(?:\n\n|$)/i);
          
          if (titleMatch && categoryMatch && summaryMatch) {
            const category = categoryMatch[1].toLowerCase();
            if (["feature", "bugfix", "refactor", "docs", "chore", "security"].includes(category)) {
              return {
                title: titleMatch[1].trim(),
                summary: summaryMatch[1].trim(),
                category: category as any,
                whyThisMatters: whyMatch?.[1]?.trim() || summaryMatch[1].trim(),
              };
            }
          }
        } catch (_e) {
          // Failed to parse
        }
        return null;
      };

      // Retry logic for generateObject
      let object: z.infer<typeof DigestSchema> | null = null;
      const maxRetries = 3;
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const result = await generateObject({
            model,
            schema: DigestSchema,
            system: DIGEST_SYSTEM_PROMPT,
            prompt: attempt > 0 ? `${prompt}\n\nRemember: Respond with valid JSON only, no additional text.` : prompt,
          });
          object = result.object;
          break; // Success, exit retry loop
        } catch (error: any) {
          // Handle schema validation errors where the model returned wrong field names
          if (error.value && typeof error.value === "object") {
            try {
              const fixed = fixFieldNames(error.value);
              const validated = DigestSchema.parse(fixed);
              console.log("Successfully fixed field name mismatch (e.g., 'impact' -> 'whyThisMatters')");
              object = validated;
              break; // Successfully fixed, exit retry loop
            } catch (_parseError) {
              // If fixing didn't work, continue to other fallbacks
            }
          }
          
          // If we got a text response, try to parse it
          if (error.text || error.cause?.text) {
            const textResponse = error.text || error.cause?.text;
            const parsed = parseTextResponse(textResponse);
            if (parsed) {
              console.log("Successfully parsed text response as fallback");
              object = parsed;
              break; // Successfully parsed, exit retry loop
            }
          }
          
          // If this is the last attempt, throw the error
          if (attempt === maxRetries - 1) {
            console.error(`Failed to generate digest after ${maxRetries} attempts:`, error);
            throw error;
          }
          
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        }
      }

      if (!object) {
        throw new Error("Failed to generate digest object after all retries");
      }

      // 8. Store immediate perspectives from the digest generation (if any)
      const immediatePerspectives = object.perspectives || [];
      if (immediatePerspectives.length > 0) {
        await ctx.runMutation(internal.digests.createPerspectivesBatch, {
          digestId,
          perspectives: immediatePerspectives.map((p) => ({
            perspective: p.perspective,
            title: p.title,
            summary: p.summary,
            confidence: p.confidence,
          })),
        });
      }

      // 9. Update digest with AI-generated content (title, summary, category, whyThisMatters)
      await ctx.runMutation(internal.digests.update, {
        digestId,
        title: object.title,
        summary: object.summary,
        category: object.category,
        whyThisMatters: object.whyThisMatters,
      });

      // 10. Determine which perspectives are relevant and which still need to be generated
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

      // Determine which perspectives were already generated and which need async generation
      const immediatePerspectiveTypes = new Set(immediatePerspectives.map(p => p.perspective));
      const perspectivesToGenerateAsync = relevantPerspectives
        .filter(p => !immediatePerspectiveTypes.has(p))
        .slice(0, 3); // Limit to 3 total perspectives

      // Queue async generation of additional perspectives (if any needed)
      if (perspectivesToGenerateAsync.length > 0) {
        await ctx.scheduler.runAfter(0, internal.ai.generateAdditionalPerspectives, {
          digestId,
          perspectives: perspectivesToGenerateAsync,
        });
      }

      // 11. Schedule async impact analysis (non-blocking)
      // Impact analysis runs in background - digest shows immediately
      if (repository.indexStatus === "completed" && fileDiffs && fileDiffs.length > 0) {
        // Prepare truncated file diffs for the async action
        const truncatedFileDiffs = fileDiffs
          .filter((f) => f.patch && f.patch.length > 0)
          .sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions)) // Prioritize larger changes
          .slice(0, 8) // Limit to 8 files
          .map((f) => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch?.substring(0, 2500), // Truncate patches
          }));

        // Extract commit context for intent-aware analysis
        let commitMessage: string | undefined;
        let prTitle: string | undefined;
        let prBody: string | undefined;

        if (event.type === "push") {
          // Combine commit messages for push events
          const commits = event.payload.commits || [];
          commitMessage = commits.map((c: any) => c.message).join("\n").substring(0, 1000);
        } else if (event.type === "pull_request") {
          const pr = event.payload.pull_request;
          prTitle = pr?.title;
          prBody = pr?.body?.substring(0, 2000);
          commitMessage = prTitle; // Use PR title as primary context
        }

        if (truncatedFileDiffs.length > 0) {
          await ctx.scheduler.runAfter(0, internal.ai.analyzeImpactAsync, {
            digestId,
            repositoryId: event.repositoryId,
            fileDiffs: truncatedFileDiffs,
            commitMessage,
            prTitle,
            prBody,
          });
        }
      }

      // 12. Update event status - digest is ready, impact analysis runs in background
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

/**
 * Generate additional perspectives asynchronously using the digest summary
 * This is much faster than re-processing the full event since it uses the already-generated summary
 */
export const generateAdditionalPerspectives = internalAction({
  args: {
    digestId: v.id("digests"),
    perspectives: v.array(
      v.union(
        v.literal("bugfix"),
        v.literal("ui"),
        v.literal("feature"),
        v.literal("security"),
        v.literal("performance"),
        v.literal("refactor"),
        v.literal("docs")
      )
    ),
  },
  handler: async (ctx, args) => {
    // Fetch digest to get summary and context
    const digest = await ctx.runQuery(internal.digests.getById, {
      digestId: args.digestId,
    });

    if (!digest) {
      console.error("Digest not found for perspective generation");
      return;
    }

    // Get repository and user to access API keys
    const repository = await ctx.runQuery(internal.repositories.getById, {
      repositoryId: digest.repositoryId,
    });

    if (!repository) {
      console.error("Repository not found for perspective generation");
      return;
    }

    const user = await ctx.runQuery(internal.users.getById, {
      userId: repository.userId,
    });

    if (!user || !user.apiKeys) {
      console.error("User or API keys not found for perspective generation");
      return;
    }

    const preferredProvider = user.apiKeys.preferredProvider || "openai";
    const apiKey =
      preferredProvider === "openai"
        ? user.apiKeys.openai
        : preferredProvider === "anthropic"
        ? user.apiKeys.anthropic
        : user.apiKeys.openrouter;

    if (!apiKey) {
      console.error(`No ${preferredProvider} API key configured for perspective generation`);
      return;
    }

    const modelName = preferredProvider === "openrouter" ? user.apiKeys.openrouterModel : undefined;
    const model = getModel(preferredProvider, apiKey, modelName);

    // Generate perspectives in parallel using the digest summary
    const perspectivePromises = args.perspectives.map(async (perspective) => {
      try {
        // Use simplified prompt based on digest summary instead of full event
        const perspectivePrompt = `Based on this code change summary, analyze it from a ${perspective} perspective:

Title: ${digest.title}
Summary: ${digest.summary}
Category: ${digest.category || "unknown"}
Why this matters: ${digest.whyThisMatters || "Not specified"}

Generate a ${perspective}-focused perspective on this change. Provide a title, summary, and confidence score (0-100).`;

        const { object: persp } = await generateObject({
          model,
          schema: PerspectiveSchema,
          prompt: perspectivePrompt,
        });

        return {
          perspective,
          title: persp.title,
          summary: persp.summary,
          confidence: persp.confidence,
        };
      } catch (error) {
        console.error(`Error generating ${perspective} perspective asynchronously:`, error);
        return null;
      }
    });

    // Wait for all perspectives to complete
    const results = await Promise.all(perspectivePromises);

    // Filter out null results and store valid perspectives
    const validPerspectives = results.filter(
      (p): p is NonNullable<typeof p> => p !== null
    );

    if (validPerspectives.length > 0) {
      await ctx.runMutation(internal.digests.createPerspectivesBatch, {
        digestId: args.digestId,
        perspectives: validPerspectives.map((p) => ({
          perspective: p.perspective,
          title: p.title,
          summary: p.summary,
          confidence: p.confidence,
        })),
      });
    }
  },
});

/**
 * Helper function for Pass 1: Analyze change intent from commit message and PR context
 * Uses the provided model (user's configured API key) instead of hardcoded env var
 */
async function analyzeChangeIntentWithModel(
  model: ReturnType<typeof getFastModel>,
  commitMessage: string,
  prTitle?: string,
  prBody?: string,
  fileCount?: number
): Promise<z.infer<typeof ChangeIntentSchema> | null> {
  // For very simple changes, skip intent analysis
  if (fileCount && fileCount <= 2 && commitMessage.length < 50) {
    return null;
  }

  // Build context from available metadata
  const contextParts = [`Commit message: "${commitMessage}"`];
  if (prTitle) {
    contextParts.push(`PR title: "${prTitle}"`);
  }
  if (prBody && prBody.length < 2000) {
    contextParts.push(`PR description: "${prBody}"`);
  }

  const intentPrompt = `Analyze this commit/PR to understand the developer's intent:

${contextParts.join("\n")}

Extract:
1. The primary intent (bugfix, feature, refactor, security, performance, chore, docs)
2. What improvements the author claims to make
3. Expected behavior changes
4. Areas that could be affected`;

  try {
    const { object: intent } = await generateObject({
      model,
      schema: ChangeIntentSchema,
      prompt: intentPrompt,
    });

    return intent;
  } catch (error) {
    console.error("Intent analysis failed:", error);
    return null;
  }
}

/**
 * Pass 2: Analyze impact asynchronously - runs in background after digest is created
 * Uses fast model, simplified prompt, and retry logic with graceful fallback
 * Now includes intent context for differential analysis
 */
export const analyzeImpactAsync = internalAction({
  args: {
    digestId: v.id("digests"),
    repositoryId: v.id("repositories"),
    fileDiffs: v.array(
      v.object({
        filename: v.string(),
        status: v.string(),
        additions: v.number(),
        deletions: v.number(),
        patch: v.optional(v.string()),
      })
    ),
    // New: commit context for intent-aware analysis
    commitMessage: v.optional(v.string()),
    prTitle: v.optional(v.string()),
    prBody: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get repository and user to access API keys
    const repository = await ctx.runQuery(internal.repositories.getById, {
      repositoryId: args.repositoryId,
    });

    if (!repository) {
      console.error("Repository not found for impact analysis");
      return;
    }

    const user = await ctx.runQuery(internal.users.getById, {
      userId: repository.userId,
    });

    if (!user || !user.apiKeys) {
      console.error("User or API keys not found for impact analysis");
      return;
    }

    // Determine which provider to use - prefer the configured one, but fall back to any available
    let preferredProvider = user.apiKeys.preferredProvider;
    let apiKey: string | undefined;

    // First try the preferred provider
    if (preferredProvider === "openai" && user.apiKeys.openai) {
      apiKey = user.apiKeys.openai;
    } else if (preferredProvider === "anthropic" && user.apiKeys.anthropic) {
      apiKey = user.apiKeys.anthropic;
    } else if (preferredProvider === "openrouter" && user.apiKeys.openrouter) {
      apiKey = user.apiKeys.openrouter;
    }

    // If preferred provider doesn't have a key, fall back to any available provider
    if (!apiKey) {
      if (user.apiKeys.openrouter) {
        preferredProvider = "openrouter";
        apiKey = user.apiKeys.openrouter;
      } else if (user.apiKeys.openai) {
        preferredProvider = "openai";
        apiKey = user.apiKeys.openai;
      } else if (user.apiKeys.anthropic) {
        preferredProvider = "anthropic";
        apiKey = user.apiKeys.anthropic;
      }
    }

    if (!apiKey || !preferredProvider) {
      console.error("No API key configured for impact analysis");
      return;
    }

    // Use fast model for impact analysis (always uses fastest model regardless of user selection)
    console.log(`Impact analysis using provider: ${preferredProvider} (fast model)`);
    const fastModel = getFastModel(preferredProvider, apiKey);

    // Pass 1: Analyze intent from commit context (if available)
    let changeIntent: z.infer<typeof ChangeIntentSchema> | null = null;
    if (args.commitMessage) {
      changeIntent = await analyzeChangeIntentWithModel(
        fastModel,
        args.commitMessage,
        args.prTitle,
        args.prBody,
        args.fileDiffs.length
      );
    }

    // Get surfaces for the files
    const surfaces = await ctx.runQuery(internal.surfaces.getSurfacesByPaths, {
      repositoryId: args.repositoryId,
      filePaths: args.fileDiffs.map((f) => f.filename),
    });

    if (surfaces.length === 0) {
      console.log("No surfaces found for impact analysis - skipping");
      return;
    }

    // Create a map of file path to surfaces for quick lookup
    const surfacesByPath = new Map<string, Array<typeof surfaces[0]>>();
    surfaces.forEach((s) => {
      if (!surfacesByPath.has(s.filePath)) {
        surfacesByPath.set(s.filePath, []);
      }
      surfacesByPath.get(s.filePath)!.push(s);
    });

    // Build simplified structured changes with compact surface context
    const structuredChanges = args.fileDiffs
      .filter((f) => f.patch)
      .map((f) => {
        const fileSurfaces = surfacesByPath.get(f.filename) || [];
        // Compact surface info: just name + dep count
        const surfaceContext = fileSurfaces.length > 0
          ? `Surfaces: ${fileSurfaces.map((s) => `${s.name} (${s.surfaceType}, ${s.dependencies.length} deps)`).join(", ")}`
          : "";

        return `### ${f.filename} (${f.status}, +${f.additions} -${f.deletions})
${surfaceContext}

\`\`\`diff
${f.patch}
\`\`\``;
      })
      .join("\n\n");

    // Build intent context section if available
    const intentContext = changeIntent
      ? `## Change Intent (from commit/PR)
- **Primary intent**: ${changeIntent.primaryIntent}
- **Claimed improvements**: ${changeIntent.claimedImprovements.join(", ") || "None specified"}
- **Expected behavior changes**: ${changeIntent.expectedBehaviorChanges.join(", ") || "None specified"}

**Important**: Verify the code achieves these claims. Mark as improvement if it does. Only flag as risk if the implementation is flawed or introduces NEW problems.

`
      : "";

    // Build commit context section
    const commitContext = args.commitMessage
      ? `## Commit Context
Commit message: "${args.commitMessage}"
${args.prTitle ? `PR title: "${args.prTitle}"` : ""}

`
      : "";

    // Intent-aware differential analysis prompt
    const impactPrompt = `${intentContext}${commitContext}## Code Changes

${structuredChanges}

${args.fileDiffs.filter((f) => !f.patch).length > 0 ? `\n${args.fileDiffs.filter((f) => !f.patch).length} additional files changed without diff data.\n` : ""}

## Analysis Task

For each file, assess:
- Risk level (low/medium/high) - for NEW risks only
- Brief reason - explain what NEW risk is introduced (or mark as improvement)
- Whether this is an improvement (adds safety, fixes bugs, adds resilience)
- Confidence (0-100)

${changeIntent ? `Also validate: Does this code achieve the claimed intent? (${changeIntent.claimedImprovements.join(", ")})` : ""}

Provide overall risk level and 2-3 sentence summary focusing on differential analysis.`;

    // Retry logic with exponential backoff
    let impactResult: z.infer<typeof ImpactAnalysisSchema> | null = null;
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const { object: impact } = await generateObject({
          model: fastModel,
          schema: ImpactAnalysisSchema,
          system: IMPACT_ANALYSIS_SYSTEM_PROMPT,
          prompt: impactPrompt,
        });
        impactResult = impact;
        break;
      } catch (error: any) {
        // Log detailed error info for debugging
        console.error(`Impact analysis attempt ${attempt + 1} failed:`, {
          message: error instanceof Error ? error.message : String(error),
          name: error?.name,
          statusCode: error?.statusCode,
          responseBody: error?.responseBody?.substring?.(0, 500),
          cause: error?.cause?.message,
          attempt,
        });

        if (attempt < maxRetries - 1) {
          // Exponential backoff: 1s, 2s, 4s
          await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        }
      }
    }

    // Graceful fallback if all retries failed
    if (!impactResult) {
      console.error("Impact analysis failed after all retries - using fallback");
      await ctx.runMutation(internal.digests.update, {
        digestId: args.digestId,
        impactAnalysis: {
          affectedSurfaces: [],
          overallRisk: "low" as const,
          confidence: 0,
          overallExplanation: "Impact analysis unavailable for this change. Manual review recommended for significant changes.",
        },
      });
      return;
    }

    // Map file paths to surface IDs
    const affectedSurfaces = impactResult.affectedFiles
      .map((af) => {
        const matchingSurfaces = surfaces.filter((s) => s.filePath === af.filePath);
        const primarySurface = matchingSurfaces[0];
        if (!primarySurface) {
          return null;
        }
        return {
          surfaceId: primarySurface._id,
          surfaceName: primarySurface.name,
          impactType: "modified" as const,
          riskLevel: af.riskLevel,
          confidence: af.confidence,
        };
      })
      .filter((af): af is NonNullable<typeof af> => af !== null);

    // Update digest with impact analysis
    await ctx.runMutation(internal.digests.update, {
      digestId: args.digestId,
      impactAnalysis: {
        affectedSurfaces,
        overallRisk: impactResult.overallRisk,
        confidence: impactResult.confidence,
        overallExplanation: impactResult.overallExplanation,
      },
    });

    console.log(`Impact analysis completed for digest ${args.digestId}:`, {
      filesAnalyzed: args.fileDiffs.length,
      surfacesAffected: affectedSurfaces.length,
      overallRisk: impactResult.overallRisk,
      intentValidated: impactResult.intentValidation?.claimsVerified ?? null,
      hadIntentContext: !!changeIntent,
    });
  },
});
