import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WorkBreakdownProps {
  workBreakdown: {
    bugfix?: { percentage: number; count: number };
    feature?: { percentage: number; count: number };
    refactor?: { percentage: number; count: number };
    docs?: { percentage: number; count: number };
    chore?: { percentage: number; count: number };
    security?: { percentage: number; count: number };
  };
}

const categoryLabels: Record<string, { label: string; emoji: string }> = {
  bugfix: { label: "Bug Fixes", emoji: "🐛" },
  feature: { label: "New Features", emoji: "✨" },
  refactor: { label: "Refactoring", emoji: "♻️" },
  docs: { label: "Documentation", emoji: "📚" },
  chore: { label: "Chores", emoji: "🧹" },
  security: { label: "Security Updates", emoji: "🔒" },
};

export function WorkBreakdown({ workBreakdown }: WorkBreakdownProps) {
  const items = Object.entries(workBreakdown)
    .filter(([_, data]) => data !== undefined)
    .map(([category, data]) => ({
      category,
      ...data!,
      ...categoryLabels[category],
    }))
    .sort((a, b) => b.percentage - a.percentage);

  if (items.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Work Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item) => (
          <div key={item.category} className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span>{item.emoji}</span>
                <span className="font-medium">{item.label}</span>
              </div>
              <div className="text-muted-foreground">
                {item.percentage.toFixed(0)}% ({item.count} {item.count === 1 ? "item" : "items"})
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${item.percentage}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
