import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
const TABS = [
    { id: "summary", label: "Summary", key: "1" },
    { id: "timeline", label: "Timeline", key: "2" },
    { id: "artifacts", label: "Artifacts", key: "3" },
    { id: "logs", label: "Logs", key: "4" },
];
export function DetailTabBar({ activeTab }) {
    return (_jsxs(Box, { paddingLeft: 1, flexShrink: 0, children: [TABS.map((tab, i) => {
                const isActive = tab.id === activeTab;
                return (_jsxs(Text, { children: [i > 0 ? _jsx(Text, { dimColor: true, children: " | " }) : null, _jsxs(Text, { color: isActive ? "blue" : "gray", bold: isActive, inverse: isActive, children: [" ", tab.key, ":", tab.label, " "] })] }, tab.id));
            }), _jsx(Text, { dimColor: true, children: "  Tab/Shift+Tab to switch" })] }));
}
