import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

export function useEvents(repositoryId: Id<"repositories"> | undefined) {
  return useQuery(
    api.events.listByRepository,
    repositoryId === undefined ? "skip" : { repositoryId }
  );
}
