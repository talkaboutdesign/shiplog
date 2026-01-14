import { Badge } from "@/components/ui/badge";

type PerspectiveType = "bugfix" | "ui" | "feature" | "security" | "performance" | "refactor" | "docs";

interface Perspective {
  perspective: PerspectiveType;
  title: string;
  summary: string;
  confidence: number;
}

interface PerspectiveBadgesProps {
  perspectives: Perspective[] | undefined;
}

const perspectiveLabels: Record<PerspectiveType, string> = {
  bugfix: "BUGFIX",
  ui: "UI",
  feature: "FEATURE",
  security: "SECURITY",
  performance: "PERFORMANCE",
  refactor: "REFACTOR",
  docs: "DOCS",
};

export function PerspectiveBadges({ perspectives }: PerspectiveBadgesProps) {
  if (!perspectives || perspectives.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {perspectives.map((perspective, index) => (
        <Badge key={`${perspective.perspective}-${index}`} variant={perspective.perspective}>
          {perspectiveLabels[perspective.perspective]}
        </Badge>
      ))}
    </div>
  );
}
