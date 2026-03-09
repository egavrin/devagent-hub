import type { RunnerAdapter, LaunchParams, RunnerCapabilities, RunnerHealth } from "./runner-adapter.js";
import type { LaunchResult } from "./launcher.js";
export interface CodexRunnerConfig {
    bin: string;
    model?: string;
    artifactsDir?: string;
    timeout?: number;
    env?: Record<string, string>;
}
/**
 * Runner adapter for OpenAI Codex CLI (@openai/codex).
 * Uses `codex exec` for non-interactive runs with `--json` for structured output.
 */
export declare class CodexRunner implements RunnerAdapter {
    readonly id = "codex";
    readonly name = "Codex";
    private config;
    private artifactsDir;
    constructor(config: CodexRunnerConfig);
    launch(params: LaunchParams): LaunchResult;
    describe(): RunnerCapabilities | null;
    health(): RunnerHealth | null;
    cancel(_runId: string): boolean;
    /**
     * Extract JSON from Codex output.
     * Primary: read the -o last-message file.
     * Fallback: parse JSONL events from stdout.
     */
    private extractJsonOutput;
    private parseJsonFromText;
}
