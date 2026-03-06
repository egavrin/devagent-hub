import { describe, it, expect, afterEach } from "vitest";
import { ProcessRegistry } from "../runner/process-registry.js";
import { StreamingLauncher } from "../runner/streaming-launcher.js";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

function makeTmpDir(): string {
  const dir = join(tmpdir(), `tui-int-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("TUI Integration", () => {
  const dirs: string[] = [];
  const registries: ProcessRegistry[] = [];

  afterEach(async () => {
    for (const reg of registries) {
      for (const mp of reg.list()) {
        mp.kill();
        await mp.onExit;
      }
    }
    registries.length = 0;
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("StreamingLauncher + ProcessRegistry work together", async () => {
    const artifactsDir = makeTmpDir();
    dirs.push(artifactsDir);
    const registry = new ProcessRegistry();
    registries.push(registry);

    const spawned: string[] = [];
    const exited: string[] = [];
    registry.on("spawn", (id: string) => spawned.push(id));
    registry.on("exit", (id: string) => exited.push(id));

    const launcher = new StreamingLauncher({
      devagentBin: "echo",
      artifactsDir,
      timeout: 5000,
      registry,
    });

    const { managedProcess, outputPath, eventsPath } = launcher.launch({
      phase: "triage",
      repoPath: "/tmp",
      runId: "int-run-1",
      input: { test: true },
    });

    expect(spawned).toEqual(["int-run-1-triage"]);
    expect(registry.get("int-run-1-triage")).toBe(managedProcess);

    // Verify artifact paths
    expect(outputPath).toContain("int-run-1");
    expect(eventsPath).toContain("int-run-1");

    // Verify input file was written
    const inputPath = join(artifactsDir, "int-run-1", "triage-input.json");
    expect(existsSync(inputPath)).toBe(true);

    const { exitCode } = await managedProcess.onExit;
    expect(exitCode).toBe(0);

    await new Promise((r) => setTimeout(r, 50));
    expect(exited).toEqual(["int-run-1-triage"]);
    expect(registry.get("int-run-1-triage")).toBeNull();
  });

  it("captures output through registry events", async () => {
    const artifactsDir = makeTmpDir();
    dirs.push(artifactsDir);
    const registry = new ProcessRegistry();
    registries.push(registry);

    const output: string[] = [];
    registry.on("output", (_id: string, data: string) => output.push(data));

    const launcher = new StreamingLauncher({
      devagentBin: "echo",
      artifactsDir,
      timeout: 5000,
      registry,
    });

    const { managedProcess } = launcher.launch({
      phase: "plan",
      repoPath: "/tmp",
      runId: "int-run-2",
      input: {},
    });

    await managedProcess.onExit;
    await new Promise((r) => setTimeout(r, 50));

    expect(output.length).toBeGreaterThan(0);
  });

  it("can kill a running process through registry", async () => {
    const artifactsDir = makeTmpDir();
    dirs.push(artifactsDir);
    const registry = new ProcessRegistry();
    registries.push(registry);

    const launcher = new StreamingLauncher({
      devagentBin: "sleep",
      artifactsDir,
      timeout: 30000,
      registry,
    });

    const { managedProcess } = launcher.launch({
      phase: "implement",
      repoPath: "/tmp",
      runId: "int-run-3",
      input: {},
    });

    const mp = registry.get("int-run-3-implement");
    expect(mp).not.toBeNull();
    mp!.kill();

    const { exitCode } = await managedProcess.onExit;
    expect(exitCode).not.toBe(0);
  });
});
