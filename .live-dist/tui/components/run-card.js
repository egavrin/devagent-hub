import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import { toRunCardViewModel } from "../view-models.js";
export function RunCard({ run, isSelected, isActive, layoutMode = "normal" }) {
    const vm = toRunCardViewModel(run);
    if (layoutMode === "narrow") {
        return _jsx(NarrowRunCard, { vm: vm, isSelected: isSelected, isActive: isActive });
    }
    return _jsx(DefaultRunCard, { vm: vm, isSelected: isSelected, isActive: isActive });
}
/** Compact single-line card for narrow terminals */
function NarrowRunCard({ vm, isSelected, isActive }) {
    return (_jsx(Box, { paddingLeft: 1, children: _jsxs(Text, { bold: isSelected, inverse: isSelected, color: isSelected ? "blue" : undefined, children: [isActive ? _jsx(Text, { color: "green", children: "*" }) : " ", "#", vm.issueNumber, " ", _jsx(Text, { color: vm.statusColor, children: vm.humanStatus }), " ", vm.title.length > 20 ? vm.title.slice(0, 19) + "\u2026" : vm.title, " ", vm.age] }) }));
}
/** Standard 3-line card for normal/wide terminals */
function DefaultRunCard({ vm, isSelected, isActive }) {
    const titleShort = vm.title.length > 22 ? vm.title.slice(0, 21) + "\u2026" : vm.title;
    return (_jsxs(Box, { flexDirection: "column", paddingLeft: 1, children: [_jsxs(Text, { bold: isSelected, inverse: isSelected, color: isSelected ? "blue" : undefined, children: [isActive ? _jsx(Text, { color: "green", children: "*" }) : " ", "#", vm.issueNumber, " ", titleShort] }), _jsxs(Text, { dimColor: true, children: ["  ", vm.phase, _jsxs(Text, { color: vm.statusColor, children: [" ", vm.humanStatus] }), vm.repairRound > 0 ? ` r${vm.repairRound}` : "", " ", vm.age] }), _jsxs(Text, { dimColor: true, children: ["  ", vm.hasPr ? _jsx(Text, { color: "green", children: "PR " }) : null, vm.blockedReason ? (_jsxs(Text, { color: "red", children: ["! ", vm.blockedReason.length > 20 ? vm.blockedReason.slice(0, 19) + "\u2026" : vm.blockedReason, " "] })) : null, isSelected && vm.suggestedAction ? (_jsxs(Text, { color: "yellow", children: ["[", vm.suggestedAction.key, "] ", vm.suggestedAction.label] })) : null] })] }));
}
