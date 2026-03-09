import type { RunnerCapabilities } from "./runner-adapter.js";
import type { SelectionPolicy } from "../workflow/config.js";
export interface RunnerStats {
    totalRuns: number;
    successRate: number;
    avgDurationMs: number;
}
export interface RegisteredRunner {
    id: string;
    bin: string;
    profileName: string;
    status: "idle" | "busy" | "offline" | "error";
    currentRunId: string | null;
    lastHeartbeat: Date;
    capabilities: RunnerCapabilities | null;
    stats: RunnerStats;
    healthStatus?: "healthy" | "degraded" | "unhealthy";
}
/**
 * In-memory registry that tracks active runners and their state.
 * Provides convenience methods for selection, lifecycle, and stats.
 */
export declare class RunnerRegistry {
    private runners;
    private selectionPolicy?;
    constructor(selectionPolicy?: SelectionPolicy);
    /** Register a new runner and return its record. */
    register(bin: string, profileName: string): RegisteredRunner;
    /** Remove a runner from the registry. */
    unregister(id: string): void;
    /** Mark a runner as busy with a specific workflow run. */
    markBusy(id: string, runId: string): void;
    /** Mark a runner as idle (available for work). */
    markIdle(id: string): void;
    /** Mark a runner as errored. */
    markError(id: string, error: string): void;
    /** Update the heartbeat timestamp for a runner. */
    heartbeat(id: string): void;
    /** Return all runners with status "idle". */
    getAvailable(): RegisteredRunner[];
    /** Return all registered runners. */
    getAll(): RegisteredRunner[];
    /** Look up a runner by ID. */
    getById(id: string): RegisteredRunner | undefined;
    /**
     * Select the best available runner for a given phase.
     * Uses the selection policy to match phase to profile, then picks the
     * first idle runner with a matching profile. Falls back to any idle runner.
     */
    getBestForPhase(phase: string): RegisteredRunner | null;
    /** Update stats for a runner after a run completes. */
    updateStats(id: string, success: boolean, durationMs: number): void;
    /**
     * Resolve a profile name from the selection policy for a given phase.
     * Returns null if no rule matches.
     */
    private resolveProfileFromPolicy;
}
