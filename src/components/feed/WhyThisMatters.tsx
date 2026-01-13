import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface WhyThisMattersProps {
  content: string;
  isProcessing?: boolean;
}

export function WhyThisMatters({ content, isProcessing = false }: WhyThisMattersProps) {
  // Always show the section if processing, even without content
  if (!content && !isProcessing) {
    return null;
  }

  return (
    <div className="border-t pt-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium">Why this matters</h4>
        {isProcessing && !content && (
          <Badge variant="processing">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-[dot-pulse_1.5s_ease-in-out_infinite]" />
            analyzing insights
          </Badge>
        )}
      </div>
      {content ? (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {content}
        </p>
      ) : (
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      )}
    </div>
  );
}
