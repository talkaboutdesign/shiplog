import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

export function useDigests(repositoryId: Id<"repositories"> | undefined) {
  return useQuery(
    api.digests.listByRepository,
    repositoryId ? { repositoryId, limit: 50 } : "skip"
  );
}
