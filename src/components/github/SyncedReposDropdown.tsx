import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SyncedReposEditor } from "./SyncedReposEditor";
import type { Repository } from "../../../convex/types";

export function SyncedReposDropdown() {
  const activeRepos = useQuery(api.repositories.getAllActive);
  const [isOpen, setIsOpen] = useState(false);

  if (activeRepos === undefined) {
    return (
      <Button variant="outline" disabled>
        Loading...
      </Button>
    );
  }

  const count = activeRepos.length;

  if (count === 0) {
    return null;
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
          </svg>
          {count} {count === 1 ? "repo" : "repos"} selected
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Synced repos</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-2">
          {activeRepos.map((repo) => (
            <div
              key={repo._id}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              <div className="flex-1">
                <div className="font-medium">{repo.fullName}</div>
                <div className="text-sm text-muted-foreground">{repo.owner}</div>
              </div>
            </div>
          ))}
          <div className="border-t pt-4">
            <SyncedReposEditor>
              <Button variant="outline" className="w-full gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit synced repos
              </Button>
            </SyncedReposEditor>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
