import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPeriodRange, type PeriodType } from "@/lib/periodUtils";
import { DigestItem } from "./DigestItem";
import type { Id } from "../../../convex/_generated/dataModel";
import ReactMarkdown from "react-markdown";

interface SummaryCardProps {
  summary: {
    _id: Id<"summaries">;
    period: PeriodType;
    periodStart: number;
    periodEnd?: number;
    headline: string;
    accomplishments: string;
    keyFeatures: string[];
    stats?: { digestCount: number };
    includedDigestIds: Id<"digests">[];
    createdAt: number;
  };
  defaultExpanded?: boolean;
}

export function SummaryCard({ summary, defaultExpanded = false }: SummaryCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Lazy load digests only when expanded
  const expandedData = useQuery(
    api.timeline.getSummaryWithDigests,
    expanded ? { summaryId: summary._id } : "skip"
  );

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const periodLabel = formatPeriodRange(summary.periodStart, summary.period, timezone);
  const digestCount = summary.stats?.digestCount || summary.includedDigestIds.length;

  // Format period type for display
  const getPeriodTypeLabel = () => {
    switch (summary.period) {
      case "daily":
        return "Daily Summary";
      case "weekly":
        return "Weekly Summary";
      case "monthly":
        return "Monthly Summary";
    }
  };

  const handleToggle = () => {
    setExpanded(!expanded);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleToggle();
    }
  };

  return (
    <Card className="overflow-hidden">
      {/* Header - clickable toggle area */}
      <CardHeader
        className={cn(
          "cursor-pointer select-none transition-colors duration-150",
          "hover:bg-muted/50 focus-visible:bg-muted/50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        )}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={`summary-content-${summary._id}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2 min-w-0">
            {/* Period badge and date */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-xs shrink-0">
                {getPeriodTypeLabel()}
              </Badge>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{periodLabel}</span>
              </div>
            </div>
            {/* Headline */}
            <h3 className="font-semibold text-lg leading-tight line-clamp-2">
              {summary.headline}
            </h3>
            {/* Stats */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{digestCount} commit{digestCount !== 1 ? "s" : ""}</span>
              {summary.keyFeatures.length > 0 && (
                <span>{summary.keyFeatures.length} feature{summary.keyFeatures.length !== 1 ? "s" : ""}</span>
              )}
            </div>
          </div>
          {/* Expand/collapse indicator */}
          <ChevronDown
            className={cn(
              "h-5 w-5 text-muted-foreground transition-transform duration-200 shrink-0 mt-1",
              expanded && "rotate-180"
            )}
            aria-hidden="true"
          />
        </div>
      </CardHeader>

      {/* Expandable content */}
      <div
        id={`summary-content-${summary._id}`}
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <CardContent className="pt-0 space-y-6">
            {/* Summary narrative */}
            {summary.accomplishments && (
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown>{summary.accomplishments}</ReactMarkdown>
              </div>
            )}

            {/* Key features */}
            {summary.keyFeatures.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Key Features</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {summary.keyFeatures.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-primary mt-1.5 shrink-0">-</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Individual digests */}
            {expanded && (
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3">Activity Details</h4>
                {expandedData === undefined ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : expandedData.digests.length > 0 ? (
                  <div className="space-y-3">
                    {expandedData.digests.map((digest) => (
                      <DigestItem key={digest._id} digest={digest} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No activity details available</p>
                )}
              </div>
            )}
          </CardContent>
        </div>
      </div>
    </Card>
  );
}
