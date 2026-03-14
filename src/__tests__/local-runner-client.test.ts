import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, test } from "vitest";
import { LocalRunnerClient } from "../runner-client/local-runner-client.js";
import { defaultConfig } from "../workflow/config.js";
import { PROTOCOL_VERSION, type TaskExecutionRequest } from "@devagent-sdk/types";
import { buildNodeScriptCommand } from "../runtime/node-runtime.js";

const tempPaths: string[] = [];

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempPaths.push(dir);
  return dir;
}

async function createRepo(): Promise<string> {
  const repo = await createTempDir("devagent-hub-runner-client-");
  await mkdir(repo, { recursive: true });
  await writeFile(join(repo, "README.md"), "# repo\n");
  return repo;
}

async function createStub(path: string, response: string): Promise<void> {
  await writeFile(path, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
const outIndex = args.indexOf("-o");
if (outIndex >= 0) fs.writeFileSync(args[outIndex + 1], ${JSON.stringify(response + "\n")});
process.stdout.write(JSON.stringify({ type: "thread.started" }) + "\\n");
process.stdout.write(JSON.stringify({ type: "turn.started" }) + "\\n");
process.stdout.write(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: ${JSON.stringify(response)} } }) + "\\n");
process.stdout.write(JSON.stringify({ type: "turn.completed" }) + "\\n");
`);
  await chmod(path, 0o755);
}

function createRequest(
  repoRoot: string,
  taskId: string,
  profileName?: string,
): TaskExecutionRequest {
  const workspaceId = "workspace-1";
  const repositoryId = "repo-1";
  return {
    protocolVersion: PROTOCOL_VERSION,
    taskId,
    taskType: "triage",
    workspaceRef: {
      id: workspaceId,
      name: "Runner Client Workspace",
      provider: "github",
      primaryRepositoryId: repositoryId,
    },
    repositories: [{
      id: repositoryId,
      workspaceId,
      alias: "primary",
      name: "repo",
      repoRoot,
      repoFullName: "org/repo",
      defaultBranch: "main",
      provider: "github",
    }],
    workItem: {
      id: "issue-1",
      kind: "github-issue",
      externalId: "1",
      title: "Runner client",
      repositoryId,
    },
    execution: {
      primaryRepositoryId: repositoryId,
      repositories: [{
        repositoryId,
        alias: "primary",
        sourceRepoPath: repoRoot,
        workBranch: `devagent/workflow/${taskId}`,
        isolation: "temp-copy",
      }],
    },
    targetRepositoryIds: [repositoryId],
    executor: {
      executorId: "codex",
      profileName,
      model: "test-model",
    },
    constraints: {},
    capabilities: {
      canSyncTasks: true,
      canCreateTask: true,
      canComment: true,
      canReview: true,
      canMerge: true,
      canOpenReviewable: true,
    },
    context: {
      summary: "runner client test",
    },
    expectedArtifacts: ["triage-report"],
  };
}

afterEach(async () => {
  while (tempPaths.length > 0) {
    await rm(tempPaths.pop()!, { recursive: true, force: true });
  }
});

test("LocalRunnerClient uses profile bin before runner.bin", async () => {
  const repo = await createRepo();
  const root = await createTempDir("devagent-hub-runner-client-stubs-");
  const runnerStub = join(root, "runner-codex-stub.js");
  const profileStub = join(root, "profile-codex-stub.js");
  await createStub(runnerStub, "runner bin output");
  await createStub(profileStub, "profile bin output");

  const config = defaultConfig();
  config.runner.bin = `${process.execPath} ${runnerStub}`;
  config.profiles.codex_profile = {
    bin: `${process.execPath} ${profileStub}`,
  };

  const client = new LocalRunnerClient(config);
  const { runId } = await client.startTask(createRequest(repo, "task-profile-bin", "codex_profile"));
  const result = await client.awaitResult(runId);

  assert.equal(result.status, "success");
  assert.match(await readFile(result.artifacts[0]!.path, "utf-8"), /profile bin output/);
});

test("LocalRunnerClient falls back to runner.bin when profile bin is absent", async () => {
  const repo = await createRepo();
  const root = await createTempDir("devagent-hub-runner-client-default-");
  const runnerStub = join(root, "runner-codex-stub.js");
  await createStub(runnerStub, "runner bin output");

  const config = defaultConfig();
  config.runner.bin = `${process.execPath} ${runnerStub}`;

  const client = new LocalRunnerClient(config);
  const { runId } = await client.startTask(createRequest(repo, "task-runner-bin"));
  const result = await client.awaitResult(runId);

  assert.equal(result.status, "success");
  assert.match(await readFile(result.artifacts[0]!.path, "utf-8"), /runner bin output/);
});

test("LocalRunnerClient launches the default DevAgent CLI through Node", async () => {
  const config = defaultConfig();
  const client = new LocalRunnerClient(config, "/tmp/devagent cli.js");

  const devagentAdapter = (client as any).runner.adapters[0];

  assert.equal(devagentAdapter.command, buildNodeScriptCommand("/tmp/devagent cli.js"));
});
