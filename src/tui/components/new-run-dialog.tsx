import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { NewRunForm, NewRunSourceType, NewRunMode } from "../state.js";

interface NewRunDialogProps {
  form: NewRunForm;
  profiles: string[];
  onChangeSourceType: (t: NewRunSourceType) => void;
  onChangeSourceId: (v: string) => void;
  onChangeMode: (m: NewRunMode) => void;
  onChangeProfile: (p: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function NewRunDialog({
  form,
  profiles,
  onChangeSourceType,
  onChangeSourceId,
  onChangeMode,
  onChangeProfile,
  onSubmit,
  onCancel,
}: NewRunDialogProps) {
  // Show up to 5 profiles, numbered starting at 5
  const visibleProfiles = profiles.slice(0, 5);
  const maxKey = 4 + visibleProfiles.length; // 4 is the last fixed key (Watch)

  return (
    <Box
      borderStyle="double"
      borderColor="green"
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      width={50}
    >
      <Text bold color="green">New Run</Text>

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

      <Box marginTop={1}>
        <Text>{form.sourceType === "issue" ? "Issue" : "PR"} #: </Text>
        <TextInput
          value={form.sourceId}
          onChange={(v) => {
            // Intercept number keys for selection when not typing digits for the ID
            // TextInput handles the sourceId; key handling is done via onChange filtering
            onChangeSourceId(v);
          }}
          onSubmit={onSubmit}
        />
      </Box>

      <Box marginTop={1} gap={2}>
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
      </Box>

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
            const key = 5 + i;
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

      <Box marginTop={1}>
        <Text dimColor>
          Enter submit  1-{maxKey} select  {visibleProfiles.length > 0 ? "0 default  " : ""}Esc cancel
        </Text>
      </Box>
    </Box>
  );
}
