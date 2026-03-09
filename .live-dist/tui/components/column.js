import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { RunCard } from "./run-card.js";
export function Column({ title, runs, selectedRunId, activeRunId, isFocused, titleColor, layoutMode = "normal" }) {
    return (_jsxs(Box, { flexDirection: "column", borderStyle: isFocused ? "bold" : "single", borderColor: isFocused ? "blue" : "gray", flexGrow: 1, flexBasis: 0, paddingRight: 1, children: [_jsxs(Text, { bold: true, color: isFocused ? "blue" : (titleColor ?? "white"), children: [" ", title, " (", runs.length, ")"] }), runs.map((run) => (_jsx(RunCard, { run: run, isSelected: run.id === selectedRunId, isActive: run.id === activeRunId, layoutMode: layoutMode }, run.id)))] }));
}
