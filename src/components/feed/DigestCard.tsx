import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PerspectiveBadges } from "./PerspectiveBadges";
import { WhyThisMatters } from "./WhyThisMatters";
import { ImpactAnalysis } from "./ImpactAnalysis";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { formatDistanceToNow } from "date-fns";
import { ArrowRight, Clock, ChevronDown, GitBranch, FileText, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Digest } from "../../../convex/types";

interface DigestCardProps {
  digest: Digest;
  repositoryFullName?: string;
  index?: number; // Position in list - first 3 default to expanded
}

export function DigestCard({ digest, repositoryFullName, index = 0 }: DigestCardProps) {
  // First 3 cards (index 0, 1, 2) are expanded by default
  const [isExpanded, setIsExpanded] = useState(index < 3);
  const [isFilesExpanded, setIsFilesExpanded] = useState(false);
  const contributor = digest.contributors[0] || "unknown";
  const githubUrl = digest.metadata?.prUrl || digest.metadata?.compareUrl;
  // Perspectives are now stored directly on the digest
  const perspectives = digest.perspectives;
  // Get event type from digest metadata
  const eventType = digest.metadata?.eventType;
  // Get file diffs from metadata
  const fileDiffs = digest.metadata?.fileDiffs || [];
  const totalAdditions = digest.metadata?.totalAdditions || 0;
  const totalDeletions = digest.metadata?.totalDeletions || 0;
  // Fetch repository name if not provided
  const repository = useQuery(
    api.repositories.getByIdPublic,
    repositoryFullName ? "skip" : { repositoryId: digest.repositoryId }
  );
  const displayRepositoryName = repositoryFullName || repository?.fullName;

  // Determine if digest is still processing
  // Check if recently created and missing expected AI-generated content
  const digestAge = Date.now() - digest.createdAt;
  const isRecentlyCreated = digestAge < 120000; // 2 minutes - extended window for AI content
  const hasBasicContent = digest.summary && digest.summary !== "Analyzing changes..." && digest.category;
  
  // Check if specific content is missing (regardless of time for recently created digests)
  const isMissingWhyThisMatters = !digest.whyThisMatters && isRecentlyCreated;
  const isMissingImpactAnalysis = !digest.impactAnalysis && isRecentlyCreated;
  
  const isProcessing = 
    digest.summary === "Analyzing changes..." || 
    (isRecentlyCreated && !hasBasicContent) ||
    (hasBasicContent && (isMissingWhyThisMatters || isMissingImpactAnalysis));

  // Determine event type for UI differentiation
  const isCodeChange = eventType === "push" || eventType === "pull_request";

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleToggle();
    }
  };

  // Check if there's collapsible content to show
  const hasCollapsibleContent = digest.impactAnalysis || digest.whyThisMatters ||
    isMissingImpactAnalysis || isMissingWhyThisMatters || githubUrl || fileDiffs.length > 0;

  return (
    <Card className="gap-4 py-5">
      {/* Header - clickable toggle area */}
      <CardHeader
        className={cn(
          "pb-0",
          hasCollapsibleContent && [
            "cursor-pointer select-none",
            "transition-colors duration-150",
            // Extend to card top edge (Card has py-6), use pt-5 to match py-5
            "-mt-6 pt-5 rounded-t-xl",
            "hover:bg-muted/50 focus-visible:bg-muted/50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          ]
        )}
        onClick={hasCollapsibleContent ? handleToggle : undefined}
        onKeyDown={hasCollapsibleContent ? handleKeyDown : undefined}
        role={hasCollapsibleContent ? "button" : undefined}
        tabIndex={hasCollapsibleContent ? 0 : undefined}
        aria-expanded={hasCollapsibleContent ? isExpanded : undefined}
        aria-controls={hasCollapsibleContent ? `digest-content-${digest._id}` : undefined}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            {/* Timestamp above headline */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3 opacity-70" />
              <span>{formatDistanceToNow(new Date(digest.createdAt), { addSuffix: true })}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {isProcessing && !digest.category ? (
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg">{digest.title}</CardTitle>
                  <Badge variant="processing" className="text-xs">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-[dot-pulse_1.5s_ease-in-out_infinite]" />
                    analyzing commit
                  </Badge>
                </div>
              ) : (
                <CardTitle className="text-lg">{digest.title}</CardTitle>
              )}
            </div>
            {/* Show animated analyzing badge while loading, or show real badges when available */}
            {isProcessing && (!perspectives || perspectives.length === 0) ? (
              <div className="flex flex-wrap gap-2">
                <Badge variant="processing">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-[dot-pulse_1.5s_ease-in-out_infinite]" />
                  analyzing perspectives
                </Badge>
              </div>
            ) : perspectives && perspectives.length > 0 ? (
              <PerspectiveBadges perspectives={perspectives} />
            ) : null}
          </div>
          {/* Expand/collapse indicator */}
          {hasCollapsibleContent && (
            <ChevronDown
              className={cn(
                "h-5 w-5 text-muted-foreground transition-transform duration-200 shrink-0 mt-1",
                isExpanded && "rotate-180"
              )}
              aria-hidden="true"
            />
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary - always visible */}
        {digest.summary && digest.summary !== "Analyzing changes..." ? (
          <p className="text-sm leading-relaxed">{digest.summary}</p>
        ) : (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>
        )}

        {/* Collapsible content - only visible when expanded */}
        <div
          id={`digest-content-${digest._id}`}
          className={cn(
            "grid transition-all duration-300 ease-in-out",
            isExpanded ? "grid-rows-[1fr] opacity-100 mt-4" : "grid-rows-[0fr] opacity-0"
          )}
        >
          {/* -m-1 p-1 creates space for focus rings while overflow-hidden clips the animation */}
          <div className="overflow-hidden -m-1 p-1 space-y-4">
            {digest.impactAnalysis ? (
              <ImpactAnalysis
                impactAnalysis={digest.impactAnalysis}
                repositoryId={digest.repositoryId}
                repositoryFullName={displayRepositoryName}
                digestMetadata={digest.metadata}
                isProcessing={isMissingImpactAnalysis}
              />
            ) : isMissingImpactAnalysis ? (
              <ImpactAnalysis
                impactAnalysis={undefined}
                repositoryId={digest.repositoryId}
                repositoryFullName={displayRepositoryName}
                digestMetadata={digest.metadata}
                isProcessing={true}
              />
            ) : null}

            {digest.whyThisMatters ? (
              <WhyThisMatters content={digest.whyThisMatters} />
            ) : isMissingWhyThisMatters ? (
              <WhyThisMatters content={""} isProcessing={true} />
            ) : null}

            {/* File changes section */}
            {fileDiffs.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <h4 className="text-sm font-medium">Files changed</h4>
                    <span className="text-xs text-muted-foreground">
                      ({fileDiffs.length} {fileDiffs.length === 1 ? "file" : "files"})
                    </span>
                  </div>
                  {(totalAdditions > 0 || totalDeletions > 0) && (
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                        <Plus className="h-3 w-3" />
                        {totalAdditions}
                      </span>
                      <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                        <Minus className="h-3 w-3" />
                        {totalDeletions}
                      </span>
                    </div>
                  )}
                </div>
                {fileDiffs.length > 0 && (
                  <button
                    onClick={() => setIsFilesExpanded(!isFilesExpanded)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    <ChevronDown
                      className={cn(
                        "h-3 w-3 transition-transform duration-200",
                        isFilesExpanded && "rotate-180"
                      )}
                    />
                    {isFilesExpanded ? "Hide" : "Show"} files
                  </button>
                )}
                {isFilesExpanded && (
                  <div className="mt-2 space-y-1 max-h-64 overflow-y-auto">
                    {fileDiffs.map((file: any, idx: number) => {
                      const statusColors = {
                        added: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
                        removed: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
                        modified: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
                        renamed: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
                      };
                      const statusLabels = {
                        added: "A",
                        removed: "D",
                        modified: "M",
                        renamed: "R",
                      };
                      return (
                        <div
                          key={idx}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1 rounded text-xs border",
                            statusColors[file.status as keyof typeof statusColors] || statusColors.modified
                          )}
                        >
                          <span className="font-mono text-[10px] font-semibold shrink-0">
                            {statusLabels[file.status as keyof typeof statusLabels] || "?"}
                          </span>
                          <span className="truncate flex-1 font-mono">{file.filename}</span>
                          {(file.additions > 0 || file.deletions > 0) && (
                            <span className="shrink-0 font-mono text-xs flex items-center gap-1">
                              {file.additions > 0 && (
                                <span className="text-green-600 dark:text-green-400">+{file.additions}</span>
                              )}
                              {file.deletions > 0 && (
                                <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>
                              )}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Footer with all metadata */}
            <div className="border-t pt-4 space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                {isCodeChange && displayRepositoryName ? (
                  <>
                    <Badge variant="outline" className="text-xs">
                      {eventType === "push" ? "Commit" : "Pull Request"} • {displayRepositoryName}
                    </Badge>
                    <span>•</span>
                  </>
                ) : isCodeChange ? (
                  <>
                    <Badge variant="outline" className="text-xs">
                      {eventType === "push" ? "Commit" : "Pull Request"}
                    </Badge>
                    <span>•</span>
                  </>
                ) : displayRepositoryName ? (
                  <>
                    <span className="font-medium">{displayRepositoryName}</span>
                    <span>•</span>
                  </>
                ) : null}
                <div className="flex items-center gap-2">
                  <Avatar className="h-4 w-4">
                    <AvatarImage
                      src={`https://github.com/${contributor}.png`}
                      alt={contributor}
                    />
                    <AvatarFallback className="text-[10px]">
                      {contributor.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <a
                    href={`https://github.com/${contributor}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    @{contributor}
                  </a>
                </div>
                {digest.metadata?.branch && (
                  <>
                    <span>•</span>
                    <Badge variant="outline" className="text-xs font-mono flex items-center gap-1">
                      <GitBranch className="h-3 w-3" />
                      {digest.metadata.branch}
                    </Badge>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                {digest.metadata?.prNumber && (
                  <>
                    <span>PR #{digest.metadata.prNumber}</span>
                  </>
                )}
                {digest.metadata?.commitCount && (
                  <>
                    {digest.metadata?.prNumber && <span>•</span>}
                    <span>{digest.metadata.commitCount} commit(s)</span>
                  </>
                )}
                {(totalAdditions > 0 || totalDeletions > 0) && (
                  <>
                    {(digest.metadata?.prNumber || digest.metadata?.commitCount) && <span>•</span>}
                    <span className="font-mono">
                      <span className="text-green-600 dark:text-green-400">+{totalAdditions}</span>
                      {" "}
                      <span className="text-red-600 dark:text-red-400">-{totalDeletions}</span>
                    </span>
                  </>
                )}
                {githubUrl && (
                  <>
                    {(digest.metadata?.prNumber || digest.metadata?.commitCount || totalAdditions > 0 || totalDeletions > 0) && <span>•</span>}
                    <a
                      href={githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      View on GitHub <ArrowRight className="h-3 w-3" />
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
