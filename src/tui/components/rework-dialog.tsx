import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

interface ReworkDialogProps {
  issueNumber: number;
  note: string;
  onChangeNote: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function ReworkDialog({ issueNumber, note, onChangeNote, onSubmit, onCancel }: ReworkDialogProps) {
  return (
    <Box
      borderStyle="double"
      borderColor="yellow"
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      width={60}
    >
      <Text bold color="yellow">Rework Plan -- #{issueNumber}</Text>

      <Box marginTop={1}>
        <Text>Feedback: </Text>
        <TextInput
          value={note}
          onChange={onChangeNote}
          onSubmit={onSubmit}
        />
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Enter to submit (empty = no note)  Esc cancel</Text>
      </Box>
    </Box>
  );
}
