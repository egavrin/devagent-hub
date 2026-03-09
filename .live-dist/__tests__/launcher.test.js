import { describe, it, expect, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { RunLauncher } from "../runner/launcher.js";
function makeTmpDir() {
    const dir = join(tmpdir(), `launcher-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    return dir;
}
describe("RunLauncher", () => {
    const dirs = [];
    afterEach(() => {
        for (const d of dirs) {
            rmSync(d, { recursive: true, force: true });
        }
        dirs.length = 0;
    });
    it("writes input file before launching", () => {
        const artifactsDir = makeTmpDir();
        dirs.push(artifactsDir);
        const launcher = new RunLauncher({
            devagentBin: "true", // Unix `true` command, exits 0
            artifactsDir,
            timeout: 5000,
        });
        const input = { issue: "test-123", description: "fix bug" };
        const result = launcher.launch({
            phase: "triage",
            repoPath: "/tmp",
            runId: "run-001",
            input,
        });
        // Input file should have been written
        const inputPath = join(artifactsDir, "run-001", "triage-input.json");
        expect(existsSync(inputPath)).toBe(true);
        const written = JSON.parse(readFileSync(inputPath, "utf-8"));
        expect(written).toEqual(input);
        // `true` exits with 0
        expect(result.exitCode).toBe(0);
        // No output file was created by `true`, so output should be null
        expect(result.output).toBeNull();
        expect(result.outputPath).toBe(join(artifactsDir, "run-001", "triage-output.json"));
        expect(result.eventsPath).toBe(join(artifactsDir, "run-001", "triage-events.jsonl"));
    });
    it("captures non-zero exit code", () => {
        const artifactsDir = makeTmpDir();
        dirs.push(artifactsDir);
        const launcher = new RunLauncher({
            devagentBin: "false", // Unix `false` command, exits 1
            artifactsDir,
            timeout: 5000,
        });
        const result = launcher.launch({
            phase: "implement",
            repoPath: "/tmp",
            runId: "run-002",
            input: { plan: "do stuff" },
        });
        expect(result.exitCode).not.toBe(0);
        expect(result.output).toBeNull();
    });
});
