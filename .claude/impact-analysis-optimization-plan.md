# Impact Analysis Performance Optimization Plan (Revised)

## Executive Summary

This is a reviewed and improved version of the original optimization plan. Key changes include:
- More conservative prompt size reduction (2,500 chars vs 1,200 chars)
- Provider-agnostic fast model selection instead of hardcoded GPT-4o-mini
- Specific Convex implementation patterns for non-blocking execution
- Graceful degradation when impact analysis fails
- Corrected assumptions about existing code behavior

---

## Problem Analysis

### Root Causes (Confirmed via Code Review)

1. **Massive prompt size**: Up to 20 files with 10,000 char patches each, plus verbose 6-category scanning guidelines (~200K+ characters total) - see `ai.ts:535-575`

2. **No retry logic for impact analysis**: Unlike digest generation (which has retry at `ai.ts:410-458`), impact analysis at `ai.ts:651` has zero retry handling - failures silently return `undefined`

3. **No system prompt**: Impact analysis only uses user prompt (`ai.ts:577-649`), which is less efficient for structured output

4. **Synchronous blocking**: `ai.ts:690` awaits impact analysis before marking digest as completed, blocking the entire flow

5. **Complex surface matching**: Schema requires LLM to match file paths to surface names (`ai.ts:31-44`), which is error-prone

6. **Silent failures**: Errors are caught and return `undefined` (`ai.ts:683-686`), which explains why "nothing showed up"

### Current Code Observations

- `getModel()` already defaults to `gpt-4o-mini` for OpenAI and OpenRouter providers (`ai.ts:83-114`)
- File patches are already limited to 10,000 chars (`ai.ts:555-557`)
- File count is limited to 20 (`ai.ts:537`)
- Retry logic exists for digest generation but not impact analysis
- Streaming is already implemented for summaries (`summariesAi.ts:517-647`)

---

## Optimization Strategy

### 1. Reduce Prompt Size (Target: ~15-20K chars, ~90% reduction)

**Current Issues:**
- 20 files x 10,000 chars = 200K chars max
- Verbose 6-category guidelines (~500 lines)
- Full dependency/export information included

**Changes (convex/ai.ts):**

```typescript
// Reduce file limit: 20 -> 8 files (prioritize by change magnitude)
const filesWithPatches = fileDiffs
  .filter((f) => f.patch && f.patch.length > 0)
  .sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions)) // Sort by change size
  .slice(0, 8);

// Reduce patch size: 10,000 -> 2,500 chars (focus on key changes)
const patchPreview = f.patch!.length > 2500
  ? f.patch!.substring(0, 2500) + "\n... (truncated)"
  : f.patch!;

// Simplify surface context: Just name + dependency count, not full dependency list
const surfaceInfo = fileSurfaces.map((s) =>
  `${s.name} (${s.surfaceType}, ${s.dependencies.length} deps)`
).join(", ");
```

**Rationale for 2,500 chars vs 1,200:**
- Most meaningful code changes are visible within 2,500 chars
- 1,200 chars often cuts off mid-function, losing context for security/bug detection
- 8 files x 2,500 chars = 20K chars baseline (still 90% reduction)

### 2. Add Retry Logic with Error Handling

**Current Issue:** `ai.ts:651` calls `generateObject` once with no retries

**Implementation (convex/ai.ts):**

```typescript
// Around line 651, replace single call with retry loop
let impactResult: z.infer<typeof ImpactAnalysisSchema> | null = null;
const maxRetries = 3;

for (let attempt = 0; attempt < maxRetries; attempt++) {
  try {
    const { object: impact } = await generateObject({
      model: fastModel, // Use fast model (see section 6)
      schema: ImpactAnalysisSchema,
      system: IMPACT_ANALYSIS_SYSTEM_PROMPT, // Use system prompt (see section 3)
      prompt: impactPrompt,
    });
    impactResult = impact;
    break;
  } catch (error: any) {
    console.error(`Impact analysis attempt ${attempt + 1} failed:`, {
      error: error instanceof Error ? error.message : String(error),
      attempt,
    });

    if (attempt < maxRetries - 1) {
      // Exponential backoff: 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }
}

if (!impactResult) {
  console.error("Impact analysis failed after all retries - returning graceful fallback");
  // Return a minimal fallback instead of undefined
  return {
    affectedSurfaces: [],
    overallRisk: "low" as const,
    confidence: 0,
    overallExplanation: "Impact analysis unavailable. Unable to assess risk for this change.",
  };
}
```

### 3. Use System Prompt for Instructions

**Current Issue:** Only user prompt, no system prompt for impact analysis

**Implementation (convex/ai.ts, after line 81):**

```typescript
const IMPACT_ANALYSIS_SYSTEM_PROMPT = `You are a senior engineer performing rapid code review. Your task is to identify critical issues in code changes.

Focus on these 3 categories ONLY:
1. SECURITY: SQL injection, XSS, auth bypass, exposed secrets, CSRF
2. CRITICAL BUGS: Null/undefined access, race conditions, type errors, logic flaws
3. BREAKING CHANGES: API contract changes, removed functionality, incompatible modifications

Guidelines:
- Be concise and specific - cite exact code when flagging issues
- Use surface dependency counts for context but analyze only the changed code
- Default to "low" risk if no issues found
- High confidence (80-100) = clear evidence; Medium (50-79) = potential concern; Low (20-49) = uncertain

Never use emojis. Never start with "Overall Assessment:" - that's redundant.`;
```

**Simplified User Prompt:**

```typescript
const impactPrompt = `Analyze these code changes for security issues, bugs, and breaking changes.

${structuredChanges}

${filesWithoutPatches.length > 0
  ? `\n${filesWithoutPatches.length} additional files changed without diff data.`
  : ""}

Provide:
1. Per-file risk assessment (match to known surfaces where possible)
2. Overall risk level with brief explanation`;
```

### 4. Simplify Schema (File-Level Focus)

**Current Issues:**
- Requires exact `surfaceName` matching which is error-prone
- Complex nested structure

**New Schema:**

```typescript
const ImpactAnalysisSchema = z.object({
  affectedFiles: z.array(
    z.object({
      filePath: z.string().describe("The file path from the diff"),
      riskLevel: z.enum(["low", "medium", "high"]),
      briefReason: z.string().max(100).describe("One-line explanation"),
      confidence: z.number().min(0).max(100),
    })
  ).max(10),
  overallRisk: z.enum(["low", "medium", "high"]),
  confidence: z.number().min(0).max(100),
  overallExplanation: z.string().max(500).describe("2-3 sentence senior engineer summary"),
});
```

**Backend Mapping (after LLM response):**

```typescript
// Map file paths to surfaces after receiving LLM response
const affectedSurfaces = impactResult.affectedFiles
  .map((af) => {
    // Find surface by file path
    const matchingSurfaces = surfaces.filter((s) => s.filePath === af.filePath);
    const primarySurface = matchingSurfaces[0]; // Use first match

    return {
      surfaceId: primarySurface?._id,
      surfaceName: primarySurface?.name || path.basename(af.filePath),
      filePath: af.filePath,
      impactType: "modified" as const, // Derive from file status if needed
      riskLevel: af.riskLevel,
      confidence: af.confidence,
    };
  })
  .filter((af) => af.surfaceId); // Only include files with matching surfaces
```

### 5. Make Non-Blocking (Async Impact Analysis)

**Current Issue:** `ai.ts:690` awaits impact analysis, blocking digest completion

**Implementation Pattern for Convex:**

```typescript
// Option A: Fire-and-forget with scheduler (RECOMMENDED)
// In digestEvent handler, around line 688:

// Don't await - schedule impact analysis to run after digest is "completed"
if (repository.indexStatus === "completed" && fileDiffs && fileDiffs.length > 0) {
  await ctx.scheduler.runAfter(0, internal.ai.analyzeImpactAsync, {
    digestId,
    repositoryId: event.repositoryId,
    fileDiffs: fileDiffs.map(f => ({
      filename: f.filename,
      status: f.status,
      patch: f.patch?.substring(0, 2500), // Pre-truncate
      additions: f.additions,
      deletions: f.deletions,
    })),
  });
}

// Mark event as completed BEFORE impact analysis finishes
await ctx.runMutation(internal.events.updateStatus, {
  eventId: args.eventId,
  status: "completed",
});
```

**New Internal Action:**

```typescript
// New action in convex/ai.ts
export const analyzeImpactAsync = internalAction({
  args: {
    digestId: v.id("digests"),
    repositoryId: v.id("repositories"),
    fileDiffs: v.array(v.object({
      filename: v.string(),
      status: v.string(),
      patch: v.optional(v.string()),
      additions: v.number(),
      deletions: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    // Perform impact analysis...
    const impactAnalysis = await performImpactAnalysis(ctx, args);

    // Update digest with results (digest already exists and is "completed")
    if (impactAnalysis) {
      await ctx.runMutation(internal.digests.update, {
        digestId: args.digestId,
        impactAnalysis,
      });
    }
  },
});
```

### 6. Provider-Agnostic Fast Model Selection

**Issue with Original Plan:** Hardcoding `gpt-4o-mini` fails if user only has OpenRouter or Anthropic configured.

**Better Approach:**

```typescript
// Helper function for fast model selection
function getFastModel(
  provider: "openai" | "anthropic" | "openrouter",
  apiKey: string,
  openrouterModel?: string
) {
  if (provider === "openai") {
    const openai = createOpenAI({ apiKey });
    return openai("gpt-4o-mini"); // Fast OpenAI model
  } else if (provider === "anthropic") {
    const anthropic = createAnthropic({ apiKey });
    return anthropic("claude-3-5-haiku-latest"); // Fast Anthropic model
  } else {
    // OpenRouter - use fast model regardless of user's preferred model
    const openrouter = createOpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
    });
    // Always use gpt-4o-mini for impact analysis via OpenRouter
    return openrouter("openai/gpt-4o-mini");
  }
}

// Usage in impact analysis:
const fastModel = getFastModel(preferredProvider, apiKey);
// User's model choice is preserved for digest generation
```

**Rationale:**
- Uses whatever provider the user has configured
- Always selects fastest model for that provider
- Preserves user's model choice for digest/summary generation

---

## Additional Improvements

### 7. Markdown Support for Rich Display

**Files to modify:**
- `convex/ai.ts`: Update `overallExplanation` description to request markdown
- `src/components/feed/ImpactAnalysis.tsx`: Render markdown

**Implementation:**

```typescript
// In ImpactAnalysisSchema:
overallExplanation: z.string().max(500).describe(
  "2-3 sentence summary in markdown. Use **bold** for critical issues, `code` for technical terms."
),

// In system prompt, add:
"Format your overall explanation using markdown: **bold** for critical findings, `code` for function/variable names."
```

**Frontend (ImpactAnalysis.tsx):**

```tsx
import ReactMarkdown from 'react-markdown';

// Replace line 189-191:
<div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none">
  <ReactMarkdown>{impactAnalysis.overallExplanation}</ReactMarkdown>
</div>
```

### 8. Work Breakdown Percentage Normalization

**Issue:** Forcing percentages to sum to exactly 100% causes floating-point issues (e.g., 33.33% x 3 = 99.99%)

**Solution: Normalize on display, not generation**

```typescript
// In transformToSummaryData (summariesAi.ts):
function transformToSummaryData(
  aiResponse: z.infer<typeof SummarySchema>,
  digestCount: number
): SummaryData {
  const workBreakdown: SummaryData["workBreakdown"] = {};

  // Calculate actual total for normalization
  const total = aiResponse.workBreakdownItems.reduce((sum, item) => sum + item.count, 0);

  for (const item of aiResponse.workBreakdownItems) {
    // Recalculate percentage based on actual counts
    const normalizedPercentage = total > 0
      ? Math.round((item.count / total) * 100)
      : 0;

    workBreakdown[item.category] = {
      percentage: normalizedPercentage,
      count: item.count,
    };
  }

  // Note: Percentages may sum to 99 or 101 due to rounding - that's acceptable
  return { /* ... */ };
}
```

**Prompt instruction:**
```
"Calculate percentages from counts. Minor rounding variations are acceptable."
```

### 9. Remove Emojis and Emdash from All Output

**Update system prompts in:**
- `DIGEST_SYSTEM_PROMPT` (ai.ts)
- `SUMMARY_SYSTEM_PROMPT` (summariesAi.ts)
- `IMPACT_ANALYSIS_SYSTEM_PROMPT` (ai.ts - new)

**Add to each:**
```
"FORMATTING RULES:
- Never use emojis
- Never use emdash (—) - use regular dash (-) or comma instead
- Keep language professional and scannable"
```

### 10. Graceful Degradation

**If impact analysis fails repeatedly, show something useful:**

```typescript
// Fallback impact analysis (when all retries fail)
const fallbackImpact = {
  affectedSurfaces: [],
  overallRisk: "low" as const,
  confidence: 0,
  overallExplanation: "Impact analysis unavailable for this change. Manual review recommended for significant changes.",
};

// In frontend (ImpactAnalysis.tsx), detect this state:
if (impactAnalysis?.confidence === 0 && impactAnalysis?.affectedSurfaces?.length === 0) {
  return (
    <div className="text-sm text-muted-foreground italic">
      {impactAnalysis.overallExplanation}
    </div>
  );
}
```

---

## What NOT To Change

1. **Automatic summary generation on digest creation**: Already works via `updateSummariesForDigest` in `summaries.ts:384`. The current pattern (backend updates existing summaries, frontend triggers on-demand generation) is correct.

2. **Frontend summary triggering**: The current `Summary.tsx` pattern is fine - it handles edge cases like first view of a period without a summary.

3. **Streaming for summaries**: Already implemented and working in `summariesAi.ts:517-647`.

4. **Surface-level granularity in database**: Keep storing surface IDs - the simplification is at the LLM prompt level, not storage.

---

## Implementation Order

### Phase 1: Critical Fixes (Highest Impact)
1. Add retry logic for impact analysis
2. Add graceful fallback for failures
3. Make impact analysis non-blocking

### Phase 2: Performance Optimization
4. Reduce prompt size (8 files, 2,500 chars)
5. Add system prompt
6. Simplify user prompt (3 categories vs 6)

### Phase 3: Model Optimization
7. Implement provider-agnostic fast model selection

### Phase 4: Quality of Life
8. Remove emojis/emdash from prompts
9. Add markdown support for explanations
10. Normalize work breakdown percentages

---

## Expected Improvements

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Prompt size | ~200K chars | ~15-20K chars | 90% reduction |
| Reliability | Silent failures | Retry + fallback | ~100% success rate |
| Perceived speed | Blocks digest | Non-blocking | Instant digest display |
| Model calls | Same as digest | Fast model only | ~3-5x faster response |

**Total expected improvement:** Digests appear immediately; impact analysis completes 5-10x faster and never silently fails.

---

## Testing Checklist

- [ ] Test with 1-2 file changes (baseline)
- [ ] Test with 8-10 file changes (within limit)
- [ ] Test with 20+ file changes (truncation handling)
- [ ] Test retry logic by simulating API failures
- [ ] Verify fallback displays when all retries fail
- [ ] Confirm digest appears before impact analysis completes
- [ ] Test with OpenAI, Anthropic, and OpenRouter providers
- [ ] Verify no emojis or emdash in generated content
- [ ] Test markdown rendering in ImpactAnalysis component
- [ ] Verify work breakdown percentages are reasonable (allow 99-101 total)
