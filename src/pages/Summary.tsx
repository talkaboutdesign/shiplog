import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SyncedReposDropdown } from "@/components/github/SyncedReposDropdown";
import { ApiKeyDrawer } from "@/components/settings/ApiKeyDrawer";
import { Button } from "@/components/ui/button";
import { SummaryTabs, type PeriodType } from "@/components/summary/SummaryTabs";
import { TabsContent } from "@/components/ui/tabs";
import { SummaryView } from "@/components/summary/SummaryView";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getPeriodForTimestamp } from "@/lib/periodUtils";
import { InstallButton } from "@/components/github/InstallButton";
import { Select } from "@/components/ui/select";
import { Id } from "../../convex/_generated/dataModel";

const GITHUB_APP_SLUG = import.meta.env.VITE_GITHUB_APP_SLUG || "shiplog";

export function Summary() {
  const user = useCurrentUser();
  const activeRepos = useQuery(api.repositories.getAllActive);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>("weekly");
  const [selectedRepoId, setSelectedRepoId] = useState<Id<"repositories"> | null>(null);
  const generateSummary = useAction(api.summaries.generateSummaryOnDemandPublic);
  const [generatingPeriods, setGeneratingPeriods] = useState<Set<PeriodType>>(new Set());
  const [errorMessages, setErrorMessages] = useState<Record<PeriodType, string | null>>({
    daily: null,
    weekly: null,
    monthly: null,
  });
  const hasTriggeredRef = useRef<Set<string>>(new Set());

  // Set initial selected repo when repos load
  useEffect(() => {
    if (activeRepos && activeRepos.length > 0 && !selectedRepoId) {
      setSelectedRepoId(activeRepos[0]._id);
    }
  }, [activeRepos, selectedRepoId]);

  // Get selected repo
  const selectedRepo = activeRepos?.find((repo) => repo._id === selectedRepoId) || activeRepos?.[0];

  // Calculate current period start for each period
  const periodStarts = useMemo(() => {
    const now = Date.now();
    return {
      daily: getPeriodForTimestamp(now, "daily"),
      weekly: getPeriodForTimestamp(now, "weekly"),
      monthly: getPeriodForTimestamp(now, "monthly"),
    };
  }, []);

  // Get summaries for all periods
  const summaries = {
    daily: useQuery(
      api.summaries.getSummary,
      selectedRepo
        ? {
            repositoryId: selectedRepo._id,
            period: "daily",
            periodStart: periodStarts.daily,
          }
        : "skip"
    ),
    weekly: useQuery(
      api.summaries.getSummary,
      selectedRepo
        ? {
            repositoryId: selectedRepo._id,
            period: "weekly",
            periodStart: periodStarts.weekly,
          }
        : "skip"
    ),
    monthly: useQuery(
      api.summaries.getSummary,
      selectedRepo
        ? {
            repositoryId: selectedRepo._id,
            period: "monthly",
            periodStart: periodStarts.monthly,
          }
        : "skip"
    ),
  };

  // Get summary for current selected period
  const summary = summaries[selectedPeriod];

  // Check if API key is configured
  const hasApiKey =
    user?.apiKeys?.openai || user?.apiKeys?.anthropic || user?.apiKeys?.openrouter;

  // Generate summaries on-demand for all periods that don't exist
  useEffect(() => {
    if (!selectedRepo || !hasApiKey) {
      return;
    }

    const periods: PeriodType[] = ["daily", "weekly", "monthly"];
    
    for (const period of periods) {
      const periodStart = periodStarts[period];
      const generationKey = `${selectedRepo._id}-${period}-${periodStart}`;
      const periodSummary = summaries[period];

      // Only generate if:
      // - Summary query has completed (not undefined)
      // - Summary doesn't exist (is null)
      // - Haven't already triggered generation for this key (including failures)
      if (
        periodSummary === undefined || // Still loading, wait
        periodSummary !== null || // Summary exists, don't generate
        hasTriggeredRef.current.has(generationKey) // Already triggered (prevents infinite retries)
      ) {
        continue;
      }

      // Summary doesn't exist, generate it
      // Mark as triggered immediately to prevent duplicate calls
      hasTriggeredRef.current.add(generationKey);
      setGeneratingPeriods((prev) => new Set(prev).add(period));
      
      const generate = async () => {
        try {
          await generateSummary({
            repositoryId: selectedRepo._id,
            period,
            periodStart,
          });
        } catch (error) {
          console.error(`Error generating ${period} summary:`, error);
          // Keep the key in the ref to prevent infinite retries on failure
          // User can manually trigger via button if needed
        } finally {
          setGeneratingPeriods((prev) => {
            const next = new Set(prev);
            next.delete(period);
            return next;
          });
        }
      };

      void generate();
    }
  }, [
    selectedRepo?._id,
    periodStarts.daily,
    periodStarts.weekly,
    periodStarts.monthly,
    summaries.daily,
    summaries.weekly,
    summaries.monthly,
    hasApiKey,
    generateSummary,
    // Removed generatingPeriods from dependencies to prevent infinite loop
  ]);

  // Reset the ref and errors when the repo changes
  useEffect(() => {
    hasTriggeredRef.current.clear();
    setGeneratingPeriods(new Set());
    setErrorMessages({ daily: null, weekly: null, monthly: null });
  }, [selectedRepoId]);

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

  const headerActions = hasRepos ? (
    <>
      <SyncedReposDropdown />
      <ApiKeyDrawer>
        <Button variant="outline" size="sm">Settings</Button>
      </ApiKeyDrawer>
    </>
  ) : null;

  return (
    <AppShell headerActions={headerActions}>
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

            {hasApiKey && (
              <>
                {activeRepos && activeRepos.length > 1 && (
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-3">
                        <label htmlFor="repo-select" className="text-sm font-medium">
                          Repository:
                        </label>
                        <Select
                          id="repo-select"
                          value={selectedRepoId || ""}
                          onChange={(e) => setSelectedRepoId(e.target.value as Id<"repositories">)}
                          className="w-auto min-w-[200px]"
                        >
                          {activeRepos.map((repo) => (
                            <option key={repo._id} value={repo._id}>
                              {repo.fullName}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <SummaryTabs value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <TabsContent value="daily">
                    {(() => {
                      const dailySummary = summaries.daily;
                      const isGenerating = generatingPeriods.has("daily");
                      const periodStart = periodStarts.daily;
                      if (dailySummary === undefined || isGenerating) {
                        return (
                          <Card>
                            <CardContent className="pt-6">
                              <div className="space-y-4">
                                <div className="text-center py-4">
                                  <p className="text-muted-foreground mb-4">
                                    Summary is being generated...
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
                      if (dailySummary === null) {
                        return (
                          <Card>
                            <CardContent className="pt-6">
                              <div className="text-center py-8 space-y-4">
                                <p className="text-muted-foreground">
                                  No summary available yet.
                                </p>
                                <div className="space-y-4">
                                  <Button
                                    onClick={() => {
                                      if (!selectedRepo) return;
                                      setErrorMessages((prev) => ({ ...prev, daily: null }));
                                      const handleGenerate = async () => {
                                        setGeneratingPeriods((prev) => new Set(prev).add("daily"));
                                        try {
                                          const result = await generateSummary({
                                            repositoryId: selectedRepo._id,
                                            period: "daily",
                                            periodStart: periodStarts.daily,
                                          });
                                          if (result === null) {
                                            setErrorMessages((prev) => ({
                                              ...prev,
                                              daily: "No digests found for this period. Summaries require at least one digest to generate.",
                                            }));
                                          }
                                        } catch (error) {
                                          console.error("Error generating summary:", error);
                                          const message = error instanceof Error ? error.message : "Failed to generate summary. Please check your API keys and try again.";
                                          setErrorMessages((prev) => ({ ...prev, daily: message }));
                                        } finally {
                                          setGeneratingPeriods((prev) => {
                                            const next = new Set(prev);
                                            next.delete("daily");
                                            return next;
                                          });
                                        }
                                      };
                                      void handleGenerate();
                                    }}
                                    disabled={!selectedRepo || generatingPeriods.has("daily")}
                                  >
                                    {generatingPeriods.has("daily") ? "Generating..." : "Generate Summary"}
                                  </Button>
                                  {errorMessages.daily && (
                                    <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                                      {errorMessages.daily}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      }
                      return (
                        <SummaryView summary={{ ...dailySummary, period: "daily", periodStart }} />
                      );
                    })()}
                  </TabsContent>
                <TabsContent value="weekly">
                  {(() => {
                    const weeklySummary = summaries.weekly;
                    const isGenerating = generatingPeriods.has("weekly");
                    const periodStart = periodStarts.weekly;
                    if (weeklySummary === undefined || isGenerating) {
                      return (
                        <Card>
                          <CardContent className="pt-6">
                            <div className="space-y-4">
                              <div className="text-center py-4">
                                <p className="text-muted-foreground mb-4">
                                  Summary is being generated...
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
                    if (weeklySummary === null) {
                      return (
                        <Card>
                          <CardContent className="pt-6">
                            <div className="text-center py-8 space-y-4">
                              <p className="text-muted-foreground">
                                No summary available yet.
                              </p>
                              <div className="space-y-4">
                                <Button
                                  onClick={() => {
                                    if (!selectedRepo) return;
                                    setErrorMessages((prev) => ({ ...prev, weekly: null }));
                                    const handleGenerate = async () => {
                                      setGeneratingPeriods((prev) => new Set(prev).add("weekly"));
                                      try {
                                        const result = await generateSummary({
                                          repositoryId: selectedRepo._id,
                                          period: "weekly",
                                          periodStart: periodStarts.weekly,
                                        });
                                        if (result === null) {
                                          setErrorMessages((prev) => ({
                                            ...prev,
                                            weekly: "No digests found for this period. Summaries require at least one digest to generate.",
                                          }));
                                        }
                                      } catch (error) {
                                        console.error("Error generating summary:", error);
                                        const message = error instanceof Error ? error.message : "Failed to generate summary. Please check your API keys and try again.";
                                        setErrorMessages((prev) => ({ ...prev, weekly: message }));
                                      } finally {
                                        setGeneratingPeriods((prev) => {
                                          const next = new Set(prev);
                                          next.delete("weekly");
                                          return next;
                                        });
                                      }
                                    };
                                    void handleGenerate();
                                  }}
                                  disabled={!selectedRepo || generatingPeriods.has("weekly")}
                                >
                                  {generatingPeriods.has("weekly") ? "Generating..." : "Generate Summary"}
                                </Button>
                                {errorMessages.weekly && (
                                  <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                                    {errorMessages.weekly}
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    }
                    return (
                      <SummaryView summary={{ ...weeklySummary, period: "weekly", periodStart }} />
                    );
                  })()}
                </TabsContent>
                <TabsContent value="monthly">
                  {(() => {
                    const monthlySummary = summaries.monthly;
                    const isGenerating = generatingPeriods.has("monthly");
                    const periodStart = periodStarts.monthly;
                    if (monthlySummary === undefined || isGenerating) {
                      return (
                        <Card>
                          <CardContent className="pt-6">
                            <div className="space-y-4">
                              <div className="text-center py-4">
                                <p className="text-muted-foreground mb-4">
                                  Summary is being generated...
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
                    if (monthlySummary === null) {
                      return (
                        <Card>
                          <CardContent className="pt-6">
                            <div className="text-center py-8 space-y-4">
                              <p className="text-muted-foreground">
                                No summary available yet.
                              </p>
                              <div className="space-y-4">
                                <Button
                                  onClick={() => {
                                    if (!selectedRepo) return;
                                    setErrorMessages((prev) => ({ ...prev, monthly: null }));
                                    const handleGenerate = async () => {
                                      setGeneratingPeriods((prev) => new Set(prev).add("monthly"));
                                      try {
                                        const result = await generateSummary({
                                          repositoryId: selectedRepo._id,
                                          period: "monthly",
                                          periodStart: periodStarts.monthly,
                                        });
                                        if (result === null) {
                                          setErrorMessages((prev) => ({
                                            ...prev,
                                            monthly: "No digests found for this period. Summaries require at least one digest to generate.",
                                          }));
                                        }
                                      } catch (error) {
                                        console.error("Error generating summary:", error);
                                        const message = error instanceof Error ? error.message : "Failed to generate summary. Please check your API keys and try again.";
                                        setErrorMessages((prev) => ({ ...prev, monthly: message }));
                                      } finally {
                                        setGeneratingPeriods((prev) => {
                                          const next = new Set(prev);
                                          next.delete("monthly");
                                          return next;
                                        });
                                      }
                                    };
                                    void handleGenerate();
                                  }}
                                  disabled={!selectedRepo || generatingPeriods.has("monthly")}
                                >
                                  {generatingPeriods.has("monthly") ? "Generating..." : "Generate Summary"}
                                </Button>
                                {errorMessages.monthly && (
                                  <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                                    {errorMessages.monthly}
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    }
                    return (
                      <SummaryView
                        summary={{ ...monthlySummary, period: "monthly", periodStart }}
                      />
                    );
                  })()}
                </TabsContent>
              </SummaryTabs>
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
