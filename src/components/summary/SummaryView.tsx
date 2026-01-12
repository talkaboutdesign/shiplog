import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkBreakdown } from "./WorkBreakdown";
import { formatPeriodRange, type PeriodType } from "@/lib/periodUtils";

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
  };
  isStreaming?: boolean;
}

const periodEmoji: Record<PeriodType, string> = {
  daily: "📅",
  weekly: "📊",
  monthly: "📈",
};

const periodLabels: Record<PeriodType, string> = {
  daily: "Daily Development Brief",
  weekly: "Weekly Development Brief",
  monthly: "Monthly Development Brief",
};

export function SummaryView({ summary, isStreaming = false }: SummaryViewProps) {
  const periodRange = formatPeriodRange(summary.periodStart, summary.period);
  const periodLabel = periodLabels[summary.period];
  const periodIcon = periodEmoji[summary.period];

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

  return (
    <div className="space-y-6">
      {/* Period Header */}
      <div className="text-center space-y-2">
        <div className="text-2xl font-bold flex items-center justify-center gap-2">
          <span>{periodIcon}</span>
          <span>{periodLabel}: {periodRange}</span>
        </div>
        {isStreaming && (
          <div className="flex justify-center">
            <StreamingIndicator />
          </div>
        )}
      </div>

      {/* Headline */}
      <Card className={isStreaming ? "transition-all duration-300" : ""}>
        <CardContent className="pt-6">
          <h2 className="text-2xl font-bold leading-tight">
            {summary.headline || (isStreaming ? "..." : "")}
          </h2>
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
                summary.accomplishments.split("\n\n").map((paragraph, index) => (
                  <p key={index} className="leading-relaxed mb-4 last:mb-0">
                    {paragraph}
                  </p>
                ))
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
              <ul className="space-y-2">
                {summary.keyFeatures.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>{feature}</span>
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

      {/* Metrics */}
      {summary.metrics && (
        <Card>
          <CardHeader>
            <CardTitle>Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Total Items</div>
                <div className="text-2xl font-bold">{summary.metrics.totalItems}</div>
              </div>
              {summary.metrics.testCoverage !== undefined && (
                <div>
                  <div className="text-sm text-muted-foreground">Test Coverage</div>
                  <div className="text-2xl font-bold">{summary.metrics.testCoverage.toFixed(0)}%</div>
                </div>
              )}
              {summary.metrics.productionIncidents !== undefined && (
                <div>
                  <div className="text-sm text-muted-foreground">Production Incidents</div>
                  <div className="text-2xl font-bold">{summary.metrics.productionIncidents}</div>
                </div>
              )}
              {summary.metrics.averageDeploymentTime !== undefined && (
                <div>
                  <div className="text-sm text-muted-foreground">Avg Deployment Time</div>
                  <div className="text-2xl font-bold">{summary.metrics.averageDeploymentTime.toFixed(0)} min</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
