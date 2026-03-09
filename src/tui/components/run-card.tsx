import React from "react";
import { Box, Text } from "ink";
import type { WorkflowRun } from "../../state/types.js";
import type { RunCardViewModel } from "../view-models.js";
import { toRunCardViewModel } from "../view-models.js";
import type { LayoutMode } from "../hooks/use-layout.js";

interface RunCardProps {
  run: WorkflowRun;
  isSelected: boolean;
  isActive: boolean;
  layoutMode?: LayoutMode;
}

export function RunCard({ run, isSelected, isActive, layoutMode = "normal" }: RunCardProps) {
  const vm = toRunCardViewModel(run);

  if (layoutMode === "narrow") {
    return <NarrowRunCard vm={vm} isSelected={isSelected} isActive={isActive} />;
  }

  return <DefaultRunCard vm={vm} isSelected={isSelected} isActive={isActive} />;
}

/** Compact single-line card for narrow terminals */
function NarrowRunCard({ vm, isSelected, isActive }: { vm: RunCardViewModel; isSelected: boolean; isActive: boolean }) {
  return (
    <Box paddingLeft={1}>
      <Text bold={isSelected} inverse={isSelected} color={isSelected ? "blue" : undefined}>
        {isActive ? <Text color="green">*</Text> : " "}
        #{vm.issueNumber} <Text color={vm.statusColor}>{vm.humanStatus}</Text> {vm.title.length > 20 ? vm.title.slice(0, 19) + "\u2026" : vm.title} {vm.age}
      </Text>
    </Box>
  );
}

/** Standard 3-line card for normal/wide terminals */
function DefaultRunCard({ vm, isSelected, isActive }: { vm: RunCardViewModel; isSelected: boolean; isActive: boolean }) {
  const titleShort = vm.title.length > 22 ? vm.title.slice(0, 21) + "\u2026" : vm.title;

  return (
    <Box flexDirection="column" paddingLeft={1}>
      {/* Line 1: ID + title */}
      <Text bold={isSelected} inverse={isSelected} color={isSelected ? "blue" : undefined}>
        {isActive ? <Text color="green">*</Text> : " "}
        #{vm.issueNumber} {titleShort}
      </Text>
      {/* Line 2: phase + human status + age */}
      <Text dimColor>
        {"  "}
        {vm.phase}
        <Text color={vm.statusColor}> {vm.humanStatus}</Text>
        {vm.repairRound > 0 ? ` r${vm.repairRound}` : ""}
        {" "}
        {vm.age}
      </Text>
      {/* Line 3: badges */}
      <Text dimColor>
        {"  "}
        {vm.hasPr ? <Text color="green">PR </Text> : null}
        {vm.blockedReason ? (
          <Text color="red">! {vm.blockedReason.length > 20 ? vm.blockedReason.slice(0, 19) + "\u2026" : vm.blockedReason} </Text>
        ) : null}
        {isSelected && vm.suggestedAction ? (
          <Text color="yellow">[{vm.suggestedAction.key}] {vm.suggestedAction.label}</Text>
        ) : null}
      </Text>
    </Box>
  );
}
