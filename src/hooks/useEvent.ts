import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export function useEvent(digestId: Id<"digests"> | undefined) {
  return useQuery(
    api.digests.getEventByDigest,
    digestId ? { digestId } : "skip"
  );
}
