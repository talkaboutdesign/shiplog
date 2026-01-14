import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SyncedReposEditor } from "@/components/github/SyncedReposEditor";
import { useSelectedRepo } from "@/hooks/useSelectedRepo";
import { cn } from "@/lib/utils";
import { Id } from "../../../convex/_generated/dataModel";
import { FolderGit, ChevronDown, Check, Pencil } from "lucide-react";

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
        <FolderGit className="h-4 w-4" />
        Loading…
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
        <FolderGit className="h-4 w-4" />
        <span className="max-w-[150px] truncate">
          {selectedRepo?.fullName || "Select repo"}
        </span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", showDropdown && "rotate-180")} />
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
                  <Check className="h-4 w-4" />
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
            <Pencil className="h-4 w-4" />
            <span>Edit synced repos</span>
          </button>
        </div>
      )}

      {/* SyncedReposEditor - controlled */}
      <SyncedReposEditor open={editorOpen} onOpenChange={setEditorOpen} />
    </div>
  );
}
