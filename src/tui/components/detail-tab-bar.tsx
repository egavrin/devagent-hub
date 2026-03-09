import React from "react";
import { Box, Text } from "ink";
import type { DetailTab } from "../state.js";

interface DetailTabBarProps {
  activeTab: DetailTab;
  onSelect: (tab: DetailTab) => void;
}

const TABS: { id: DetailTab; label: string; key: string }[] = [
  { id: "summary", label: "Summary", key: "1" },
  { id: "timeline", label: "Timeline", key: "2" },
  { id: "artifacts", label: "Artifacts", key: "3" },
  { id: "logs", label: "Logs", key: "4" },
];

export function DetailTabBar({ activeTab }: DetailTabBarProps) {
  return (
    <Box paddingLeft={1} flexShrink={0}>
      {TABS.map((tab, i) => {
        const isActive = tab.id === activeTab;
        return (
          <Text key={tab.id}>
            {i > 0 ? <Text dimColor>{" | "}</Text> : null}
            <Text color={isActive ? "blue" : "gray"} bold={isActive} inverse={isActive}>
              {" "}{tab.key}:{tab.label}{" "}
            </Text>
          </Text>
        );
      })}
      <Text dimColor>{"  Tab/Shift+Tab to switch"}</Text>
    </Box>
  );
}
