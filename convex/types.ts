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
export type AIProvider = "openai" | "anthropic";
export type GitHubEventType =
  | "push"
  | "pull_request"
  | "pull_request_review"
  | "issues";
