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
import type { Digest } from "../../../convex/types";

interface DigestCardProps {
  digest: Digest;
  repositoryFullName?: string;
}

export function DigestCard({ digest, repositoryFullName }: DigestCardProps) {
  const contributor = digest.contributors[0] || "unknown";
  const githubUrl = digest.metadata?.prUrl || digest.metadata?.issueUrl || digest.metadata?.compareUrl;
  const perspectives = usePerspectives(digest._id);
  const event = useEvent(digest._id);

  // Check if digest is still being processed (has placeholder data)
  const isProcessing = digest.summary === "Analyzing changes..." || 
    digest.title.includes("Processing") || 
    digest.title.includes("Push:") && !digest.category;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
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
            {/* Only show perspective badges, show nothing if no perspectives exist */}
            {perspectives && perspectives.length > 0 && (
              <PerspectiveBadges perspectives={perspectives} />
            )}
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

        {digest.impactAnalysis && (
          <ImpactAnalysis
            impactAnalysis={digest.impactAnalysis}
            repositoryId={digest.repositoryId}
            event={event ? { fileDiffs: event.fileDiffs } : undefined}
          />
        )}

        {digest.whyThisMatters && (
          <WhyThisMatters content={digest.whyThisMatters} />
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {digest.metadata?.prNumber && (
            <>
              <span>PR #{digest.metadata.prNumber}</span>
            </>
          )}
          {digest.metadata?.issueNumber && (
            <>
              {digest.metadata?.prNumber && <span>•</span>}
              <span>Issue #{digest.metadata.issueNumber}</span>
            </>
          )}
          {digest.metadata?.commitCount && (
            <>
              {(digest.metadata?.prNumber || digest.metadata?.issueNumber) && <span>•</span>}
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
