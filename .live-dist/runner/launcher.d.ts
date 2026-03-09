import type { RunnerDescription } from "../workflow/stage-schemas.js";
import type { RunnerProtocol, RunnerCompatResult } from "./protocol.js";
import type { AgentProfile } from "../workflow/config.js";
export interface LaunchResult {
    exitCode: number;
    outputPath: string;
    eventsPath: string;
    output: unknown | null;
    costUsd?: number;
}
export interface LauncherConfig {
    devagentBin: string;
    artifactsDir: string;
    timeout: number;
    provider?: string;
    model?: string;
    maxIterations?: number;
    approvalMode?: string;
    reasoning?: string;
}
/**
 * Query the runner for its capabilities via `devagent workflow describe`.
 * Returns null if the runner doesn't support the command.
 * Results are cached per bin string.
 */
export declare function describeRunner(bin: string): RunnerDescription | null;
/** Clear the describeRunner cache (useful in tests). */
export declare function clearDescribeRunnerCache(): void;
/** Convert a RunnerDescription to a full RunnerProtocol. */
export declare function toRunnerProtocol(desc: RunnerDescription): RunnerProtocol;
/**
 * Check whether a runner is compatible with what Hub needs.
 * Returns warnings for missing optional features and errors for critical gaps.
 */
export declare function validateRunnerCompat(desc: RunnerDescription | null): RunnerCompatResult;
/**
 * Validate that a profile's requested settings are supported by the runner.
 * Returns an array of warning strings (empty if fully compatible).
 */
export declare function validateProfileAgainstRunner(profile: AgentProfile, desc: RunnerDescription | null): string[];
export declare class RunLauncher {
    private config;
    constructor(config: LauncherConfig);
    launch(params: {
        phase: string;
        repoPath: string;
        runId: string;
        input: unknown;
    }): LaunchResult;
}
