import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
/** Max hints to show in footer — keeps it scannable */
const MAX_HINTS = 8;
export function ContextFooter({ dialog, inputMode, actions, suggested }) {
    if (inputMode || dialog) {
        return null;
    }
    // Build hint list: suggested first (if any), then available actions, capped
    const hints = [];
    const seen = new Set();
    if (suggested) {
        hints.push({ key: suggested.hotkey, label: suggested.label, isSuggested: true });
        seen.add(suggested.id);
    }
    for (const action of actions) {
        if (seen.has(action.id))
            continue;
        if (hints.length >= MAX_HINTS)
            break;
        hints.push({ key: action.hotkey, label: action.label, isSuggested: false });
        seen.add(action.id);
    }
    return (_jsx(Box, { paddingLeft: 1, flexShrink: 0, children: hints.map((h, i) => (_jsxs(Text, { children: [i > 0 ? "  " : "", _jsx(Text, { color: h.isSuggested ? "yellow" : "gray", bold: h.isSuggested, children: h.key }), _jsxs(Text, { dimColor: !h.isSuggested, children: [" ", h.label] })] }, i))) }));
}
