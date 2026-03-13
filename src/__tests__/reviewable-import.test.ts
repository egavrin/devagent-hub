import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { CanonicalStore } from "../persistence/canonical-store.js";
import { resolveReviewableImportRepoRoot } from "../cli/reviewable-import.js";

const paths: string[] = [];

async function createStore(): Promise<CanonicalStore> {
  const dir = await mkdtemp(join(tmpdir(), "devagent-hub-reviewable-import-"));
  paths.push(dir);
  return new CanonicalStore(join(dir, "state.db"));
}

afterEach(async () => {
  await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("resolveReviewableImportRepoRoot", () => {
  it("returns the requested repository root when the repository belongs to the workspace", async () => {
    const store = await createStore();
    store.upsertWorkspace({
      id: "workspace-1",
      name: "workspace",
      provider: "github",
      primaryRepositoryId: "workspace-1:primary",
      allowedExecutors: ["devagent"],
    });
    store.upsertRepository({
      id: "workspace-1:primary",
      workspaceId: "workspace-1",
      alias: "primary",
      name: "repo",
      repoRoot: "/tmp/repo",
      repoFullName: "org/repo",
      defaultBranch: "main",
      provider: "github",
    });

    expect(resolveReviewableImportRepoRoot(store, "workspace-1", "workspace-1:primary")).toBe("/tmp/repo");

    store.close();
  });

  it("rejects repositories outside the requested workspace", async () => {
    const store = await createStore();
    store.upsertWorkspace({
      id: "workspace-1",
      name: "workspace-1",
      provider: "github",
      primaryRepositoryId: "workspace-1:primary",
      allowedExecutors: ["devagent"],
    });
    store.upsertWorkspace({
      id: "workspace-2",
      name: "workspace-2",
      provider: "github",
      primaryRepositoryId: "workspace-2:primary",
      allowedExecutors: ["devagent"],
    });
    store.upsertRepository({
      id: "workspace-2:primary",
      workspaceId: "workspace-2",
      alias: "primary",
      name: "repo",
      repoRoot: "/tmp/repo-2",
      repoFullName: "org/repo-2",
      defaultBranch: "main",
      provider: "github",
    });

    expect(() => resolveReviewableImportRepoRoot(store, "workspace-1", "workspace-2:primary"))
      .toThrow(/does not belong to workspace workspace-1/);

    store.close();
  });
});
