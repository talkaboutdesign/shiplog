import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SyncedReposEditor } from "@/components/github/SyncedReposEditor";
import { useSelectedRepo } from "@/hooks/useSelectedRepo";
import { cn } from "@/lib/utils";
import { Id } from "../../../convex/_generated/dataModel";

export function RepoSelector() {
  const { repos, selectedRepo, setSelectedRepoId, isLoading } = useSelectedRepo();
  const [showDropdown, setShowDropdown] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }

    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showDropdown]);

  if (isLoading) {
    return (
      <Button variant="outline" disabled className="gap-2">
        <RepoIcon />
        Loading...
      </Button>
    );
  }

  if (!repos || repos.length === 0) {
    return null;
  }

  const handleSelectRepo = (repoId: Id<"repositories">) => {
    setSelectedRepoId(repoId);
    setShowDropdown(false);
  };

  const handleEditClick = () => {
    setShowDropdown(false);
    setEditorOpen(true);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <Button
        variant="outline"
        className="gap-2"
        onClick={() => setShowDropdown(!showDropdown)}
      >
        <RepoIcon />
        <span className="max-w-[150px] truncate">
          {selectedRepo?.fullName || "Select repo"}
        </span>
        <ChevronIcon className={cn("transition-transform", showDropdown && "rotate-180")} />
      </Button>

      {/* Dropdown Menu */}
      {showDropdown && (
        <div className="absolute right-0 top-full mt-2 z-50 min-w-[220px] rounded-md border bg-popover text-popover-foreground p-1 shadow-lg backdrop-blur-0">
          {/* Repo List */}
          <div className="max-h-[300px] overflow-y-auto">
            {repos.map((repo) => (
              <button
                key={repo._id}
                onClick={() => handleSelectRepo(repo._id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  selectedRepo?._id === repo._id && "bg-accent"
                )}
              >
                {selectedRepo?._id === repo._id && (
                  <CheckIcon className="h-4 w-4" />
                )}
                <span className={cn(selectedRepo?._id !== repo._id && "pl-6")}>
                  {repo.fullName}
                </span>
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="my-1 h-px bg-border" />

          {/* Edit Synced Repos */}
          <button
            onClick={handleEditClick}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <EditIcon className="h-4 w-4" />
            <span>Edit synced repos</span>
          </button>
        </div>
      )}

      {/* SyncedReposEditor - controlled */}
      <SyncedReposEditor open={editorOpen} onOpenChange={setEditorOpen} />
    </div>
  );
}

function RepoIcon() {
  return (
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
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
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
      className={cn("h-4 w-4", className)}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
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
      className={cn("h-4 w-4", className)}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
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
      className={cn("h-4 w-4", className)}
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
