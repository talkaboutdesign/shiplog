import { expect } from "vitest";

/**
 * Test assertion helpers for security checks
 */

/**
 * Expect an ownership verification error
 */
export async function expectOwnershipError(
  promise: Promise<any>
): Promise<void> {
  await expect(promise).rejects.toThrowError(
    /Repository not found or unauthorized|Unauthorized/
  );
}

/**
 * Verify namespace format is repository-scoped
 */
export function expectNamespaceFormat(
  namespace: string,
  repositoryId: string
): void {
  expect(namespace).toBe(`repo-${repositoryId}`);
}

/**
 * Verify cache key format includes repositoryId
 */
export function expectCacheKeyFormat(
  key: string,
  repositoryId: string
): void {
  expect(key).toContain(repositoryId);
  // Key should follow pattern: {type}-${repositoryId}-${hash}
  // RepositoryId is an Id type, so we convert to string for regex matching
  const repoIdStr = String(repositoryId);
  expect(key).toMatch(new RegExp(`^\\w+-${repoIdStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-.+$`));
}

/**
 * Verify thread metadata includes repositoryId
 */
export function expectThreadMetadata(
  metadata: any,
  repositoryId: string
): void {
  expect(metadata).toHaveProperty("repositoryId");
  expect(metadata.repositoryId).toBe(repositoryId);
}

/**
 * Verify workflow context includes repositoryId
 */
export function expectWorkflowContext(
  context: any,
  repositoryId: string
): void {
  expect(context).toHaveProperty("repositoryId");
  expect(context.repositoryId).toBe(repositoryId);
}
