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

export function SummaryView({ summary }: SummaryViewProps) {
  const periodRange = formatPeriodRange(summary.periodStart, summary.period);
  const periodLabel = periodLabels[summary.period];
  const periodIcon = periodEmoji[summary.period];

  return (
    <div className="space-y-6">
      {/* Period Header */}
      <div className="text-center space-y-2">
        <div className="text-2xl font-bold flex items-center justify-center gap-2">
          <span>{periodIcon}</span>
          <span>{periodLabel}: {periodRange}</span>
        </div>
      </div>

      {/* Headline */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-2xl font-bold leading-tight">{summary.headline}</h2>
        </CardContent>
      </Card>

      {/* Accomplishments */}
      <Card>
        <CardHeader>
          <CardTitle>This {summary.period === "daily" ? "Day's" : summary.period === "weekly" ? "Week's" : "Month's"} Accomplishments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none dark:prose-invert">
            {summary.accomplishments.split("\n\n").map((paragraph, index) => (
              <p key={index} className="leading-relaxed mb-4 last:mb-0">
                {paragraph}
              </p>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Key Features */}
      {summary.keyFeatures.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Key Features Shipped</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {summary.keyFeatures.map((feature, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Work Breakdown */}
      <WorkBreakdown workBreakdown={summary.workBreakdown} />

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
