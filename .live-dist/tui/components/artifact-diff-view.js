import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
function truncate(s, max) {
    return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
}
function flattenData(data, prefix = "") {
    const entries = [];
    for (const [k, v] of Object.entries(data)) {
        const fullKey = prefix ? `${prefix}.${k}` : k;
        if (v !== null && typeof v === "object" && !Array.isArray(v)) {
            entries.push(...flattenData(v, fullKey));
        }
        else if (Array.isArray(v)) {
            entries.push({ key: fullKey, value: `[${v.length} items]` });
        }
        else {
            entries.push({ key: fullKey, value: String(v ?? "") });
        }
    }
    return entries;
}
function computeDiff(older, newer) {
    const oldEntries = flattenData(older);
    const newEntries = flattenData(newer);
    const oldMap = new Map(oldEntries.map((e) => [e.key, e.value]));
    const newMap = new Map(newEntries.map((e) => [e.key, e.value]));
    const allKeys = new Set([...oldMap.keys(), ...newMap.keys()]);
    const lines = [];
    for (const key of allKeys) {
        const oldVal = oldMap.get(key);
        const newVal = newMap.get(key);
        if (oldVal === undefined) {
            lines.push({ key, status: "added", newValue: newVal });
        }
        else if (newVal === undefined) {
            lines.push({ key, status: "removed", oldValue: oldVal });
        }
        else if (oldVal !== newVal) {
            lines.push({ key, status: "changed", oldValue: oldVal, newValue: newVal });
        }
        else {
            lines.push({ key, status: "same", oldValue: oldVal, newValue: newVal });
        }
    }
    // Sort: changes first, then additions, then removals, then same
    const order = { changed: 0, added: 1, removed: 2, same: 3 };
    lines.sort((a, b) => order[a.status] - order[b.status]);
    return lines;
}
const STATUS_COLORS = {
    changed: "yellow",
    added: "green",
    removed: "red",
    same: "gray",
};
const STATUS_ICONS = {
    changed: "~",
    added: "+",
    removed: "-",
    same: " ",
};
export function ArtifactDiffView({ older, newer, height }) {
    const diff = computeDiff(older.data, newer.data);
    const changes = diff.filter((d) => d.status !== "same");
    const unchangedCount = diff.length - changes.length;
    // Show summary comparison first
    const summaryChanged = older.summary !== newer.summary;
    const lines = [];
    lines.push({ key: "hdr", node: (_jsxs(Text, { bold: true, children: ["Comparing ", _jsx(Text, { color: "cyan", children: older.type }), " ", _jsx(Text, { dimColor: true, children: older.createdAt.slice(11, 19) }), " vs ", _jsx(Text, { dimColor: true, children: newer.createdAt.slice(11, 19) })] })) });
    if (summaryChanged) {
        lines.push({ key: "sum-old", node: (_jsxs(Text, { children: [_jsx(Text, { color: "red", children: "- " }), _jsx(Text, { dimColor: true, children: truncate(older.summary, 70) })] })) });
        lines.push({ key: "sum-new", node: (_jsxs(Text, { children: [_jsx(Text, { color: "green", children: "+ " }), truncate(newer.summary, 70)] })) });
    }
    else {
        lines.push({ key: "sum-same", node: (_jsxs(Text, { dimColor: true, children: ["  Summary unchanged: ", truncate(older.summary, 60)] })) });
    }
    lines.push({ key: "sep", node: (_jsx(Text, { dimColor: true, children: "\u2500".repeat(40) })) });
    lines.push({ key: "stats", node: (_jsxs(Text, { children: [_jsxs(Text, { color: "yellow", children: [changes.length, " changed"] }), "  ", _jsxs(Text, { dimColor: true, children: [unchangedCount, " unchanged"] })] })) });
    // Show changes
    for (const d of changes.slice(0, height - 8)) {
        const color = STATUS_COLORS[d.status];
        const icon = STATUS_ICONS[d.status];
        if (d.status === "changed") {
            lines.push({ key: `diff-${d.key}`, node: (_jsxs(Text, { children: [_jsxs(Text, { color: color, children: [icon, " ", d.key, ": "] }), _jsx(Text, { color: "red", children: truncate(d.oldValue ?? "", 30) }), _jsxs(Text, { dimColor: true, children: [" ", "\u2192", " "] }), _jsx(Text, { color: "green", children: truncate(d.newValue ?? "", 30) })] })) });
        }
        else {
            lines.push({ key: `diff-${d.key}`, node: (_jsxs(Text, { color: color, children: [icon, " ", d.key, ": ", truncate(d.status === "added" ? d.newValue ?? "" : d.oldValue ?? "", 50)] })) });
        }
    }
    if (changes.length > height - 8) {
        lines.push({ key: "more", node: (_jsxs(Text, { dimColor: true, children: ["  ...", changes.length - (height - 8), " more changes"] })) });
    }
    if (changes.length === 0) {
        lines.push({ key: "no-changes", node: (_jsx(Text, { dimColor: true, children: "No data changes between versions" })) });
    }
    return (_jsx(Box, { flexDirection: "column", paddingLeft: 1, children: lines.slice(0, height).map((l) => (_jsx(Box, { children: l.node }, l.key))) }));
}
