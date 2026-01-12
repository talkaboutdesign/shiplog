"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
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
      explanation: z.string().describe("Brief senior engineer notes. Be specific: what bugs/issues found (with line/function references if possible), what looks suspicious, what's the impact. If nothing concerning, briefly note why. Examples: 'Missing null check on user.id access', 'Potential race condition in async function fetchData', 'High risk: utility used by 15+ files', 'Clean refactor, no logic changes'. Do NOT explain confidence scores."),
    })
  ),
  overallRisk: z.enum(["low", "medium", "high"]),
  confidence: z.number().min(0).max(100),
  overallExplanation: z.string().describe("Brief senior engineer summary. Focus on: critical bugs/security issues, patterns of concern, high-impact changes, red flags. Be specific with examples. If nothing concerning, note why. Be concise. Do NOT start with 'Overall Assessment:' or repeat risk level (it's in the tag). Do NOT explain confidence scores."),
});

const DIGEST_SYSTEM_PROMPT = `You are a technical writer who translates GitHub activity into clear, concise summaries for non-technical stakeholders.

IMPORTANT: You MUST respond with valid JSON only. Do not include any text before or after the JSON object.

REQUIRED JSON FIELDS (use these exact field names):
- "title": Brief action-oriented phrase
- "summary": 2-3 sentence explanation
- "category": One of: "feature", "bugfix", "refactor", "docs", "chore", "security"
- "whyThisMatters": 1-2 sentence explanation of business/user impact (REQUIRED - do NOT use "impact" as the field name)

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
- security: Security-related changes

For whyThisMatters: Write 1-2 sentences explaining the business or user impact. This field is REQUIRED.

When multiple commits are present, synthesize them into a single coherent summary that captures the overall change.`;

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
      const [user, indexCheck] = await Promise.all([
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
        } catch (e) {
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
            } catch (parseError) {
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

      // 8. Update digest with AI-generated content (title, summary, category, whyThisMatters)
      await ctx.runMutation(internal.digests.update, {
        digestId,
        title: object.title,
        summary: object.summary,
        category: object.category,
        whyThisMatters: object.whyThisMatters,
      });

      // 9. Determine which perspectives are relevant (needed before parallel generation)
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

      // 10. Prepare for parallel AI generation: fetch surfaces if needed for impact analysis
      const surfacesPromise = repository.indexStatus === "completed" && fileDiffs && fileDiffs.length > 0
        ? ctx.runQuery(internal.surfaces.getSurfacesByPaths, {
            repositoryId: event.repositoryId,
            filePaths: fileDiffs.map((f) => f.filename),
          })
        : Promise.resolve([]);

      // 11. Generate perspectives and impact analysis in parallel
      const perspectivesToGenerate = relevantPerspectives.slice(0, 3);
      const perspectivePromises = perspectivesToGenerate.map(async (perspective) => {
        try {
          const perspectivePrompt = `Analyze this code change from a ${perspective} perspective:

${prompt}

Generate a ${perspective}-focused summary.`;

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
          console.error(`Error generating ${perspective} perspective:`, error);
          return null;
        }
      });

      // Generate impact analysis in parallel with perspectives
      const impactAnalysisPromise = (async () => {
        try {
          const surfaces = await surfacesPromise;
          
          if (surfaces.length === 0 || !fileDiffs || fileDiffs.length === 0) {
            return undefined;
          }

          // Build prompt with actual code changes
          const filesWithPatches = fileDiffs
            .filter((f) => f.patch && f.patch.length > 0)
            .slice(0, 20); // Limit to avoid token limits
          
          const filesWithoutPatches = fileDiffs.filter(
            (f) => !f.patch || f.patch.length === 0
          );

          // Create a map of file path to surfaces for quick lookup
          const surfacesByPath = new Map<string, Array<typeof surfaces[0]>>();
          surfaces.forEach((s) => {
            if (!surfacesByPath.has(s.filePath)) {
              surfacesByPath.set(s.filePath, []);
            }
            surfacesByPath.get(s.filePath)!.push(s);
          });

          // Build structured code changes with context
          const structuredChanges = filesWithPatches.map((f) => {
            const fileSurfaces = surfacesByPath.get(f.filename) || [];
            const patchPreview = f.patch!.length > 10000 
              ? f.patch!.substring(0, 10000) + "\n... (truncated)"
              : f.patch!;
            
            let context = `File: ${f.filename} (${f.status}, +${f.additions} -${f.deletions})`;
            
            if (fileSurfaces.length > 0) {
              const surfaceInfo = fileSurfaces.map((s) => {
                const deps = s.dependencies.length > 0 
                  ? `\n  Dependencies: ${s.dependencies.slice(0, 5).join(", ")}${s.dependencies.length > 5 ? ` (+${s.dependencies.length - 5} more)` : ""}`
                  : "";
                const exports = s.exports && s.exports.length > 0
                  ? `\n  Exports: ${s.exports.slice(0, 5).join(", ")}${s.exports.length > 5 ? ` (+${s.exports.length - 5} more)` : ""}`
                  : "";
                return `  - ${s.name} (${s.surfaceType})${deps}${exports}`;
              }).join("\n");
              context += `\nKnown surfaces in this file:\n${surfaceInfo}`;
            }
            
            return `${context}\n\nCode diff:\n${patchPreview}`;
          }).join("\n\n---\n\n");

          let impactPrompt = `You're a senior engineer reviewing code changes. Systematically scan the code for bugs, security issues, and potential problems. Be specific and actionable.

=== CODE CHANGES ===

${structuredChanges}

${filesWithoutPatches.length > 0 
  ? `\nFiles changed without patch data:\n${filesWithoutPatches.map((f) => `- ${f.filename} (${f.status}): +${f.additions} -${f.deletions}`).join("\n")}` 
  : ""}

=== SCANNING GUIDELINES ===

For each file, systematically check:

1. **Security Issues:**
   - SQL injection, XSS, CSRF vulnerabilities
   - Unsanitized user input
   - Missing authentication/authorization checks
   - Exposed secrets, API keys, or credentials
   - Insecure dependencies or outdated packages

2. **Bugs & Logic Errors:**
   - Null/undefined access without checks
   - Off-by-one errors, array bounds
   - Race conditions, async/await issues
   - Type mismatches, incorrect type handling
   - Missing return statements or early returns
   - Incorrect conditional logic

3. **Error Handling:**
   - Missing try/catch blocks
   - Unhandled promise rejections
   - Silent failures
   - Poor error messages

4. **Performance Issues:**
   - N+1 queries, inefficient loops
   - Missing memoization where needed
   - Large bundle sizes, unnecessary imports
   - Memory leaks (event listeners, subscriptions)

5. **Code Quality:**
   - Breaking changes to APIs/contracts
   - Removed functionality without migration
   - Inconsistent patterns with codebase
   - Missing tests for critical paths

6. **Dependency Impact:**
   - Files with many dependencies (high coupling) are riskier
   - Changes to exported APIs affect downstream code
   - Breaking changes to shared utilities/services

=== ANALYSIS TASK ===

For each affected surface (match file paths to known surfaces):
1. Impact type: modified/added/deleted
2. Risk level (low/medium/high):
   - LOW: Minor changes, well-isolated, no bugs spotted
   - MEDIUM: Moderate changes, some dependencies, minor concerns
   - HIGH: Major changes, many dependencies, bugs/issues found, security concerns
3. Confidence (0-100):
   - 80-100: Clear understanding, complete context, obvious issues or clean code
   - 50-79: Good understanding but some ambiguity
   - 20-49: Limited context or unclear changes
   - 0-19: Very unclear, missing critical context
4. Explanation: Write like brief notes to a senior engineer. Be specific:
   - What bugs/issues did you find? (e.g., "Missing null check on line X", "Potential race condition in async function Y")
   - What looks suspicious? (e.g., "Removed error handling without replacement", "Changed API contract without migration")
   - What's the impact? (e.g., "High risk: This utility is used by 15+ files", "Security concern: User input not sanitized")
   - If nothing concerning: Briefly note why (e.g., "Clean refactor, no logic changes", "Well-tested utility function")
   Do NOT explain confidence scores - they're displayed separately.

Overall assessment:
Provide overall risk level and write like briefing a senior engineer. Focus on:
- Critical bugs or security issues found
- Patterns of concern across files
- High-impact changes (many dependencies, breaking changes)
- Any red flags that need immediate attention
Be concise and specific. Do NOT start with "Overall Assessment:" or repeat the risk level (it's in the tag). Do NOT explain confidence scores.`;

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
                explanation: af.explanation,
              };
            })
            .filter((af): af is NonNullable<typeof af> => af !== null);

          if (affectedSurfaces.length > 0) {
            return {
              affectedSurfaces,
              overallRisk: impact.overallRisk,
              confidence: impact.confidence,
              overallExplanation: impact.overallExplanation,
            };
          }
          return undefined;
        } catch (error) {
          console.error("Error analyzing impact:", error);
          return undefined;
        }
      })();

      // Wait for all AI generations to complete in parallel
      const [perspectiveResults, impactAnalysis] = await Promise.all([
        Promise.all(perspectivePromises),
        repository.indexStatus === "completed" ? impactAnalysisPromise : Promise.resolve(undefined),
      ]);

      // Filter out null results from failed perspective generations
      const perspectives = perspectiveResults.filter(
        (p): p is NonNullable<typeof p> => p !== null
      );

      // 12. Update digest with impact analysis if available
      if (impactAnalysis) {
        await ctx.runMutation(internal.digests.update, {
          digestId,
          impactAnalysis,
        });
      }

      // 13. Store perspectives in batch
      if (perspectives.length > 0) {
        await ctx.runMutation(internal.digests.createPerspectivesBatch, {
          digestId,
          perspectives: perspectives.map((p) => ({
            perspective: p.perspective,
            title: p.title,
            summary: p.summary,
            confidence: p.confidence,
          })),
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
