import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

const STORAGE_KEY = "shiplog_selected_repo";

interface SelectedRepoContextValue {
  repos: ReturnType<typeof useQuery<typeof api.repositories.getAllActive>>;
  selectedRepo: { _id: Id<"repositories">; fullName: string } | null;
  selectedRepoId: Id<"repositories"> | null;
  setSelectedRepoId: (id: Id<"repositories"> | null) => void;
  isLoading: boolean;
}

const SelectedRepoContext = createContext<SelectedRepoContextValue | null>(null);

export function SelectedRepoProvider({ children }: { children: ReactNode }) {
  const activeRepos = useQuery(api.repositories.getAllActive);
  const [selectedRepoId, setSelectedRepoIdState] = useState<Id<"repositories"> | null>(() => {
    // Initialize from localStorage
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (stored as Id<"repositories">) : null;
  });

  // Update localStorage when selection changes
  const setSelectedRepoId = useCallback((id: Id<"repositories"> | null) => {
    // Update state first, then localStorage
    // This ensures React re-renders immediately
    setSelectedRepoIdState(id);
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // When repos load, validate the stored selection
  useEffect(() => {
    if (activeRepos === undefined) return;

    if (activeRepos.length === 0) {
      // No repos, clear selection
      setSelectedRepoId(null);
      return;
    }

    // Check if stored selection is still valid
    const storedId = localStorage.getItem(STORAGE_KEY);
    if (storedId) {
      const isValid = activeRepos.some((r) => r._id === storedId);
      if (isValid) {
        // Use setSelectedRepoId to ensure state and localStorage stay in sync
        setSelectedRepoId(storedId as Id<"repositories">);
        return;
      }
    }

    // If no valid selection, select first repo
    setSelectedRepoId(activeRepos[0]._id);
  }, [activeRepos, setSelectedRepoId]);

  // Get the selected repo object
  const selectedRepo = activeRepos?.find((r) => r._id === selectedRepoId) || activeRepos?.[0] || null;

  const value: SelectedRepoContextValue = {
    repos: activeRepos,
    selectedRepo,
    selectedRepoId: selectedRepoId, // Return state directly, not derived from selectedRepo
    setSelectedRepoId,
    isLoading: activeRepos === undefined,
  };

  return <SelectedRepoContext.Provider value={value}>{children}</SelectedRepoContext.Provider>;
}

export function useSelectedRepo() {
  const context = useContext(SelectedRepoContext);
  if (!context) {
    throw new Error("useSelectedRepo must be used within SelectedRepoProvider");
  }
  return context;
}
