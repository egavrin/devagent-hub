import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

interface InputBarProps {
  isActive: boolean;
  onSubmit: (text: string) => void;
}

export function InputBar({ isActive, onSubmit }: InputBarProps) {
  const [value, setValue] = useState("");
  const [sent, setSent] = useState(false);

  if (!isActive) return null;

  const handleSubmit = (text: string) => {
    if (!text.trim()) return;
    onSubmit(text);
    setValue("");
    setSent(true);
    setTimeout(() => setSent(false), 1000);
  };

  return (
    <Box>
      <Text color="green">{">"} </Text>
      {sent ? (
        <Text color="green">Sent</Text>
      ) : (
        <TextInput value={value} onChange={setValue} onSubmit={handleSubmit} />
      )}
      <Text dimColor>  [Esc to exit input]</Text>
    </Box>
  );
}
