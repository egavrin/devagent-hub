/**
 * View models decouple UI components from raw state types.
 * Each builder transforms domain data into display-ready values.
 */
import { toOperatorStatus, operatorStatusColor, humanStatus, suggestedAction } from "./status-map.js";
function formatAge(dateStr) {
    const ms = Date.now() - new Date(dateStr).getTime();
    if (ms < 60_000)
        return `${Math.floor(ms / 1000)}s`;
    if (ms < 3600_000)
        return `${Math.floor(ms / 60_000)}m`;
    if (ms < 86400_000)
        return `${Math.floor(ms / 3600_000)}h`;
    return `${Math.floor(ms / 86400_000)}d`;
}
export function toRunCardViewModel(run) {
    const rawTitle = run.metadata?.title;
    const opStatus = toOperatorStatus(run.status);
    return {
        id: run.id,
        issueNumber: run.issueNumber,
        title: rawTitle ?? "",
        age: formatAge(run.updatedAt),
        phase: run.currentPhase ?? "-",
        humanStatus: humanStatus(run.status),
        statusColor: operatorStatusColor(opStatus),
        operatorStatus: opStatus,
        repairRound: run.repairRound,
        hasPr: !!run.prUrl,
        blockedReason: run.blockedReason ?? null,
        suggestedAction: suggestedAction(run.status),
    };
}
export function toBoardSummaryViewModel(runs) {
    let runningCount = 0;
    let needsActionCount = 0;
    let blockedCount = 0;
    let failedCount = 0;
    let doneCount = 0;
    let queuedCount = 0;
    let waitingCount = 0;
    for (const run of runs) {
        const os = toOperatorStatus(run.status);
        switch (os) {
            case "Running":
                runningCount++;
                break;
            case "Needs Action":
                needsActionCount++;
                break;
            case "Blocked":
                blockedCount++;
                break;
            case "Done":
                doneCount++;
                break;
            case "Queued":
                queuedCount++;
                break;
            case "Waiting":
                waitingCount++;
                break;
        }
        if (run.status === "failed")
            failedCount++;
    }
    return {
        mode: runs.length > 0 ? runs[0].mode : null,
        runningCount,
        needsActionCount,
        blockedCount,
        failedCount,
        doneCount,
        queuedCount,
        waitingCount,
        totalCount: runs.length,
    };
}
function getBlockedInfo(run, transitions) {
    const lastT = transitions.length > 0 ? transitions[transitions.length - 1] : null;
    switch (run.status) {
        case "failed":
            return {
                reason: `Failed at ${run.currentPhase ?? "unknown"}: ${lastT?.reason ?? "Unknown error"}`,
                suggestion: "R to retry, D to delete",
            };
        case "escalated":
            return {
                reason: `Escalated: ${lastT?.reason ?? "By policy"}`,
                suggestion: "Review artifacts, then retry or close",
            };
        case "plan_draft":
        case "plan_revision":
            return {
                reason: "Plan needs approval",
                suggestion: "A to approve, W to rework",
            };
        case "awaiting_human_review":
            return {
                reason: "PR ready for human review",
                suggestion: "A to approve, r to rerun reviewer",
            };
        case "awaiting_local_verify":
            return {
                reason: "Implementation done, needs verify/PR",
                suggestion: "C to continue",
            };
        case "auto_review_fix_loop":
            return {
                reason: "Auto-review found issues, repairing",
                suggestion: "C to repair",
            };
        default:
            return null;
    }
}
export function toRunDetailViewModel(run, artifacts, transitions, agentRuns, approvals, isActive) {
    const rawTitle = run.metadata?.title;
    const opStatus = toOperatorStatus(run.status);
    const pending = approvals.filter((a) => a.action === null);
    const gates = artifacts.filter((a) => a.type === "gate_verdict");
    const latestArtifact = artifacts.length > 0 ? artifacts[artifacts.length - 1] : null;
    const recentT = transitions.slice(-5);
    const modeLabel = run.mode === "watch" ? "[WATCH]" : run.mode === "autopilot" ? "[AUTO]" : "[ASSISTED]";
    return {
        issueNumber: run.issueNumber,
        title: rawTitle ?? "",
        humanStatus: humanStatus(run.status),
        statusColor: operatorStatusColor(opStatus),
        operatorStatus: opStatus,
        phase: run.currentPhase ?? "-",
        repairRound: run.repairRound,
        age: formatAge(run.createdAt),
        modeLabel,
        profile: run.agentProfile ?? null,
        model: run.actualModel ?? null,
        runner: run.runnerId ?? null,
        branch: run.branch ?? null,
        prUrl: run.prUrl ?? null,
        isActive,
        blocked: getBlockedInfo(run, transitions),
        suggestedAction: suggestedAction(run.status),
        pendingApprovalCount: pending.length,
        pendingApprovalSummaries: pending.slice(0, 3).map((a) => `${a.phase}: ${a.summary.length > 50 ? a.summary.slice(0, 49) + "\u2026" : a.summary}`),
        gates: gates.map((g) => {
            const data = g.data;
            const gAction = data.action ?? "?";
            const color = gAction === "proceed" ? "green" : gAction === "rework" ? "yellow" : "red";
            const icon = gAction === "proceed" ? "+" : gAction === "rework" ? "~" : "x";
            return { id: g.id, phase: g.phase, action: gAction, color, icon };
        }),
        latestArtifact: latestArtifact
            ? { type: latestArtifact.type.replace(/_/g, " "), summary: latestArtifact.summary ?? null }
            : null,
        recentTransitions: recentT.map((t) => ({
            time: t.timestamp.slice(11, 19),
            from: t.from,
            to: t.to,
            reason: t.reason ? (t.reason.length > 30 ? t.reason.slice(0, 29) + "\u2026" : t.reason) : null,
        })),
        agentRunCount: agentRuns.length,
        totalCost: agentRuns.reduce((sum, ar) => sum + (ar.costUsd ?? 0), 0),
    };
}
