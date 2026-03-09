import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Box, Text } from "ink";
export function resolveInboxItem(items, planRevisionRuns, awaitingReviewRuns, readyToMergeRuns, escalatedRuns, failedRuns, index) {
    let idx = index;
    if (idx < items.length) {
        return { kind: "approval", run: items[idx].run, approval: items[idx].approval };
    }
    idx -= items.length;
    if (idx < planRevisionRuns.length) {
        return { kind: "plan_revision", run: planRevisionRuns[idx] };
    }
    idx -= planRevisionRuns.length;
    if (idx < awaitingReviewRuns.length) {
        return { kind: "awaiting_review", run: awaitingReviewRuns[idx] };
    }
    idx -= awaitingReviewRuns.length;
    if (idx < readyToMergeRuns.length) {
        return { kind: "ready_to_merge", run: readyToMergeRuns[idx] };
    }
    idx -= readyToMergeRuns.length;
    if (idx < escalatedRuns.length) {
        return { kind: "escalated", run: escalatedRuns[idx] };
    }
    idx -= escalatedRuns.length;
    if (idx < failedRuns.length) {
        return { kind: "blocked", run: failedRuns[idx] };
    }
    return null;
}
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
function urgencyColor(age) {
    if (age > 3600_000)
        return "red";
    if (age > 600_000)
        return "yellow";
    return "white";
}
function severityColor(severity) {
    switch (severity) {
        case "critical": return "red";
        case "high": return "red";
        case "medium": return "yellow";
        case "low": return "green";
        default: return "white";
    }
}
function modeBadge(mode) {
    if (mode === "watch")
        return _jsx(Text, { color: "magenta", children: "[W]" });
    if (mode === "autopilot")
        return _jsx(Text, { color: "red", children: "[AP]" });
    return null;
}
function truncTitle(title, max) {
    return title.length > max ? title.slice(0, max - 1) + "\u2026" : title;
}
export function ApprovalQueueView({ items, planRevisionRuns, escalatedRuns, failedRuns, awaitingReviewRuns, readyToMergeRuns, selectedIndex, height }) {
    const allItems = [];
    let selectableIndex = 0;
    // Near-merge PRs summary (non-selectable header)
    const nearMergeCount = [...readyToMergeRuns, ...awaitingReviewRuns].filter((r) => r.prUrl).length;
    if (nearMergeCount > 0) {
        allItems.push({ key: "near-merge-summary", node: (_jsxs(Text, { bold: true, color: "green", children: ["Near-Merge PRs: ", nearMergeCount] })) });
    }
    // Pending approvals section
    if (items.length > 0) {
        allItems.push({ key: "approvals-hdr", node: (_jsxs(Box, { gap: 2, children: [_jsxs(Text, { bold: true, children: ["Pending Approvals (", items.length, ")"] }), _jsx(Text, { dimColor: true, children: "A approve  W rework" })] })) });
        for (const [, item] of items.entries()) {
            const isSelected = selectableIndex === selectedIndex;
            const age = Date.now() - new Date(item.approval.createdAt).getTime();
            const ageStr = formatAge(item.approval.createdAt);
            const ageColor = urgencyColor(age);
            const title = item.run
                ? item.run.metadata?.title ?? ""
                : "";
            allItems.push({ key: `approval-${item.approval.id}`, node: (_jsxs(Text, { inverse: isSelected, bold: isSelected, children: [isSelected ? ">" : " ", _jsxs(Text, { color: "yellow", children: [" #", item.run?.issueNumber ?? "?"] }), " ", _jsx(Text, { children: item.approval.phase }), item.approval.recommendedAction ? _jsxs(Text, { dimColor: true, children: [" ", item.approval.recommendedAction] }) : null, item.approval.severity ? (_jsxs(_Fragment, { children: [" ", _jsxs(Text, { color: severityColor(item.approval.severity), children: ["[", item.approval.severity, "]"] })] })) : null, " ", item.run ? modeBadge(item.run.mode) : null, " ", _jsx(Text, { dimColor: true, children: truncTitle(title, 30) }), "  ", _jsx(Text, { color: ageColor, children: ageStr })] })) });
            selectableIndex++;
        }
    }
    // Pending stage reworks section
    if (planRevisionRuns.length > 0) {
        allItems.push({ key: "revision-sep", node: _jsx(Text, { dimColor: true, children: "\u2500".repeat(50) }) });
        allItems.push({ key: "revision-hdr", node: (_jsxs(Box, { gap: 2, children: [_jsxs(Text, { bold: true, color: "yellow", children: ["Pending Reworks (", planRevisionRuns.length, ")"] }), _jsx(Text, { dimColor: true, children: "A approve  W rework  C continue" })] })) });
        for (const r of planRevisionRuns) {
            const title = r.metadata?.title ?? "";
            const isSelected = selectableIndex === selectedIndex;
            allItems.push({ key: `revision-${r.id}`, node: (_jsxs(Text, { inverse: isSelected, bold: isSelected, children: [isSelected ? ">" : " ", _jsxs(Text, { color: "yellow", children: [" #", r.issueNumber] }), " ", modeBadge(r.mode), " ", _jsx(Text, { dimColor: true, children: truncTitle(title, 30) }), "  ", _jsx(Text, { dimColor: true, children: formatAge(r.updatedAt) })] })) });
            selectableIndex++;
        }
    }
    // Awaiting human review section
    if (awaitingReviewRuns.length > 0) {
        allItems.push({ key: "review-sep", node: _jsx(Text, { dimColor: true, children: "\u2500".repeat(50) }) });
        allItems.push({ key: "review-hdr", node: (_jsxs(Box, { gap: 2, children: [_jsxs(Text, { bold: true, color: "cyan", children: ["Awaiting Human Review (", awaitingReviewRuns.length, ")"] }), _jsx(Text, { dimColor: true, children: "C mark reviewed  r rerun reviewer  O open PR" })] })) });
        for (const r of awaitingReviewRuns) {
            const title = r.metadata?.title ?? "";
            const isSelected = selectableIndex === selectedIndex;
            allItems.push({ key: `review-${r.id}`, node: (_jsxs(Text, { inverse: isSelected, bold: isSelected, children: [isSelected ? ">" : " ", _jsxs(Text, { color: "cyan", children: [" #", r.issueNumber] }), " ", modeBadge(r.mode), " ", _jsx(Text, { dimColor: true, children: truncTitle(title, 30) }), "  ", _jsx(Text, { dimColor: true, children: formatAge(r.updatedAt) }), "  ", r.prUrl ? _jsx(Text, { color: "cyan", children: r.prUrl }) : _jsx(Text, { dimColor: true, children: "no PR" })] })) });
            selectableIndex++;
        }
    }
    // Ready to merge section
    if (readyToMergeRuns.length > 0) {
        allItems.push({ key: "merge-sep", node: _jsx(Text, { dimColor: true, children: "\u2500".repeat(50) }) });
        allItems.push({ key: "merge-hdr", node: (_jsxs(Box, { gap: 2, children: [_jsxs(Text, { bold: true, color: "green", children: ["Ready to Merge (", readyToMergeRuns.length, ")"] }), _jsx(Text, { dimColor: true, children: "C mark done  O open PR" })] })) });
        for (const r of readyToMergeRuns) {
            const title = r.metadata?.title ?? "";
            const isSelected = selectableIndex === selectedIndex;
            allItems.push({ key: `merge-${r.id}`, node: (_jsxs(Text, { inverse: isSelected, bold: isSelected, children: [isSelected ? ">" : " ", _jsxs(Text, { color: "green", children: [" #", r.issueNumber] }), " ", modeBadge(r.mode), " ", _jsx(Text, { dimColor: true, children: truncTitle(title, 30) }), "  ", _jsx(Text, { dimColor: true, children: formatAge(r.updatedAt) }), "  ", r.prUrl ? _jsx(Text, { color: "cyan", children: r.prUrl }) : null] })) });
            selectableIndex++;
        }
    }
    // Escalated runs section
    if (escalatedRuns.length > 0) {
        allItems.push({ key: "escalated-sep", node: _jsx(Text, { dimColor: true, children: "\u2500".repeat(50) }) });
        allItems.push({ key: "escalated-hdr", node: (_jsxs(Box, { gap: 2, children: [_jsxs(Text, { bold: true, color: "yellow", children: ["Escalated (", escalatedRuns.length, ")"] }), _jsx(Text, { dimColor: true, children: "Enter open  T take-over" })] })) });
        for (const r of escalatedRuns) {
            const title = r.metadata?.title ?? "";
            const isSelected = selectableIndex === selectedIndex;
            allItems.push({ key: `escalated-${r.id}`, node: (_jsxs(Text, { inverse: isSelected, bold: isSelected, children: [isSelected ? ">" : " ", _jsxs(Text, { color: "yellow", children: [" #", r.issueNumber] }), " ", _jsx(Text, { dimColor: true, children: r.currentPhase ?? "" }), " ", _jsx(Text, { dimColor: true, children: truncTitle(title, 25) }), "  ", _jsx(Text, { dimColor: true, children: formatAge(r.updatedAt) }), "  ", r.blockedReason ? _jsx(Text, { color: "yellow", children: truncTitle(r.blockedReason, 30) }) : null] })) });
            selectableIndex++;
        }
    }
    // Failed runs section
    if (failedRuns.length > 0) {
        allItems.push({ key: "failed-sep", node: _jsx(Text, { dimColor: true, children: "\u2500".repeat(50) }) });
        allItems.push({ key: "failed-hdr", node: (_jsxs(Box, { gap: 2, children: [_jsxs(Text, { bold: true, color: "red", children: ["Failed (", failedRuns.length, ")"] }), _jsx(Text, { dimColor: true, children: "r retry  Enter open" })] })) });
        for (const r of failedRuns) {
            const title = r.metadata?.title ?? "";
            const isSelected = selectableIndex === selectedIndex;
            allItems.push({ key: `failed-${r.id}`, node: (_jsxs(Text, { inverse: isSelected, bold: isSelected, children: [isSelected ? ">" : " ", _jsxs(Text, { color: "red", children: [" #", r.issueNumber] }), " ", _jsx(Text, { dimColor: true, children: r.currentPhase ?? "" }), " ", _jsx(Text, { dimColor: true, children: truncTitle(title, 25) }), "  ", _jsx(Text, { dimColor: true, children: formatAge(r.updatedAt) })] })) });
            selectableIndex++;
        }
    }
    if (allItems.length === 0) {
        allItems.push({ key: "empty", node: _jsx(Text, { dimColor: true, children: "No pending items. All clear!" }) });
    }
    const totalSelectable = items.length + planRevisionRuns.length + awaitingReviewRuns.length + readyToMergeRuns.length + escalatedRuns.length + failedRuns.length;
    const visible = allItems.slice(0, Math.max(height - 4, 5));
    return (_jsxs(Box, { flexDirection: "column", flexGrow: 1, paddingLeft: 1, paddingRight: 1, children: [_jsxs(Box, { justifyContent: "space-between", flexShrink: 0, children: [_jsx(Text, { bold: true, color: "cyan", children: "Review Inbox" }), _jsxs(Text, { dimColor: true, children: [totalSelectable, " items  j/k nav  Enter open run  Esc back"] })] }), _jsx(Box, { flexDirection: "column", marginTop: 1, flexGrow: 1, children: visible.map((item) => (_jsx(Box, { children: item.node }, item.key))) })] }));
}
