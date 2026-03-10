import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { CanonicalStore } from "../persistence/canonical-store.js";
import { PROTOCOL_VERSION, type TaskExecutionEvent, type TaskExecutionResult } from "@devagent-sdk/types";

const paths: string[] = [];

async function createStore(): Promise<{ store: CanonicalStore; dbPath: string }> {
  const dir = await mkdtemp(join(tmpdir(), "devagent-hub-store-"));
  paths.push(dir);
  const dbPath = join(dir, "state.db");
  return { store: new CanonicalStore(dbPath), dbPath };
}

afterEach(async () => {
  await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("CanonicalStore", () => {
  it("persists workflow snapshots with attempts, events, artifacts, and results", async () => {
    const { store } = await createStore();
    const project = store.upsertProject({
      id: "org/repo",
      name: "repo",
      repoRoot: "/tmp/repo",
      repoFullName: "org/repo",
      allowedExecutors: ["devagent"],
    });
    const workItem = store.upsertWorkItem({
      id: "org/repo:issue:42",
      projectId: project.id,
      kind: "github-issue",
      externalId: "42",
      title: "Fix workflow",
      state: "open",
      labels: ["devagent"],
      url: "https://github.com/org/repo/issues/42",
    });
    const workflow = store.createWorkflowInstance({
      projectId: project.id,
      workItemId: workItem.id,
      stage: "triage",
      status: "running",
      branch: "devagent/workflow/42-test",
    });
    const task = store.createTask({
      workflowInstanceId: workflow.id,
      type: "triage",
      status: "running",
      executorId: "devagent",
      runnerId: "local",
    });
    const attempt = store.createAttempt({
      taskId: task.id,
      executorId: "devagent",
      runnerId: "run-1",
      workspacePath: "/tmp/workspace",
    });
    const event: TaskExecutionEvent = {
      protocolVersion: PROTOCOL_VERSION,
      type: "started",
      at: "2026-03-10T00:00:00.000Z",
      taskId: task.id,
    };
    const result: TaskExecutionResult = {
      protocolVersion: PROTOCOL_VERSION,
      taskId: task.id,
      status: "success",
      artifacts: [
        {
          kind: "triage-report",
          path: "/tmp/workspace/triage-report.md",
          createdAt: "2026-03-10T00:00:01.000Z",
        },
      ],
      metrics: {
        startedAt: "2026-03-10T00:00:00.000Z",
        finishedAt: "2026-03-10T00:00:01.000Z",
        durationMs: 1000,
      },
    };

    store.recordEvent(task.id, event);
    store.recordArtifacts(task.id, result.artifacts);
    store.recordResult(task.id, result);
    store.finishAttempt(attempt.id, {
      status: "success",
      resultPath: "/tmp/workspace/result.json",
      workspacePath: "/tmp/workspace",
    });
    store.updateTask(task.id, {
      status: "completed",
      attemptIds: [attempt.id],
      runnerId: "run-1",
    });

    const snapshot = store.getWorkflowSnapshot(workflow.id);
    expect(snapshot.project.id).toBe(project.id);
    expect(snapshot.workItem.id).toBe(workItem.id);
    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.attempts).toHaveLength(1);
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.artifacts).toHaveLength(1);
    expect(snapshot.results).toHaveLength(1);

    store.close();
  });

  it("recovers persisted workflow state after restart", async () => {
    const { store, dbPath } = await createStore();
    const project = store.upsertProject({
      id: "org/repo",
      name: "repo",
      repoRoot: "/tmp/repo",
      repoFullName: "org/repo",
      allowedExecutors: ["devagent"],
    });
    const workItem = store.upsertWorkItem({
      id: "org/repo:issue:99",
      projectId: project.id,
      kind: "github-issue",
      externalId: "99",
      title: "Recover me",
      state: "open",
      labels: ["devagent"],
      url: "https://github.com/org/repo/issues/99",
    });
    const workflow = store.createWorkflowInstance({
      projectId: project.id,
      workItemId: workItem.id,
      stage: "plan",
      status: "waiting_approval",
      branch: "devagent/workflow/99-test",
    });
    store.createApproval({ workflowInstanceId: workflow.id, stage: "plan" });
    store.close();

    const reopened = new CanonicalStore(dbPath);
    const snapshot = reopened.getWorkflowSnapshot(workflow.id);
    expect(snapshot.workflow.status).toBe("waiting_approval");
    expect(snapshot.approvals).toHaveLength(1);
    reopened.close();
  });
});
