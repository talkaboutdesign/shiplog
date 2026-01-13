import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InstallButton } from "@/components/github/InstallButton";
import { FeedFilters, type FeedFilters as FeedFiltersType } from "@/components/feed/FeedFilters";
import { ApiKeyDrawer } from "@/components/settings/ApiKeyDrawer";
import { DigestCard } from "@/components/feed/DigestCard";
import { FeedSkeleton } from "@/components/feed/FeedSkeleton";
import { EmptyFeed } from "@/components/feed/EmptyFeed";
import { Button } from "@/components/ui/button";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useSelectedRepo } from "@/hooks/useSelectedRepo";
import { Skeleton } from "@/components/ui/skeleton";
import { useHeaderActions } from "@/components/layout/HeaderActionsContext";

const GITHUB_APP_SLUG = import.meta.env.VITE_GITHUB_APP_SLUG || "shiplog";

export function Feed() {
  const user = useCurrentUser();
  const { repos: activeRepos, selectedRepoId, isLoading: reposLoading } = useSelectedRepo();
  const { setHeaderActions } = useHeaderActions();
  const [filters, setFilters] = useState<FeedFiltersType>({
    eventType: "all",
    timeRange: "24h",
  });

  // Get digests and events from all active repos (for contributors list)
  const allRepositoryIds = activeRepos?.map((r) => r._id) || [];
  const digests = useQuery(
    api.digests.listByRepositories,
    allRepositoryIds.length > 0 ? { repositoryIds: allRepositoryIds, limit: 50 } : "skip"
  );
  const events = useQuery(
    api.events.listByRepositories,
    allRepositoryIds.length > 0 ? { repositoryIds: allRepositoryIds, limit: 50 } : "skip"
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

  // Set header actions
  useEffect(() => {
    const hasRepos = activeRepos && activeRepos.length > 0;
    const headerActions = hasRepos ? (
      <ApiKeyDrawer>
        <Button variant="outline" size="sm">Settings</Button>
      </ApiKeyDrawer>
    ) : null;
    setHeaderActions(headerActions);
  }, [activeRepos, setHeaderActions]);

  if (reposLoading || user === undefined) {
    return (
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
    );
  }

  const hasRepos = activeRepos && activeRepos.length > 0;

  return (
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
                />
                <MultiRepoActivityFeed
                  repositoryIds={
                    selectedRepoId
                      ? [selectedRepoId]
                      : allRepositoryIds
                  }
                  filters={filters}
                />
              </>
            )}
          </>
        )}
      </div>
  );
}

function MultiRepoActivityFeed({
  repositoryIds,
  filters
}: {
  repositoryIds: Id<"repositories">[];
  filters: FeedFiltersType;
}) {
  const ITEMS_PER_PAGE = 25;
  const BACKEND_FETCH_SIZE = 50; // Fetch more to account for filtering
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [allDigests, setAllDigests] = useState<Array<{ digest: any; event: any }>>([]);
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Reset pagination when filters or repositoryIds change
  useEffect(() => {
    setCursor(undefined);
    setAllDigests([]);
    setDisplayCount(ITEMS_PER_PAGE);
    setHasMore(true);
  }, [filters, repositoryIds.join(",")]);

  // Query digests with pagination
  const digests = useQuery(
    api.digests.listByRepositories,
    repositoryIds.length > 0 ? { 
      repositoryIds, 
      limit: BACKEND_FETCH_SIZE,
      cursor 
    } : "skip"
  );
  
  // Query events with pagination
  const events = useQuery(
    api.events.listByRepositories,
    repositoryIds.length > 0 ? { 
      repositoryIds, 
      limit: BACKEND_FETCH_SIZE,
      cursor 
    } : "skip"
  );

  // Process and filter digests when new data arrives
  useEffect(() => {
    if (digests === undefined || events === undefined) {
      return;
    }

    // Create a map of eventId -> event for efficient lookup
    const eventMap = new Map(events.map((e) => [e._id, e]));

    // Calculate time range threshold
    const now = Date.now();
    const timeRangeThreshold =
      filters.timeRange === "24h" ? now - 24 * 60 * 60 * 1000 :
      filters.timeRange === "7d" ? now - 7 * 24 * 60 * 60 * 1000 :
      now - 30 * 24 * 60 * 60 * 1000; // 30d

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
      // Use the earlier of the two timestamps to be inclusive
      const relevantTimestamp = Math.min(digest.createdAt, event.occurredAt);
      if (relevantTimestamp < timeRangeThreshold) {
        return false;
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
    const newItems: Array<{ digest: any; event: any }> = [];
    
    for (const digest of filteredDigests) {
      const event = eventMap.get(digest.eventId);
      if (event && !seenEventIds.has(event._id)) {
        seenEventIds.add(event._id);
        newItems.push({ digest, event });
      }
    }

    // Sort by creation time (newest first)
    newItems.sort((a, b) => b.digest.createdAt - a.digest.createdAt);

    if (cursor === undefined) {
      // First load - replace all items
      setAllDigests(newItems);
      setDisplayCount(Math.min(ITEMS_PER_PAGE, newItems.length));
      setHasMore(newItems.length === BACKEND_FETCH_SIZE);
    } else {
      // Loading more - append new items, avoiding duplicates
      setAllDigests((prev) => {
        const existingIds = new Set(prev.map((item) => item.digest._id));
        const uniqueNewItems = newItems.filter((item) => !existingIds.has(item.digest._id));
        const combined = [...prev, ...uniqueNewItems];
        // Re-sort combined list
        combined.sort((a, b) => b.digest.createdAt - a.digest.createdAt);
        // Increase display count to show new items
        setDisplayCount((currentDisplay) => Math.min(currentDisplay + uniqueNewItems.length, combined.length));
        return combined;
      });
      setHasMore(newItems.length === BACKEND_FETCH_SIZE);
    }

    setIsLoadingMore(false);
  }, [digests, events, filters, cursor]);

  const handleLoadMore = () => {
    if (allDigests.length === 0 || isLoadingMore) return;
    
    // If we have more items loaded than displayed, just show more
    if (allDigests.length > displayCount) {
      setDisplayCount((prev) => Math.min(prev + ITEMS_PER_PAGE, allDigests.length));
      return;
    }
    
    // Otherwise, load more from backend
    // Use the oldest digest's timestamp as the cursor
    const oldestDigest = allDigests[allDigests.length - 1];
    const newCursor = oldestDigest.digest.createdAt;
    setCursor(newCursor);
    setIsLoadingMore(true);
  };

  if (digests === undefined || events === undefined) {
    return <FeedSkeleton />;
  }

  if (allDigests.length === 0) {
    return <EmptyFeed />;
  }

  const displayedDigests = allDigests.slice(0, displayCount);
  const canShowMore = displayCount < allDigests.length || hasMore;

  return (
    <div className="space-y-4">
      {displayedDigests.map(({ digest, event }, index) => (
        <DigestCard key={digest._id} digest={digest} event={event} index={index} />
      ))}
      {canShowMore && (
        <div className="flex justify-center pt-4">
          <Button 
            onClick={handleLoadMore} 
            disabled={isLoadingMore}
            variant="outline"
          >
            {isLoadingMore ? "Loading..." : "Load More"}
          </Button>
        </div>
      )}
    </div>
  );
}
