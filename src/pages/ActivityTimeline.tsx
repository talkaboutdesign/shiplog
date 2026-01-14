import { useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InstallButton } from "@/components/github/InstallButton";
import { ApiKeyDrawer } from "@/components/settings/ApiKeyDrawer";
import { WelcomeHeader } from "@/components/timeline/WelcomeHeader";
import { SummaryCard } from "@/components/timeline/SummaryCard";
import { TodayFeed } from "@/components/timeline/TodayFeed";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useSelectedRepo } from "@/hooks/useSelectedRepo";
import { useHeaderActions } from "@/components/layout/HeaderActionsContext";

const GITHUB_APP_SLUG = import.meta.env.VITE_GITHUB_APP_SLUG || "shiplog";

export function ActivityTimeline() {
  const user = useCurrentUser();
  const { repos: activeRepos, selectedRepoId, isLoading: reposLoading } = useSelectedRepo();
  const { setHeaderActions } = useHeaderActions();

  // Get timeline context for "while you were away"
  const timelineContext = useQuery(
    api.timeline.getTimelineContext,
    selectedRepoId ? { repositoryId: selectedRepoId } : "skip"
  );

  // Update last visit timestamp on mount
  const updateLastVisit = useMutation(api.users.updateLastVisit);
  useEffect(() => {
    // Update last visit after a short delay to ensure we've fetched the "while you were away" data first
    const timer = setTimeout(() => {
      updateLastVisit();
    }, 2000);
    return () => clearTimeout(timer);
  }, [updateLastVisit]);

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

  // Loading state
  if (reposLoading || user === undefined) {
    return (
      <div className="container mx-auto max-w-4xl">
        <div className="space-y-2 mb-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-48" />
        </div>
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

  // No repos connected
  if (!hasRepos) {
    return (
      <div className="container mx-auto max-w-4xl">
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
      </div>
    );
  }

  // No API key configured
  if (!hasApiKey) {
    return (
      <div className="container mx-auto max-w-4xl space-y-6">
        <WelcomeHeader context={timelineContext} isLoading={timelineContext === undefined} />
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
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl space-y-6">
      {/* Welcome header with personalized greeting */}
      <WelcomeHeader context={timelineContext} isLoading={timelineContext === undefined} />

      {/* Summary cards for "while you were away" */}
      {timelineContext?.summariesToShow && timelineContext.summariesToShow.length > 0 && (
        <div className="space-y-4">
          {timelineContext.summariesToShow.map((summary, index) => (
            <SummaryCard
              key={summary._id}
              summary={summary}
              defaultExpanded={index === 0} // First summary is expanded by default
            />
          ))}
        </div>
      )}

      {/* Separator between summaries and today's feed */}
      {timelineContext?.summariesToShow && timelineContext.summariesToShow.length > 0 && (
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
        </div>
      )}

      {/* Today's activity feed */}
      <TodayFeed repositoryId={selectedRepoId} />
    </div>
  );
}
