import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Box, Text } from "ink";
const TERMINAL_STATUSES = new Set(["done", "failed", "escalated"]);
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
export function RunnersView({ config, runs = [], agentRuns = [], runnerInfos = [], height }) {
    const profiles = Object.entries(config.profiles);
    const roles = Object.entries(config.roles);
    const policy = config.selection_policy;
    // Count active runs per profile
    const activeRuns = runs.filter((r) => !TERMINAL_STATUSES.has(r.status));
    const runsByProfile = new Map();
    for (const r of activeRuns) {
        if (r.agentProfile) {
            const list = runsByProfile.get(r.agentProfile) ?? [];
            list.push(r);
            runsByProfile.set(r.agentProfile, list);
        }
    }
    // Compute failure rates per profile from recent agent runs
    const recentAgentRuns = agentRuns.slice(-50);
    const failureByProfile = new Map();
    for (const ar of recentAgentRuns) {
        const p = ar.profile ?? "default";
        const entry = failureByProfile.get(p) ?? { total: 0, failed: 0 };
        entry.total++;
        if (ar.status === "failed" || ar.status === "timeout")
            entry.failed++;
        failureByProfile.set(p, entry);
    }
    // Latest agent run per profile for "last activity"
    const lastRunByProfile = new Map();
    for (const ar of recentAgentRuns) {
        const p = ar.profile ?? "default";
        lastRunByProfile.set(p, ar);
    }
    return (_jsxs(Box, { flexDirection: "column", flexGrow: 1, paddingLeft: 1, paddingRight: 1, height: height, children: [_jsxs(Box, { justifyContent: "space-between", flexShrink: 0, children: [_jsx(Text, { bold: true, color: "cyan", children: "Runner Registry" }), _jsx(Text, { dimColor: true, children: "Esc back  Q quit" })] }), runnerInfos.length > 0 && (_jsxs(Box, { flexDirection: "column", borderStyle: "single", borderColor: "gray", marginTop: 1, paddingLeft: 1, paddingRight: 1, children: [_jsxs(Text, { bold: true, children: ["Live Runners (", runnerInfos.length, ")"] }), runnerInfos.map((info) => (_jsxs(Box, { flexDirection: "column", marginTop: 0, children: [_jsxs(Box, { children: [_jsxs(Text, { bold: true, color: info.healthy ? "green" : "red", children: [info.healthy ? "●" : "○", " ", info.bin] }), info.version && _jsxs(Text, { dimColor: true, children: ["  v", info.version] })] }), _jsxs(Box, { paddingLeft: 2, children: [_jsx(Text, { dimColor: true, children: "phases: " }), _jsx(Text, { children: info.supportedPhases.join(", ") || "all" }), info.availableProviders.length > 0 && (_jsxs(_Fragment, { children: [_jsx(Text, { dimColor: true, children: "  providers: " }), _jsx(Text, { children: info.availableProviders.join(", ") })] })), info.supportedApprovalModes.length > 0 && (_jsxs(_Fragment, { children: [_jsx(Text, { dimColor: true, children: "  approval: " }), _jsx(Text, { children: info.supportedApprovalModes.join(", ") })] })), info.mcpServers.length > 0 && (_jsxs(_Fragment, { children: [_jsx(Text, { dimColor: true, children: "  mcp: " }), _jsxs(Text, { children: ["[", info.mcpServers.join(", "), "]"] })] })), info.tools.length > 0 && (_jsxs(_Fragment, { children: [_jsx(Text, { dimColor: true, children: "  tools: " }), _jsxs(Text, { children: ["[", info.tools.join(", "), "]"] })] }))] })] }, info.bin)))] })), _jsxs(Box, { flexDirection: "column", borderStyle: "single", borderColor: "gray", marginTop: 1, paddingLeft: 1, paddingRight: 1, children: [_jsxs(Text, { bold: true, children: ["Profiles (", profiles.length, ")"] }), profiles.map(([name, profile]) => {
                        const count = runsByProfile.get(name)?.length ?? 0;
                        const failure = failureByProfile.get(name);
                        const lastRun = lastRunByProfile.get(name);
                        const failRate = failure && failure.total > 0
                            ? Math.round((failure.failed / failure.total) * 100)
                            : null;
                        return (_jsxs(Box, { flexDirection: "column", marginTop: 0, children: [_jsxs(Box, { children: [_jsx(Text, { bold: true, color: "green", children: name }), count > 0 && _jsxs(Text, { color: "yellow", children: [" (", count, " active)"] }), _jsx(Text, { dimColor: true, children: "  bin:" }), _jsxs(Text, { children: [" ", profile.bin ?? "default"] }), _jsx(Text, { dimColor: true, children: "  provider:" }), _jsxs(Text, { children: [" ", profile.provider ?? "default"] }), _jsx(Text, { dimColor: true, children: "  model:" }), _jsxs(Text, { children: [" ", profile.model ?? "default"] })] }), _jsxs(Box, { paddingLeft: 2, children: [_jsx(Text, { dimColor: true, children: "reasoning:" }), _jsxs(Text, { children: [" ", profile.reasoning ?? "default"] }), _jsx(Text, { dimColor: true, children: "  approval:" }), _jsxs(Text, { children: [" ", profile.approval_mode ?? "default"] }), profile.capabilities && profile.capabilities.length > 0 && (_jsxs(_Fragment, { children: [_jsx(Text, { dimColor: true, children: "  caps:" }), _jsxs(Text, { children: [" [", profile.capabilities.join(", "), "]"] })] })), failRate !== null && (_jsxs(_Fragment, { children: [_jsx(Text, { dimColor: true, children: "  fail:" }), _jsxs(Text, { color: failRate > 30 ? "red" : failRate > 10 ? "yellow" : "green", children: [" ", failRate, "%"] }), _jsxs(Text, { dimColor: true, children: [" (", failure.total, " runs)"] })] })), lastRun && (_jsxs(_Fragment, { children: [_jsx(Text, { dimColor: true, children: "  last:" }), _jsxs(Text, { children: [" ", formatAge(lastRun.startedAt), " ago"] })] }))] })] }, name));
                    })] }), runsByProfile.size > 0 && (_jsxs(Box, { flexDirection: "column", borderStyle: "single", borderColor: "gray", marginTop: 1, paddingLeft: 1, paddingRight: 1, children: [_jsx(Text, { bold: true, children: "Current Assignments" }), [...runsByProfile.entries()].map(([profileName, profileRuns]) => (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { bold: true, color: "green", children: ["  ", profileName, ":"] }), profileRuns.map((r) => {
                                const title = r.metadata?.title ?? "";
                                return (_jsxs(Box, { paddingLeft: 4, children: [_jsxs(Text, { children: ["#", r.issueNumber] }), _jsxs(Text, { dimColor: true, children: [" ", r.currentPhase ?? r.status] }), _jsxs(Text, { dimColor: true, children: [" ", title.length > 25 ? title.slice(0, 24) + "\u2026" : title] })] }, r.id));
                            })] }, profileName)))] })), _jsxs(Box, { flexDirection: "column", borderStyle: "single", borderColor: "gray", marginTop: 1, paddingLeft: 1, paddingRight: 1, children: [_jsx(Text, { bold: true, children: "Roles (phase \u2192 profile)" }), roles.map(([phase, profile]) => (_jsxs(Box, { flexDirection: "row", children: [_jsxs(Text, { dimColor: true, children: [phase, ":"] }), _jsxs(Text, { bold: true, children: [" ", profile] })] }, phase)))] }), policy && policy.rules.length > 0 && (_jsxs(Box, { flexDirection: "column", borderStyle: "single", borderColor: "gray", marginTop: 1, paddingLeft: 1, paddingRight: 1, children: [_jsxs(Text, { bold: true, children: ["Selection Policy (", policy.rules.length, " rules)"] }), policy.rules.map((rule, i) => (_jsxs(Box, { flexDirection: "row", children: [_jsx(Text, { dimColor: true, children: "phases:" }), _jsxs(Text, { children: [" [", rule.phases.join(", "), "]"] }), rule.complexity && (_jsxs(_Fragment, { children: [_jsx(Text, { dimColor: true, children: "  complexity:" }), _jsxs(Text, { children: [" [", rule.complexity.join(", "), "]"] })] })), _jsx(Text, { dimColor: true, children: "  \u2192 " }), _jsx(Text, { bold: true, color: "green", children: rule.profile })] }, i)))] }))] }));
}
