import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TimeAgo } from "@/components/common/TimeAgo";
import { PerspectiveBadges } from "./PerspectiveBadges";
import { WhyThisMatters } from "./WhyThisMatters";
import { ImpactAnalysis } from "./ImpactAnalysis";
import { usePerspectives } from "@/hooks/usePerspectives";
import { useEvent } from "@/hooks/useEvent";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { formatDistanceToNow } from "date-fns";
import type { Digest, Event } from "../../../convex/types";

interface DigestCardProps {
  digest: Digest;
  repositoryFullName?: string;
  event?: Event; // Optional event prop to avoid extra query
}

export function DigestCard({ digest, repositoryFullName, event: eventProp }: DigestCardProps) {
  const contributor = digest.contributors[0] || "unknown";
  const githubUrl = digest.metadata?.prUrl || digest.metadata?.compareUrl;
  const perspectives = usePerspectives(digest._id);
  // Use provided event or fetch it
  const fetchedEvent = useEvent(digest._id);
  const event = eventProp || fetchedEvent;
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
  const isCodeChange = event?.type === "push" || event?.type === "pull_request";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            {/* Timestamp above headline */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="opacity-70"
              >
                <circle cx="6" cy="6" r="4.5" />
                <path d="M6 3v3l2.5 1.5" />
              </svg>
              <span>{formatDistanceToNow(new Date(digest.createdAt), { addSuffix: true })}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {isProcessing && !digest.category ? (
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg">{digest.title}</CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    Analyzing...
                  </Badge>
                </div>
              ) : (
                <CardTitle className="text-lg">{digest.title}</CardTitle>
              )}
            </div>
            {/* Show animated analyzing badge while loading, or show real badges when available */}
            {isProcessing && (!perspectives || perspectives.length === 0) ? (
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1.5 animate-[dot-pulse_1.5s_ease-in-out_infinite]" />
                  ANALYZING
                </Badge>
              </div>
            ) : perspectives && perspectives.length > 0 ? (
              <PerspectiveBadges perspectives={perspectives} />
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {digest.summary && digest.summary !== "Analyzing changes..." ? (
          <p className="text-sm leading-relaxed">{digest.summary}</p>
        ) : (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>
        )}

        {digest.impactAnalysis ? (
          <ImpactAnalysis
            impactAnalysis={digest.impactAnalysis}
            repositoryId={digest.repositoryId}
            event={event ? { fileDiffs: event.fileDiffs } : undefined}
            isProcessing={isMissingImpactAnalysis}
          />
        ) : isMissingImpactAnalysis ? (
          <ImpactAnalysis
            impactAnalysis={undefined}
            repositoryId={digest.repositoryId}
            event={event ? { fileDiffs: event.fileDiffs } : undefined}
            isProcessing={true}
          />
        ) : null}

        {digest.whyThisMatters ? (
          <WhyThisMatters content={digest.whyThisMatters} />
        ) : isMissingWhyThisMatters ? (
          <WhyThisMatters content={""} isProcessing={true} />
        ) : null}

        {/* Footer with all metadata */}
        <div className="border-t pt-4 mt-4 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            {isCodeChange && displayRepositoryName ? (
              <>
                <Badge variant="outline" className="text-xs">
                  {event.type === "push" ? "Code Push" : "Pull Request"} • {displayRepositoryName}
                </Badge>
                <span>•</span>
              </>
            ) : isCodeChange ? (
              <>
                <Badge variant="outline" className="text-xs">
                  {event.type === "push" ? "Code Push" : "Pull Request"}
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
                  src={event?.actorAvatarUrl || `https://github.com/${contributor}.png`}
                  alt={contributor}
                />
                <AvatarFallback className="text-[10px]">
                  {contributor.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <a
                href={`https://github.com/${event?.actorGithubUsername || contributor}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                @{event?.actorGithubUsername || contributor}
              </a>
            </div>
            {digest.metadata?.branch && (
              <>
                <span>•</span>
                <Badge variant="outline" className="text-xs font-mono">
                  {digest.metadata.branch}
                </Badge>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
            {githubUrl && (
              <>
                {(digest.metadata?.prNumber || digest.metadata?.commitCount) && <span>•</span>}
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  View on GitHub →
                </a>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
