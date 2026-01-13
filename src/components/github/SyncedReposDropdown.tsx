import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SyncedReposEditor } from "./SyncedReposEditor";
import { FolderGit, ChevronDown, Pencil } from "lucide-react";
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
          <FolderGit className="h-4 w-4" />
          {count} {count === 1 ? "repo" : "repos"} selected
          <ChevronDown className="h-4 w-4" />
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
                <Pencil className="h-4 w-4" />
                Edit synced repos
              </Button>
            </SyncedReposEditor>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
