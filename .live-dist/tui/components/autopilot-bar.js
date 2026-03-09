import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
export function AutopilotBar({ running, lastPoll, activeCount, totalDispatched, escalatedCount, maxEscalations, totalCostUsd, sessionMaxCostUsd }) {
    if (!running)
        return null;
    const pollAge = lastPoll
        ? `${Math.floor((Date.now() - new Date(lastPoll).getTime()) / 1000)}s ago`
        : "pending";
    const escalationPressure = (maxEscalations && maxEscalations > 0 && escalatedCount !== undefined)
        ? escalatedCount / maxEscalations
        : 0;
    const costPressure = (sessionMaxCostUsd && sessionMaxCostUsd > 0 && totalCostUsd !== undefined)
        ? totalCostUsd / sessionMaxCostUsd
        : 0;
    const pressureColor = Math.max(escalationPressure, costPressure) >= 0.8 ? "red"
        : Math.max(escalationPressure, costPressure) >= 0.5 ? "yellow"
            : "green";
    return (_jsxs(Box, { paddingLeft: 1, flexShrink: 0, children: [_jsx(Text, { color: "magenta", bold: true, children: "[AUTOPILOT] " }), _jsxs(Text, { color: "green", children: ["active:", activeCount] }), _jsxs(Text, { dimColor: true, children: ["  dispatched:", totalDispatched, "  poll:", pollAge] }), escalatedCount !== undefined && maxEscalations !== undefined && maxEscalations > 0 && (_jsxs(Text, { color: pressureColor, children: ["  esc:", escalatedCount, "/", maxEscalations] })), totalCostUsd !== undefined && totalCostUsd > 0 && (_jsxs(Text, { color: pressureColor, children: ["  cost:$", totalCostUsd.toFixed(2), sessionMaxCostUsd && sessionMaxCostUsd > 0 ? `/$${sessionMaxCostUsd.toFixed(2)}` : ""] }))] }));
}
