import { useState } from "react";
import { Button } from "@/components/ui/button";

interface WhyThisMattersProps {
  content: string;
}

export function WhyThisMatters({ content }: WhyThisMattersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!content) {
    return null;
  }

  return (
    <div className="border-t pt-4 mt-4">
      <Button
        variant="ghost"
        className="w-full justify-between p-0 h-auto font-normal"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="text-sm font-medium">Why this matters</span>
        <span className="text-muted-foreground">
          {isExpanded ? "▲" : "▼"}
        </span>
      </Button>
      {isExpanded && (
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          {content}
        </p>
      )}
    </div>
  );
}
