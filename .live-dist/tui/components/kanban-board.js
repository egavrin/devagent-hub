import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { toOperatorStatus } from "../status-map.js";
import { Column } from "./column.js";
export const OPERATOR_BUCKETS = [
    {
        title: "Needs Action",
        color: "yellow",
        match: (r) => toOperatorStatus(r.status) === "Needs Action",
    },
    {
        title: "Running",
        color: "blue",
        match: (r) => toOperatorStatus(r.status) === "Running",
    },
    {
        title: "Queued",
        color: "gray",
        match: (r) => toOperatorStatus(r.status) === "Queued",
    },
    {
        title: "Waiting",
        color: "white",
        match: (r) => toOperatorStatus(r.status) === "Waiting",
    },
    {
        title: "Done",
        color: "green",
        match: (r) => toOperatorStatus(r.status) === "Done",
    },
    {
        title: "Blocked",
        color: "red",
        match: (r) => toOperatorStatus(r.status) === "Blocked",
    },
];
export function KanbanBoard({ runs, selectedRunId, activeRunId, focusedColumnIndex, isFocused, compactMode = true }) {
    // Build bucket runs
    const bucketRuns = OPERATOR_BUCKETS.map((bucket) => ({
        bucket,
        runs: runs.filter(bucket.match),
    }));
    // In compact mode, filter out empty buckets but track collapsed ones
    const visibleBuckets = compactMode
        ? bucketRuns.filter((b) => b.runs.length > 0)
        : bucketRuns;
    const collapsedBuckets = compactMode
        ? bucketRuns.filter((b) => b.runs.length === 0)
        : [];
    // Map focusedColumnIndex to visible bucket index
    const clampedFocusIndex = Math.min(focusedColumnIndex, Math.max(0, visibleBuckets.length - 1));
    return (_jsxs(Box, { flexDirection: "column", width: "100%", children: [collapsedBuckets.length > 0 && (_jsx(Box, { paddingLeft: 1, flexShrink: 0, children: collapsedBuckets.map((b, i) => (_jsxs(Text, { dimColor: true, children: [i > 0 ? "  " : "", b.bucket.title, "(0)"] }, b.bucket.title))) })), _jsxs(Box, { flexDirection: "row", width: "100%", children: [visibleBuckets.map((b, i) => (_jsx(Column, { title: b.bucket.title, runs: b.runs, selectedRunId: selectedRunId, activeRunId: activeRunId, isFocused: isFocused && i === clampedFocusIndex, titleColor: b.bucket.color }, b.bucket.title))), visibleBuckets.length === 0 && (_jsx(Box, { padding: 1, children: _jsx(Text, { dimColor: true, children: "No workflow runs yet \u2014 press N to start" }) }))] })] }));
}
