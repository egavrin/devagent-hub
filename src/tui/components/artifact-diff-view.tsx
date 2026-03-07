import React from "react";
import { Box, Text } from "ink";
import type { Artifact } from "../../state/types.js";

interface ArtifactDiffViewProps {
  older: Artifact;
  newer: Artifact;
  height: number;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
}

function flattenData(
  data: Record<string, unknown>,
  prefix = "",
): Array<{ key: string; value: string }> {
  const entries: Array<{ key: string; value: string }> = [];
  for (const [k, v] of Object.entries(data)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      entries.push(...flattenData(v as Record<string, unknown>, fullKey));
    } else if (Array.isArray(v)) {
      entries.push({ key: fullKey, value: `[${v.length} items]` });
    } else {
      entries.push({ key: fullKey, value: String(v ?? "") });
    }
  }
  return entries;
}

type DiffLine = {
  key: string;
  status: "same" | "changed" | "added" | "removed";
  oldValue?: string;
  newValue?: string;
};

function computeDiff(older: Record<string, unknown>, newer: Record<string, unknown>): DiffLine[] {
  const oldEntries = flattenData(older);
  const newEntries = flattenData(newer);
  const oldMap = new Map(oldEntries.map((e) => [e.key, e.value]));
  const newMap = new Map(newEntries.map((e) => [e.key, e.value]));
  const allKeys = new Set([...oldMap.keys(), ...newMap.keys()]);

  const lines: DiffLine[] = [];
  for (const key of allKeys) {
    const oldVal = oldMap.get(key);
    const newVal = newMap.get(key);

    if (oldVal === undefined) {
      lines.push({ key, status: "added", newValue: newVal });
    } else if (newVal === undefined) {
      lines.push({ key, status: "removed", oldValue: oldVal });
    } else if (oldVal !== newVal) {
      lines.push({ key, status: "changed", oldValue: oldVal, newValue: newVal });
    } else {
      lines.push({ key, status: "same", oldValue: oldVal, newValue: newVal });
    }
  }

  // Sort: changes first, then additions, then removals, then same
  const order = { changed: 0, added: 1, removed: 2, same: 3 };
  lines.sort((a, b) => order[a.status] - order[b.status]);

  return lines;
}

const STATUS_COLORS: Record<string, string> = {
  changed: "yellow",
  added: "green",
  removed: "red",
  same: "gray",
};

const STATUS_ICONS: Record<string, string> = {
  changed: "~",
  added: "+",
  removed: "-",
  same: " ",
};

export function ArtifactDiffView({ older, newer, height }: ArtifactDiffViewProps) {
  const diff = computeDiff(older.data, newer.data);
  const changes = diff.filter((d) => d.status !== "same");
  const unchangedCount = diff.length - changes.length;

  // Show summary comparison first
  const summaryChanged = older.summary !== newer.summary;

  const lines: Array<{ key: string; node: React.ReactNode }> = [];

  lines.push({ key: "hdr", node: (
    <Text bold>
      Comparing <Text color="cyan">{older.type}</Text>
      {" "}
      <Text dimColor>{older.createdAt.slice(11, 19)}</Text>
      {" vs "}
      <Text dimColor>{newer.createdAt.slice(11, 19)}</Text>
    </Text>
  )});

  if (summaryChanged) {
    lines.push({ key: "sum-old", node: (
      <Text><Text color="red">- </Text><Text dimColor>{truncate(older.summary, 70)}</Text></Text>
    )});
    lines.push({ key: "sum-new", node: (
      <Text><Text color="green">+ </Text>{truncate(newer.summary, 70)}</Text>
    )});
  } else {
    lines.push({ key: "sum-same", node: (
      <Text dimColor>  Summary unchanged: {truncate(older.summary, 60)}</Text>
    )});
  }

  lines.push({ key: "sep", node: (
    <Text dimColor>{"\u2500".repeat(40)}</Text>
  )});

  lines.push({ key: "stats", node: (
    <Text>
      <Text color="yellow">{changes.length} changed</Text>
      {"  "}
      <Text dimColor>{unchangedCount} unchanged</Text>
    </Text>
  )});

  // Show changes
  for (const d of changes.slice(0, height - 8)) {
    const color = STATUS_COLORS[d.status];
    const icon = STATUS_ICONS[d.status];

    if (d.status === "changed") {
      lines.push({ key: `diff-${d.key}`, node: (
        <Text>
          <Text color={color}>{icon} {d.key}: </Text>
          <Text color="red">{truncate(d.oldValue ?? "", 30)}</Text>
          <Text dimColor> {"\u2192"} </Text>
          <Text color="green">{truncate(d.newValue ?? "", 30)}</Text>
        </Text>
      )});
    } else {
      lines.push({ key: `diff-${d.key}`, node: (
        <Text color={color}>
          {icon} {d.key}: {truncate(d.status === "added" ? d.newValue ?? "" : d.oldValue ?? "", 50)}
        </Text>
      )});
    }
  }

  if (changes.length > height - 8) {
    lines.push({ key: "more", node: (
      <Text dimColor>  ...{changes.length - (height - 8)} more changes</Text>
    )});
  }

  if (changes.length === 0) {
    lines.push({ key: "no-changes", node: (
      <Text dimColor>No data changes between versions</Text>
    )});
  }

  return (
    <Box flexDirection="column" paddingLeft={1}>
      {lines.slice(0, height).map((l) => (
        <Box key={l.key}>{l.node}</Box>
      ))}
    </Box>
  );
}
