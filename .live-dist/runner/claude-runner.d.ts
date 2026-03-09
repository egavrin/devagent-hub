import type { RunnerAdapter, LaunchParams, RunnerCapabilities, RunnerHealth } from "./runner-adapter.js";
import type { LaunchResult } from "./launcher.js";
export interface ClaudeRunnerConfig {
    bin: string;
    model?: string;
    artifactsDir?: string;
    timeout?: number;
    permissionMode?: string;
}
/**
 * Runner adapter for Claude Code CLI.
 * Uses `claude -p` (print mode) with `--output-format json` for structured output.
 */
export declare class ClaudeRunner implements RunnerAdapter {
    readonly id = "claude";
    readonly name = "Claude Code";
    private config;
    private artifactsDir;
    constructor(config: ClaudeRunnerConfig);
    launch(params: LaunchParams): LaunchResult;
    describe(): RunnerCapabilities | null;
    health(): RunnerHealth | null;
    cancel(_runId: string): boolean;
    /**
     * Extract structured JSON from Claude Code's output.
     * With --output-format json, Claude returns { result: "...", ... }.
     * The result field contains the model's text response which should be our JSON.
     */
    private extractJsonOutput;
    private parseJsonFromText;
}
