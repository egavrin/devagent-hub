import React from "react";
import { Box, Text } from "ink";
import type { WorkflowRun } from "../../state/types.js";
import { toRunCardViewModel } from "../view-models.js";

interface RunCardPreviewProps {
  run: WorkflowRun | null;
}

/** Quick preview pane shown alongside the board in wide terminals (>140 cols) */
export function RunCardPreview({ run }: RunCardPreviewProps) {
  if (!run) {
    return <Text dimColor>Select a run to preview</Text>;
  }

  const vm = toRunCardViewModel(run);
  const title = (run.metadata as Record<string, unknown>)?.title as string | undefined;

  return (
    <Box flexDirection="column">
      <Text bold color="blue">#{vm.issueNumber}</Text>
      {title && <Text>{title.length > 50 ? title.slice(0, 49) + "\u2026" : title}</Text>}

      <Box marginTop={1} gap={2}>
        <Text color={vm.statusColor} bold>{vm.humanStatus}</Text>
        <Text dimColor>{vm.phase}</Text>
        <Text dimColor>{vm.age}</Text>
      </Box>

      {vm.repairRound > 0 && <Text dimColor>repair round: {vm.repairRound}</Text>}
      {vm.hasPr && <Text color="green">PR: {run.prUrl}</Text>}
      {run.branch && <Text dimColor>branch: {run.branch}</Text>}
      {run.agentProfile && <Text dimColor>profile: {run.agentProfile}</Text>}
      {run.actualModel && <Text dimColor>model: {run.actualModel}</Text>}

      {vm.blockedReason && (
        <Box marginTop={1}>
          <Text color="red">! {vm.blockedReason}</Text>
        </Box>
      )}

      {vm.suggestedAction && (
        <Box marginTop={1}>
          <Text color="yellow">Next: [{vm.suggestedAction.key}] {vm.suggestedAction.label}</Text>
        </Box>
      )}
    </Box>
  );
}
