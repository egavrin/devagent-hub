import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from "ink";
function eventIcon(type) {
    switch (type) {
        case "tool_call": return "*";
        case "tool_result": return "=";
        case "thinking": return "~";
        case "output": return ">>";
        case "error": return "!";
        default: return "?";
    }
}
function eventColor(type) {
    switch (type) {
        case "tool_call": return "cyan";
        case "tool_result": return "green";
        case "thinking": return "gray";
        case "output": return "white";
        case "error": return "red";
        default: return "gray";
    }
}
export function StructuredView({ events, maxVisible = 50 }) {
    const visible = events.slice(-maxVisible);
    return (_jsxs(Box, { flexDirection: "column", children: [visible.map((event, i) => {
                const time = event.timestamp.split("T")[1]?.slice(0, 8) ?? "";
                const icon = eventIcon(event.type);
                const label = event.name ? `${event.type}:${event.name}` : event.type;
                const summary = event.summary ?? "";
                return (_jsxs(Text, { color: eventColor(event.type), children: [time, " ", icon, " ", label, " ", summary] }, i));
            }), visible.length === 0 && _jsx(Text, { dimColor: true, children: "No events yet..." })] }));
}
