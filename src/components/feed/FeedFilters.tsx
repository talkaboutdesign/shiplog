import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select } from "@/components/ui/select";
import type { GitHubEventType } from "../../../convex/types";

export interface FeedFilters {
  eventType: GitHubEventType | "all";
  contributor?: string;
  timeRange: "24h" | "7d" | "all";
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
      contributor: value || undefined,
    });
  };

  const handleTimeRangeChange = (value: string) => {
    onFiltersChange({
      ...filters,
      timeRange: value as FeedFilters["timeRange"],
    });
  };

  return (
    <div className="space-y-4">
      <Tabs value={filters.eventType} onValueChange={handleEventTypeChange}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="push">Push</TabsTrigger>
          <TabsTrigger value="pull_request">PR</TabsTrigger>
          <TabsTrigger value="issues">Issues</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex gap-4">
        {contributors.length > 0 && (
          <div className="flex-1">
            <Select
              value={filters.contributor || ""}
              onChange={(e) => handleContributorChange(e.target.value)}
            >
              <option value="">All contributors</option>
              {contributors.map((contributor) => (
                <option key={contributor} value={contributor}>
                  {contributor}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="flex-1">
          <Select
            value={filters.timeRange}
            onChange={(e) => handleTimeRangeChange(e.target.value)}
          >
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="all">All time</option>
          </Select>
        </div>
      </div>
    </div>
  );
}
