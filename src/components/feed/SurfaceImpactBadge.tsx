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

export function SurfaceImpactBadge({
  surfaceName: _surfaceName,
  filePath,
  surfaceType: _surfaceType,
  impactType,
  riskLevel,
  confidence,
  explanation,
}: SurfaceImpactBadgeProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="p-4 rounded-md border bg-card space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={`risk-${riskLevel}` as const}>
          {riskLevel} risk
        </Badge>
      </div>
      {filePath && (
        <div className="text-sm font-mono text-muted-foreground truncate">
          {filePath}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="capitalize">{impactType}</span>
          <span>•</span>
          <span>Confidence: {confidence}%</span>
        </div>
        {explanation && (
          <Button
            variant="ghost"
            size="sm"
            className="h-auto py-1 px-2 text-xs"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? "Hide details" : "Show details"}
          </Button>
        )}
      </div>
      {isExpanded && explanation && (
        <div className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-md">
          <p className="font-medium mb-1">Why {riskLevel} risk?</p>
          <p className="leading-relaxed">{explanation}</p>
        </div>
      )}
    </div>
  );
}
