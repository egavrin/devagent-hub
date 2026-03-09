import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { ArtifactDiffView } from "./artifact-diff-view.js";
const TYPE_COLORS = {
    triage_report: "cyan",
    plan_draft: "yellow",
    accepted_plan: "green",
    implementation_report: "blue",
    verification_report: "green",
    review_report: "magenta",
    repair_report: "red",
    gate_verdict: "white",
    diff_summary: "gray",
};
const TYPE_LABELS = {
    triage_report: "Triage Report",
    plan_draft: "Plan Draft",
    accepted_plan: "Accepted Plan",
    implementation_report: "Implementation Report",
    verification_report: "Verification Report",
    review_report: "Review Report",
    repair_report: "Repair Report",
    gate_verdict: "Gate Verdict",
    diff_summary: "Diff Summary",
};
function truncate(s, max) {
    return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
}
function verdictBadge(artifact) {
    const data = artifact.data;
    if (artifact.type === "gate_verdict") {
        const action = data.action;
        const color = action === "proceed" ? "green" : action === "rework" ? "yellow" : "red";
        const icon = action === "proceed" ? "PASS" : action === "rework" ? "REWORK" : "BLOCK";
        return _jsxs(Text, { color: color, bold: true, children: [" [", icon, "]"] });
    }
    if (artifact.type === "review_report") {
        const verdict = data.verdict;
        const blocking = data.blockingCount ?? 0;
        if (verdict === "block" || blocking > 0) {
            return _jsxs(Text, { color: "red", bold: true, children: [" [BLOCK:", blocking, "]"] });
        }
        return _jsx(Text, { color: "green", bold: true, children: " [PASS]" });
    }
    return null;
}
function renderReviewFindings(data, lines) {
    const findings = data.findings;
    if (!findings || findings.length === 0)
        return;
    const blocking = findings.filter((f) => f.severity === "critical" || f.severity === "major");
    const warnings = findings.filter((f) => f.severity !== "critical" && f.severity !== "major");
    if (blocking.length > 0) {
        lines.push({ key: "findings-block-hdr", node: (_jsxs(Text, { bold: true, color: "red", children: ["Blocking (", blocking.length, ")"] })) });
        for (const [i, f] of blocking.slice(0, 5).entries()) {
            const file = f.file ?? "";
            const line = f.line ?? 0;
            const msg = f.message ?? "";
            const sev = f.severity ?? "";
            lines.push({ key: `finding-b${i}`, node: (_jsxs(Text, { children: [_jsx(Text, { color: "red", children: sev }), file ? _jsxs(Text, { dimColor: true, children: [" ", file, line > 0 ? `:${line}` : ""] }) : "", _jsxs(Text, { children: [" ", truncate(msg, 60)] })] })) });
        }
        if (blocking.length > 5) {
            lines.push({ key: "findings-block-more", node: (_jsxs(Text, { dimColor: true, children: ["  ...", blocking.length - 5, " more blocking"] })) });
        }
    }
    if (warnings.length > 0) {
        lines.push({ key: "findings-warn-hdr", node: (_jsxs(Text, { bold: true, color: "yellow", children: ["Warnings (", warnings.length, ")"] })) });
        for (const [i, f] of warnings.slice(0, 3).entries()) {
            const msg = f.message ?? "";
            lines.push({ key: `finding-w${i}`, node: (_jsxs(Text, { children: [_jsx(Text, { color: "yellow", children: f.severity ?? "warn" }), _jsxs(Text, { dimColor: true, children: [" ", truncate(msg, 60)] })] })) });
        }
        if (warnings.length > 3) {
            lines.push({ key: "findings-warn-more", node: (_jsxs(Text, { dimColor: true, children: ["  ...", warnings.length - 3, " more warnings"] })) });
        }
    }
}
function renderPlanSections(data, lines) {
    // Common plan fields
    const steps = data.steps;
    const approach = data.approach;
    const risk = data.risk;
    if (approach) {
        lines.push({ key: "plan-approach", node: (_jsxs(Text, { children: ["Approach: ", truncate(approach, 70)] })) });
    }
    if (risk) {
        lines.push({ key: "plan-risk", node: (_jsxs(Text, { children: ["Risk: ", _jsx(Text, { color: risk === "high" ? "red" : risk === "medium" ? "yellow" : "green", children: risk })] })) });
    }
    if (steps && steps.length > 0) {
        lines.push({ key: "plan-steps-hdr", node: _jsxs(Text, { bold: true, children: ["Steps (", steps.length, ")"] }) });
        for (const [i, step] of steps.slice(0, 6).entries()) {
            const desc = step.description ?? step.title ?? `Step ${i + 1}`;
            lines.push({ key: `plan-step-${i}`, node: (_jsxs(Text, { dimColor: true, children: ["  ", i + 1, ". ", truncate(desc, 65)] })) });
        }
        if (steps.length > 6) {
            lines.push({ key: "plan-steps-more", node: (_jsxs(Text, { dimColor: true, children: ["  ...", steps.length - 6, " more steps"] })) });
        }
    }
}
export function ArtifactPane({ artifacts, approvals, agentRuns, isFocused, height, showDiff, onJumpToAgentRun }) {
    const lines = [];
    // Build agent run lookup for attribution
    const agentRunMap = new Map();
    if (agentRuns) {
        for (const ar of agentRuns) {
            agentRunMap.set(ar.id, ar);
        }
    }
    // Show latest artifact prominently with expanded detail
    const latest = artifacts.length > 0 ? artifacts[artifacts.length - 1] : null;
    if (latest) {
        const color = TYPE_COLORS[latest.type] ?? "white";
        const label = TYPE_LABELS[latest.type] ?? latest.type;
        const producer = latest.agentRunId ? agentRunMap.get(latest.agentRunId) : null;
        const attribution = producer?.executorKind
            ? ` by ${producer.executorKind}${producer.profile ? ` @${producer.profile}` : ""}`
            : "";
        lines.push({ key: "latest-hdr", node: (_jsxs(Text, { bold: true, children: [_jsx(Text, { color: color, children: label }), verdictBadge(latest), _jsx(Text, { dimColor: true, children: attribution })] })) });
        // Summary
        if (latest.summary) {
            const summaryLines = latest.summary.split("\n").slice(0, 4);
            for (const [i, line] of summaryLines.entries()) {
                lines.push({ key: `latest-s${i}`, node: (_jsxs(Text, { children: ["  ", truncate(line, 75)] })) });
            }
        }
        // Type-specific expanded content
        const data = latest.data;
        if (latest.type === "review_report" || latest.type === "repair_report") {
            renderReviewFindings(data, lines);
        }
        if (latest.type === "plan_draft" || latest.type === "accepted_plan") {
            renderPlanSections(data, lines);
        }
        lines.push({ key: "latest-sep", node: _jsx(Text, { dimColor: true, children: "\u2500".repeat(40) }) });
    }
    // Pending approvals
    const pending = approvals.filter((a) => a.action === null);
    if (pending.length > 0) {
        lines.push({ key: "approvals-hdr", node: (_jsxs(Text, { bold: true, color: "yellow", children: ["Pending Approvals (", pending.length, ")"] })) });
        for (const a of pending) {
            lines.push({ key: `approval-${a.id}`, node: (_jsxs(Text, { children: [_jsx(Text, { color: "yellow", children: a.phase }), _jsxs(Text, { dimColor: true, children: [" ", truncate(a.summary, 55)] })] })) });
        }
        lines.push({ key: "approvals-sep", node: _jsx(Text, { dimColor: true, children: "\u2500".repeat(40) }) });
    }
    // Version diff — find comparable artifacts (same type, multiple versions)
    if (showDiff && latest) {
        const sameType = artifacts.filter((a) => a.type === latest.type);
        if (sameType.length >= 2) {
            const older = sameType[sameType.length - 2];
            lines.push({ key: "diff-section", node: (_jsx(ArtifactDiffView, { older: older, newer: latest, height: Math.min(10, Math.floor(height / 3)) })) });
            lines.push({ key: "diff-sep", node: _jsx(Text, { dimColor: true, children: "\u2500".repeat(40) }) });
        }
    }
    // Artifact history (older items)
    if (artifacts.length > 1) {
        lines.push({ key: "history-hdr", node: _jsx(Text, { bold: true, children: "History" }) });
        for (const a of artifacts.slice(0, -1).reverse()) {
            const color = TYPE_COLORS[a.type] ?? "white";
            const producer = a.agentRunId ? agentRunMap.get(a.agentRunId) : null;
            const kindTag = producer?.executorKind ? ` [${producer.executorKind}]` : "";
            lines.push({ key: `hist-${a.id}`, node: (_jsxs(Text, { children: [_jsxs(Text, { dimColor: true, children: [a.createdAt.slice(11, 19), " "] }), _jsx(Text, { color: color, children: a.type }), verdictBadge(a), kindTag ? _jsx(Text, { color: "blue", children: kindTag }) : "", a.agentRunId && onJumpToAgentRun ? _jsx(Text, { color: "cyan", children: " [\u2192]" }) : "", _jsxs(Text, { dimColor: true, children: [" ", truncate(a.summary, 40)] })] })) });
        }
    }
    if (lines.length === 0) {
        lines.push({ key: "empty", node: _jsx(Text, { dimColor: true, children: "No artifacts yet" }) });
    }
    const visible = lines.slice(0, Math.max(height - 3, 3));
    return (_jsxs(Box, { borderStyle: isFocused ? "bold" : "single", borderColor: isFocused ? "blue" : "gray", flexDirection: "column", flexGrow: 1, paddingLeft: 1, overflow: "hidden", children: [_jsx(Text, { bold: true, dimColor: true, children: "Artifacts" }), visible.map((l) => (_jsx(Box, { children: l.node }, l.key)))] }));
}
