import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface SurfaceImpactBadgeProps {
  surfaceName: string;
  filePath?: string;
  surfaceType?: "component" | "service" | "utility" | "hook" | "type" | "config" | "other";
  impactType: "modified" | "added" | "deleted";
  riskLevel: "low" | "medium" | "high";
  confidence: number;
  explanation?: string;
}

const surfaceTypeColors: Record<
  "component" | "service" | "utility" | "hook" | "type" | "config" | "other",
  string
> = {
  component: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  service: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  utility: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
  hook: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20",
  type: "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20",
  config: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  other: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
};

const riskColors = {
  low: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  medium: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
  high: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
};

export function SurfaceImpactBadge({
  surfaceName,
  filePath,
  surfaceType,
  impactType,
  riskLevel,
  confidence,
  explanation,
}: SurfaceImpactBadgeProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="p-3 rounded-md border bg-card space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge
          variant="outline"
          className={`text-xs ${riskColors[riskLevel]}`}
        >
          {riskLevel} risk
        </Badge>
      </div>
      {filePath && (
        <div className="text-sm font-mono text-muted-foreground truncate">
          {filePath}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="capitalize">{impactType}</span>
          <span>•</span>
          <span>Confidence: {confidence}%</span>
        </div>
        {explanation && (
          <Button
            variant="ghost"
            className="h-auto p-0 text-xs"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? "Hide details" : "Show details"}
          </Button>
        )}
      </div>
      {isExpanded && explanation && (
        <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md mt-2">
          <p className="font-medium mb-1">Why {riskLevel} risk?</p>
          <p>{explanation}</p>
        </div>
      )}
    </div>
  );
}
