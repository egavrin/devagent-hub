import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { NewRunForm, NewRunSourceType, NewRunMode } from "../state.js";

interface NewRunDialogProps {
  form: NewRunForm;
  onChangeSourceType: (t: NewRunSourceType) => void;
  onChangeSourceId: (v: string) => void;
  onChangeMode: (m: NewRunMode) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function NewRunDialog({
  form,
  onChangeSourceType,
  onChangeSourceId,
  onChangeMode,
  onSubmit,
  onCancel,
}: NewRunDialogProps) {
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
          onChange={onChangeSourceId}
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

      <Box marginTop={1}>
        <Text dimColor>Enter submit  1/2 source  3/4 mode  Esc cancel</Text>
      </Box>
    </Box>
  );
}
