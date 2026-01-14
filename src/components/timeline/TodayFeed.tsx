import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DigestCard } from "@/components/feed/DigestCard";
import type { Id } from "../../../convex/_generated/dataModel";

interface TodayFeedProps {
  repositoryId: Id<"repositories"> | null;
}

export function TodayFeed({ repositoryId }: TodayFeedProps) {
  const [allDigests, setAllDigests] = useState<any[]>([]);
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Query for today's feed with pagination
  const feedData = useQuery(
    api.timeline.getTodayFeed,
    repositoryId ? { repositoryId, cursor, limit: 10 } : "skip"
  );

  // Reset when repository changes
  useEffect(() => {
    setAllDigests([]);
    setCursor(undefined);
  }, [repositoryId]);

  // Accumulate digests when new data arrives
  useEffect(() => {
    if (feedData === undefined) return;

    if (cursor === undefined) {
      // Initial load - replace all
      setAllDigests(feedData.digests);
    } else {
      // Loading more - append unique items
      setAllDigests((prev) => {
        const existingIds = new Set(prev.map((d) => d._id));
        const newItems = feedData.digests.filter((d: any) => !existingIds.has(d._id));
        return [...prev, ...newItems];
      });
    }
    setIsLoadingMore(false);
  }, [feedData, cursor]);

  const handleLoadMore = () => {
    if (!feedData?.hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    setCursor(feedData.nextCursor);
  };

  // Loading state
  if (feedData === undefined && cursor === undefined) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Today</h2>
        <div className="space-y-4">
          <FeedSkeleton />
          <FeedSkeleton />
          <FeedSkeleton />
        </div>
      </div>
    );
  }

  // No repository selected
  if (!repositoryId) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Today</h2>
        <p className="text-muted-foreground">Select a repository to view activity.</p>
      </div>
    );
  }

  // Empty state
  if (allDigests.length === 0 && feedData && !feedData.hasMore) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Today</h2>
        <div className="text-center py-8 text-muted-foreground">
          <p>No activity yet today</p>
          <p className="text-sm mt-1">New commits and pull requests will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Today</h2>

      {/* Digest items */}
      {/* Note: Pagination (limit: 10) keeps list manageable. 
          If allDigests exceeds 50 items after multiple "Load More" clicks, 
          consider virtualization (e.g., @tanstack/react-virtual) for better performance. */}
      <div className="space-y-4">
        {allDigests.map((digest, index) => (
          <DigestCard
            key={digest._id}
            digest={digest}
            index={index}
          />
        ))}
      </div>

      {/* Load more button */}
      {feedData?.hasMore && (
        <div className="flex justify-center pt-4">
          <Button
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            variant="outline"
            aria-label="Load more activity"
          >
            {isLoadingMore ? "Loading…" : "Load More"}
          </Button>
        </div>
      )}
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
