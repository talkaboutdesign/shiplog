import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InstallButton } from "@/components/github/InstallButton";
import { RepoCard } from "@/components/github/RepoCard";
import { FeedFilters, type FeedFilters as FeedFiltersType } from "@/components/feed/FeedFilters";
import { ApiKeyDrawer } from "@/components/settings/ApiKeyDrawer";
import { SyncedReposDropdown } from "@/components/github/SyncedReposDropdown";
import { DigestCard } from "@/components/feed/DigestCard";
import { FeedSkeleton } from "@/components/feed/FeedSkeleton";
import { EmptyFeed } from "@/components/feed/EmptyFeed";
import { Button } from "@/components/ui/button";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Skeleton } from "@/components/ui/skeleton";

const GITHUB_APP_SLUG = import.meta.env.VITE_GITHUB_APP_SLUG || "shiplog";

export function Dashboard() {
  const user = useCurrentUser();
  const activeRepos = useQuery(api.repositories.getAllActive);
  const [filters, setFilters] = useState<FeedFiltersType>({
    eventType: "all",
    timeRange: "all",
    repositoryId: "all",
  });

  // Get digests and events from all active repos
  const repositoryIds = activeRepos?.map((r) => r._id) || [];
  const digests = useQuery(
    api.digests.listByRepositories,
    repositoryIds.length > 0 ? { repositoryIds, limit: 50 } : "skip"
  );
  const events = useQuery(
    api.events.listByRepositories,
    repositoryIds.length > 0 ? { repositoryIds, limit: 50 } : "skip"
  );

  // Extract unique contributors from digests and events
  const contributors = Array.from(
    new Set([
      ...(digests ? digests.flatMap((d) => d.contributors).filter((c) => c) : []),
      ...(events ? events.map((e) => e.actorGithubUsername).filter((c) => c) : []),
    ])
  ).sort();

  // Check if API key is configured
  const hasApiKey =
    user?.apiKeys?.openai || user?.apiKeys?.anthropic || user?.apiKeys?.openrouter;

  if (activeRepos === undefined || user === undefined) {
    return (
      <AppShell>
        <div className="container mx-auto max-w-4xl">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64 mt-2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  const hasRepos = activeRepos.length > 0;

  return (
    <AppShell>
      <div className="container mx-auto max-w-4xl space-y-6">
        {!hasRepos ? (
          <Card>
            <CardHeader>
              <CardTitle>Welcome to ShipLog</CardTitle>
              <CardDescription>
                Connect your GitHub repository to get started
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Install the ShipLog GitHub App to connect your repository and
                start receiving AI-powered activity summaries.
              </p>
              <InstallButton appSlug={GITHUB_APP_SLUG} />
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                {activeRepos.length === 1 ? (
                  <RepoCard repository={activeRepos[0]} />
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle>Synced repositories</CardTitle>
                      <CardDescription>
                        {activeRepos.length} {activeRepos.length === 1 ? "repository" : "repositories"} synced
                      </CardDescription>
                    </CardHeader>
                  </Card>
                )}
              </div>
              <div className="flex items-center gap-2">
                <SyncedReposDropdown />
                <ApiKeyDrawer>
                  <Button variant="outline">Settings</Button>
                </ApiKeyDrawer>
              </div>
            </div>

            {!hasApiKey && (
              <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
                <CardHeader>
                  <CardTitle className="text-yellow-900 dark:text-yellow-100">
                    Setup Required
                  </CardTitle>
                  <CardDescription className="text-yellow-800 dark:text-yellow-200">
                    Configure your AI API key to generate activity summaries
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ApiKeyDrawer>
                    <Button>Configure API Keys</Button>
                  </ApiKeyDrawer>
                </CardContent>
              </Card>
            )}

            {hasApiKey && (
              <>
                <FeedFilters
                  filters={filters}
                  onFiltersChange={setFilters}
                  contributors={contributors}
                  repositories={activeRepos}
                />
                <MultiRepoActivityFeed 
                  repositoryIds={
                    filters.repositoryId && filters.repositoryId !== "all"
                      ? [filters.repositoryId]
                      : repositoryIds
                  }
                  filters={filters}
                />
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function MultiRepoActivityFeed({ 
  repositoryIds, 
  filters 
}: { 
  repositoryIds: string[];
  filters: FeedFiltersType;
}) {
  const digests = useQuery(
    api.digests.listByRepositories,
    repositoryIds.length > 0 ? { repositoryIds, limit: 50 } : "skip"
  );
  const events = useQuery(
    api.events.listByRepositories,
    repositoryIds.length > 0 ? { repositoryIds, limit: 50 } : "skip"
  );

  if (digests === undefined || events === undefined) {
    return <FeedSkeleton />;
  }

  // Create a map of eventId -> event for efficient lookup
  const eventMap = new Map(events.map((e) => [e._id, e]));

  // Calculate time range threshold
  const now = Date.now();
  const timeRangeThreshold = 
    filters.timeRange === "24h" ? now - 24 * 60 * 60 * 1000 :
    filters.timeRange === "7d" ? now - 7 * 24 * 60 * 60 * 1000 :
    null;

  // Filter events
  const filteredEvents = events.filter((event) => {
    // Filter by event type
    if (filters.eventType !== "all") {
      if (event.type !== filters.eventType) {
        return false;
      }
    }

    // Filter by time range
    if (timeRangeThreshold !== null) {
      if (event.occurredAt < timeRangeThreshold) {
        return false;
      }
    }

    // Filter by contributor
    if (filters.contributor) {
      if (event.actorGithubUsername !== filters.contributor) {
        return false;
      }
    }

    return true;
  });

  // Filter digests
  const filteredDigests = digests.filter((digest) => {
    const event = eventMap.get(digest.eventId);
    if (!event) {
      return false; // Skip digests without associated events
    }

    // Filter by event type
    if (filters.eventType !== "all") {
      if (event.type !== filters.eventType) {
        return false;
      }
    }

    // Filter by time range (use digest createdAt, but also check event occurredAt for consistency)
    if (timeRangeThreshold !== null) {
      // Use the earlier of the two timestamps to be inclusive
      const relevantTimestamp = Math.min(digest.createdAt, event.occurredAt);
      if (relevantTimestamp < timeRangeThreshold) {
        return false;
      }
    }

    // Filter by contributor
    if (filters.contributor) {
      // Check both the digest contributors and the event actor
      const hasContributor = 
        digest.contributors.includes(filters.contributor) ||
        event.actorGithubUsername === filters.contributor;
      if (!hasContributor) {
        return false;
      }
    }

    return true;
  });

  // Deduplicate digests by event ID (one digest per event)
  const seenEventIds = new Set<string>();
  
  // Track seen event IDs
  for (const digest of filteredDigests) {
    const event = eventMap.get(digest.eventId);
    if (event) {
      seenEventIds.add(event._id);
    }
  }

  // Build final deduplicated list - include if the event ID was seen
  const deduplicatedDigests = filteredDigests.filter((digest) => {
    const event = eventMap.get(digest.eventId);
    if (!event) return false;
    return seenEventIds.has(event._id);
  });

  // Only show digests - events are backend-only triggers
  if (deduplicatedDigests.length === 0) {
    return <EmptyFeed />;
  }

  // Sort digests by creation time (newest first)
  const sortedDigests = [...deduplicatedDigests].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="space-y-4">
      {sortedDigests.map((digest) => {
        const event = eventMap.get(digest.eventId);
        return <DigestCard key={digest._id} digest={digest} event={event} />;
      })}
    </div>
  );
}
