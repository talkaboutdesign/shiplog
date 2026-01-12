import { useDigests } from "@/hooks/useDigests";
import { DigestCard } from "./DigestCard";
import { FeedSkeleton } from "./FeedSkeleton";
import { EmptyFeed } from "./EmptyFeed";
import { Id } from "../../../convex/_generated/dataModel";

interface ActivityFeedProps {
  repositoryId: Id<"repositories"> | undefined;
}

export function ActivityFeed({ repositoryId }: ActivityFeedProps) {
  const digests = useDigests(repositoryId);

  if (digests === undefined) {
    return <FeedSkeleton />;
  }

  if (digests.length === 0) {
    return <EmptyFeed />;
  }

  return (
    <div className="space-y-4">
      {digests.map((digest) => (
        <DigestCard key={digest._id} digest={digest} />
      ))}
    </div>
  );
}
