import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkBreakdown } from "./WorkBreakdown";
import { formatPeriodRange, type PeriodType } from "@/lib/periodUtils";
import { TimeAgo } from "@/components/common/TimeAgo";
import { StreamingText } from "@/components/common/StreamingText";
import ReactMarkdown from "react-markdown";
import { Clock } from "lucide-react";

interface SummaryViewProps {
  summary: {
    headline: string;
    accomplishments: string;
    keyFeatures: string[];
    workBreakdown: {
      bugfix?: { percentage: number; count: number };
      feature?: { percentage: number; count: number };
      refactor?: { percentage: number; count: number };
      docs?: { percentage: number; count: number };
      chore?: { percentage: number; count: number };
      security?: { percentage: number; count: number };
    };
    metrics?: {
      totalItems: number;
      averageDeploymentTime?: number;
      productionIncidents?: number;
      testCoverage?: number;
    };
    period: PeriodType;
    periodStart: number;
    lastUpdatedAt?: number;
  };
  isStreaming?: boolean;
}

const categoryLabels: Record<string, string> = {
  bugfix: "Bug Fixes",
  feature: "Features",
  refactor: "Refactoring",
  docs: "Documentation",
  chore: "Chores",
  security: "Security",
};

export function SummaryView({ summary, isStreaming = false }: SummaryViewProps) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const periodRange = formatPeriodRange(summary.periodStart, summary.period, timezone);

  // Streaming indicator component
  const StreamingIndicator = () => (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <div className="flex gap-1">
        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" style={{ animationDelay: "0ms" }} />
        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" style={{ animationDelay: "150ms" }} />
        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" style={{ animationDelay: "300ms" }} />
      </div>
      <span>Writing...</span>
    </div>
  );

  // Format period label for weekly/monthly
  const getPeriodLabel = () => {
    if (summary.period === "weekly") {
      return `Week of ${periodRange}`;
    } else if (summary.period === "monthly") {
      return periodRange;
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Headline with Published time */}
      <Card className={isStreaming ? "transition-all duration-300" : ""}>
        <CardContent className="pt-6">
          <div className="space-y-3">
            <h2 className="text-2xl font-bold leading-tight">
              {summary.headline ? (
                <StreamingText text={summary.headline} isStreaming={isStreaming} />
              ) : isStreaming ? (
                "..."
              ) : null}
            </h2>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {summary.lastUpdatedAt && (
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 opacity-70" />
                  <span>Published</span>
                  <TimeAgo timestamp={summary.lastUpdatedAt} />
                </div>
              )}
              {getPeriodLabel() && (
                <span className="text-muted-foreground/80">{getPeriodLabel()}</span>
              )}
            </div>
            {isStreaming && (
              <div className="pt-2">
                <StreamingIndicator />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Accomplishments */}
      {(summary.accomplishments || isStreaming) && (
        <Card className={isStreaming ? "transition-all duration-300" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>This {summary.period === "daily" ? "Day's" : summary.period === "weekly" ? "Week's" : "Month's"} Accomplishments</span>
              {isStreaming && summary.accomplishments && <StreamingIndicator />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none dark:prose-invert">
              {summary.accomplishments ? (
                <ReactMarkdown>{summary.accomplishments}</ReactMarkdown>
              ) : isStreaming ? (
                <p className="text-muted-foreground">Generating content...</p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Features */}
      {(summary.keyFeatures.length > 0 || isStreaming) && (
        <Card className={isStreaming ? "transition-all duration-300" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Key Features Shipped</span>
              {isStreaming && summary.keyFeatures.length > 0 && <StreamingIndicator />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary.keyFeatures.length > 0 ? (
              <ul className="space-y-2 list-disc list-inside">
                {summary.keyFeatures.map((feature, index) => (
                  <li key={index} className="leading-relaxed">
                    {feature}
                  </li>
                ))}
              </ul>
            ) : isStreaming ? (
              <p className="text-muted-foreground">Analyzing features...</p>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Work Breakdown - only show when not empty or not streaming */}
      {Object.keys(summary.workBreakdown).length > 0 && (
        <WorkBreakdown workBreakdown={summary.workBreakdown} />
      )}

      {/* Stats */}
      {summary.metrics && (
        <Card>
          <CardHeader>
            <CardTitle>Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground">Total Code Pushes</div>
              <div className="text-2xl font-bold mt-1">{summary.metrics.totalItems}</div>
            </div>
            {Object.keys(summary.workBreakdown).length > 0 && (
              <div className="space-y-2 pt-2 border-t">
                <div className="text-sm text-muted-foreground mb-2">Breakdown by Category</div>
                {Object.entries(summary.workBreakdown)
                  .filter(([_, data]) => data !== undefined)
                  .map(([category, data]) => ({
                    category,
                    ...data,
                    label: categoryLabels[category] || category,
                  }))
                  .sort((a, b) => b.percentage - a.percentage)
                  .map((item) => (
                    <div key={item.category} className="flex items-center justify-between text-sm">
                      <span>{item.label}</span>
                      <span className="font-medium">{item.percentage.toFixed(0)}%</span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}