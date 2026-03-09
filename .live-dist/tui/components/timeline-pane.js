import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
function formatDuration(start, end) {
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : Date.now();
    const ms = e - s;
    if (ms < 1000)
        return `${ms}ms`;
    if (ms < 60_000)
        return `${(ms / 1000).toFixed(0)}s`;
    if (ms < 3600_000)
        return `${Math.floor(ms / 60_000)}m${Math.floor((ms % 60_000) / 1000)}s`;
    return `${Math.floor(ms / 3600_000)}h${Math.floor((ms % 3600_000) / 60_000)}m`;
}
const BOOKMARK_INDICATORS = {
    phase_start: { symbol: "[P]", color: "blue" },
    gate_verdict: { symbol: "[G]", color: "green" },
    error: { symbol: "[!]", color: "red" },
    pr_open: { symbol: "[PR]", color: "cyan" },
    ci_fail: { symbol: "[CI]", color: "red" },
};
export function TimelinePane({ agentRuns, transitions, artifacts, isFocused, height, jumpTarget, scrollToAgentRunId }) {
    const entries = [];
    // Agent runs as timeline entries
    for (const ar of agentRuns) {
        const statusMark = ar.status === "success" ? "\u2714" : ar.status === "failed" ? "\u2718" : "\u25B6";
        const statusColor = ar.status === "success" ? "green" : ar.status === "failed" ? "red" : "cyan";
        const dur = formatDuration(ar.startedAt, ar.finishedAt);
        const kindBadge = ar.executorKind ? ` [${ar.executorKind}]` : "";
        const profileBadge = ar.profile ? ` @${ar.profile}` : "";
        const arBookmark = ar.status === "failed" ? "error" : undefined;
        entries.push({
            time: ar.startedAt.slice(11, 19),
            sortKey: ar.startedAt,
            groupKey: `agent:${ar.phase}:${ar.workflowRunId}`,
            bookmark: arBookmark,
            agentRunId: ar.id,
            node: (_jsxs(Text, { children: [_jsx(Text, { color: statusColor, children: statusMark }), ar.status === "running"
                        ? _jsxs(Text, { color: "cyan", bold: true, children: [" ", ar.phase] })
                        : _jsxs(Text, { children: [" ", ar.phase] }), kindBadge ? _jsx(Text, { color: "blue", children: kindBadge }) : "", profileBadge ? _jsx(Text, { dimColor: true, children: profileBadge }) : "", _jsxs(Text, { dimColor: true, children: [" ", dur] }), ar.iterations ? _jsxs(Text, { dimColor: true, children: [" (", ar.iterations, " iters)"] }) : "", ar.exitReason ? _jsxs(Text, { color: "red", children: [" ", ar.exitReason] }) : ""] })),
        });
    }
    // Non-gate artifacts as timeline markers
    const nonGateArtifacts = artifacts.filter((a) => a.type !== "gate_verdict");
    for (const a of nonGateArtifacts) {
        const typeColors = {
            triage_report: "cyan",
            plan_draft: "yellow",
            accepted_plan: "green",
            implementation_report: "blue",
            verification_report: "green",
            review_report: "magenta",
            repair_report: "red",
            diff_summary: "gray",
        };
        const color = typeColors[a.type] ?? "white";
        const summaryShort = a.summary.length > 40 ? a.summary.slice(0, 39) + "\u2026" : a.summary;
        entries.push({
            time: a.createdAt.slice(11, 19),
            sortKey: a.createdAt,
            node: (_jsxs(Text, { children: [_jsxs(Text, { color: color, children: ["\u25C6", " ", a.type.replace(/_/g, " ")] }), summaryShort ? _jsxs(Text, { dimColor: true, children: [" ", summaryShort] }) : ""] })),
        });
    }
    // Gate verdicts
    const gates = artifacts.filter((a) => a.type === "gate_verdict");
    for (const g of gates) {
        const data = g.data;
        const action = data.action ?? "unknown";
        const color = action === "proceed" ? "green" : action === "rework" ? "yellow" : "red";
        const icon = action === "proceed" ? "\u2714" : action === "rework" ? "\u21BA" : "\u2718";
        entries.push({
            time: g.createdAt.slice(11, 19),
            sortKey: g.createdAt,
            bookmark: "gate_verdict",
            node: (_jsxs(Text, { children: [_jsxs(Text, { color: color, children: [icon, " gate:", g.phase] }), _jsxs(Text, { dimColor: true, children: [" ", action] })] })),
        });
    }
    // Status transitions (only show recent ones to avoid noise)
    const recentTransitions = transitions.slice(-8);
    for (const t of recentTransitions) {
        entries.push({
            time: t.timestamp.slice(11, 19),
            sortKey: t.timestamp,
            node: (_jsxs(Text, { dimColor: true, children: [t.from, " ", "\u2192", " ", t.to, t.reason ? ` (${t.reason.length > 30 ? t.reason.slice(0, 29) + "\u2026" : t.reason})` : ""] })),
        });
    }
    entries.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    // Collapse consecutive tool events with the same groupKey when > 3 in a row
    const collapsed = [];
    let i = 0;
    while (i < entries.length) {
        const entry = entries[i];
        if (!entry.groupKey) {
            collapsed.push(entry);
            i++;
            continue;
        }
        // Collect consecutive entries with the same groupKey
        let j = i + 1;
        while (j < entries.length && entries[j].groupKey === entry.groupKey) {
            j++;
        }
        const groupSize = j - i;
        if (groupSize > 3) {
            // Show first and last, with a collapsed indicator in between
            collapsed.push(entries[i]);
            collapsed.push({
                time: "",
                sortKey: entries[i].sortKey + ":collapsed",
                node: _jsxs(Text, { dimColor: true, children: ["  ... ", groupSize - 2, " more ", entry.groupKey?.split(":")[1] ?? "tool", " events"] }),
            });
            collapsed.push(entries[j - 1]);
        }
        else {
            for (let k = i; k < j; k++) {
                collapsed.push(entries[k]);
            }
        }
        i = j;
    }
    // Compute jump target index for scrolling
    let jumpIndex = -1;
    if (jumpTarget === "latest_gate") {
        for (let k = collapsed.length - 1; k >= 0; k--) {
            if (collapsed[k].bookmark === "gate_verdict") {
                jumpIndex = k;
                break;
            }
        }
    }
    else if (jumpTarget === "last_error") {
        for (let k = collapsed.length - 1; k >= 0; k--) {
            if (collapsed[k].bookmark === "error" || collapsed[k].bookmark === "ci_fail") {
                jumpIndex = k;
                break;
            }
        }
    }
    if (scrollToAgentRunId) {
        for (let k = collapsed.length - 1; k >= 0; k--) {
            if (collapsed[k].agentRunId === scrollToAgentRunId) {
                jumpIndex = k;
                break;
            }
        }
    }
    const viewSize = height - 3;
    let visible;
    let highlightOffset = -1;
    if (jumpIndex >= 0) {
        // Center the jumped-to entry in the visible window
        const start = Math.max(0, Math.min(jumpIndex - Math.floor(viewSize / 2), collapsed.length - viewSize));
        visible = collapsed.slice(start, start + viewSize);
        highlightOffset = jumpIndex - start;
    }
    else {
        visible = collapsed.slice(-viewSize);
    }
    return (_jsxs(Box, { borderStyle: isFocused ? "bold" : "single", borderColor: isFocused ? "blue" : "gray", flexDirection: "column", flexGrow: 1, paddingLeft: 1, overflow: "hidden", children: [_jsx(Text, { bold: true, dimColor: true, children: "Timeline" }), visible.length === 0 ? (_jsx(Text, { dimColor: true, children: "No activity yet" })) : (visible.map((e, idx) => {
                const bm = e.bookmark ? BOOKMARK_INDICATORS[e.bookmark] : null;
                const isHighlighted = idx === highlightOffset;
                return (_jsxs(Box, { children: [bm ? _jsxs(Text, { color: bm.color, children: [bm.symbol, " "] }) : null, _jsxs(Text, { dimColor: true, children: [e.time, " "] }), _jsx(Text, { inverse: isHighlighted, children: isHighlighted ? "" : "" }), e.node] }, idx));
            }))] }));
}
