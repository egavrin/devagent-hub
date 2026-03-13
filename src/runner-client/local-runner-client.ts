import { join } from "node:path";
import { LocalRunner } from "@devagent-runner/local-runner";
import {
  ClaudeAdapter,
  CodexAdapter,
  DevAgentAdapter,
  OpenCodeAdapter,
} from "@devagent-runner/adapters";
import type { TaskExecutionEvent, TaskExecutionRequest, TaskExecutionResult } from "@devagent-sdk/types";
import { resolveBaselineRepoPath, resolveWorkspaceRoot } from "../baseline/manifest.js";
import type { RunnerClient } from "./types.js";
import type { WorkflowConfig } from "../workflow/config.js";

export class LocalRunnerClient implements RunnerClient {
  private readonly runner: LocalRunner;

  constructor(
    private readonly config: WorkflowConfig,
    devagentCliPath?: string,
  ) {
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
        new CodexAdapter((request) => this.resolveCommand(request)),
        new ClaudeAdapter((request) => this.resolveCommand(request)),
        new OpenCodeAdapter((request) => this.resolveCommand(request)),
      ],
    });
  }

  private resolveCommand(request: TaskExecutionRequest): string | undefined {
    const profile = request.executor.profileName
      ? this.config.profiles[request.executor.profileName]
      : undefined;
    return profile?.bin ?? this.config.runner.bin;
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

  inspect(runId: string): Promise<{ workspacePath: string; resultPath: string; eventLogPath: string }> {
    return this.runner.inspect(runId) as Promise<{ workspacePath: string; resultPath: string; eventLogPath: string }>;
  }

  cleanupRun(runId: string): Promise<void> {
    return (this.runner as LocalRunner & { cleanupRun(runId: string): Promise<void> }).cleanupRun(runId);
  }
}
