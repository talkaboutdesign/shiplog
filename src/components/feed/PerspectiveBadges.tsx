import { Badge } from "@/components/ui/badge";
import type { Doc } from "../../../convex/_generated/dataModel";

interface PerspectiveBadgesProps {
  perspectives: Doc<"digestPerspectives">[];
}

const perspectiveLabels: Record<
  Doc<"digestPerspectives">["perspective"],
  string
> = {
  bugfix: "BUGFIX",
  ui: "UI",
  feature: "FEATURE",
  security: "SECURITY",
  performance: "PERFORMANCE",
  refactor: "REFACTOR",
  docs: "DOCS",
};

export function PerspectiveBadges({ perspectives }: PerspectiveBadgesProps) {
  if (perspectives.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {perspectives.map((perspective) => (
        <Badge key={perspective._id} variant={perspective.perspective}>
          {perspectiveLabels[perspective.perspective]}
        </Badge>
      ))}
    </div>
  );
}
