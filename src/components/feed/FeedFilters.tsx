import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select } from "@/components/ui/select";
import type { GitHubEventType } from "../../../convex/types";
import type { Repository } from "../../../convex/types";
import { Id } from "../../../convex/_generated/dataModel";

export interface FeedFilters {
  eventType: GitHubEventType | "all";
  contributor?: string;
  timeRange: "24h" | "7d" | "all";
  repositoryId?: Id<"repositories"> | "all";
}

interface FeedFiltersProps {
  filters: FeedFilters;
  onFiltersChange: (filters: FeedFilters) => void;
  contributors?: string[];
  repositories?: Repository[];
}

export function FeedFilters({
  filters,
  onFiltersChange,
  contributors = [],
  repositories = [],
}: FeedFiltersProps) {
  const handleEventTypeChange = (value: string) => {
    onFiltersChange({
      ...filters,
      eventType: value as FeedFilters["eventType"],
    });
  };

  const handleContributorChange = (value: string) => {
    onFiltersChange({
      ...filters,
      contributor: value || undefined,
    });
  };

  const handleTimeRangeChange = (value: string) => {
    onFiltersChange({
      ...filters,
      timeRange: value as FeedFilters["timeRange"],
    });
  };

  const handleRepositoryChange = (value: string) => {
    onFiltersChange({
      ...filters,
      repositoryId: value === "all" ? "all" : (value as Id<"repositories">),
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Tabs value={filters.eventType} onValueChange={handleEventTypeChange}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="push">Push</TabsTrigger>
          <TabsTrigger value="pull_request">PR</TabsTrigger>
        </TabsList>
      </Tabs>

      {repositories.length > 1 && (
        <Select
          value={filters.repositoryId || "all"}
          onChange={(e) => handleRepositoryChange(e.target.value)}
          className="w-auto"
        >
          <option value="all">All repositories</option>
          {repositories.map((repo) => (
            <option key={repo._id} value={repo._id}>
              {repo.fullName}
            </option>
          ))}
        </Select>
      )}

      {contributors.length > 0 && (
        <Select
          value={filters.contributor || ""}
          onChange={(e) => handleContributorChange(e.target.value)}
          className="w-auto"
        >
          <option value="">All contributors</option>
          {contributors.map((contributor) => (
            <option key={contributor} value={contributor}>
              {contributor}
            </option>
          ))}
        </Select>
      )}

      <Select
        value={filters.timeRange}
        onChange={(e) => handleTimeRangeChange(e.target.value)}
        className="w-auto"
      >
        <option value="24h">Last 24 hours</option>
        <option value="7d">Last 7 days</option>
        <option value="all">All time</option>
      </Select>
    </div>
  );
}
