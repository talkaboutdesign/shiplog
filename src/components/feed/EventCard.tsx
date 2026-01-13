import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TimeAgo } from "@/components/common/TimeAgo";
import type { Event } from "../../../convex/types";

interface EventCardProps {
  event: Event;
}

const statusColors: Record<Event["status"], "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  processing: "default",
  completed: "default",
  failed: "destructive",
  skipped: "outline",
};

const statusLabels: Record<Event["status"], string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  skipped: "Skipped",
};

const eventTypeLabels: Record<string, string> = {
  push: "Push",
  pull_request: "Pull Request",
};

export function EventCard({ event }: EventCardProps) {
  const statusColor = statusColors[event.status];
  const statusLabel = statusLabels[event.status];
  const eventTypeLabel = eventTypeLabels[event.type] || event.type;

  // Extract info from payload
  const payload = event.payload;
  let title = `${eventTypeLabel} event`;
  let description: string | undefined;

  if (event.type === "push") {
    const commits = payload.commits || [];
    title = `Push: ${commits.length} commit(s)`;
    description = commits[0]?.message || payload.head_commit?.message;
  } else if (event.type === "pull_request") {
    title = payload.pull_request?.title || "Pull Request";
    description = payload.pull_request?.body;
  }

  const showStatusBadge = true;
  
  return (
    <Card className={event.status === "failed" || event.status === "skipped" ? "border-destructive" : ""}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-lg">{title}</CardTitle>
              {showStatusBadge && <Badge variant={statusColor}>{statusLabel}</Badge>}
              <Badge variant="outline">{eventTypeLabel}</Badge>
            </div>
            <CardDescription>
              <TimeAgo timestamp={event.occurredAt} />
            </CardDescription>
          </div>
          <Avatar>
            <AvatarImage src={event.actorAvatarUrl} alt={event.actorGithubUsername} />
            <AvatarFallback>{event.actorGithubUsername.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
        )}

        {event.errorMessage && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
            <p className="text-sm font-medium text-destructive mb-1">Error:</p>
            <p className="text-sm text-destructive/90">{event.errorMessage}</p>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>by {event.actorGithubUsername}</span>
          {event.processedAt && (
            <>
              <span>•</span>
              <span>Processed <TimeAgo timestamp={event.processedAt} /></span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
