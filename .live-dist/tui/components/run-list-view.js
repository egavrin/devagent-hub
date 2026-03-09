import { jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { RunCard } from "./run-card.js";
/** Single-column list for narrow terminals (<80 cols) */
export function RunListView({ runs, selectedRunId, activeRunId }) {
    if (runs.length === 0) {
        return (_jsx(Box, { padding: 1, children: _jsx(Text, { dimColor: true, children: "No workflow runs yet \u2014 press N to start" }) }));
    }
    return (_jsx(Box, { flexDirection: "column", width: "100%", children: runs.map((run) => (_jsx(RunCard, { run: run, isSelected: run.id === selectedRunId, isActive: run.id === activeRunId, layoutMode: "narrow" }, run.id))) }));
}
