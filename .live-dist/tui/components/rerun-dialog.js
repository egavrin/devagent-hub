import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { Box, Text, useInput } from "ink";
export function RerunDialog({ profiles, selectedIndex, onSelect, onCancel }) {
    const [localIndex, setLocalIndex] = React.useState(selectedIndex);
    useInput((input, key) => {
        if (key.escape) {
            onCancel();
            return;
        }
        if (key.return) {
            const profile = profiles[localIndex];
            if (profile)
                onSelect(profile);
            return;
        }
        if (input === "j" || key.downArrow) {
            setLocalIndex((i) => Math.min(profiles.length - 1, i + 1));
        }
        if (input === "k" || key.upArrow) {
            setLocalIndex((i) => Math.max(0, i - 1));
        }
    });
    return (_jsxs(Box, { borderStyle: "double", borderColor: "magenta", flexDirection: "column", paddingLeft: 1, paddingRight: 1, width: 50, children: [_jsx(Text, { bold: true, color: "magenta", children: "Rerun with Profile" }), _jsx(Box, { flexDirection: "column", marginTop: 1, children: profiles.map((name, i) => (_jsx(Box, { children: _jsxs(Text, { color: i === localIndex ? "cyan" : undefined, bold: i === localIndex, children: [i === localIndex ? "> " : "  ", name] }) }, name))) }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { dimColor: true, children: "j/k navigate  Enter select  Esc cancel" }) })] }));
}
