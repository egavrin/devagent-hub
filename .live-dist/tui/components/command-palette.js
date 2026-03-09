import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
export function CommandPalette({ actions, onSubmit, onCancel }) {
    const [value, setValue] = useState("");
    const handleSubmit = (text) => {
        const trimmed = text.trim().toLowerCase();
        // Exact match by id or label
        const exact = actions.find((a) => a.id === trimmed || a.label.toLowerCase() === trimmed);
        if (exact) {
            onSubmit(exact.id);
            return;
        }
        // Otherwise take the first filtered match
        if (filtered.length > 0) {
            onSubmit(filtered[0].id);
        }
    };
    const filtered = value.trim()
        ? actions.filter((a) => {
            const q = value.trim().toLowerCase();
            return (a.id.includes(q) ||
                a.label.toLowerCase().includes(q) ||
                a.keywords.some((k) => k.includes(q)));
        })
        : actions;
    return (_jsxs(Box, { borderStyle: "double", borderColor: "magenta", flexDirection: "column", paddingLeft: 1, paddingRight: 1, width: 50, children: [_jsx(Text, { bold: true, color: "magenta", children: "Commands" }), _jsxs(Box, { marginTop: 1, children: [_jsx(Text, { color: "yellow", children: "> " }), _jsx(TextInput, { value: value, onChange: setValue, onSubmit: handleSubmit })] }), _jsxs(Box, { marginTop: 1, flexDirection: "column", children: [filtered.slice(0, 12).map((a) => (_jsxs(Box, { justifyContent: "space-between", children: [_jsx(Text, { children: a.label }), _jsx(Text, { dimColor: true, children: a.hotkey })] }, a.id))), filtered.length === 0 && _jsx(Text, { dimColor: true, children: "No matching commands" })] }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { dimColor: true, children: "Enter to run  Esc to close" }) })] }));
}
