import { Badge } from "@/components/ui/badge";
import type { DigestCategory } from "../../../convex/types";

interface CategoryBadgeProps {
  category?: DigestCategory;
}

const categoryColors: Record<DigestCategory, { variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
  feature: { variant: "default", className: "bg-green-500 text-white hover:bg-green-600" },
  bugfix: { variant: "destructive" },
  refactor: { variant: "secondary" },
  docs: { variant: "outline", className: "border-blue-500 text-blue-700" },
  chore: { variant: "outline", className: "border-gray-500 text-gray-700" },
  security: { variant: "destructive", className: "bg-red-600 text-white hover:bg-red-700" },
};

export function CategoryBadge({ category }: CategoryBadgeProps) {
  if (!category) {
    return null;
  }

  const colorConfig = categoryColors[category];

  return (
    <Badge variant={colorConfig.variant} className={colorConfig.className}>
      {category}
    </Badge>
  );
}
