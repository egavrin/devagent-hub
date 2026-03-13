import type { CanonicalStore } from "../persistence/canonical-store.js";

export function resolveReviewableImportRepoRoot(
  store: CanonicalStore,
  workspaceId: string,
  repositoryId: string,
): string {
  const workspace = store.getWorkspace(workspaceId);
  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }

  const repository = store.getRepository(repositoryId);
  if (!repository) {
    throw new Error(`Repository ${repositoryId} not found`);
  }

  if (repository.workspaceId !== workspaceId) {
    throw new Error(`Repository ${repositoryId} does not belong to workspace ${workspaceId}`);
  }

  return repository.repoRoot;
}
