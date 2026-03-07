import { describe, it, expect, beforeEach } from "vitest";
import { RunnerRegistry } from "../runner/runner-registry.js";
import type { RegisteredRunner } from "../runner/runner-registry.js";
import type { SelectionPolicy } from "../workflow/config.js";

describe("RunnerRegistry", () => {
  let registry: RunnerRegistry;

  beforeEach(() => {
    registry = new RunnerRegistry();
  });

  // ─── register / unregister ─────────────────────────────────

  it("registers a runner with idle status and unique id", () => {
    const runner = registry.register("/usr/bin/devagent", "default");
    expect(runner.id).toBeTruthy();
    expect(runner.bin).toBe("/usr/bin/devagent");
    expect(runner.profileName).toBe("default");
    expect(runner.status).toBe("idle");
    expect(runner.currentRunId).toBeNull();
    expect(runner.capabilities).toBeNull();
    expect(runner.stats.totalRuns).toBe(0);
  });

  it("assigns unique ids to each runner", () => {
    const r1 = registry.register("/usr/bin/devagent", "default");
    const r2 = registry.register("/usr/bin/devagent", "default");
    expect(r1.id).not.toBe(r2.id);
  });

  it("unregisters a runner", () => {
    const runner = registry.register("/usr/bin/devagent", "default");
    registry.unregister(runner.id);
    expect(registry.getById(runner.id)).toBeUndefined();
    expect(registry.getAll()).toHaveLength(0);
  });

  it("unregister with unknown id is a no-op", () => {
    registry.register("/usr/bin/devagent", "default");
    registry.unregister("nonexistent");
    expect(registry.getAll()).toHaveLength(1);
  });

  // ─── markBusy / markIdle state transitions ────────────────

  it("markBusy sets status and currentRunId", () => {
    const runner = registry.register("/usr/bin/devagent", "default");
    registry.markBusy(runner.id, "run-123");
    const updated = registry.getById(runner.id)!;
    expect(updated.status).toBe("busy");
    expect(updated.currentRunId).toBe("run-123");
  });

  it("markIdle resets status and clears currentRunId", () => {
    const runner = registry.register("/usr/bin/devagent", "default");
    registry.markBusy(runner.id, "run-123");
    registry.markIdle(runner.id);
    const updated = registry.getById(runner.id)!;
    expect(updated.status).toBe("idle");
    expect(updated.currentRunId).toBeNull();
  });

  it("markError sets error status and clears currentRunId", () => {
    const runner = registry.register("/usr/bin/devagent", "default");
    registry.markBusy(runner.id, "run-123");
    registry.markError(runner.id, "process crashed");
    const updated = registry.getById(runner.id)!;
    expect(updated.status).toBe("error");
    expect(updated.currentRunId).toBeNull();
  });

  it("mark methods are no-ops for unknown ids", () => {
    registry.markBusy("nonexistent", "run-1");
    registry.markIdle("nonexistent");
    registry.markError("nonexistent", "err");
    // No throw, no crash
    expect(registry.getAll()).toHaveLength(0);
  });

  // ─── getAvailable returns only idle runners ───────────────

  it("getAvailable returns only idle runners", () => {
    const r1 = registry.register("/usr/bin/devagent", "default");
    const r2 = registry.register("/usr/bin/devagent", "fast");
    const r3 = registry.register("/usr/bin/devagent", "strong");

    registry.markBusy(r1.id, "run-1");
    registry.markError(r3.id, "crash");

    const available = registry.getAvailable();
    expect(available).toHaveLength(1);
    expect(available[0].id).toBe(r2.id);
  });

  it("getAvailable returns empty array when no runners idle", () => {
    const r1 = registry.register("/usr/bin/devagent", "default");
    registry.markBusy(r1.id, "run-1");
    expect(registry.getAvailable()).toHaveLength(0);
  });

  // ─── getBestForPhase uses selection policy ────────────────

  it("getBestForPhase returns null when no runners available", () => {
    expect(registry.getBestForPhase("triage")).toBeNull();
  });

  it("getBestForPhase returns the only idle runner when no policy", () => {
    const r = registry.register("/usr/bin/devagent", "default");
    expect(registry.getBestForPhase("triage")?.id).toBe(r.id);
  });

  it("getBestForPhase uses selection policy to prefer matching profile", () => {
    const policy: SelectionPolicy = {
      rules: [
        { phases: ["triage", "review"], profile: "cheap" },
        { phases: ["implement"], profile: "strong" },
      ],
    };
    const reg = new RunnerRegistry(policy);

    const r1 = reg.register("/usr/bin/devagent", "default");
    const r2 = reg.register("/usr/bin/devagent", "cheap");
    const r3 = reg.register("/usr/bin/devagent", "strong");

    // triage should prefer "cheap" profile
    expect(reg.getBestForPhase("triage")?.id).toBe(r2.id);

    // implement should prefer "strong" profile
    expect(reg.getBestForPhase("implement")?.id).toBe(r3.id);
  });

  it("getBestForPhase falls back when policy profile not available", () => {
    const policy: SelectionPolicy = {
      rules: [{ phases: ["triage"], profile: "premium" }],
    };
    const reg = new RunnerRegistry(policy);
    const r = reg.register("/usr/bin/devagent", "default");

    // No "premium" runner, should fall back to any idle runner
    expect(reg.getBestForPhase("triage")?.id).toBe(r.id);
  });

  it("getBestForPhase skips busy runners", () => {
    const reg = new RunnerRegistry();
    const r1 = reg.register("/usr/bin/devagent", "default");
    const r2 = reg.register("/usr/bin/devagent", "default");
    reg.markBusy(r1.id, "run-1");

    expect(reg.getBestForPhase("triage")?.id).toBe(r2.id);
  });

  // ─── updateStats calculates correctly ─────────────────────

  it("updateStats tracks a single successful run", () => {
    const r = registry.register("/usr/bin/devagent", "default");
    registry.updateStats(r.id, true, 5000);
    const stats = registry.getById(r.id)!.stats;
    expect(stats.totalRuns).toBe(1);
    expect(stats.successRate).toBe(1);
    expect(stats.avgDurationMs).toBe(5000);
  });

  it("updateStats tracks mixed success/failure", () => {
    const r = registry.register("/usr/bin/devagent", "default");
    registry.updateStats(r.id, true, 4000);
    registry.updateStats(r.id, false, 6000);
    const stats = registry.getById(r.id)!.stats;
    expect(stats.totalRuns).toBe(2);
    expect(stats.successRate).toBe(0.5);
    expect(stats.avgDurationMs).toBe(5000);
  });

  it("updateStats accumulates over many runs", () => {
    const r = registry.register("/usr/bin/devagent", "default");
    registry.updateStats(r.id, true, 1000);
    registry.updateStats(r.id, true, 2000);
    registry.updateStats(r.id, true, 3000);
    registry.updateStats(r.id, false, 4000);
    const stats = registry.getById(r.id)!.stats;
    expect(stats.totalRuns).toBe(4);
    expect(stats.successRate).toBe(0.75);
    expect(stats.avgDurationMs).toBe(2500);
  });

  it("updateStats is a no-op for unknown id", () => {
    registry.updateStats("nonexistent", true, 1000);
    // No throw
  });

  // ─── heartbeat updates timestamp ──────────────────────────

  it("heartbeat updates lastHeartbeat", async () => {
    const r = registry.register("/usr/bin/devagent", "default");
    const initial = r.lastHeartbeat.getTime();

    // Small delay to ensure timestamp differs
    await new Promise((resolve) => setTimeout(resolve, 10));

    registry.heartbeat(r.id);
    const updated = registry.getById(r.id)!;
    expect(updated.lastHeartbeat.getTime()).toBeGreaterThanOrEqual(initial);
  });

  it("heartbeat is a no-op for unknown id", () => {
    registry.heartbeat("nonexistent");
    // No throw
  });

  // ─── getAll / getById ─────────────────────────────────────

  it("getAll returns all runners regardless of status", () => {
    const r1 = registry.register("/usr/bin/devagent", "default");
    const r2 = registry.register("/usr/bin/devagent", "fast");
    registry.markBusy(r1.id, "run-1");
    registry.markError(r2.id, "err");
    expect(registry.getAll()).toHaveLength(2);
  });

  it("getById returns undefined for unknown id", () => {
    expect(registry.getById("nonexistent")).toBeUndefined();
  });

  // ─── concurrency check (used by orchestrator) ─────────────

  it("busy count can be derived for concurrency checks", () => {
    const r1 = registry.register("/usr/bin/devagent", "default");
    const r2 = registry.register("/usr/bin/devagent", "fast");
    const r3 = registry.register("/usr/bin/devagent", "strong");

    registry.markBusy(r1.id, "run-1");
    registry.markBusy(r2.id, "run-2");

    const busyCount = registry.getAll().filter((r) => r.status === "busy").length;
    expect(busyCount).toBe(2);

    // Simulating canDispatch with max_concurrency = 3
    const maxConcurrency = 3;
    expect(busyCount < maxConcurrency).toBe(true);

    // Mark the third busy — now at capacity
    registry.markBusy(r3.id, "run-3");
    const newBusyCount = registry.getAll().filter((r) => r.status === "busy").length;
    expect(newBusyCount < maxConcurrency).toBe(false);
  });
});
