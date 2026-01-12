import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InstallButton } from "@/components/github/InstallButton";
import { RepoCard } from "@/components/github/RepoCard";
import { ActivityFeed } from "@/components/feed/ActivityFeed";
import { FeedFilters, type FeedFilters as FeedFiltersType } from "@/components/feed/FeedFilters";
import { ApiKeyDrawer } from "@/components/settings/ApiKeyDrawer";
import { Button } from "@/components/ui/button";
import { useRepository } from "@/hooks/useRepository";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDigests } from "@/hooks/useDigests";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const GITHUB_APP_SLUG = import.meta.env.VITE_GITHUB_APP_SLUG || "shiplog";

export function Dashboard() {
  const repository = useRepository();
  const user = useCurrentUser();
  const digests = useDigests(repository?._id);
  const [filters, setFilters] = useState<FeedFiltersType>({
    eventType: "all",
    timeRange: "all",
  });

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
    user?.apiKeys?.openai || user?.apiKeys?.anthropic;

  if (repository === undefined || user === undefined) {
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

  return (
    <AppShell>
      <div className="container mx-auto max-w-4xl space-y-6">
        {!repository ? (
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
            <div className="flex items-center justify-between">
              <RepoCard repository={repository} />
              <ApiKeyDrawer>
                <Button variant="outline">Settings</Button>
              </ApiKeyDrawer>
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
                />
                <ActivityFeed repositoryId={repository._id} />
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
