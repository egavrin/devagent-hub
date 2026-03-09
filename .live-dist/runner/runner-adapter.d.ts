import type { LaunchResult } from "./launcher.js";
/**
 * Formal interface for all stage executors.
 * Any runner (DevAgent, OpenCode, Claude Code, etc.) must implement this.
 */
export interface RunnerAdapter {
    /** Unique runner identifier (e.g., "devagent", "opencode", "claude-code"). */
    readonly id: string;
    /** Human-readable name. */
    readonly name: string;
    /** Execute a workflow phase and return the result. */
    launch(params: LaunchParams): LaunchResult | Promise<LaunchResult>;
    /** Query the runner for its capabilities. Returns null if unsupported. */
    describe(): RunnerCapabilities | null;
    /** Query runner health status. Returns null if unsupported. */
    health(): RunnerHealth | null;
    /** Cancel a running workflow run. Returns true if cancellation was accepted. */
    cancel(runId: string): boolean;
}
export interface RunnerHealth {
    status: "healthy" | "degraded" | "unhealthy";
    load: number;
    message?: string;
}
export interface LaunchParams {
    phase: string;
    repoPath: string;
    runId: string;
    input: unknown;
}
export interface RunnerCapabilities {
    version: string;
    contractVersion?: number;
    supportedPhases: string[];
    availableProviders: string[];
    supportedApprovalModes: string[];
    supportedReasoningLevels: string[];
}
