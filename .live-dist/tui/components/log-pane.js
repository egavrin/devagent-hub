import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { StructuredView } from "./structured-view.js";
import { RawLogView } from "./raw-log-view.js";
export function LogPane({ selectedRun, logMode, events, outputLines, isFocused }) {
    if (!selectedRun) {
        return (_jsx(Box, { borderStyle: "single", borderColor: "gray", flexDirection: "column", flexGrow: 1, padding: 1, children: _jsx(Text, { dimColor: true, children: "Select a workflow run to view logs..." }) }));
    }
    const repoShort = selectedRun.repo.split("/").pop() ?? selectedRun.repo;
    const modeLabel = logMode === "structured" ? "[S]truct" : logMode === "errors" ? "[E]rrors" : "[L]og";
    const errorPattern = /error|fail/i;
    const errorEvents = events.filter((ev) => ev.type === "error" || errorPattern.test(ev.summary ?? "") || errorPattern.test(ev.type));
    return (_jsxs(Box, { borderStyle: isFocused ? "bold" : "single", borderColor: isFocused ? "blue" : "gray", flexDirection: "column", flexGrow: 1, padding: 1, children: [_jsxs(Box, { justifyContent: "space-between", children: [_jsxs(Text, { bold: true, children: [">", " #", selectedRun.issueNumber, " ", repoShort, " -- ", selectedRun.status] }), _jsx(Text, { dimColor: true, children: modeLabel })] }), _jsx(Box, { marginTop: 1, flexDirection: "column", flexGrow: 1, children: logMode === "structured" ? (_jsx(StructuredView, { events: events })) : logMode === "errors" ? (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { dimColor: true, children: ["Showing ", errorEvents.length, " errors of ", events.length, " total events"] }), _jsx(StructuredView, { events: errorEvents })] })) : (_jsx(RawLogView, { lines: outputLines })) })] }));
}
