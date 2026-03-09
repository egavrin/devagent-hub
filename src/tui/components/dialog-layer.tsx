import React from "react";
import { Box } from "ink";
import type { WorkflowRun } from "../../state/types.js";
import type { WorkflowConfig } from "../../workflow/config.js";
import type { Dialog, NewRunForm, NewRunSourceType, NewRunMode, GateStrictness, RunPriority } from "../state.js";
import type { Action } from "../action-registry.js";
import { NewRunDialog } from "./new-run-dialog.js";
import { ReworkDialog } from "./rework-dialog.js";
import { CommandPalette } from "./command-palette.js";
import { HelpDialog } from "./help-dialog.js";
import { RerunDialog } from "./rerun-dialog.js";

interface DialogLayerProps {
  dialog: Dialog;
  termWidth: number;
  // New run dialog
  newRunForm: NewRunForm;
  profiles: string[];
  runners: string[];
  onChangeSourceType: (t: NewRunSourceType) => void;
  onChangeSourceId: (v: string) => void;
  onChangeMode: (m: NewRunMode) => void;
  onChangeProfile: (p: string) => void;
  onChangeRunner: (r: string) => void;
  onChangeModel: (m: string) => void;
  onChangeGateStrictness: (g: GateStrictness) => void;
  onChangePriority: (p: RunPriority) => void;
  onNewRunSubmit: () => void;
  // Rework dialog
  selectedRun: WorkflowRun | null;
  reworkNote: string;
  onChangeReworkNote: (v: string) => void;
  onReworkSubmit: () => void;
  // Command palette
  paletteActions: Action[];
  onPaletteSubmit: (actionId: string) => void;
  // Rerun dialog
  config: WorkflowConfig | undefined;
  rerunProfileIndex: number;
  onRerunSubmit: (profileName: string) => void;
  // Common
  onClose: () => void;
}

export function DialogLayer({
  dialog,
  termWidth,
  newRunForm,
  profiles,
  runners,
  onChangeSourceType,
  onChangeSourceId,
  onChangeMode,
  onChangeProfile,
  onChangeRunner,
  onChangeModel,
  onChangeGateStrictness,
  onChangePriority,
  onNewRunSubmit,
  selectedRun,
  reworkNote,
  onChangeReworkNote,
  onReworkSubmit,
  paletteActions,
  onPaletteSubmit,
  config,
  rerunProfileIndex,
  onRerunSubmit,
  onClose,
}: DialogLayerProps) {
  if (!dialog) return null;

  if (dialog === "new-run") {
    return (
      <Box position="absolute" marginTop={5} marginLeft={Math.floor((termWidth - 52) / 2)}>
        <NewRunDialog
          form={newRunForm}
          profiles={profiles}
          runners={runners}
          onChangeSourceType={onChangeSourceType}
          onChangeSourceId={onChangeSourceId}
          onChangeMode={onChangeMode}
          onChangeProfile={onChangeProfile}
          onChangeRunner={onChangeRunner}
          onChangeModel={onChangeModel}
          onChangeGateStrictness={onChangeGateStrictness}
          onChangePriority={onChangePriority}
          onSubmit={onNewRunSubmit}
          onCancel={onClose}
        />
      </Box>
    );
  }

  if (dialog === "rework" && selectedRun) {
    return (
      <Box position="absolute" marginTop={5} marginLeft={Math.floor((termWidth - 62) / 2)}>
        <ReworkDialog
          issueNumber={selectedRun.issueNumber}
          note={reworkNote}
          onChangeNote={onChangeReworkNote}
          onSubmit={onReworkSubmit}
          onCancel={onClose}
        />
      </Box>
    );
  }

  if (dialog === "command-palette") {
    return (
      <Box position="absolute" marginTop={5} marginLeft={Math.floor((termWidth - 52) / 2)}>
        <CommandPalette
          actions={paletteActions}
          onSubmit={(actionId) => {
            onClose();
            onPaletteSubmit(actionId);
          }}
          onCancel={onClose}
        />
      </Box>
    );
  }

  if (dialog === "help") {
    return (
      <Box position="absolute" marginTop={2} marginLeft={Math.floor((termWidth - 62) / 2)}>
        <HelpDialog onClose={onClose} />
      </Box>
    );
  }

  if (dialog === "rerun" && config) {
    return (
      <Box position="absolute" marginTop={5} marginLeft={Math.floor((termWidth - 52) / 2)}>
        <RerunDialog
          profiles={Object.keys(config.profiles)}
          selectedIndex={rerunProfileIndex}
          onSelect={onRerunSubmit}
          onCancel={onClose}
        />
      </Box>
    );
  }

  return null;
}
