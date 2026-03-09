/** Complexity ordering for threshold comparison. */
const COMPLEXITY_ORDER = ["trivial", "small", "medium", "large", "epic"];
/**
 * Autopilot daemon: polls GitHub for eligible issues, prioritizes them,
 * and dispatches workflow runs up to the concurrency limit.
 */
export class AutopilotDaemon {
    store;
    github;
    orchestrator;
    config;
    repo;
    signal;
    emit;
    activeRuns = new Map();
    constructor(options) {
        this.store = options.store;
        this.github = options.github;
        this.orchestrator = options.orchestrator;
        this.config = options.config;
        this.repo = options.repo;
        this.signal = options.signal;
        this.emit = options.onEvent ?? (() => { });
    }
    /** Run the autopilot loop until aborted. */
    async run() {
        const { poll_interval_seconds } = this.config.autopilot;
        while (!this.signal?.aborted) {
            try {
                await this.poll();
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                process.stderr.write(`[autopilot] Poll error: ${msg}\n`);
            }
            // Wait for next poll interval (interruptible)
            await this.sleep(poll_interval_seconds * 1000);
        }
        // Wait for in-flight runs to finish
        if (this.activeRuns.size > 0) {
            process.stderr.write(`[autopilot] Waiting for ${this.activeRuns.size} active runs to finish...\n`);
            await Promise.allSettled(this.activeRuns.values());
        }
        this.emit({ type: "stopped" });
    }
    /** Single poll cycle: discover issues, filter, prioritize, dispatch. */
    async poll() {
        this.emit({ type: "poll_start" });
        // Clean up completed runs from activeRuns tracking
        for (const [issueNum, promise] of this.activeRuns) {
            const run = this.store.getWorkflowRunByIssue(this.repo, issueNum);
            if (run && (run.status === "done" || run.status === "failed" || run.status === "escalated")) {
                this.activeRuns.delete(issueNum);
            }
        }
        const { max_concurrent_runs, eligible_labels, exclude_labels } = this.config.autopilot;
        // How many slots are available?
        const available = max_concurrent_runs - this.activeRuns.size;
        if (available <= 0) {
            this.emit({ type: "poll_done", discovered: 0, dispatched: 0 });
            return;
        }
        // Fetch eligible issues from GitHub
        const issues = await this.github.fetchEligibleIssues(this.repo, eligible_labels);
        // Filter: exclude labels, already running, already done
        const candidates = issues.filter((issue) => {
            // Skip issues with exclude labels
            if (exclude_labels.some((l) => issue.labels.includes(l))) {
                return false;
            }
            // Skip issues already tracked
            const existing = this.store.getWorkflowRunByIssue(this.repo, issue.number);
            if (existing) {
                // Allow re-run of failed/escalated if they've been reset
                if (existing.status !== "failed" && existing.status !== "escalated") {
                    return false;
                }
            }
            // Skip issues already being dispatched in this cycle
            if (this.activeRuns.has(issue.number)) {
                return false;
            }
            return true;
        });
        // Prioritize
        const prioritized = this.prioritize(candidates);
        // Dispatch up to available slots
        const toDispatch = prioritized.slice(0, available);
        let dispatched = 0;
        for (const { issue } of toDispatch) {
            this.emit({ type: "dispatch", issueNumber: issue.number, title: issue.title });
            const promise = this.dispatchRun(issue.number);
            this.activeRuns.set(issue.number, promise);
            dispatched++;
        }
        this.emit({ type: "poll_done", discovered: candidates.length, dispatched });
    }
    /** Prioritize issues: priority-labeled first, then by creation date (oldest first). */
    prioritize(issues) {
        const { priority_labels } = this.config.autopilot;
        return issues
            .map((issue) => {
            let priority = 0;
            for (let i = 0; i < priority_labels.length; i++) {
                if (issue.labels.includes(priority_labels[i])) {
                    priority = priority_labels.length - i;
                    break;
                }
            }
            return { issue, priority };
        })
            .sort((a, b) => {
            // Higher priority first
            if (b.priority !== a.priority)
                return b.priority - a.priority;
            // Older issues first
            return new Date(a.issue.createdAt).getTime() - new Date(b.issue.createdAt).getTime();
        });
    }
    /** Dispatch a single workflow run (watch mode) and track completion. */
    async dispatchRun(issueNumber) {
        try {
            const run = await this.orchestrator.runWorkflow(issueNumber);
            // Post-run risk checks
            this.checkRunRisk(issueNumber, run.id);
            this.emit({ type: "complete", issueNumber, status: run.status });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.emit({ type: "error", issueNumber, error: msg });
            process.stderr.write(`[autopilot] Run failed for #${issueNumber}: ${msg}\n`);
        }
        finally {
            this.activeRuns.delete(issueNumber);
        }
    }
    /** Check risk thresholds after a run completes. Escalates if exceeded. */
    checkRunRisk(issueNumber, runId) {
        const { max_complexity, min_gate_confidence, max_changed_files } = this.config.autopilot;
        // Check triage complexity
        const triageArtifact = this.store.getLatestArtifact(runId, "triage_report");
        if (triageArtifact?.data) {
            const complexity = triageArtifact.data.complexity;
            if (complexity && this.exceedsComplexity(complexity, max_complexity)) {
                this.emit({
                    type: "escalate",
                    issueNumber,
                    reason: `Complexity "${complexity}" exceeds autopilot max "${max_complexity}"`,
                });
                this.orchestrator.requestPause(runId);
            }
        }
        // Check gate confidence
        const gateArtifacts = this.store.getArtifactsByWorkflow(runId)
            .filter((a) => a.type === "gate_verdict");
        for (const gate of gateArtifacts) {
            const confidence = gate.data.confidence;
            if (confidence !== undefined && confidence < min_gate_confidence) {
                this.emit({
                    type: "escalate",
                    issueNumber,
                    reason: `Gate confidence ${confidence.toFixed(2)} below threshold ${min_gate_confidence}`,
                });
            }
        }
        // Check changed files count
        const implArtifact = this.store.getLatestArtifact(runId, "implementation_report");
        if (implArtifact?.data) {
            const changedFiles = implArtifact.data.changedFiles;
            if (changedFiles && changedFiles.length > max_changed_files) {
                this.emit({
                    type: "escalate",
                    issueNumber,
                    reason: `${changedFiles.length} files changed exceeds max ${max_changed_files}`,
                });
            }
        }
    }
    /** Check if a complexity level exceeds the threshold. */
    exceedsComplexity(actual, max) {
        const actualIdx = COMPLEXITY_ORDER.indexOf(actual);
        const maxIdx = COMPLEXITY_ORDER.indexOf(max);
        if (actualIdx === -1 || maxIdx === -1)
            return false;
        return actualIdx > maxIdx;
    }
    /** Abortable sleep. */
    sleep(ms) {
        return new Promise((resolve) => {
            if (this.signal?.aborted) {
                resolve();
                return;
            }
            const timer = setTimeout(resolve, ms);
            this.signal?.addEventListener("abort", () => {
                clearTimeout(timer);
                resolve();
            }, { once: true });
        });
    }
}
