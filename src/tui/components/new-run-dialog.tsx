import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { NewRunForm, NewRunSourceType, NewRunMode } from "../state.js";

interface NewRunDialogProps {
  form: NewRunForm;
  profiles: string[];
  runners: string[];
  onChangeSourceType: (t: NewRunSourceType) => void;
  onChangeSourceId: (v: string) => void;
  onChangeMode: (m: NewRunMode) => void;
  onChangeProfile: (p: string) => void;
  onChangeRunner: (r: string) => void;
  onChangeModel: (m: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function NewRunDialog({
  form,
  profiles,
  runners,
  onChangeSourceType,
  onChangeSourceId,
  onChangeMode,
  onChangeProfile,
  onChangeRunner,
  onChangeModel,
  onSubmit,
  onCancel,
}: NewRunDialogProps) {
  const visibleProfiles = profiles.slice(0, 5);

  return (
    <Box
      borderStyle="double"
      borderColor="green"
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      width={58}
    >
      <Text bold color="green">New Run</Text>

      {/* Source type */}
      <Box marginTop={1} gap={2}>
        <Text>Source:</Text>
        <Text
          bold={form.sourceType === "issue"}
          color={form.sourceType === "issue" ? "green" : "gray"}
          underline={form.sourceType === "issue"}
        >
          [1] Issue
        </Text>
        <Text
          bold={form.sourceType === "pr"}
          color={form.sourceType === "pr" ? "green" : "gray"}
          underline={form.sourceType === "pr"}
        >
          [2] PR
        </Text>
      </Box>

      {/* Source ID */}
      <Box marginTop={1}>
        <Text>{form.sourceType === "issue" ? "Issue" : "PR"} #: </Text>
        <TextInput
          value={form.sourceId}
          onChange={onChangeSourceId}
          onSubmit={onSubmit}
        />
      </Box>

      {/* Mode */}
      <Box marginTop={1} gap={1}>
        <Text>Mode:</Text>
        <Text
          bold={form.mode === "assisted"}
          color={form.mode === "assisted" ? "cyan" : "gray"}
          underline={form.mode === "assisted"}
        >
          [3] Assisted
        </Text>
        <Text
          bold={form.mode === "watch"}
          color={form.mode === "watch" ? "cyan" : "gray"}
          underline={form.mode === "watch"}
        >
          [4] Watch
        </Text>
        <Text
          bold={form.mode === "autopilot-once"}
          color={form.mode === "autopilot-once" ? "red" : "gray"}
          underline={form.mode === "autopilot-once"}
        >
          [5] Auto-once
        </Text>
      </Box>

      {/* Profile */}
      {visibleProfiles.length > 0 && (
        <Box marginTop={1} gap={1} flexWrap="wrap">
          <Text>Profile:</Text>
          <Text
            bold={form.profile === ""}
            color={form.profile === "" ? "magenta" : "gray"}
            underline={form.profile === ""}
          >
            [0] default
          </Text>
          {visibleProfiles.map((name, i) => {
            const key = 6 + i;
            const selected = form.profile === name;
            return (
              <Text
                key={name}
                bold={selected}
                color={selected ? "magenta" : "gray"}
                underline={selected}
              >
                [{key}] {name}
              </Text>
            );
          })}
        </Box>
      )}

      {/* Runner */}
      {runners.length > 1 && (
        <Box marginTop={1} gap={1} flexWrap="wrap">
          <Text>Runner:</Text>
          <Text
            bold={form.runner === ""}
            color={form.runner === "" ? "blue" : "gray"}
            underline={form.runner === ""}
          >
            auto
          </Text>
          {runners.map((name) => {
            const selected = form.runner === name;
            return (
              <Text
                key={name}
                bold={selected}
                color={selected ? "blue" : "gray"}
              >
                {" "}{name}{selected ? "*" : ""}
              </Text>
            );
          })}
          <Text dimColor> (Tab to cycle)</Text>
        </Box>
      )}

      {/* Model override */}
      <Box marginTop={1}>
        <Text>Model: </Text>
        <Text dimColor>{form.model || "(from profile)"}</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Enter submit  Esc cancel
        </Text>
      </Box>
    </Box>
  );
}
