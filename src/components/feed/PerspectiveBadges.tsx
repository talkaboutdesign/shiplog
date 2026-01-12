import { Badge } from "@/components/ui/badge";
import type { Doc } from "../../../convex/_generated/dataModel";

interface PerspectiveBadgesProps {
  perspectives: Doc<"digestPerspectives">[];
}

const perspectiveColors: Record<
  Doc<"digestPerspectives">["perspective"],
  string
> = {
  bugfix: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  ui: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  feature: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  security: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  performance: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  refactor: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
  docs: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20",
};

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
        <Badge
          key={perspective._id}
          variant="outline"
          className={perspectiveColors[perspective.perspective]}
        >
          {perspectiveLabels[perspective.perspective]}
        </Badge>
      ))}
    </div>
  );
}
