import type { StateStore } from "../state/store.js";
import type { GitHubGateway } from "../github/gateway.js";
import type { WorkflowConfig } from "./config.js";
import type { WorkflowOrchestrator } from "./orchestrator.js";
export interface AutopilotOptions {
    store: StateStore;
    github: GitHubGateway;
    orchestrator: WorkflowOrchestrator;
    config: WorkflowConfig;
    repo: string;
    signal?: AbortSignal;
    onEvent?: (event: AutopilotEvent) => void;
}
export type AutopilotEvent = {
    type: "poll_start";
} | {
    type: "poll_done";
    discovered: number;
    dispatched: number;
} | {
    type: "dispatch";
    issueNumber: number;
    title: string;
} | {
    type: "complete";
    issueNumber: number;
    status: string;
} | {
    type: "error";
    issueNumber: number;
    error: string;
} | {
    type: "skip";
    issueNumber: number;
    reason: string;
} | {
    type: "escalate";
    issueNumber: number;
    reason: string;
} | {
    type: "stopped";
};
/**
 * Autopilot daemon: polls GitHub for eligible issues, prioritizes them,
 * and dispatches workflow runs up to the concurrency limit.
 */
export declare class AutopilotDaemon {
    private store;
    private github;
    private orchestrator;
    private config;
    private repo;
    private signal?;
    private emit;
    private activeRuns;
    constructor(options: AutopilotOptions);
    /** Run the autopilot loop until aborted. */
    run(): Promise<void>;
    /** Single poll cycle: discover issues, filter, prioritize, dispatch. */
    poll(): Promise<void>;
    /** Prioritize issues: priority-labeled first, then by creation date (oldest first). */
    private prioritize;
    /** Dispatch a single workflow run (watch mode) and track completion. */
    private dispatchRun;
    /** Check risk thresholds after a run completes. Escalates if exceeded. */
    private checkRunRisk;
    /** Check if a complexity level exceeds the threshold. */
    private exceedsComplexity;
    /** Abortable sleep. */
    private sleep;
}
