import { Badge } from "@/components/ui/badge";

interface SurfaceImpactBadgeProps {
  surfaceName: string;
  impactType: "modified" | "added" | "deleted";
  riskLevel: "low" | "medium" | "high";
  confidence: number;
}

const riskColors = {
  low: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  medium: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
  high: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
};

const riskIcons = {
  low: "✓",
  medium: "ℹ",
  high: "⚠",
};

export function SurfaceImpactBadge({
  surfaceName,
  impactType,
  riskLevel,
  confidence,
}: SurfaceImpactBadgeProps) {
  const icon = riskIcons[riskLevel];

  return (
    <div className="flex items-center gap-2 p-2 rounded-md border bg-card">
      <span className={`text-lg ${riskColors[riskLevel].split(" ")[1]}`}>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{surfaceName}</span>
          <Badge
            variant="outline"
            className={`text-xs ${riskColors[riskLevel]}`}
          >
            {riskLevel} risk
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {impactType} • {confidence}% confidence
        </div>
      </div>
    </div>
  );
}
