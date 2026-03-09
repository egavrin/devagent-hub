import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
export function InputBar({ isActive, onSubmit }) {
    const [value, setValue] = useState("");
    const [sent, setSent] = useState(false);
    if (!isActive)
        return null;
    const handleSubmit = (text) => {
        if (!text.trim())
            return;
        onSubmit(text);
        setValue("");
        setSent(true);
        setTimeout(() => setSent(false), 1000);
    };
    return (_jsxs(Box, { children: [_jsxs(Text, { color: "green", children: [">", " "] }), sent ? (_jsx(Text, { color: "green", children: "Sent" })) : (_jsx(TextInput, { value: value, onChange: setValue, onSubmit: handleSubmit })), _jsx(Text, { dimColor: true, children: "  [Esc to exit input]" })] }));
}
