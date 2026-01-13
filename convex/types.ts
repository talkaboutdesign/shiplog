import { Doc, Id } from "./_generated/dataModel";

export type User = Doc<"users">;
export type Repository = Doc<"repositories">;
export type Event = Doc<"events">;
export type Digest = Doc<"digests">;

export type UserId = Id<"users">;
export type RepositoryId = Id<"repositories">;
export type EventId = Id<"events">;
export type DigestId = Id<"digests">;

export type EventStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "skipped";
export type DigestCategory =
  | "feature"
  | "bugfix"
  | "refactor"
  | "docs"
  | "chore"
  | "security";
export type AIProvider = "openai" | "anthropic" | "openrouter";
export type GitHubEventType =
  | "push"
  | "pull_request";

// File diff from GitHub API
export interface FileDiff {
  filename: string;
  status: "added" | "removed" | "modified" | "renamed";
  additions: number;
  deletions: number;
  changes?: number;
  patch?: string;
  previous_filename?: string;
}

// Perspective type for digest perspectives
export type PerspectiveType = "feature" | "bugfix" | "refactor" | "docs" | "security" | "ui" | "performance";

// Perspective generated for digest
export interface Perspective {
  perspective: PerspectiveType;
  title: string;
  summary: string;
  confidence: number;
}
