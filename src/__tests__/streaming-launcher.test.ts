import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { StreamingLauncher } from "../runner/streaming-launcher.js";
import { ProcessRegistry } from "../runner/process-registry.js";

function makeTmpDir(): string {
  const dir = join(tmpdir(), `streaming-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("StreamingLauncher", () => {
  const dirs: string[] = [];
  let registry: ProcessRegistry;

  afterEach(() => {
    for (const mp of registry.list()) mp.kill();
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("writes input file and returns a ManagedProcess", async () => {
    const artifactsDir = makeTmpDir();
    dirs.push(artifactsDir);
    registry = new ProcessRegistry();

    const launcher = new StreamingLauncher({
      devagentBin: "true",
      artifactsDir,
      timeout: 5000,
      registry,
    });

    const { managedProcess, outputPath, eventsPath } = launcher.launch({
      phase: "triage",
      repoPath: "/tmp",
      runId: "run-s1",
      input: { issue: "test" },
    });

    const inputPath = join(artifactsDir, "run-s1", "triage-input.json");
    expect(existsSync(inputPath)).toBe(true);
    const written = JSON.parse(readFileSync(inputPath, "utf-8"));
    expect(written).toEqual({ issue: "test" });

    expect(outputPath).toBe(join(artifactsDir, "run-s1", "triage-output.json"));
    expect(eventsPath).toBe(join(artifactsDir, "run-s1", "triage-events.jsonl"));

    const { exitCode } = await managedProcess.onExit;
    expect(exitCode).toBe(0);
  });

  it("registers process in registry", async () => {
    const artifactsDir = makeTmpDir();
    dirs.push(artifactsDir);
    registry = new ProcessRegistry();

    const launcher = new StreamingLauncher({
      devagentBin: "sleep",
      artifactsDir,
      timeout: 5000,
      registry,
    });

    const { managedProcess } = launcher.launch({
      phase: "implement",
      repoPath: "/tmp",
      runId: "run-s2",
      input: {},
    });

    expect(registry.get(managedProcess.id)).toBe(managedProcess);
    managedProcess.kill();
    await managedProcess.onExit;
  });
});
