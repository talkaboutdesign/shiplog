import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { SurfaceImpactBadge } from "./SurfaceImpactBadge";
import { Badge } from "@/components/ui/badge";
import type { Digest } from "../../../convex/types";
import type { Id } from "../../../convex/_generated/dataModel";

interface ImpactAnalysisProps {
  impactAnalysis: Digest["impactAnalysis"];
  repositoryId: Id<"repositories">;
  event?: {
    fileDiffs?: Array<{
      filename: string;
      status: "added" | "removed" | "modified" | "renamed";
      additions: number;
      deletions: number;
    }>;
  };
}

export function ImpactAnalysis({ impactAnalysis, repositoryId, event }: ImpactAnalysisProps) {
  const indexStatus = useQuery(api.surfaces.getRepositoryIndexStatus, {
    repositoryId,
  });

  if (!impactAnalysis || !impactAnalysis.affectedSurfaces.length) {
    return null;
  }

  // Fetch surface details for each affected surface
  const surfaceIds = impactAnalysis.affectedSurfaces
    .map((s) => s.surfaceId)
    .filter((id) => id) as Id<"codeSurfaces">[];

  const surfaces = useQuery(
    api.surfaces.getSurfacesByIds,
    surfaceIds.length > 0 ? { surfaceIds } : "skip"
  );

  const riskColors = {
    low: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
    medium: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
    high: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  };

  // Create a map of surfaceId to surface details
  const surfaceMap = new Map();
  if (surfaces) {
    surfaces.forEach((s) => surfaceMap.set(s._id, s));
  }

  return (
    <div className="border-t pt-4 mt-4 space-y-4">
      {/* Index Status */}
      {indexStatus && indexStatus.indexStatus === "completed" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="text-green-600">✓</span>
          <span>Index Status:</span>
          <span className="font-medium">
            Indexed
            {indexStatus.indexedAt && (
              <span className="ml-1 font-mono text-xs">
                ({new Date(indexStatus.indexedAt).toLocaleDateString()})
              </span>
            )}
          </span>
          {indexStatus.surfaceCount !== undefined && (
            <span className="ml-2">
              • {indexStatus.surfaceCount} surfaces
            </span>
          )}
        </div>
      )}

      {/* AI-Detected Impact Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-yellow-600">⚠</span>
            <h4 className="text-sm font-semibold">AI-Detected Impact</h4>
          </div>
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

        {/* Affected Surfaces */}
        <div className="space-y-2">
          {impactAnalysis.affectedSurfaces.map((surface, index) => {
            const surfaceDetails = surface.surfaceId
              ? surfaceMap.get(surface.surfaceId)
              : null;

            return (
              <SurfaceImpactBadge
                key={index}
                surfaceName={surface.surfaceName}
                filePath={surfaceDetails?.filePath}
                surfaceType={surfaceDetails?.surfaceType}
                impactType={surface.impactType}
                riskLevel={surface.riskLevel}
                confidence={surface.confidence}
              />
            );
          })}
        </div>
      </div>

      {/* Changed Files */}
      {event?.fileDiffs && event.fileDiffs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span>Changed Files ({event.fileDiffs.length})</span>
          </div>
          <div className="space-y-1">
            {event.fileDiffs.map((file, index) => (
              <div
                key={index}
                className="text-sm text-muted-foreground font-mono truncate"
              >
                {file.filename}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
