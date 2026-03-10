import { join } from "node:path";
import { LocalRunner } from "@devagent-runner/local-runner";
import {
  ClaudeAdapter,
  CodexAdapter,
  DevAgentAdapter,
  OpenCodeAdapter,
} from "@devagent-runner/adapters";
import type { TaskExecutionEvent, TaskExecutionRequest, TaskExecutionResult } from "@devagent-sdk/types";
import { loadBaselineManifest, resolveBaselineRepoPath, resolveWorkspaceRoot } from "../baseline/manifest.js";
import type { RunnerClient } from "./types.js";

export class LocalRunnerClient implements RunnerClient {
  private readonly runner: LocalRunner;

  constructor(devagentCliPath?: string) {
    const manifest = loadBaselineManifest();
    const workspaceRoot = resolveWorkspaceRoot();
    const resolvedDevagentCliPath = devagentCliPath ?? join(
      resolveBaselineRepoPath("devagent", workspaceRoot),
      "packages",
      "cli",
      "dist",
      "index.js",
    );
    this.runner = new LocalRunner({
      adapters: [
        new DevAgentAdapter(`bun ${resolvedDevagentCliPath}`),
        new CodexAdapter(),
        new ClaudeAdapter(),
        new OpenCodeAdapter(),
      ],
    });
  }

  startTask(request: TaskExecutionRequest): Promise<{ runId: string }> {
    return this.runner.startTask(request);
  }

  subscribe(runId: string, onEvent: (event: TaskExecutionEvent) => void): Promise<void> {
    return this.runner.subscribe(runId, onEvent);
  }

  cancel(runId: string): Promise<void> {
    return this.runner.cancel(runId);
  }

  awaitResult(runId: string): Promise<TaskExecutionResult> {
    return this.runner.awaitResult(runId);
  }

  inspect(runId: string): Promise<{ workspacePath: string; resultPath: string }> {
    return this.runner.inspect(runId) as Promise<{ workspacePath: string; resultPath: string }>;
  }

  cleanupRun(runId: string): Promise<void> {
    return (this.runner as LocalRunner & { cleanupRun(runId: string): Promise<void> }).cleanupRun(runId);
  }
}
