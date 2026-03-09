import { jsx as _jsx } from "react/jsx-runtime";
import { Box } from "ink";
import { NewRunDialog } from "./new-run-dialog.js";
import { ReworkDialog } from "./rework-dialog.js";
import { CommandPalette } from "./command-palette.js";
import { HelpDialog } from "./help-dialog.js";
import { RerunDialog } from "./rerun-dialog.js";
export function DialogLayer({ dialog, termWidth, newRunForm, profiles, runners, onChangeSourceType, onChangeSourceId, onChangeMode, onChangeProfile, onChangeRunner, onChangeModel, onChangeGateStrictness, onChangePriority, onNewRunSubmit, selectedRun, reworkNote, onChangeReworkNote, onReworkSubmit, paletteActions, onPaletteSubmit, config, rerunProfileIndex, onRerunSubmit, onClose, }) {
    if (!dialog)
        return null;
    if (dialog === "new-run") {
        return (_jsx(Box, { position: "absolute", marginTop: 5, marginLeft: Math.floor((termWidth - 52) / 2), children: _jsx(NewRunDialog, { form: newRunForm, profiles: profiles, runners: runners, onChangeSourceType: onChangeSourceType, onChangeSourceId: onChangeSourceId, onChangeMode: onChangeMode, onChangeProfile: onChangeProfile, onChangeRunner: onChangeRunner, onChangeModel: onChangeModel, onChangeGateStrictness: onChangeGateStrictness, onChangePriority: onChangePriority, onSubmit: onNewRunSubmit, onCancel: onClose }) }));
    }
    if (dialog === "rework" && selectedRun) {
        return (_jsx(Box, { position: "absolute", marginTop: 5, marginLeft: Math.floor((termWidth - 62) / 2), children: _jsx(ReworkDialog, { issueNumber: selectedRun.issueNumber, note: reworkNote, onChangeNote: onChangeReworkNote, onSubmit: onReworkSubmit, onCancel: onClose }) }));
    }
    if (dialog === "command-palette") {
        return (_jsx(Box, { position: "absolute", marginTop: 5, marginLeft: Math.floor((termWidth - 52) / 2), children: _jsx(CommandPalette, { actions: paletteActions, onSubmit: (actionId) => {
                    onClose();
                    onPaletteSubmit(actionId);
                }, onCancel: onClose }) }));
    }
    if (dialog === "help") {
        return (_jsx(Box, { position: "absolute", marginTop: 2, marginLeft: Math.floor((termWidth - 62) / 2), children: _jsx(HelpDialog, { onClose: onClose }) }));
    }
    if (dialog === "rerun" && config) {
        return (_jsx(Box, { position: "absolute", marginTop: 5, marginLeft: Math.floor((termWidth - 52) / 2), children: _jsx(RerunDialog, { profiles: Object.keys(config.profiles), selectedIndex: rerunProfileIndex, onSelect: onRerunSubmit, onCancel: onClose }) }));
    }
    return null;
}
