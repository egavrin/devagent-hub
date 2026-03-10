import React from "react";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { CanonicalStore } from "../persistence/canonical-store.js";
import { HubApp } from "../tui/app.js";

const paths: string[] = [];

async function createStore(): Promise<CanonicalStore> {
  const dir = await mkdtemp(join(tmpdir(), "devagent-hub-tui-"));
  paths.push(dir);
  const store = new CanonicalStore(join(dir, "state.db"));
  const project = store.upsertProject({
    id: "org/repo",
    name: "repo",
    repoRoot: "/tmp/repo",
    repoFullName: "org/repo",
    allowedExecutors: ["devagent", "codex"],
  });
  const workItem = store.upsertWorkItem({
    id: "org/repo:issue:42",
    projectId: project.id,
    kind: "github-issue",
    externalId: "42",
    title: "TUI issue",
    state: "open",
    labels: ["devagent"],
    url: "https://github.com/org/repo/issues/42",
  });
  store.createWorkflowInstance({
    projectId: project.id,
    workItemId: workItem.id,
    stage: "plan",
    status: "waiting_approval",
    branch: "devagent/workflow/42-test",
    baseBranch: "main",
    baseSha: "abc123",
    baselineSnapshot: {
      targetBranch: "main",
      targetBaseSha: "abc123",
      system: {
        protocolVersion: "0.1",
        sdkSha: "sdk",
        runnerSha: "runner",
        devagentSha: "devagent",
        hubSha: "hub",
      },
    },
  });
  return store;
}

afterEach(async () => {
  await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("HubApp", () => {
  it("renders inbox and run detail from the canonical store", async () => {
    const store = await createStore();
    const workflow = store.listWorkflowInstances()[0]!;

    const inbox = render(<HubApp store={store} screen="inbox" />);
    expect(inbox.lastFrame()).toContain("Inbox");
    expect(inbox.lastFrame()).toContain("TUI issue");
    inbox.unmount();

    const detail = render(<HubApp store={store} screen="detail" workflowId={workflow.id} />);
    expect(detail.lastFrame()).toContain("Run Detail");
    expect(detail.lastFrame()).toContain("Issue #42");
    expect(detail.lastFrame()).toContain("Approvals");
    detail.unmount();

    store.close();
  });
});
