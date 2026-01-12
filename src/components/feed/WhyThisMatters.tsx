import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface WhyThisMattersProps {
  content: string;
  isProcessing?: boolean;
}

export function WhyThisMatters({ content, isProcessing = false }: WhyThisMattersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Always show the section if processing, even without content
  if (!content && !isProcessing) {
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
        <>
          {content ? (
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              {content}
            </p>
          ) : (
            <div className="space-y-2 mt-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          )}
        </>
      )}
      {/* Show subtle loading indicator when collapsed and processing */}
      {!isExpanded && isProcessing && !content && (
        <div className="mt-2 flex items-center gap-2">
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-3 w-24" />
        </div>
      )}
    </div>
  );
}
