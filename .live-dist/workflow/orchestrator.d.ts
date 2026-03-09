import type { StateStore } from "../state/store.js";
import type { GitHubGateway } from "../github/gateway.js";
import type { WorkflowConfig } from "./config.js";
import type { WorkflowRun } from "../state/types.js";
import type { LaunchResult } from "../runner/launcher.js";
import type { WorktreeManager } from "../workspace/worktree-manager.js";
import type { ReviewGate } from "./review-gate.js";
import type { RunnerRegistry, RegisteredRunner } from "../runner/runner-registry.js";
export interface Finding {
    file: string;
    line: number;
    severity: string;
    message: string;
    category: string;
    author?: string;
}
export interface OrchestratorDeps {
    store: StateStore;
    github: GitHubGateway;
    launcher: {
        launch(params: {
            phase: string;
            repoPath: string;
            runId: string;
            input: unknown;
        }): LaunchResult | Promise<LaunchResult>;
    };
    repo: string;
    repoRoot?: string;
    config?: WorkflowConfig;
    worktreeManager?: WorktreeManager;
    reviewGate?: ReviewGate;
    runnerRegistry?: RunnerRegistry;
}
export declare class WorkflowOrchestrator {
    private store;
    private github;
    private launcher;
    private repo;
    private repoRoot;
    private config;
    private worktreeManager?;
    private reviewGate?;
    private runnerRegistry?;
    constructor(deps: OrchestratorDeps);
    /** Check whether we can dispatch another run without exceeding concurrency limits. */
    private canDispatch;
    /** Select the best available runner for a phase using the registry. */
    private selectRunner;
    /**
     * Dispatch a workflow run to a runner. Checks concurrency, selects a runner,
     * and marks it busy. Returns the assigned runner and the current phase.
     */
    dispatch(runId: string): Promise<{
        runner: RegisteredRunner;
        phase: string;
    }>;
    private get isWatchMode();
    /** Determine triggeredBy based on the current workflow mode. */
    private get triggeredBy();
    /**
     * Transition status and automatically set nextAction for terminal/blocked states.
     * This wraps store.updateStatus and adds nextAction bookkeeping.
     */
    private transitionStatus;
    /** Request the workflow to be cancelled. */
    requestCancel(runId: string): void;
    private checkCancel;
    /** Request the workflow to pause after the current phase completes. */
    requestPause(runId: string): void;
    /** Check if a pause was requested and clear the flag. Returns true if paused. */
    private checkPause;
    /** Check budget limits for a run. Returns exceeded status and reason. */
    private checkBudget;
    /** Get a complete artifact chain for a workflow run (audit trail). */
    getArtifactChain(runId: string): {
        phase: string;
        type: string;
        verdict?: string;
        timestamp: string;
    }[];
    /**
     * Run a review gate on a stage's output. Stores gate_verdict artifact.
     * Returns the verdict.
     */
    private runGate;
    /**
     * Ensure the repo has a .gitignore so agents don't commit dependency dirs.
     */
    private ensureGitignore;
    private setupWorktree;
    private cleanupWorktree;
    triageFromPR(prNumber: number): Promise<WorkflowRun>;
    triage(issueNumber: number, sourceType?: "issue" | "pr"): Promise<WorkflowRun>;
    plan(issueNumber: number): Promise<WorkflowRun>;
    approvePlan(issueNumber: number): Promise<WorkflowRun>;
    reworkPlan(issueNumber: number, note?: string): Promise<WorkflowRun>;
    triageAndPlan(issueNumber: number): Promise<WorkflowRun>;
    implement(issueNumber: number): Promise<WorkflowRun>;
    verify(issueNumber: number): Promise<WorkflowRun>;
    openPR(issueNumber: number): Promise<WorkflowRun>;
    implementAndPR(issueNumber: number): Promise<WorkflowRun>;
    review(issueNumber: number): Promise<WorkflowRun>;
    repair(issueNumber: number): Promise<WorkflowRun>;
    /**
     * Shared helper: validate status, check conflicts, run repair agent, push fixes.
     * Returns the updated workflow run.
     */
    private repairFromFindings;
    /**
     * Resolve PR review comments by running a repair phase with the comments as findings.
     */
    resolveComments(issueNumber: number): Promise<WorkflowRun>;
    /**
     * Fix CI failures on a PR by fetching failed check logs, running repair, and pushing.
     * Optionally marks the PR as ready (undraft) when CI passes.
     */
    fixCI(issueNumber: number, options?: {
        markReady?: boolean;
    }): Promise<WorkflowRun>;
    /**
     * Poll CI checks until they complete, then fix failures if any.
     * Returns the updated run. Used in watch mode after PR open and after repairs.
     */
    private waitForCIAndFix;
    /**
     * Poll PR checks until all are completed (no more in_progress).
     * Returns the final check states.
     */
    private pollCIChecks;
    runWorkflow(issueNumber: number, options?: {
        autoApprove?: boolean;
    }): Promise<WorkflowRun>;
    private runWorkflowAssisted;
    /**
     * Watch mode workflow: inter-stage gates replace human approval.
     * Gates evaluate each stage's output; on "proceed" the workflow continues,
     * on "rework" the stage is retried (up to max_rounds), on "escalate" the run stops.
     */
    private runWorkflowWatch;
    /**
     * Internal rework for watch mode — transitions plan without GitHub comment about human rework.
     */
    private reworkPlanInternal;
    /**
     * Bootstrap a project from a brief markdown file.
     * Parses the brief, seeds backlog items, creates GitHub issues, and stores a bootstrap artifact.
     */
    bootstrapFromBrief(briefPath: string): Promise<WorkflowRun>;
    /**
     * Get aggregated project status for all runs sharing a sourceRef.
     */
    getProjectStatus(sourceRef: string): {
        totalIssues: number;
        completedIssues: number;
        failedIssues: number;
        escalatedIssues: number;
        totalCost: number;
        withinBudget: boolean;
        allDone: boolean;
    };
}
