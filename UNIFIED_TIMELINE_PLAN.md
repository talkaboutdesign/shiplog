# Unified Activity Timeline Plan

## Overview

Replace the current Summary + Feed pages with a single, unified Activity Timeline that adapts based on how long the user has been away.

**Key insight**: Summaries are generated AFTER periods end (via cron), not in real-time. This eliminates the `getSummaryStatus` polling that's causing the database bandwidth problem.

---

## User Experience

### The Vision

One page. One timeline. Smart and adaptive.

```
┌─────────────────────────────────────────────────┐
│  [Repo Selector in Header]                      │
├─────────────────────────────────────────────────┤
│  Welcome back, Max!                             │
│  You've been away 3 days. Here's what happened: │
├─────────────────────────────────────────────────┤
│  [Friday's Summary Card] ← Expanded             │
│    "12 commits focused on auth refactor..."     │
│    ├─ Commit: Fix login redirect                │
│    ├─ Commit: Add session handling              │
│    └─ PR Merged: Auth refactor complete         │
│                                                 │
│  [Thursday's Summary Card] ← Collapsed          │
│  [Wednesday's Summary Card] ← Collapsed         │
├─────────────────────────────────────────────────┤
│  ─────── Today ───────                          │
│  ├─ Commit: Update dependencies (2h ago)        │
│  ├─ Commit: Fix typo in README (4h ago)         │
│  └─ [Load More]                                 │
└─────────────────────────────────────────────────┘
```

### Adaptive "While You Were Away"

| Time Away | What to Show |
|-----------|--------------|
| < 1 day | "14 new commits since this morning" → straight to today's feed |
| 1-2 days | Yesterday's daily summary card (expanded) + today's feed |
| 3-6 days | Daily summary cards for each missed day (most recent expanded, others collapsed) |
| 1-2 weeks | Weekly summary card (expanded) + today's feed |
| 2+ weeks | Weekly + monthly summary cards + today's feed |

### Expand/Collapse Behavior

When a summary card is expanded, it shows:
1. **Summary text** - The AI-generated narrative at the top
2. **Individual items** - The commits/PRs from that period below

This gives leadership the high-level view while letting engineers drill into specifics.

### Per-Repo Focus

- Repo selector stays in header (existing pattern)
- Timeline shows activity for selected repo only
- Most users have one main repo - keeps it focused, reduces noise
- Can add unified cross-repo view later if needed

---

## What This Eliminates

| Current System | New System |
|----------------|------------|
| `getSummaryStatus` polling every page load | **GONE** - no polling needed |
| Fetches ALL digests just to count them | **GONE** - counts known at generation time |
| Real-time summary updates | **GONE** - summaries immutable once generated |
| Separate Summary + Feed pages | **GONE** - single unified page |
| 3 separate queries for daily/weekly/monthly status | **GONE** - single timeline query |
| Complex `updateKey` mechanism | **GONE** - not needed |
| ~1GB+ monthly database bandwidth | **Expected 90%+ reduction** |

---

## Data Model Changes

### Users Table - Add `lastVisitAt`

```typescript
// convex/schema.ts
users: defineTable({
  // ... existing fields
  lastVisitAt: v.optional(v.number()),  // NEW: Track last visit timestamp
})
```

### Summaries Table - Add metadata fields

```typescript
// convex/schema.ts
summaries: defineTable({
  repositoryId: v.id("repositories"),
  period: v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
  periodStart: v.number(),
  periodEnd: v.number(),  // NEW: Explicit end timestamp

  // Content
  content: v.string(),
  highlights: v.optional(v.array(v.string())),  // NEW: Key bullet points for quick scan

  // Stats for header display
  stats: v.optional(v.object({  // NEW
    digestCount: v.number(),
    // Can add more: prCount, contributorCount, etc.
  })),

  includedDigestIds: v.array(v.id("digests")),
  generatedAt: v.optional(v.number()),  // NEW: When cron generated this
  createdAt: v.number(),
})
```

### Retention

- Keep summaries for 1 year
- Cron job to clean up old summaries (optional, implement later)

---

## Backend Changes

### New Queries

#### `getTimelineContext` - Smart "while you were away" data

```typescript
// convex/timeline.ts
export const getTimelineContext = query({
  args: {
    repositoryId: v.id("repositories"),
  },
  returns: v.object({
    lastVisitAt: v.number(),
    millisAway: v.number(),
    daysAway: v.number(),
    summariesToShow: v.array(v.object({
      period: v.string(),
      periodStart: v.number(),
      // ... summary fields
    })),
    todayDigestCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const lastVisit = user?.lastVisitAt || Date.now();
    const millisAway = Date.now() - lastVisit;
    const daysAway = Math.floor(millisAway / (1000 * 60 * 60 * 24));

    // Fetch appropriate summaries based on time away
    let summariesToShow = [];

    if (daysAway >= 14) {
      // Show weekly + monthly
      summariesToShow = await getRecentSummaries(ctx, args.repositoryId, ["weekly", "monthly"], 4);
    } else if (daysAway >= 7) {
      // Show weekly
      summariesToShow = await getRecentSummaries(ctx, args.repositoryId, ["weekly"], 2);
    } else if (daysAway >= 1) {
      // Show daily summaries for missed days
      summariesToShow = await getDailySummariesSince(ctx, args.repositoryId, lastVisit);
    }
    // daysAway < 1: no summaries needed, just show feed

    // Count today's digests (simple count, not full fetch)
    const todayStart = getStartOfDay(Date.now());
    const todayDigests = await ctx.db
      .query("digests")
      .withIndex("by_repository_time", q => q.eq("repositoryId", args.repositoryId))
      .filter(q => q.gte(q.field("createdAt"), todayStart))
      .take(100);

    return {
      lastVisitAt: lastVisit,
      millisAway,
      daysAway,
      summariesToShow,
      todayDigestCount: todayDigests.length,
    };
  },
});
```

#### `getTodayFeed` - Today's digests with pagination

```typescript
// convex/timeline.ts
export const getTodayFeed = query({
  args: {
    repositoryId: v.id("repositories"),
    cursor: v.optional(v.number()),  // createdAt of last item
    limit: v.optional(v.number()),   // default 10
  },
  returns: v.object({
    digests: v.array(/* digest schema */),
    hasMore: v.boolean(),
    nextCursor: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const limit = args.limit || 10;
    const todayStart = getStartOfDay(Date.now());

    let query = ctx.db
      .query("digests")
      .withIndex("by_repository_time", q => q.eq("repositoryId", args.repositoryId))
      .order("desc");

    if (args.cursor) {
      query = query.filter(q => q.lt(q.field("createdAt"), args.cursor));
    }

    // For today: filter to today only
    // After today: load more goes into yesterday, etc.
    const digests = await query.take(limit + 1);

    const hasMore = digests.length > limit;
    const returnDigests = hasMore ? digests.slice(0, limit) : digests;

    return {
      digests: returnDigests,
      hasMore,
      nextCursor: hasMore ? returnDigests[returnDigests.length - 1].createdAt : undefined,
    };
  },
});
```

#### `getSummaryWithDigests` - Expanded summary card data

```typescript
// convex/timeline.ts
export const getSummaryWithDigests = query({
  args: {
    summaryId: v.id("summaries"),
  },
  returns: v.object({
    summary: /* summary schema */,
    digests: v.array(/* digest schema */),
  }),
  handler: async (ctx, args) => {
    const summary = await ctx.db.get(args.summaryId);
    if (!summary) throw new Error("Summary not found");

    // Fetch the digests included in this summary
    const digests = await Promise.all(
      summary.includedDigestIds.map(id => ctx.db.get(id))
    );

    return {
      summary,
      digests: digests.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt),
    };
  },
});
```

### New Mutations

#### `updateLastVisit` - Track when user visited

```typescript
// convex/users.ts
export const updateLastVisit = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    await ctx.db.patch(user._id, {
      lastVisitAt: Date.now(),
    });
    return null;
  },
});
```

### Cron Jobs

#### Daily Summary Generation (runs 00:05 UTC)

```typescript
// convex/crons.ts
export const generateDailySummaries = internalAction({
  args: {},
  handler: async (ctx) => {
    // Get all active repositories
    const repos = await ctx.runQuery(internal.repositories.listActive);

    const yesterdayStart = getStartOfDay(Date.now() - 24 * 60 * 60 * 1000);
    const yesterdayEnd = getStartOfDay(Date.now());

    for (const repo of repos) {
      // Check if summary already exists
      const existing = await ctx.runQuery(internal.summaries.getByRepositoryPeriod, {
        repositoryId: repo._id,
        period: "daily",
        periodStart: yesterdayStart,
      });

      if (existing) continue;

      // Get digests for yesterday
      const digests = await ctx.runQuery(internal.digests.getByRepositoryTimeRange, {
        repositoryId: repo._id,
        startTime: yesterdayStart,
        endTime: yesterdayEnd,
      });

      if (digests.length === 0) continue;  // No activity, skip

      // Generate summary via AI
      await ctx.runAction(internal.summaries.generateSummary, {
        repositoryId: repo._id,
        period: "daily",
        periodStart: yesterdayStart,
        periodEnd: yesterdayEnd,
        digestIds: digests.map(d => d._id),
      });
    }
  },
});

// Register cron
crons.daily(
  "generate daily summaries",
  { hourUTC: 0, minuteUTC: 5 },
  internal.crons.generateDailySummaries
);
```

#### Weekly Summary Generation (runs Monday 00:10 UTC)

```typescript
// convex/crons.ts
export const generateWeeklySummaries = internalAction({
  args: {},
  handler: async (ctx) => {
    // Similar to daily, but for last week (Mon-Sun)
    const lastWeekStart = getStartOfWeek(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const lastWeekEnd = getStartOfWeek(Date.now());

    // ... similar logic
  },
});

// Register cron - runs on Monday
crons.weekly(
  "generate weekly summaries",
  { dayOfWeek: "monday", hourUTC: 0, minuteUTC: 10 },
  internal.crons.generateWeeklySummaries
);
```

#### Monthly Summary Generation (runs 1st of month 00:15 UTC)

```typescript
// convex/crons.ts
export const generateMonthlySummaries = internalAction({
  args: {},
  handler: async (ctx) => {
    // Similar to daily, but for last month
    const lastMonthStart = getStartOfMonth(Date.now() - 1);  // Previous month
    const lastMonthEnd = getStartOfMonth(Date.now());

    // ... similar logic
  },
});

// Register cron - runs on 1st of month
crons.monthly(
  "generate monthly summaries",
  { day: 1, hourUTC: 0, minuteUTC: 15 },
  internal.crons.generateMonthlySummaries
);
```

---

## Frontend Changes

### New Components

#### `ActivityTimeline` - Main page component

```tsx
// src/pages/ActivityTimeline.tsx
export function ActivityTimeline() {
  const { selectedRepoId } = useSelectedRepo();
  const context = useQuery(api.timeline.getTimelineContext,
    selectedRepoId ? { repositoryId: selectedRepoId } : "skip"
  );

  // Update last visit on mount
  const updateLastVisit = useMutation(api.users.updateLastVisit);
  useEffect(() => {
    updateLastVisit();
  }, []);

  return (
    <div>
      <WelcomeHeader context={context} />
      <SummaryCards summaries={context?.summariesToShow} />
      <TodayFeed repositoryId={selectedRepoId} />
    </div>
  );
}
```

#### `WelcomeHeader` - Personalized greeting

```tsx
// src/components/timeline/WelcomeHeader.tsx
export function WelcomeHeader({ context }) {
  const { daysAway, todayDigestCount } = context;

  if (daysAway < 1) {
    return (
      <div>
        <h1>Welcome back!</h1>
        <p>{todayDigestCount} commits today</p>
      </div>
    );
  }

  return (
    <div>
      <h1>Welcome back!</h1>
      <p>You've been away {daysAway} days. Here's what happened:</p>
    </div>
  );
}
```

#### `SummaryCard` - Expandable summary

```tsx
// src/components/timeline/SummaryCard.tsx
export function SummaryCard({ summary, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Lazy load digests only when expanded
  const { data } = useQuery(
    api.timeline.getSummaryWithDigests,
    expanded ? { summaryId: summary._id } : "skip"
  );

  return (
    <Card>
      <CardHeader onClick={() => setExpanded(!expanded)}>
        <div className="flex justify-between">
          <span>{formatPeriodLabel(summary.period, summary.periodStart)}</span>
          <span>{summary.stats?.digestCount} commits</span>
          <ChevronIcon expanded={expanded} />
        </div>
      </CardHeader>

      {expanded && (
        <CardContent>
          {/* Summary narrative */}
          <p className="text-muted-foreground mb-4">{summary.content}</p>

          {/* Individual items */}
          <div className="space-y-2">
            {data?.digests.map(digest => (
              <DigestItem key={digest._id} digest={digest} />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
```

#### `TodayFeed` - Live feed with load more

```tsx
// src/components/timeline/TodayFeed.tsx
export function TodayFeed({ repositoryId }) {
  const [cursor, setCursor] = useState<number | undefined>();
  const { data, isLoading } = useQuery(api.timeline.getTodayFeed, {
    repositoryId,
    cursor,
    limit: 10,
  });

  return (
    <div>
      <h2>Today</h2>

      {data?.digests.map(digest => (
        <DigestItem key={digest._id} digest={digest} />
      ))}

      {data?.hasMore && (
        <Button
          variant="ghost"
          onClick={() => setCursor(data.nextCursor)}
        >
          Load more
        </Button>
      )}
    </div>
  );
}
```

### Pages to Remove

- `src/pages/Summary.tsx` - replaced by ActivityTimeline
- `src/pages/Feed.tsx` - replaced by ActivityTimeline

### Components to Remove

- `src/components/summary/SummaryTabs.tsx`
- `src/components/summary/SummaryView.tsx`
- `src/components/summary/SummaryPeriodView.tsx`
- Any components only used by the old Summary page

### Routes Update

```tsx
// src/App.tsx
<Routes>
  <Route path="/" element={<ActivityTimeline />} />  {/* Was Summary */}
  {/* Remove /feed route */}
  <Route path="/github/callback" element={<GitHubCallback />} />
</Routes>
```

---

## Migration Path

### Phase 1: Infrastructure (No UI changes)

1. Add `lastVisitAt` field to users schema
2. Add `periodEnd`, `highlights`, `stats` fields to summaries schema
3. Create `convex/timeline.ts` with new queries
4. Add `updateLastVisit` mutation
5. Set up cron job scaffolding (can be disabled initially)

**Validation**: Run existing app, verify nothing breaks

### Phase 2: Cron Jobs (Background)

1. Implement `generateDailySummaries` cron
2. Implement `generateWeeklySummaries` cron
3. Implement `generateMonthlySummaries` cron
4. Test cron jobs manually
5. Enable crons in production

**Validation**: Verify summaries are generated correctly after periods end

### Phase 3: Build New UI (Parallel)

1. Create `WelcomeHeader` component
2. Create `SummaryCard` component
3. Create `TodayFeed` component
4. Create `ActivityTimeline` page
5. Add route at `/new` for testing

**Validation**: Test new UI at `/new` route while old UI still works

### Phase 4: Switch Over

1. Make `ActivityTimeline` the default at `/`
2. Remove old `/feed` route (or redirect to `/`)
3. Update navigation

**Validation**: Full user testing of new experience

### Phase 5: Cleanup

1. Delete `getSummaryStatus` query (THE BANDWIDTH PROBLEM - GONE!)
2. Delete old Summary page and components
3. Delete old Feed page (if separate)
4. Remove unused queries/mutations
5. Clean up any dead code

**Validation**: Verify app still works, check bundle size reduced

---

## Expected Impact

### Database Bandwidth

| Before | After |
|--------|-------|
| `getSummaryStatus` fetches ALL digests 3x per page load | Query removed entirely |
| ~1 GB/month bandwidth (exceeded limit) | Expected 90%+ reduction |
| Scales poorly with digest count | Constant query cost |

### User Experience

| Before | After |
|--------|-------|
| Separate Summary + Feed pages | Single unified timeline |
| Rigid tabs (daily/weekly/monthly) | Fluid, adaptive experience |
| Same view regardless of time away | Personalized "welcome back" |
| Manual navigation to find updates | Smart highlighting of what you missed |

### Code Complexity

| Before | After |
|--------|-------|
| Complex `getSummaryStatus` with polling | Simple cron-generated summaries |
| `updateKey` mechanism for deduplication | Not needed |
| Real-time summary updates | Summaries immutable |
| Multiple overlapping queries | Single timeline query |

---

## Open Questions / Future Enhancements

1. **Notifications**: Email digest when you've been away X days?
2. **Cross-repo view**: Unified timeline across all repos (implement later)
3. **Team view**: See what specific team members have been working on
4. **Highlights extraction**: Better AI prompting for the `highlights` field
5. **Search**: Search within timeline for specific commits/topics

---

## Summary

This plan transforms ShipLog from a rigid tab-based interface to a smart, adaptive timeline that knows when you were last here and shows you exactly what you missed. It eliminates the database bandwidth problem by generating summaries via cron after periods end, rather than polling for updates in real-time.

The result is faster, cheaper, simpler, and a better user experience.
