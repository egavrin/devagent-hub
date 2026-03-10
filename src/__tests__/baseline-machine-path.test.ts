import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { DevAgentAdapter } from "@devagent-runner/adapters";
import { LocalRunner, readEventLog } from "@devagent-runner/local-runner";
import { validateTaskExecutionEvent, validateTaskExecutionRequest, validateTaskExecutionResult } from "@devagent-sdk/validation";
import type { TaskExecutionRequest } from "@devagent-sdk/types";
import { PROTOCOL_VERSION } from "@devagent-sdk/types";
import {
  devagentCommandArgs,
  fixturePath,
  readJson,
  repoPath,
  spawnProcess,
  uniqueTaskId,
} from "../baseline/test-helpers.js";

type TaskType = "triage" | "plan" | "implement" | "verify" | "review" | "repair";

const hubRoot = repoPath("devagent-hub");
const { command: devagentCommand, args: devagentArgs } = devagentCommandArgs();
const adapterCommand = [devagentCommand, ...devagentArgs].join(" ");
const tempPaths: string[] = [];

afterEach(async () => {
  while (tempPaths.length > 0) {
    await rm(tempPaths.pop()!, { recursive: true, force: true });
  }
  for (const taskType of ["triage", "plan", "implement", "review", "repair"] as const) {
    delete process.env[`DEVAGENT_EXECUTOR_FAKE_RESPONSE_${taskType.toUpperCase()}`];
  }
});

function fakeResponseForTask(taskType: TaskType): string {
  switch (taskType) {
    case "triage":
      return "# Triage Report\n\nIssue understanding\nSuggested next step";
    case "plan":
      return "# Plan\n\nImplementation steps\nTest strategy";
    case "implement":
      return "# Implementation Summary\n\nChanged files\nSummary of edits";
    case "review":
      return "# Review Report\n\nNo defects found.";
    case "repair":
      return "# Final Summary\n\nFixes applied\nRemaining concerns: none";
    case "verify":
      return "";
  }
}

async function loadRequest(taskType: TaskType): Promise<TaskExecutionRequest> {
  const fixtureName = taskType === "triage" ? "request-triage.json"
    : taskType === "plan" ? "request-plan.json"
    : taskType === "implement" ? "request-implement.json"
    : taskType === "verify" ? "request-verify.json"
    : taskType === "review" ? "request-review.json"
    : "request-repair.json";
  return readJson<TaskExecutionRequest>(fixturePath(fixtureName));
}

function normalizeRequest(taskType: TaskType, request: TaskExecutionRequest): TaskExecutionRequest {
  return {
    ...request,
    protocolVersion: PROTOCOL_VERSION,
    taskId: uniqueTaskId(`baseline-${taskType}`),
    project: {
      id: "egavrin/devagent-hub",
      name: "devagent-hub",
      repoRoot: hubRoot,
      repoFullName: "egavrin/devagent-hub",
    },
    workspace: {
      sourceRepoPath: hubRoot,
      baseRef: "main",
      workBranch: `baseline/${taskType}/${uniqueTaskId(taskType)}`,
      isolation: taskType === "verify" ? "temp-copy" : "git-worktree",
      readOnly: taskType === "review" || taskType === "verify",
    },
    executor: {
      executorId: "devagent",
      profileName: "baseline",
      provider: "chatgpt",
      model: "gpt-5.4",
      reasoning: "medium",
      approvalMode: "full-auto",
    },
    constraints: {
      maxIterations: 2,
      allowNetwork: true,
      verifyCommands: taskType === "verify"
        ? [`${process.execPath} -e "process.stdout.write('baseline verify ok')"`]
        : undefined,
    },
    context: {
      ...request.context,
      skills: [],
      changedFilesHint: request.context.changedFilesHint ?? [],
    },
  };
}

describe("baseline machine path", () => {
  it("runs all six task types and failure drills through runner -> devagent execute", async () => {
    const runner = new LocalRunner({
      adapters: [new DevAgentAdapter(adapterCommand)],
    });

    for (const taskType of ["triage", "plan", "implement", "verify", "review", "repair"] as const) {
      const request = normalizeRequest(taskType, await loadRequest(taskType));
      validateTaskExecutionRequest(request);
      if (taskType !== "verify") {
        process.env[`DEVAGENT_EXECUTOR_FAKE_RESPONSE_${taskType.toUpperCase()}`] = fakeResponseForTask(taskType);
      }

      const { runId } = await runner.startTask(request);
      await runner.subscribe(runId, () => {});
      const result = await runner.awaitResult(runId);
      const metadata = await runner.inspect(runId) as { eventLogPath: string };
      const events = await readEventLog(metadata.eventLogPath);

      expect(validateTaskExecutionResult(result)).toBe(result);
      for (const event of events) {
        expect(validateTaskExecutionEvent(event)).toBe(event);
      }

      expect(result.status, `${taskType}: ${result.error?.code ?? "no-code"} ${result.error?.message ?? "no-message"}`).toBe("success");
      expect(events.some((event) => event.type === "started")).toBe(true);
      expect(events.some((event) => event.type === "artifact")).toBe(true);
      expect(events.some((event) => event.type === "completed" && event.status === "success")).toBe(true);
      expect(result.artifacts).toHaveLength(1);
      expect(existsSync(result.artifacts[0]!.path)).toBe(true);
      await runner.cleanupRun(runId);
    }

    expect(() => validateTaskExecutionRequest({
      protocolVersion: PROTOCOL_VERSION,
      taskId: "invalid",
    })).toThrow();

    const badVerify = normalizeRequest("verify", await loadRequest("verify"));
    badVerify.taskId = uniqueTaskId("baseline-bad-verify");
    badVerify.constraints.verifyCommands = ["definitely-not-a-real-command-12345"];
    const badVerifyRun = await runner.startTask(badVerify);
    const badVerifyResult = await runner.awaitResult(badVerifyRun.runId);
    expect(validateTaskExecutionResult(badVerifyResult).status).toBe("failed");
    await runner.cleanupRun(badVerifyRun.runId);

    const unsupported = normalizeRequest("plan", await loadRequest("plan"));
    unsupported.taskId = uniqueTaskId("baseline-unsupported");
    unsupported.constraints.allowNetwork = false;
    const unsupportedRun = await runner.startTask(unsupported);
    const unsupportedResult = await runner.awaitResult(unsupportedRun.runId);
    expect(validateTaskExecutionResult(unsupportedResult).status).toBe("failed");
    await runner.cleanupRun(unsupportedRun.runId);

    const cancelRequest = normalizeRequest("verify", await loadRequest("verify"));
    cancelRequest.taskId = uniqueTaskId("baseline-cancel");
    cancelRequest.constraints.verifyCommands = [`${process.execPath} -e "setTimeout(() => {}, 30000)"`];
    const cancelRun = await runner.startTask(cancelRequest);
    await runner.subscribe(cancelRun.runId, () => {});
    await runner.cancel(cancelRun.runId);
    const cancelled = await runner.awaitResult(cancelRun.runId);
    expect(validateTaskExecutionResult(cancelled).status).toBe("cancelled");
    await runner.cleanupRun(cancelRun.runId);

    const request = normalizeRequest("plan", await loadRequest("plan"));
    const tempDir = await mkdtemp(join(tmpdir(), "devagent-missing-artifact-"));
    tempPaths.push(tempDir);
    const requestPath = join(tempDir, "request.json");
    await writeFile(requestPath, JSON.stringify(request, null, 2));
    const missingArtifact = await spawnProcess(devagentCommand, [
      ...devagentArgs,
      "execute",
      "--request",
      requestPath,
      "--artifact-dir",
      join("/dev/null", "artifacts"),
    ], {
      cwd: hubRoot,
      env: {
        DEVAGENT_EXECUTOR_FAKE_RESPONSE_PLAN: fakeResponseForTask("plan"),
      },
    });
    expect(missingArtifact.code).not.toBe(0);
  }, 120000);
});
