import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronUp, ChevronDown } from "lucide-react";
import type { Digest } from "../../../convex/types";
import type { Id } from "../../../convex/_generated/dataModel";

interface ImpactAnalysisProps {
  impactAnalysis: Digest["impactAnalysis"];
  repositoryId: Id<"repositories">;
  repositoryFullName?: string;
  digestMetadata?: Digest["metadata"];
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

export function ImpactAnalysis({ 
  impactAnalysis, 
  repositoryId: _repositoryId, 
  repositoryFullName,
  digestMetadata,
  event, 
  isProcessing = false 
}: ImpactAnalysisProps) {
  const [showFiles, setShowFiles] = useState(false);

  // Minimal query to get filePath for matching - only fetch what we need
  const surfaceIds = impactAnalysis?.affectedSurfaces
    ?.map((s) => s.surfaceId)
    .filter((id) => id) as Id<"codeSurfaces">[] ?? [];

  const surfaces = useQuery(
    api.surfaces.getSurfacesByIds,
    surfaceIds.length > 0 ? { surfaceIds } : "skip"
  );

  // Now we can have conditional returns
  if (!impactAnalysis && !isProcessing) {
    return null;
  }

  // Create map of surfaceId to filePath and riskLevel
  const surfaceToFileMap = new Map<string, { riskLevel: "low" | "medium" | "high" }>();
  if (surfaces && impactAnalysis?.affectedSurfaces) {
    impactAnalysis.affectedSurfaces.forEach((surface) => {
      if (surface.surfaceId) {
        const surfaceDetails = surfaces.find((s) => s._id === surface.surfaceId);
        if (surfaceDetails?.filePath) {
          surfaceToFileMap.set(surfaceDetails.filePath, {
            riskLevel: surface.riskLevel,
          });
        }
      }
    });
  }

  // Build unified file list from fileDiffs, enriched with risk levels
  const allFiles: Array<{
    filename: string;
    riskLevel?: "low" | "medium" | "high";
    status: "added" | "removed" | "modified" | "renamed";
  }> = [];

  if (event?.fileDiffs) {
    event.fileDiffs.forEach((fileDiff) => {
      const riskInfo = surfaceToFileMap.get(fileDiff.filename);
      allFiles.push({
        filename: fileDiff.filename,
        riskLevel: riskInfo?.riskLevel,
        status: fileDiff.status,
      });
    });
  }

  // Get GitHub URL for file links
  const githubBaseUrl = digestMetadata?.prUrl 
    ? `${digestMetadata.prUrl}/files`
    : digestMetadata?.compareUrl;

  // Helper function to get risk color
  const getRiskColor = (riskLevel?: "low" | "medium" | "high") => {
    if (!riskLevel) return "text-muted-foreground";
    switch (riskLevel) {
      case "low":
        return "text-green-600";
      case "medium":
        return "text-amber-600";
      case "high":
        return "text-red-600";
    }
  };

  // Processing state - show header immediately with analyzing state
  if (!impactAnalysis && isProcessing) {
    const fileCount = event?.fileDiffs?.length || 0;
    return (
      <div className="space-y-4">
        {/* Codebase Impact Analysis - show header immediately */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-yellow-600">⚠</span>
              <h4 className="text-sm font-semibold">Codebase Impact Analysis</h4>
            </div>
            <Badge variant="processing">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-[dot-pulse_1.5s_ease-in-out_infinite]" />
              analyzing impact
            </Badge>
          </div>
          
          {/* Skeleton for overall explanation */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </div>

        {/* Changed Files - compact button with expandable list */}
        {fileCount > 0 && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto py-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowFiles(!showFiles)}
            >
              {fileCount} file{fileCount !== 1 ? 's' : ''} changed
              {showFiles ? (
                <ChevronUp className="ml-1 h-3 w-3" />
              ) : (
                <ChevronDown className="ml-1 h-3 w-3" />
              )}
            </Button>
            {showFiles && (
              <div className="mt-2 space-y-1 pl-2 border-l-2 border-muted">
                {event?.fileDiffs?.map((file, index) => (
                  <Skeleton
                    key={index}
                    className="h-4 w-full"
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // At this point, impactAnalysis must exist (we handled the !impactAnalysis case above)
  if (!impactAnalysis) {
    return null;
  }

  const fileCount = allFiles.length;

  return (
    <div className="space-y-4">
      {/* Codebase Impact Analysis */}
      <div className="space-y-3">
        {/* Header - Always visible */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-yellow-600">⚠</span>
            <h4 className="text-sm font-semibold">Codebase Impact Analysis</h4>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={`risk-${impactAnalysis.overallRisk}` as const}>
              {impactAnalysis.overallRisk} risk
            </Badge>
            <span className="text-xs text-muted-foreground">
              {impactAnalysis.confidence}% confidence
            </span>
          </div>
        </div>

        {/* Overall Explanation - Always visible */}
        {impactAnalysis.overallExplanation ? (
          <div className="text-sm leading-relaxed">
            <p>{impactAnalysis.overallExplanation}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        )}

        {/* Unified Files List - Collapsible */}
        {fileCount > 0 && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto py-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowFiles(!showFiles)}
            >
              {fileCount} file{fileCount !== 1 ? 's' : ''} changed
              {showFiles ? (
                <ChevronUp className="ml-1 h-3 w-3" />
              ) : (
                <ChevronDown className="ml-1 h-3 w-3" />
              )}
            </Button>
            {showFiles && (
              <div className="mt-2 space-y-1 pl-2 border-l-2 border-muted">
                {allFiles.map((file, index) => {
                  const fileUrl = githubBaseUrl;
                  const riskText = file.riskLevel ? `${file.riskLevel} risk` : undefined;
                  const filenameColor = getRiskColor(file.riskLevel);
                  
                  return (
                    <div
                      key={index}
                      className="text-xs"
                    >
                      {fileUrl ? (
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`font-mono ${filenameColor} hover:underline truncate`}
                        >
                          {file.filename}
                          {riskText && ` • ${riskText}`}
                        </a>
                      ) : (
                        <span className={`font-mono ${filenameColor} truncate`}>
                          {file.filename}
                          {riskText && ` • ${riskText}`}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
