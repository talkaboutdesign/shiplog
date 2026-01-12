import { SurfaceImpactBadge } from "./SurfaceImpactBadge";
import { Badge } from "@/components/ui/badge";
import type { Digest } from "../../../convex/types";

interface ImpactAnalysisProps {
  impactAnalysis: Digest["impactAnalysis"];
}

export function ImpactAnalysis({ impactAnalysis }: ImpactAnalysisProps) {
  if (!impactAnalysis || !impactAnalysis.affectedSurfaces.length) {
    return null;
  }

  const riskColors = {
    low: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
    medium: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
    high: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  };

  return (
    <div className="border-t pt-4 mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Surfaces Affected</h4>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={riskColors[impactAnalysis.overallRisk]}
          >
            {impactAnalysis.overallRisk} risk
          </Badge>
          <span className="text-xs text-muted-foreground">
            {impactAnalysis.confidence}% confidence
          </span>
        </div>
      </div>
      <div className="space-y-2">
        {impactAnalysis.affectedSurfaces.map((surface, index) => (
          <SurfaceImpactBadge
            key={index}
            surfaceName={surface.surfaceName}
            impactType={surface.impactType}
            riskLevel={surface.riskLevel}
            confidence={surface.confidence}
          />
        ))}
      </div>
    </div>
  );
}
