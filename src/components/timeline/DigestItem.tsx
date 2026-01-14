import { Badge } from "@/components/ui/badge";
import { Clock, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Id } from "../../../convex/_generated/dataModel";

interface DigestItemProps {
  digest: {
    _id: Id<"digests">;
    title: string;
    summary: string;
    category?: "feature" | "bugfix" | "refactor" | "docs" | "chore" | "security";
    contributors: string[];
    metadata?: {
      prNumber?: number;
      prUrl?: string;
      prState?: string;
      commitCount?: number;
      compareUrl?: string;
      branch?: string;
    };
    whyThisMatters?: string;
    createdAt: number;
  };
  compact?: boolean;
}

const categoryColors: Record<string, string> = {
  feature: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  bugfix: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  refactor: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  docs: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  chore: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  security: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

const categoryLabels: Record<string, string> = {
  feature: "Feature",
  bugfix: "Bug Fix",
  refactor: "Refactor",
  docs: "Docs",
  chore: "Chore",
  security: "Security",
};

export function DigestItem({ digest, compact = false }: DigestItemProps) {
  const githubUrl = digest.metadata?.prUrl || digest.metadata?.compareUrl;
  const contributor = digest.contributors[0] || "unknown";

  if (compact) {
    return (
      <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
        {digest.category && (
          <Badge
            variant="secondary"
            className={`text-xs shrink-0 ${categoryColors[digest.category] || ""}`}
          >
            {categoryLabels[digest.category] || digest.category}
          </Badge>
        )}
        <span className="font-medium text-sm truncate flex-1 min-w-0">{digest.title}</span>
        <span className="text-xs text-muted-foreground shrink-0">
          {formatDistanceToNow(new Date(digest.createdAt), { addSuffix: true })}
        </span>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4 space-y-2 hover:bg-muted/30 transition-colors">
      {/* Header with category and time */}
      <div className="flex items-center gap-2 flex-wrap">
        {digest.category && (
          <Badge
            variant="secondary"
            className={`text-xs ${categoryColors[digest.category] || ""}`}
          >
            {categoryLabels[digest.category] || digest.category}
          </Badge>
        )}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" aria-hidden="true" />
          <span>{formatDistanceToNow(new Date(digest.createdAt), { addSuffix: true })}</span>
        </div>
      </div>

      {/* Title */}
      <h4 className="font-medium">{digest.title}</h4>

      {/* Summary */}
      <p className="text-sm text-muted-foreground line-clamp-2">{digest.summary}</p>

      {/* Footer with metadata */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
        <span>@{contributor}</span>
        {digest.metadata?.branch && (
          <Badge variant="outline" className="text-xs font-mono">
            {digest.metadata.branch}
          </Badge>
        )}
        {digest.metadata?.commitCount && (
          <span>{digest.metadata.commitCount} commit{digest.metadata.commitCount !== 1 ? "s" : ""}</span>
        )}
        {githubUrl && (
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline flex items-center gap-1 ml-auto"
            aria-label={`View ${digest.title} on GitHub`}
          >
            View on GitHub <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  );
}
