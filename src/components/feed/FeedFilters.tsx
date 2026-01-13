import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GitHubEventType } from "../../../convex/types";

export interface FeedFilters {
  eventType: GitHubEventType | "all";
  contributor?: string;
  timeRange: "24h" | "7d" | "30d";
}

interface FeedFiltersProps {
  filters: FeedFilters;
  onFiltersChange: (filters: FeedFilters) => void;
  contributors?: string[];
}

export function FeedFilters({
  filters,
  onFiltersChange,
  contributors = [],
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
      contributor: value === "all" ? undefined : value,
    });
  };

  const handleTimeRangeChange = (value: string) => {
    onFiltersChange({
      ...filters,
      timeRange: value as FeedFilters["timeRange"],
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

      {contributors.length > 0 && (
        <Select
          value={filters.contributor || "all"}
          onValueChange={handleContributorChange}
        >
          <SelectTrigger className="w-auto min-w-[140px]">
            <SelectValue placeholder="All contributors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All contributors</SelectItem>
            {contributors.map((contributor) => (
              <SelectItem key={contributor} value={contributor}>
                {contributor}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select value={filters.timeRange} onValueChange={handleTimeRangeChange}>
        <SelectTrigger className="w-auto min-w-[140px]">
          <SelectValue placeholder="Time range" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="24h">Last 24 hours</SelectItem>
          <SelectItem value="7d">Last 7 days</SelectItem>
          <SelectItem value="30d">Last 30 days</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
