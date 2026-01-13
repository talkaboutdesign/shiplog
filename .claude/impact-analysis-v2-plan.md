# Impact Analysis V2 - Semantic Understanding Plan

## Problem Statement

The current impact analysis flags patterns without understanding intent. Example: We added retry logic to fix silent failures, but the analyzer flagged "silent failures returning undefined" as high risk - it saw the pattern without recognizing it was the fix.

## Root Causes

1. **No before/after context** - Analyzer only sees the new code, not what it replaced
2. **Pattern matching without semantics** - Sees `catch { return }` and flags it without understanding retry context
3. **No intent awareness** - Doesn't consider what the change is trying to accomplish
4. **Diff-only analysis** - Missing surrounding code context that explains the pattern

---

## Proposed Improvements

### 1. Two-Pass Analysis Architecture

**Pass 1: Intent Detection**
- Analyze commit message, PR title/description
- Categorize the change intent: "adding error handling", "fixing bug", "performance optimization", etc.
- Extract claimed improvements: "adds retry logic", "fixes silent failures"

**Pass 2: Validation Analysis**
- Evaluate if the code actually implements the claimed intent
- Look for issues the change might introduce (not issues it fixes)
- Cross-reference: "Claims to add retry logic - does the code actually retry?"

```typescript
const IntentSchema = z.object({
  primaryIntent: z.enum(["bugfix", "feature", "refactor", "security", "performance"]),
  claimedImprovements: z.array(z.string()).describe("What the commit claims to fix/improve"),
  potentialRisks: z.array(z.string()).describe("What could go wrong with this approach"),
});

const ValidationSchema = z.object({
  intentValidation: z.object({
    claimVerified: z.boolean(),
    explanation: z.string(),
  }),
  newRisksIntroduced: z.array(z.object({
    risk: z.string(),
    severity: z.enum(["low", "medium", "high"]),
    location: z.string(),
  })),
});
```

### 2. Before/After Context in Prompt

Instead of just showing the diff, show:
- **Removed code context**: What pattern existed before
- **Added code context**: What pattern exists now
- **Semantic summary**: "Previously: no error handling. Now: 3-retry loop with fallback"

```typescript
// Build before/after summary
const changeContext = {
  removed: extractRemovedPatterns(diff), // "Single call with no retry"
  added: extractAddedPatterns(diff),     // "Retry loop with exponential backoff"
  netChange: summarizeNetChange(diff),   // "Added error resilience"
};
```

### 3. Smart Pattern Recognition

Don't flag patterns in isolation - understand the surrounding context:

**Current (bad):**
```
Sees: `return undefined` in catch block
Flags: "Silent failure risk"
```

**Improved:**
```
Sees: `return undefined` in catch block
Checks: Is this inside a retry loop? Is there a fallback after the loop?
Result: "Fallback after retry exhaustion - intentional graceful degradation"
```

**Implementation:**
```typescript
// In the prompt, add pattern context
const patternContext = `
When evaluating error handling patterns, consider:
- Is the catch block inside a retry loop? If so, individual failures are expected.
- Is there fallback logic after the loop? If so, the final return is graceful degradation, not silent failure.
- Does the code log errors before returning? If so, it's not silent.

DO NOT flag as "silent failure" if:
1. The code has retry logic that attempts multiple times
2. The code logs the error before returning
3. The code returns a fallback value (not just undefined) after retries exhausted
`;
```

### 4. Differential Risk Assessment

Ask: "What risks does this change ADD?" not "What risks exist in this code?"

```typescript
const differentialPrompt = `
Focus on DIFFERENTIAL risk analysis:
- What NEW risks does this change introduce that didn't exist before?
- What risks does this change REMOVE or MITIGATE?
- Net assessment: Is the codebase safer or riskier after this change?

DO NOT flag:
- Existing patterns that weren't changed
- Patterns that are FIXES for previous issues
- Defensive code that handles edge cases
`;
```

### 5. Commit Message Integration

Use the commit message as strong context signal:

```typescript
const commitContext = `
Commit message: "${commitMessage}"

The commit author claims this change: ${extractClaims(commitMessage)}

Your job is to:
1. Verify if the code actually implements these claims
2. Identify any NEW risks the implementation might introduce
3. NOT flag the problems the commit claims to fix (those are the "before" state)
`;
```

---

## Implementation Plan

### Phase 1: Prompt Engineering (Quick Win)
1. Add differential analysis framing to existing prompt
2. Add pattern context for common false positives (retry loops, fallbacks)
3. Include commit message in the analysis context

### Phase 2: Two-Pass Architecture
1. Create `analyzeIntent` action that extracts intent from commit/PR
2. Modify `analyzeImpactAsync` to receive intent context
3. Add validation step that cross-references intent with implementation

### Phase 3: Before/After Context
1. Parse diff to extract removed vs added code separately
2. Generate semantic summaries of what changed
3. Include "net change" context in prompt

---

## File Changes Required

### `convex/ai.ts`

```typescript
// New schema for intent detection
const IntentSchema = z.object({
  primaryIntent: z.enum(["bugfix", "feature", "refactor", "security", "performance"]),
  claimedFixes: z.array(z.string()),
  expectedBehaviorChange: z.string(),
});

// Updated impact analysis prompt
const IMPACT_ANALYSIS_SYSTEM_PROMPT = `You are a senior engineer performing DIFFERENTIAL code review.

Your job is to identify NEW risks introduced by changes, not existing patterns.

Key principles:
1. If code adds error handling/retry logic, that's a FIX not a risk
2. If code adds fallback behavior, that's defensive programming not silent failure
3. Focus on what's DIFFERENT and potentially problematic about the new approach

When you see patterns like:
- Retry loops with catch blocks: This is resilience, not silent failure
- Fallback returns after retries: This is graceful degradation
- Error logging before returns: This is observable failure, not silent

DO NOT flag as risks:
- Error handling that didn't exist before (that's an improvement)
- Defensive null checks (that's safety)
- Fallback values (that's resilience)

DO flag as risks:
- New code paths that could throw unexpectedly
- Removed error handling
- New external dependencies that could fail
- Logic changes that alter behavior in unexpected ways
`;

// New action for intent detection (Phase 2)
export const analyzeChangeIntent = internalAction({
  args: {
    commitMessage: v.string(),
    prTitle: v.optional(v.string()),
    prBody: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Extract intent from commit/PR metadata
    // Return structured intent for impact analysis
  },
});
```

### `convex/digests.ts` or `convex/ai.ts`

Pass commit message to impact analysis:

```typescript
await ctx.scheduler.runAfter(0, internal.ai.analyzeImpactAsync, {
  digestId,
  repositoryId: event.repositoryId,
  fileDiffs: truncatedFileDiffs,
  commitMessage: extractCommitMessage(event), // NEW
  prDescription: extractPrDescription(event), // NEW
});
```

---

## Expected Improvements

| Scenario | Current Behavior | Improved Behavior |
|----------|------------------|-------------------|
| Add retry logic | "High risk: silent failures" | "Low risk: adds resilience" |
| Add fallback handling | "Medium risk: returns undefined" | "Low risk: graceful degradation" |
| Add error logging | "Silent failure pattern" | "Observable failure, properly logged" |
| Remove error handling | Not flagged | "High risk: removed error handling" |
| Add new external call | May not flag | "Medium risk: new failure point" |

---

## Success Metrics

1. False positive rate on "fix" commits drops by >50%
2. True positive rate on actual regressions maintained
3. Confidence scores more accurate (higher for clear fixes, lower for ambiguous)
4. User feedback: "Analysis understands what I'm trying to do"

---

## Testing Strategy

1. Create test fixtures with known-good changes (retry logic, error handling)
2. Verify these get "low risk" ratings
3. Create test fixtures with known-bad changes (removed error handling)
4. Verify these get "high risk" ratings
5. A/B test with real commits to measure false positive reduction
