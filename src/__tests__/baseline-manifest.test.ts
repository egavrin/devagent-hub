import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";
import { resolveWorkspaceRoot } from "../baseline/manifest.js";

describe("baseline manifest helpers", () => {
  it("resolves sibling workspace roots from runner worktree paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "devagent-hub-baseline-"));
    try {
      await Promise.all([
        mkdir(join(root, "devagent-sdk"), { recursive: true }),
        mkdir(join(root, "devagent-runner"), { recursive: true }),
        mkdir(join(root, "devagent"), { recursive: true }),
        mkdir(join(root, "devagent-hub", ".devagent-runner", "workspaces", "workflow-1"), { recursive: true }),
      ]);

      const hubWorktreeRoot = join(root, "devagent-hub", ".devagent-runner", "workspaces", "workflow-1");
      expect(resolveWorkspaceRoot(hubWorktreeRoot)).toBe(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
