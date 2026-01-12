import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export function usePerspectives(digestId: Id<"digests"> | undefined) {
  return useQuery(
    api.digests.getPerspectivesByDigest,
    digestId ? { digestId } : "skip"
  );
}
