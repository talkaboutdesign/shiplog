# Performance Optimization Plan (No RAG)

## Current State Analysis

### ✅ Already Implemented
- **Agent Component**: Installed and partially used (threads created but not used for generation)
- **Workflow Component**: Installed and used for digest generation
- **Workpool Component**: Installed but **NOT USED** (critical performance issue)
- **Action Cache**: Installed but has **CIRCULAR DEPENDENCY** issue

### ❌ Critical Issues Found

1. **Circular Dependency in Cache** (FIXED but needs verification)
   - `generateDigest` → `digestCache.fetch()` → `computeDigest` → (now does work directly)
   - But `generateDigest` ALSO has its own generation logic (duplicate code)
   - **Fix**: Remove duplicate generation logic from `generateDigest`, rely on cache only

2. **Workpools Not Used** (CRITICAL - causing TooManyConcurrentRequests)
   - Workpools are defined but never called
   - All AI operations run concurrently without throttling
   - **Fix**: Wrap all AI operations in workpool.enqueue()

3. **Agent Created But Not Used** (Performance waste)
   - Agent is created just for thread ID, but generation uses `generateObject` directly
   - **Fix**: Either use agent properly OR remove agent creation if not needed

4. **Excessive Logging** (FIXED)
   - `getGitHubAppConfig()` had 10 console.log calls per invocation
   - **Fix**: Already removed, verify it's working

5. **No Structured Output Optimization**
   - Not using strict mode or JSON schema mode
   - Manual retry logic could be simplified

## Performance Optimization Strategy

### Phase 1: Fix Critical Performance Issues (IMMEDIATE)

#### 1.1 Fix Cache Circular Dependency
**Problem**: `generateDigest` has duplicate generation logic that bypasses cache

**Solution**:
- Remove generation logic from `generateDigest` (lines 160-195)
- Let cache handle all generation via `computeDigest`
- `generateDigest` should ONLY: verify ownership, get user, create thread, call cache

**Files to Modify**:
- `convex/agents/digestAgent.ts`: Remove duplicate generation, rely on cache only

#### 1.2 Implement Workpool Throttling (CRITICAL)
**Problem**: Too many concurrent requests hitting 64 limit

**Solution**:
- Wrap all AI operations in workpool.enqueue()
- Use appropriate workpool for each operation:
  - `aiWorkpool`: Digest generation, perspective generation
  - `impactAnalysisWorkpool`: Impact analysis
  - `summaryWorkpool`: Summary generation

**Files to Modify**:
- `convex/agents/digestAgent.ts`: Use workpool for generation
- `convex/agents/impactAgent.ts`: Use workpool for analysis
- `convex/agents/perspectiveAgent.ts`: Use workpool for perspectives
- `convex/agents/summaryAgent.ts`: Use workpool for summaries
- `convex/cache/compute.ts`: Use workpool for digest generation

**Implementation Pattern**:
```typescript
// Before
const result = await generateObject({ model, schema, prompt });

// After
const result = await aiWorkpool.enqueue(ctx, async () => {
  return await generateObject({ model, schema, prompt });
});
```

#### 1.3 Simplify Agent Usage
**Problem**: Agent created but not used, just for thread tracking

**Options**:
- **Option A**: Remove agent creation, use simple thread ID generation
- **Option B**: Actually use agent for generation (more complex, but better tracking)

**Recommendation**: **Option A** - Remove agent creation, use simple tracking
- Thread ID is only used for tracking, not for actual agent functionality
- Simpler code, less overhead
- Can add agent usage later if needed

**Files to Modify**:
- `convex/agents/digestAgent.ts`: Remove agent creation, use simple thread ID
- `convex/agents/impactAgent.ts`: Remove agent creation if not used
- `convex/agents/perspectiveAgent.ts`: Remove agent creation if not used

### Phase 2: Optimize Structured Outputs

#### 2.1 Use Strict Mode for Structured Outputs
**Current**: Manual retry with text parsing fallbacks
**Optimized**: Use strict structured outputs, single retry for transient errors only

**Files to Modify**:
- `convex/agents/digestAgent.ts`: Use strict mode
- `convex/agents/impactAgent.ts`: Use strict mode
- `convex/agents/perspectiveAgent.ts`: Use strict mode
- `convex/agents/summaryAgent.ts`: Use strict mode
- `convex/cache/compute.ts`: Use strict mode

**Implementation**:
```typescript
// Use AI SDK's structured output features
const result = await generateObject({
  model,
  schema: DigestSchema,
  system: DIGEST_SYSTEM_PROMPT,
  prompt: buildEventPrompt(event, fileDiffs),
  // AI SDK handles structured outputs automatically
});
```

#### 2.2 Simplify Error Handling
**Current**: 3 retries with multiple fallback parsers
**Optimized**: Single retry for transient errors, graceful fallback

**Files to Modify**:
- `convex/agents/errors.ts`: Simplify retry logic
- All agent files: Use simplified error handling

### Phase 3: Optimize Prompts and Schemas

#### 3.1 Remove Verbose JSON Instructions
**Current**: Prompts include "IMPORTANT: You MUST respond with valid JSON only"
**Optimized**: Remove JSON instructions (handled by structured outputs)

**Files to Modify**:
- `convex/agents/prompts.ts`: Remove JSON formatting instructions

#### 3.2 Ensure Schema Matches Database
**Current**: Some schemas might have mismatches
**Optimized**: Verify all schemas match database schema exactly

**Files to Review**:
- `convex/agents/schemas.ts`: Verify all schemas match database
- `convex/schema.ts`: Compare with agent schemas

### Phase 4: Remove RAG References

#### 4.1 Clean Up Agent Tools
**Current**: Tools might reference RAG (already removed, but verify)
**Action**: Verify no RAG references remain

**Files to Check**:
- `convex/agents/tools.ts`: Verify only `getFileDiff` tool remains
- Remove any RAG-related tool code

#### 4.2 Update Documentation
**Action**: Remove RAG references from any documentation

## Implementation Plan

### Step 1: Fix Cache (HIGH PRIORITY)
1. Remove duplicate generation logic from `generateDigest`
2. Ensure `computeDigest` handles all generation
3. Test cache hit/miss scenarios

### Step 2: Add Workpool Throttling (CRITICAL)
1. Wrap digest generation in `aiWorkpool.enqueue()`
2. Wrap impact analysis in `impactAnalysisWorkpool.enqueue()`
3. Wrap perspective generation in `aiWorkpool.enqueue()`
4. Wrap summary generation in `summaryWorkpool.enqueue()`
5. Test concurrent request limits

### Step 3: Simplify Agent Usage
1. Remove agent creation from `digestAgent.ts`
2. Use simple thread ID generation
3. Remove agent creation from other agents if not used
4. Test thread tracking still works

### Step 4: Optimize Structured Outputs
1. Remove manual JSON parsing
2. Use AI SDK structured outputs
3. Simplify error handling
4. Test with all providers (OpenAI, Anthropic, OpenRouter)

### Step 5: Clean Up Prompts
1. Remove verbose JSON instructions
2. Focus prompts on business logic
3. Test prompt effectiveness

## Expected Performance Improvements

### Before Optimization
- **Concurrent Requests**: Unlimited (hitting 64 limit)
- **Digest Generation**: 17-50 seconds
- **Error Rate**: High (TooManyConcurrentRequests)
- **Cache**: Not working properly (circular dependency)

### After Optimization
- **Concurrent Requests**: Throttled via workpools (max 10 for AI, 5 for impact)
- **Digest Generation**: 3-8 seconds (with cache), 10-20 seconds (without cache)
- **Error Rate**: Low (workpool throttling prevents overload)
- **Cache**: Working correctly (no circular dependency)

## Security Checklist (No Changes Needed)

All security measures are already in place:
- ✅ Repository ownership verification
- ✅ Internal functions only
- ✅ Cache key isolation (repositoryId in keys)
- ✅ Workflow ownership verification
- ✅ Agent tool security

## Testing Strategy

### Performance Tests
1. **Concurrent Request Test**: Trigger 100 events, verify workpool throttling
2. **Cache Test**: Verify cache hits work correctly
3. **Error Recovery Test**: Verify graceful handling of failures

### Integration Tests
1. **End-to-End Flow**: Webhook → Event → Digest → Summary
2. **Workpool Throttling**: Verify max parallelism limits
3. **Cache Integration**: Verify cache works with workpools

## Files to Modify

### High Priority (Performance Critical)
1. `convex/agents/digestAgent.ts` - Remove duplicate generation, add workpool
2. `convex/cache/compute.ts` - Add workpool, verify no circular dependency
3. `convex/agents/impactAgent.ts` - Add workpool
4. `convex/agents/perspectiveAgent.ts` - Add workpool
5. `convex/agents/summaryAgent.ts` - Add workpool

### Medium Priority (Optimization)
6. `convex/agents/prompts.ts` - Remove verbose JSON instructions
7. `convex/agents/errors.ts` - Simplify error handling
8. `convex/agents/schemas.ts` - Verify schema matches database

### Low Priority (Cleanup)
9. `convex/agents/tools.ts` - Verify no RAG references
10. Documentation files - Remove RAG references

## Migration Notes

- **No Breaking Changes**: All changes are internal optimizations
- **Backward Compatible**: Existing functionality preserved
- **Gradual Rollout**: Can deploy incrementally
- **Monitoring**: Add logging for workpool queue depth, cache hit rates

## Success Metrics

- ✅ No more "TooManyConcurrentRequests" errors
- ✅ Digest generation < 10 seconds (cached) or < 20 seconds (uncached)
- ✅ Workpool queue depth < 5 under normal load
- ✅ Cache hit rate > 50% for repeated events
- ✅ Error rate < 1% for structured outputs
