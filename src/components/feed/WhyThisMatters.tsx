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
    <div className="border-t pt-4 mt-4">
      <h4 className="text-sm font-medium mb-2">Why this matters</h4>
      {content ? (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {content}
        </p>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground animate-[dot-pulse_1.5s_ease-in-out_infinite]" />
          <span className="animate-pulse">Generating insights...</span>
        </div>
      )}
    </div>
  );
}
