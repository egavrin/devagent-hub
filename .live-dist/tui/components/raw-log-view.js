import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
export function RawLogView({ lines, maxVisible = 50 }) {
    const visible = lines.slice(-maxVisible);
    return (_jsxs(Box, { flexDirection: "column", children: [visible.map((line, i) => (_jsx(Text, { wrap: "truncate", children: line.text }, i))), visible.length === 0 && _jsx(Text, { dimColor: true, children: "No output yet..." })] }));
}
