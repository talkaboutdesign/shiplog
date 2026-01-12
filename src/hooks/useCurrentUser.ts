import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";

export function useCurrentUser() {
  const { isSignedIn } = useAuth();
  const user = useQuery(api.users.getCurrent);
  const upsertUser = useMutation(api.users.upsert);

  useEffect(() => {
    if (isSignedIn && !user) {
      void upsertUser();
    }
  }, [isSignedIn, user, upsertUser]);

  return user;
}
