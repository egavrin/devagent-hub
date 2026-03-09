/**
 * In-memory registry that tracks active runners and their state.
 * Provides convenience methods for selection, lifecycle, and stats.
 */
export class RunnerRegistry {
    runners = new Map();
    selectionPolicy;
    constructor(selectionPolicy) {
        this.selectionPolicy = selectionPolicy;
    }
    /** Register a new runner and return its record. */
    register(bin, profileName) {
        const id = crypto.randomUUID();
        const runner = {
            id,
            bin,
            profileName,
            status: "idle",
            currentRunId: null,
            lastHeartbeat: new Date(),
            capabilities: null,
            stats: {
                totalRuns: 0,
                successRate: 0,
                avgDurationMs: 0,
            },
        };
        this.runners.set(id, runner);
        return runner;
    }
    /** Remove a runner from the registry. */
    unregister(id) {
        this.runners.delete(id);
    }
    /** Mark a runner as busy with a specific workflow run. */
    markBusy(id, runId) {
        const runner = this.runners.get(id);
        if (!runner)
            return;
        runner.status = "busy";
        runner.currentRunId = runId;
        runner.lastHeartbeat = new Date();
    }
    /** Mark a runner as idle (available for work). */
    markIdle(id) {
        const runner = this.runners.get(id);
        if (!runner)
            return;
        runner.status = "idle";
        runner.currentRunId = null;
        runner.lastHeartbeat = new Date();
    }
    /** Mark a runner as errored. */
    markError(id, error) {
        const runner = this.runners.get(id);
        if (!runner)
            return;
        runner.status = "error";
        runner.currentRunId = null;
        runner.lastHeartbeat = new Date();
    }
    /** Update the heartbeat timestamp for a runner. */
    heartbeat(id) {
        const runner = this.runners.get(id);
        if (!runner)
            return;
        runner.lastHeartbeat = new Date();
    }
    /** Return all runners with status "idle". */
    getAvailable() {
        return [...this.runners.values()].filter((r) => r.status === "idle");
    }
    /** Return all registered runners. */
    getAll() {
        return [...this.runners.values()];
    }
    /** Look up a runner by ID. */
    getById(id) {
        return this.runners.get(id);
    }
    /**
     * Select the best available runner for a given phase.
     * Uses the selection policy to match phase to profile, then picks the
     * first idle runner with a matching profile. Falls back to any idle runner.
     */
    getBestForPhase(phase) {
        const available = this.getAvailable();
        if (available.length === 0)
            return null;
        // If we have a selection policy, try to find a runner whose profile
        // matches the policy's preferred profile for this phase.
        if (this.selectionPolicy) {
            const preferredProfile = this.resolveProfileFromPolicy(phase);
            if (preferredProfile) {
                const match = available.find((r) => r.profileName === preferredProfile);
                if (match)
                    return match;
            }
        }
        // Prefer healthy runners over degraded/unhealthy ones.
        const healthPriority = (r) => {
            if (!r.healthStatus || r.healthStatus === "healthy")
                return 2;
            if (r.healthStatus === "degraded")
                return 1;
            return 0; // unhealthy
        };
        // Fallback: return the runner with best health, then best success rate, or the first available.
        return available.reduce((best, curr) => {
            const bestHealth = healthPriority(best);
            const currHealth = healthPriority(curr);
            if (currHealth !== bestHealth)
                return currHealth > bestHealth ? curr : best;
            if (curr.stats.totalRuns === 0 && best.stats.totalRuns === 0)
                return best;
            if (curr.stats.totalRuns === 0)
                return best;
            if (best.stats.totalRuns === 0)
                return curr;
            return curr.stats.successRate > best.stats.successRate ? curr : best;
        });
    }
    /** Update stats for a runner after a run completes. */
    updateStats(id, success, durationMs) {
        const runner = this.runners.get(id);
        if (!runner)
            return;
        const { totalRuns, successRate, avgDurationMs } = runner.stats;
        const newTotal = totalRuns + 1;
        const successCount = Math.round(successRate * totalRuns) + (success ? 1 : 0);
        runner.stats = {
            totalRuns: newTotal,
            successRate: newTotal > 0 ? successCount / newTotal : 0,
            avgDurationMs: newTotal > 0
                ? (avgDurationMs * totalRuns + durationMs) / newTotal
                : durationMs,
        };
    }
    /**
     * Resolve a profile name from the selection policy for a given phase.
     * Returns null if no rule matches.
     */
    resolveProfileFromPolicy(phase) {
        if (!this.selectionPolicy)
            return null;
        for (const rule of this.selectionPolicy.rules) {
            const phaseMatch = rule.phases.includes("*") || rule.phases.includes(phase);
            if (!phaseMatch)
                continue;
            // Skip complexity-gated rules (we don't have complexity context here).
            if (rule.complexity && rule.complexity.length > 0)
                continue;
            return rule.profile;
        }
        return null;
    }
}
