import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TimeAgo } from "@/components/common/TimeAgo";
import { PerspectiveBadges } from "./PerspectiveBadges";
import { WhyThisMatters } from "./WhyThisMatters";
import { ImpactAnalysis } from "./ImpactAnalysis";
import { usePerspectives } from "@/hooks/usePerspectives";
import type { Digest } from "../../../convex/types";

interface DigestCardProps {
  digest: Digest;
  repositoryFullName?: string;
}

export function DigestCard({ digest, repositoryFullName }: DigestCardProps) {
  const contributor = digest.contributors[0] || "unknown";
  const githubUrl = digest.metadata?.prUrl || digest.metadata?.issueUrl || digest.metadata?.compareUrl;
  const perspectives = usePerspectives(digest._id);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <CardTitle className="text-lg">{digest.title}</CardTitle>
            {/* Only show perspective badges, show nothing if no perspectives exist */}
            {perspectives && perspectives.length > 0 && (
              <PerspectiveBadges perspectives={perspectives} />
            )}
            <CardDescription>
              <TimeAgo timestamp={digest.createdAt} />
            </CardDescription>
          </div>
          <Avatar>
            <AvatarImage src={`https://github.com/${contributor}.png`} alt={contributor} />
            <AvatarFallback>{contributor.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed">{digest.summary}</p>

        {digest.impactAnalysis && (
          <ImpactAnalysis impactAnalysis={digest.impactAnalysis} />
        )}

        {digest.whyThisMatters && (
          <WhyThisMatters content={digest.whyThisMatters} />
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>by {contributor}</span>
          {digest.metadata?.prNumber && (
            <>
              <span>•</span>
              <span>PR #{digest.metadata.prNumber}</span>
            </>
          )}
          {digest.metadata?.issueNumber && (
            <>
              <span>•</span>
              <span>Issue #{digest.metadata.issueNumber}</span>
            </>
          )}
          {digest.metadata?.commitCount && (
            <>
              <span>•</span>
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
