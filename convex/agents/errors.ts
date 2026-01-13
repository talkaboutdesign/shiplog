/**
 * Error handling utilities for agent operations
 */

/**
 * Check if an error is transient (should be retried)
 */
export function isTransientError(error: any): boolean {
  if (!error) return false;

  // Rate limit errors
  if (error.status === 429 || error.statusCode === 429) {
    return true;
  }

  // Timeout errors
  if (error.name === "TimeoutError" || error.message?.includes("timeout")) {
    return true;
  }

  // Network errors
  if (error.name === "NetworkError" || error.message?.includes("network")) {
    return true;
  }

  // 5xx server errors (retryable)
  if (error.status >= 500 && error.status < 600) {
    return true;
  }

  return false;
}

/**
 * Generate a fallback digest when AI generation fails
 */
export function generateFallbackDigest(event: any): {
  title: string;
  summary: string;
  category: "feature" | "bugfix" | "refactor" | "docs" | "chore" | "security";
  whyThisMatters: string;
} {
  const eventType = event.type;
  const payload = event.payload;

  let title = "Code changes";
  let category: "feature" | "bugfix" | "refactor" | "docs" | "chore" | "security" = "refactor";
  let summary = "Code changes were made to the repository.";
  let whyThisMatters = "These changes may affect the application's functionality.";

  if (eventType === "push") {
    const commits = payload.commits || [];
    const commitCount = commits.length;
    title = `Push: ${commitCount} commit${commitCount !== 1 ? "s" : ""}`;
    summary = `A developer pushed ${commitCount} commit${commitCount !== 1 ? "s" : ""} to the repository.`;
  } else if (eventType === "pull_request") {
    const pr = payload.pull_request;
    title = pr?.title || "Pull Request";
    summary = `A pull request was ${payload.action || "opened"}.`;
    if (pr?.body) {
      summary += ` ${pr.body.substring(0, 100)}`;
    }
  }

  return {
    title,
    summary,
    category,
    whyThisMatters,
  };
}

/**
 * Log structured output error for monitoring
 */
export function logStructuredOutputError(
  error: any,
  context: { eventId?: string; digestId?: string; provider?: string; [key: string]: any }
): void {
  console.error("Structured output error:", {
    error: error instanceof Error ? error.message : String(error),
    name: error?.name,
    statusCode: error?.statusCode,
    ...context,
  });
}
