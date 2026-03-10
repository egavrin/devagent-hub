import React from "react";
import { Box, Text } from "ink";
import type { CanonicalStore } from "../persistence/canonical-store.js";

export type HubScreen = "inbox" | "runs" | "detail" | "settings";

export interface HubAppProps {
  store: CanonicalStore;
  screen: HubScreen;
  workflowId?: string;
}

function InboxView({ store }: { store: CanonicalStore }) {
  const projects = store.listProjects();
  const items = projects.flatMap((project) => store.listWorkItems(project.id).map((item) => ({ project, item })));
  return (
    <Box flexDirection="column">
      <Text bold>Inbox</Text>
      {items.length === 0 ? <Text dimColor>No imported issues.</Text> : null}
      {items.map(({ project, item }) => (
        <Text key={item.id}>
          #{item.externalId} {item.title} [{item.state}] {project.name}
        </Text>
      ))}
    </Box>
  );
}

function RunsView({ store }: { store: CanonicalStore }) {
  const workflows = store.listWorkflowInstances();
  return (
    <Box flexDirection="column">
      <Text bold>Runs</Text>
      {workflows.length === 0 ? <Text dimColor>No workflow instances.</Text> : null}
      {workflows.map((workflow) => (
        <Text key={workflow.id}>
          {workflow.id} {workflow.stage} [{workflow.status}] repair={workflow.repairRound}
        </Text>
      ))}
    </Box>
  );
}

function DetailView({ store, workflowId }: { store: CanonicalStore; workflowId?: string }) {
  if (!workflowId) {
    return <Text dimColor>Provide a workflow id for detail view.</Text>;
  }
  const snapshot = store.getWorkflowSnapshot(workflowId);
  return (
    <Box flexDirection="column">
      <Text bold>Run Detail</Text>
      <Text>{snapshot.workflow.id}</Text>
      <Text>
        Issue #{snapshot.workItem.externalId} {snapshot.workItem.title}
      </Text>
      <Text>
        Stage {snapshot.workflow.stage} [{snapshot.workflow.status}]
      </Text>
      {snapshot.workflow.prNumber ? (
        <Text>
          PR #{snapshot.workflow.prNumber} {snapshot.workflow.prUrl ?? ""}
        </Text>
      ) : null}
      <Text>Tasks: {snapshot.tasks.length}</Text>
      <Text>Attempts: {snapshot.attempts.length}</Text>
      <Text>Artifacts: {snapshot.artifacts.length}</Text>
      <Text>Events: {snapshot.events.length}</Text>
      <Text>Approvals: {snapshot.approvals.length}</Text>
    </Box>
  );
}

function SettingsView({ store }: { store: CanonicalStore }) {
  const projects = store.listProjects();
  return (
    <Box flexDirection="column">
      <Text bold>Settings</Text>
      {projects.length === 0 ? <Text dimColor>No projects configured.</Text> : null}
      {projects.map((project) => (
        <Box key={project.id} flexDirection="column">
          <Text>{project.name}</Text>
          <Text dimColor>{project.repoRoot}</Text>
          <Text>Executors: {project.allowedExecutors.join(", ")}</Text>
        </Box>
      ))}
    </Box>
  );
}

export function HubApp({ store, screen, workflowId }: HubAppProps) {
  if (screen === "inbox") {
    return <InboxView store={store} />;
  }
  if (screen === "detail") {
    return <DetailView store={store} workflowId={workflowId} />;
  }
  if (screen === "settings") {
    return <SettingsView store={store} />;
  }
  return <RunsView store={store} />;
}
