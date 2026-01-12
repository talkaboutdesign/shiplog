import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function useRepository() {
  return useQuery(api.repositories.getActive);
}
