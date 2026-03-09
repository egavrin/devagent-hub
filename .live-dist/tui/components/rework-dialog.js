import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
export function ReworkDialog({ issueNumber, note, onChangeNote, onSubmit, onCancel }) {
    return (_jsxs(Box, { borderStyle: "double", borderColor: "yellow", flexDirection: "column", paddingLeft: 1, paddingRight: 1, width: 60, children: [_jsxs(Text, { bold: true, color: "yellow", children: ["Rework Plan -- #", issueNumber] }), _jsxs(Box, { marginTop: 1, children: [_jsx(Text, { children: "Feedback: " }), _jsx(TextInput, { value: note, onChange: onChangeNote, onSubmit: onSubmit })] }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { dimColor: true, children: "Enter to submit (empty = no note)  Esc cancel" }) })] }));
}
