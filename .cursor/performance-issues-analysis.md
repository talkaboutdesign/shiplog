# Performance Issues Analysis

## Issues Identified

### 1. Impact Analysis Not Completing
**Problem**: Impact analysis shows "analyzing impact" but never completes.

**Root Cause**: 
- Impact analysis only runs if `repository.indexStatus === "completed"` (digestWorkflow.ts:223)
- If repository isn't indexed, impact analysis is silently skipped
- If impact analysis fails, it returns `null` and workflow continues without error
- UI shows "analyzing impact" state but workflow has already completed

**Location**: `convex/workflows/digestWorkflow.ts:223-304`

### 2. High Log Volume
**Problem**: Producing excessive logs from workflow/worker operations.

**Root Cause**:
- `loop:main`, `loop:updateRunStatus`, `complete:complete`, `worker:runMutationWrapper` are **normal** Workflow component behavior
- Workflow component uses an internal loop to process steps
- Each workflow step creates multiple mutations for coordination
- Multiple concurrent workflows = high log volume

**This is expected behavior**, but indicates many workflows are running simultaneously.

### 3. Long-Running Summary Updates (10-23 seconds)
**Problem**: Summary update actions taking 10-23 seconds.

**Root Cause**:
- `updateSummaryPublic` and `updateSummaryStreaming` actions are doing expensive AI generation
- Called from frontend (Summary.tsx) AND from workflow onComplete handler
- No throttling/rate limiting
- Multiple summary updates can queue up

**Location**: `convex/summaries.ts:580`, `convex/summariesAi.ts:671`

### 4. Workflow Overhead
**Problem**: Moving to workflows/agents added significant overhead.

**Root Cause**:
- Each workflow step creates coordination mutations (`loop:updateRunStatus`, etc.)
- Workflow component adds latency (each step waits for mutations)
- More complex error handling and retry logic
- No workpool throttling (workpools aren't actually being used as intended)

## Recommendations

### Immediate Fixes

1. **Fix Impact Analysis Silent Failures**
   - Add logging when impact analysis is skipped (repo not indexed)
   - Update UI state when impact analysis is skipped/failed
   - Consider making impact analysis non-blocking (run async after digest completes)

2. **Optimize Summary Updates**
   - Don't trigger summary updates from frontend if they're already being triggered by workflow
   - Consider debouncing/throttling summary updates
   - Make summary updates non-blocking (use workpool if needed)

3. **Reduce Workflow Overhead**
   - Consider if workflows are necessary for all operations
   - Workflows are good for multi-step orchestration but add overhead for simple operations
   - Direct function calls are faster than workflow steps

4. **Add Rate Limiting**
   - Use workpools correctly to throttle concurrent AI operations
   - Limit concurrent workflow executions

### Longer Term

1. Review if workflow component is necessary for digest generation
2. Consider reverting to direct function calls for simpler operations
3. Implement proper workpool throttling (requires refactoring to extract AI operations into separate actions)
