import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiKeyDrawer } from "@/components/settings/ApiKeyDrawer";
import { Button } from "@/components/ui/button";
import { SummaryTabs, type PeriodType } from "@/components/summary/SummaryTabs";
import { TabsContent } from "@/components/ui/tabs";
import { SummaryView } from "@/components/summary/SummaryView";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useSelectedRepo } from "@/hooks/useSelectedRepo";
import { getPeriodForTimestamp } from "@/lib/periodUtils";
import { InstallButton } from "@/components/github/InstallButton";
import { useHeaderActions } from "@/components/layout/HeaderActionsContext";

const GITHUB_APP_SLUG = import.meta.env.VITE_GITHUB_APP_SLUG || "shiplog";

export function Summary() {
  const user = useCurrentUser();
  const { repos: activeRepos, selectedRepo, selectedRepoId, isLoading: reposLoading } = useSelectedRepo();
  const { setHeaderActions } = useHeaderActions();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>("weekly");
  const generateSummary = useAction(api.summaries.generateSummaryOnDemandPublic);
  const updateSummary = useAction(api.summaries.updateSummaryPublic);
  const [processingPeriods, setProcessingPeriods] = useState<Set<PeriodType>>(new Set());
  const hasTriggeredRef = useRef<Set<string>>(new Set());

  // Calculate current period start for each period using user's timezone
  const periodStarts = useMemo(() => {
    const now = Date.now();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return {
      daily: getPeriodForTimestamp(now, "daily", timezone),
      weekly: getPeriodForTimestamp(now, "weekly", timezone),
      monthly: getPeriodForTimestamp(now, "monthly", timezone),
    };
  }, []);

  // Get summary status for all periods (includes digest counts)
  // Use selectedRepoId as a simple filter - exactly like the old repositoryId filter
  const summaryStatuses = {
    daily: useQuery(
      api.summaries.getSummaryStatus,
      selectedRepoId
        ? {
            repositoryId: selectedRepoId,
            period: "daily",
            periodStart: periodStarts.daily,
          }
        : "skip"
    ),
    weekly: useQuery(
      api.summaries.getSummaryStatus,
      selectedRepoId
        ? {
            repositoryId: selectedRepoId,
            period: "weekly",
            periodStart: periodStarts.weekly,
          }
        : "skip"
    ),
    monthly: useQuery(
      api.summaries.getSummaryStatus,
      selectedRepoId
        ? {
            repositoryId: selectedRepoId,
            period: "monthly",
            periodStart: periodStarts.monthly,
          }
        : "skip"
    ),
  };

  // Check if API key is configured
  const hasApiKey =
    user?.apiKeys?.openai || user?.apiKeys?.anthropic || user?.apiKeys?.openrouter;

  // Auto-generate or auto-update summaries
  useEffect(() => {
    if (!selectedRepoId || !selectedRepo || !hasApiKey) {
      return;
    }

    const periods: PeriodType[] = ["daily", "weekly", "monthly"];

    for (const period of periods) {
      const periodStart = periodStarts[period];
      const status = summaryStatuses[period];

      // Skip if still loading
      if (status === undefined) {
        continue;
      }

      const generationKey = `${selectedRepoId}-${period}-${periodStart}-gen`;
      const updateKey = `${selectedRepoId}-${period}-${periodStart}-upd-${status.digestCount}`;

      // Handle new summary generation
      if (status.needsGeneration && !hasTriggeredRef.current.has(generationKey)) {
        hasTriggeredRef.current.add(generationKey);
        setProcessingPeriods((prev) => new Set(prev).add(period));

        const doGenerate = async () => {
          try {
            await generateSummary({
              repositoryId: selectedRepoId,
              period,
              periodStart,
            });
          } catch (error) {
            console.error(`Error generating ${period} summary:`, error);
          } finally {
            setProcessingPeriods((prev) => {
              const next = new Set(prev);
              next.delete(period);
              return next;
            });
          }
        };

        void doGenerate();
        continue;
      }

      // Handle summary update (new digests available)
      if (status.needsUpdate && !hasTriggeredRef.current.has(updateKey)) {
        hasTriggeredRef.current.add(updateKey);
        setProcessingPeriods((prev) => new Set(prev).add(period));

        const doUpdate = async () => {
          try {
            await updateSummary({
              repositoryId: selectedRepoId,
              period,
              periodStart,
            });
          } catch (error) {
            console.error(`Error updating ${period} summary:`, error);
          } finally {
            setProcessingPeriods((prev) => {
              const next = new Set(prev);
              next.delete(period);
              return next;
            });
          }
        };

        void doUpdate();
      }
    }
  }, [
    selectedRepoId,
    selectedRepo,
    periodStarts.daily,
    periodStarts.weekly,
    periodStarts.monthly,
    summaryStatuses.daily,
    summaryStatuses.weekly,
    summaryStatuses.monthly,
    hasApiKey,
    generateSummary,
    updateSummary,
  ]);

  // Reset the ref when the repo changes
  useEffect(() => {
    hasTriggeredRef.current.clear();
    setProcessingPeriods(new Set());
  }, [selectedRepoId]);

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

  // Render content for a period tab
  const renderPeriodContent = (period: PeriodType) => {
    const status = summaryStatuses[period];
    const periodStart = periodStarts[period];
    const isProcessing = processingPeriods.has(period);

    // Loading state
    if (status === undefined || isProcessing) {
      return (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="text-center py-4">
                <p className="text-muted-foreground mb-4">
                  {isProcessing
                    ? (status?.needsUpdate ? "Updating summary with new activity..." : "Generating summary...")
                    : "Loading..."}
                </p>
              </div>
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          </CardContent>
        </Card>
      );
    }

    // No digests for this period
    if (status.digestCount === 0) {
      return (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No activity recorded for this {period === "daily" ? "day" : period === "weekly" ? "week" : "month"} yet.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Summaries are automatically generated when there's development activity to report.
              </p>
            </div>
          </CardContent>
        </Card>
      );
    }

    // Summary exists (may be streaming)
    if (status.summary) {
      return (
        <SummaryView
          summary={{ ...status.summary, period, periodStart }}
          isStreaming={status.summary.isStreaming === true}
        />
      );
    }

    // Fallback - waiting for generation (shouldn't normally reach here due to auto-generation)
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              Preparing summary...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  };

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
                  Configure your AI API key to generate summary reports
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ApiKeyDrawer>
                  <Button>Configure API Keys</Button>
                </ApiKeyDrawer>
              </CardContent>
            </Card>
          )}

          {hasApiKey && selectedRepoId && (
            <SummaryTabs value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <TabsContent value="daily">
                  {renderPeriodContent("daily")}
                </TabsContent>
                <TabsContent value="weekly">
                  {renderPeriodContent("weekly")}
                </TabsContent>
                <TabsContent value="monthly">
                  {renderPeriodContent("monthly")}
                </TabsContent>
              </SummaryTabs>
          )}
        </>
      )}
    </div>
  );
}
