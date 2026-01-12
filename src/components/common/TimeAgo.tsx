import { formatDistanceToNow } from "date-fns";

interface TimeAgoProps {
  timestamp: number;
}

export function TimeAgo({ timestamp }: TimeAgoProps) {
  const timeAgo = formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  return <span className="text-sm text-muted-foreground">{timeAgo}</span>;
}
