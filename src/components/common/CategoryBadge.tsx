import { Badge } from "@/components/ui/badge";
import type { DigestCategory } from "../../../convex/types";

interface CategoryBadgeProps {
  category?: DigestCategory;
}

export function CategoryBadge({ category }: CategoryBadgeProps) {
  if (!category) {
    return null;
  }

  return <Badge variant={category}>{category}</Badge>;
}
