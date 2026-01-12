import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InstallButton } from "@/components/github/InstallButton";
import { RepoCard } from "@/components/github/RepoCard";
import { FeedFilters, type FeedFilters as FeedFiltersType } from "@/components/feed/FeedFilters";
import { ApiKeyDrawer } from "@/components/settings/ApiKeyDrawer";
import { SyncedReposDropdown } from "@/components/github/SyncedReposDropdown";
import { DigestCard } from "@/components/feed/DigestCard";
import { EventCard } from "@/components/feed/EventCard";
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

  // Extract unique contributors from digests
  const contributors = digests
    ? Array.from(
        new Set(
          digests.flatMap((d) => d.contributors).filter((c) => c)
        )
      )
    : [];

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
                />
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function MultiRepoActivityFeed({ repositoryIds }: { repositoryIds: string[] }) {
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

  // Get events that don't have digests (pending, processing, failed, skipped)
  const eventsWithoutDigests = events.filter(
    (event) => event.status !== "completed" || !digests.some((d) => d.eventId === event._id)
  );

  if (digests.length === 0 && eventsWithoutDigests.length === 0) {
    return <EmptyFeed />;
  }

  // Combine digests and events, showing events without digests
  const allItems: Array<{ type: "digest" | "event"; id: string; timestamp: number }> = [
    ...digests.map((d) => ({ type: "digest" as const, id: d._id, timestamp: d.createdAt })),
    ...eventsWithoutDigests.map((e) => ({ type: "event" as const, id: e._id, timestamp: e.occurredAt })),
  ].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="space-y-4">
      {allItems.map((item) => {
        if (item.type === "digest") {
          const digest = digests.find((d) => d._id === item.id);
          return digest ? <DigestCard key={digest._id} digest={digest} /> : null;
        } else {
          const event = eventsWithoutDigests.find((e) => e._id === item.id);
          return event ? <EventCard key={event._id} event={event} /> : null;
        }
      })}
    </div>
  );
}
