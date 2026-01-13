import { useDigests } from "@/hooks/useDigests";
import { useEvents } from "@/hooks/useEvents";
import { DigestCard } from "./DigestCard";
import { EventCard } from "./EventCard";
import { FeedSkeleton } from "./FeedSkeleton";
import { EmptyFeed } from "./EmptyFeed";
import { Id } from "../../../convex/_generated/dataModel";

interface ActivityFeedProps {
  repositoryId: Id<"repositories"> | undefined;
}

export function ActivityFeed({ repositoryId }: ActivityFeedProps) {
  const digests = useDigests(repositoryId);
  const events = useEvents(repositoryId);

  if (digests === undefined || events === undefined) {
    return <FeedSkeleton />;
  }

  // Get events that don't have digests (pending, processing, failed, skipped)
  const eventsWithoutDigests = events.filter(
    (event) => event.status !== "completed" || !digests.some((d) => d.eventId === event._id)
  );

  if (digests.length === 0 && eventsWithoutDigests.length === 0) {
    return <EmptyFeed />;
  }

  // Combine digests and events, showing events without digests
  const allItems: Array<{ type: "digest" | "event"; id: string; timestamp: number }> = [
    ...digests.map((d) => ({ type: "digest" as const, id: d._id, timestamp: d.createdAt })),
    ...eventsWithoutDigests.map((e) => ({ type: "event" as const, id: e._id, timestamp: e.occurredAt })),
  ].sort((a, b) => b.timestamp - a.timestamp);

  // Track digest index for collapsible behavior
  let digestIndex = 0;

  return (
    <div className="space-y-4">
      {allItems.map((item) => {
        if (item.type === "digest") {
          const digest = digests.find((d) => d._id === item.id);
          const currentIndex = digestIndex++;
          return digest ? <DigestCard key={digest._id} digest={digest} index={currentIndex} /> : null;
        } else {
          const event = eventsWithoutDigests.find((e) => e._id === item.id);
          return event ? <EventCard key={event._id} event={event} /> : null;
        }
      })}
    </div>
  );
}
