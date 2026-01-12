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
              {/* Show code change indicator for pushes/PRs */}
              {isCodeChange && (
                <Badge variant="outline" className="text-xs">
                  {event.type === "push" ? "Code Push" : "Pull Request"}
                </Badge>
              )}
            </div>
            {/* Show skeleton for perspectives while loading, or show real badges when available */}
            {isProcessing && perspectives === undefined ? (
              <div className="flex gap-2 flex-wrap">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ) : perspectives && perspectives.length > 0 ? (
              <PerspectiveBadges perspectives={perspectives} />
            ) : null}
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Avatar className="h-5 w-5">
                  <AvatarImage
                    src={event?.actorAvatarUrl || `https://github.com/${contributor}.png`}
                    alt={contributor}
                  />
                  <AvatarFallback className="text-xs">
                    {contributor.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span>@{event?.actorGithubUsername || contributor}</span>
              </div>
              {digest.metadata?.branch && (
                <>
                  <span>•</span>
                  <Badge variant="outline" className="text-xs font-mono">
                    {digest.metadata.branch}
                  </Badge>
                </>
              )}
              <span>•</span>
              <TimeAgo timestamp={digest.createdAt} />
            </div>
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
        </div>

        {githubUrl && (
          <div>
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              View on GitHub →
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
