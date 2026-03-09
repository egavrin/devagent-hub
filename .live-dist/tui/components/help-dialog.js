import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
function Section({ title, bindings }) {
    return (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsx(Text, { bold: true, underline: true, children: title }), bindings.map(([key, desc]) => (_jsxs(Box, { children: [_jsx(Box, { width: 16, children: _jsx(Text, { color: "cyan", children: key }) }), _jsx(Text, { children: desc })] }, key)))] }));
}
export function HelpDialog({ onClose }) {
    return (_jsxs(Box, { borderStyle: "double", borderColor: "blue", flexDirection: "column", paddingLeft: 1, paddingRight: 1, width: 60, children: [_jsx(Text, { bold: true, color: "blue", children: "Keybindings" }), _jsxs(Box, { marginTop: 1, flexDirection: "column", children: [_jsx(Section, { title: "Navigation", bindings: [
                            ["j/k or arrows", "Move up/down"],
                            ["h/l or arrows", "Move left/right"],
                            ["Enter", "Select / open run"],
                            ["Tab / Shift+Tab", "Next / previous pane"],
                            ["gg", "Go to top"],
                            ["G", "Go to bottom"],
                            ["1-5", "Pane shortcuts (run screen)"],
                            ["Esc", "Back / close dialog"],
                        ] }), _jsx(Section, { title: "Run Actions", bindings: [
                            ["a", "Approve plan"],
                            ["w", "Rework plan"],
                            ["c", "Continue workflow"],
                            ["r", "Retry failed run"],
                            ["K", "Kill active agent"],
                            ["d", "Delete run"],
                            ["n", "New run"],
                            ["p", "Pause run"],
                            ["t", "Take over (show worktree)"],
                            ["o", "Open PR externally"],
                        ] }), _jsx(Section, { title: "Log Modes", bindings: [
                            ["S", "Structured log view"],
                            ["L", "Raw log view"],
                        ] }), _jsx(Section, { title: "Views and Tools", bindings: [
                            ["/", "Toggle search/filter"],
                            [":", "Command palette"],
                            ["?", "This help screen"],
                            ["v", "Approvals view"],
                            ["f", "Toggle artifact diff"],
                            ["x", "Toggle autopilot"],
                            ["i", "Enter input mode"],
                            ["q", "Quit"],
                        ] })] }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { dimColor: true, children: "Press Esc to close" }) })] }));
}
