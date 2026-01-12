import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { SurfaceImpactBadge } from "./SurfaceImpactBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  isProcessing?: boolean;
}

export function ImpactAnalysis({ impactAnalysis, repositoryId, event, isProcessing = false }: ImpactAnalysisProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const indexStatus = useQuery(api.surfaces.getRepositoryIndexStatus, {
    repositoryId,
  });

  // Don't return null - always show container when impactAnalysis exists or when processing
  if (!impactAnalysis && !isProcessing) {
    return null;
  }

  // If processing but no impactAnalysis yet, show header immediately with analyzing state
  if (!impactAnalysis && isProcessing) {
    return (
      <div className="border-t pt-4 mt-4 space-y-4">
        {/* Index Status skeleton */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-48" />
        </div>

        {/* AI-Detected Impact - show header immediately */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-yellow-600">⚠</span>
              <h4 className="text-sm font-semibold">AI-Detected Impact</h4>
            </div>
            <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1.5 animate-[dot-pulse_1.5s_ease-in-out_infinite]" />
              analyzing risk
            </Badge>
          </div>
        </div>

        {/* Changed Files - show immediately if available (from commit data, not AI) */}
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

  // If impactAnalysis exists but no affected surfaces, still show container
  if (!impactAnalysis.affectedSurfaces.length) {
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
      {indexStatus === undefined ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Skeleton className="h-4 w-4" /> {/* Checkmark skeleton */}
          <Skeleton className="h-4 w-32" /> {/* "Index Status: Indexed" skeleton */}
          <Skeleton className="h-4 w-24" /> {/* Date skeleton */}
          <Skeleton className="h-4 w-20" /> {/* Surface count skeleton */}
        </div>
      ) : indexStatus && indexStatus.indexStatus === "completed" ? (
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
      ) : null}

      {/* AI-Detected Impact - Collapsible */}
      <div className="space-y-3">
        <Button
          variant="ghost"
          className="w-full justify-between p-0 h-auto font-normal hover:bg-transparent"
          onClick={() => setIsExpanded(!isExpanded)}
        >
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
            <span className="text-muted-foreground ml-2">
              {isExpanded ? "▲" : "▼"}
            </span>
          </div>
        </Button>
        {/* Show subtle loading indicator when collapsed and content is loading */}
        {!isExpanded && isProcessing && (surfaces === undefined || !impactAnalysis.overallExplanation) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Skeleton className="h-3 w-3 rounded-full animate-pulse" />
            <Skeleton className="h-3 w-32" />
          </div>
        )}

        {/* Overall Explanation */}
        {isExpanded && (
          <>
            {impactAnalysis.overallExplanation ? (
              <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                <p className="font-medium mb-1">Overall Assessment:</p>
                <p>{impactAnalysis.overallExplanation}</p>
                <p className="mt-2 text-xs">
                  <strong>Confidence Score:</strong> This indicates how certain the AI is about the risk assessment. Higher confidence means the analysis is more reliable based on the code structure and changes detected.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            )}

            {/* Affected Surfaces */}
            <div className="space-y-2">
              {surfaces === undefined ? (
                // Show skeleton for each affected surface
                impactAnalysis.affectedSurfaces.map((_, index) => (
                  <Skeleton key={index} className="h-8 w-full" />
                ))
              ) : (
                impactAnalysis.affectedSurfaces.map((surface, index) => {
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
                      explanation={surface.explanation}
                    />
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* Changed Files - always show when available (from commit data, not AI) */}
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
