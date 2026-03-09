import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { toRunCardViewModel } from "../view-models.js";
/** Quick preview pane shown alongside the board in wide terminals (>140 cols) */
export function RunCardPreview({ run }) {
    if (!run) {
        return _jsx(Text, { dimColor: true, children: "Select a run to preview" });
    }
    const vm = toRunCardViewModel(run);
    const title = run.metadata?.title;
    return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Text, { bold: true, color: "blue", children: ["#", vm.issueNumber] }), title && _jsx(Text, { children: title.length > 50 ? title.slice(0, 49) + "\u2026" : title }), _jsxs(Box, { marginTop: 1, gap: 2, children: [_jsx(Text, { color: vm.statusColor, bold: true, children: vm.humanStatus }), _jsx(Text, { dimColor: true, children: vm.phase }), _jsx(Text, { dimColor: true, children: vm.age })] }), vm.repairRound > 0 && _jsxs(Text, { dimColor: true, children: ["repair round: ", vm.repairRound] }), vm.hasPr && _jsxs(Text, { color: "green", children: ["PR: ", run.prUrl] }), run.branch && _jsxs(Text, { dimColor: true, children: ["branch: ", run.branch] }), run.agentProfile && _jsxs(Text, { dimColor: true, children: ["profile: ", run.agentProfile] }), run.actualModel && _jsxs(Text, { dimColor: true, children: ["model: ", run.actualModel] }), vm.blockedReason && (_jsx(Box, { marginTop: 1, children: _jsxs(Text, { color: "red", children: ["! ", vm.blockedReason] }) })), vm.suggestedAction && (_jsx(Box, { marginTop: 1, children: _jsxs(Text, { color: "yellow", children: ["Next: [", vm.suggestedAction.key, "] ", vm.suggestedAction.label] }) }))] }));
}
