import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Loader2, RefreshCw, Search, X } from "lucide-react";
import type { Repository } from "../../../convex/types";

interface SyncedReposEditorProps {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SyncedReposEditor({ children, open: controlledOpen, onOpenChange }: SyncedReposEditorProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const allRepos = useQuery(api.repositories.getAllAvailable);
  const activeRepos = useQuery(api.repositories.getAllActive);
  const toggleSync = useMutation(api.repositories.toggleSyncStatus);
  const refreshRepos = useAction(api.repositories.refreshRepos);

  const activeRepoIds = useMemo(
    () => new Set(activeRepos?.map((r) => r._id) || []),
    [activeRepos]
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshRepos();
      // The queries will automatically refetch
    } catch (error) {
      console.error("Failed to refresh repos:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Auto-refresh when editor opens if data is stale or missing
  useEffect(() => {
    if (!isOpen || !allRepos || isRefreshing) return;

    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    const isStale = allRepos.length === 0 || 
      allRepos.some((repo) => !repo.lastSyncedAt || repo.lastSyncedAt < fiveMinutesAgo);

    if (isStale) {
      handleRefresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); // Only check when editor opens

  const filteredRepos = useMemo(() => {
    if (!allRepos) return [];
    if (!searchQuery.trim()) return allRepos;

    const query = searchQuery.toLowerCase();
    return allRepos.filter(
      (repo) =>
        repo.name.toLowerCase().includes(query) ||
        repo.fullName.toLowerCase().includes(query) ||
        repo.owner.toLowerCase().includes(query)
    );
  }, [allRepos, searchQuery]);

  // Group repos by owner
  const groupedRepos = useMemo(() => {
    const groups = new Map<string, Repository[]>();
    filteredRepos.forEach((repo) => {
      const owner = repo.owner;
      if (!groups.has(owner)) {
        groups.set(owner, []);
      }
      groups.get(owner)!.push(repo);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredRepos]);

  const selectedRepos = useMemo(() => {
    return filteredRepos.filter((repo) => activeRepoIds.has(repo._id));
  }, [filteredRepos, activeRepoIds]);

  const handleToggle = async (repoId: string, currentStatus: boolean) => {
    await toggleSync({
      repositoryId: repoId as any,
      isActive: !currentStatus,
    });
  };

  const handleSave = () => {
    setIsOpen(false);
    setSearchQuery("");
  };

  if (allRepos === undefined || activeRepos === undefined) {
    return (
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        {children && <SheetTrigger asChild>{children}</SheetTrigger>}
        <SheetContent side="right" className="w-[500px] sm:w-[600px] overflow-y-auto">
          <div className="flex items-center justify-center h-full px-6">
            <div className="text-muted-foreground">Loading repositories...</div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  const activeCount = activeRepos.length;
  const totalCount = allRepos.length;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      {children && <SheetTrigger asChild>{children}</SheetTrigger>}
      <SheetContent side="right" className="w-[500px] sm:w-[600px] flex flex-col overflow-hidden">
        <SheetHeader className="px-6 pt-6 pb-0">
          <SheetTitle>Synced repos</SheetTitle>
          <SheetDescription>
            Select the repos you would like to sync to ShipLog. Repos must be
            synced in order to review and contribute to them. If you are missing
            a repo in the list below make sure that ShipLog has access to it in
            your authentication settings.
          </SheetDescription>
        </SheetHeader>

        {/* Fixed section: Status bar and search */}
        <div className="px-6 mt-8 space-y-6 shrink-0">
          {/* Status bar */}
          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">
              {activeCount} of {totalCount} repos synced
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="gap-2"
            >
              {isRefreshing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Refreshing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </>
              )}
            </Button>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search repositories"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable section: Repository list */}
        <div className="flex-1 overflow-y-auto px-6 py-6 min-h-0">
          <div className="space-y-8">
            {/* Selected repositories section */}
            {selectedRepos.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Selected repositories</h3>
                <div className="space-y-1 rounded-lg border bg-muted/50 p-4">
                  {selectedRepos.map((repo) => {
                    const isActive = activeRepoIds.has(repo._id);
                    return (
                      <label
                        key={repo._id}
                        className="flex items-center gap-3 p-2 rounded hover:bg-background cursor-pointer"
                      >
                        <Checkbox
                          checked={isActive}
                          onCheckedChange={() => handleToggle(repo._id, isActive)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div 
                          className="flex-1 min-w-0"
                          onClick={(e) => {
                            e.preventDefault();
                            handleToggle(repo._id, isActive);
                          }}
                        >
                          <div className="font-medium truncate">{repo.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {repo.fullName}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Grouped repositories - show unselected repos grouped by owner */}
            {groupedRepos.length > 0 && (
              <div className="space-y-6">
                {groupedRepos.map(([owner, repos]) => {
                  // Only show unselected repos in the grouped section
                  const unselectedRepos = repos.filter((repo) => !activeRepoIds.has(repo._id));
                  
                  if (unselectedRepos.length === 0) {
                    return null;
                  }

                  return (
                    <div key={owner} className="space-y-3">
                      <h3 className="text-sm font-semibold">{owner}</h3>
                      <div className="space-y-1">
                        {unselectedRepos.map((repo) => {
                          const isActive = activeRepoIds.has(repo._id);
                          return (
                            <label
                              key={repo._id}
                              className="flex items-center gap-3 p-2 rounded hover:bg-muted cursor-pointer"
                            >
                              <Checkbox
                                checked={isActive}
                                onCheckedChange={() => handleToggle(repo._id, isActive)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div 
                                className="flex-1 min-w-0"
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleToggle(repo._id, isActive);
                                }}
                              >
                                <div className="font-medium truncate">
                                  {repo.name}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {repo.fullName}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {filteredRepos.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                No repositories found
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex justify-end gap-3 border-t pt-6 pb-6 px-6 shrink-0">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
