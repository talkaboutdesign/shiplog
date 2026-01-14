import { Skeleton } from "@/components/ui/skeleton";

interface WelcomeHeaderProps {
  context: {
    userName?: string;
    daysAway: number;
    hoursAway: number;
    todayDigestCount: number;
    summariesToShow: Array<{
      period: string;
      periodStart: number;
    }>;
  } | undefined;
  isLoading?: boolean;
}

export function WelcomeHeader({ context, isLoading }: WelcomeHeaderProps) {
  if (isLoading || !context) {
    return (
      <div className="space-y-2 mb-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-48" />
      </div>
    );
  }

  const { userName, daysAway, hoursAway, todayDigestCount, summariesToShow } = context;
  const displayName = userName || "there";

  // Format the time away message
  const getTimeAwayMessage = (): string => {
    if (daysAway >= 14) {
      const weeks = Math.floor(daysAway / 7);
      return `You've been away ${weeks} week${weeks > 1 ? "s" : ""}. Here's what happened:`;
    } else if (daysAway >= 7) {
      return `You've been away about a week. Here's what happened:`;
    } else if (daysAway >= 2) {
      return `You've been away ${daysAway} days. Here's what happened:`;
    } else if (daysAway === 1) {
      return "You've been away a day. Here's what happened:";
    } else if (hoursAway >= 1) {
      return `${todayDigestCount} commit${todayDigestCount !== 1 ? "s" : ""} today`;
    } else {
      return todayDigestCount > 0
        ? `${todayDigestCount} commit${todayDigestCount !== 1 ? "s" : ""} today`
        : "No activity yet today";
    }
  };

  // Show different greeting based on time away
  const showCatchUp = daysAway >= 1 && summariesToShow.length > 0;

  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight">
        Welcome back{displayName !== "there" ? `, ${displayName}` : ""}!
      </h1>
      <p className="text-muted-foreground mt-1">
        {getTimeAwayMessage()}
      </p>
      {showCatchUp && (
        <p className="text-sm text-muted-foreground/80 mt-1">
          {summariesToShow.length} summar{summariesToShow.length === 1 ? "y" : "ies"} to catch up on
        </p>
      )}
    </div>
  );
}
