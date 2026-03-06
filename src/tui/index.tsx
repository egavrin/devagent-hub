import React from "react";
import { render } from "ink";
import { App } from "./app.js";
import type { StateStore } from "../state/store.js";
import type { ProcessRegistry } from "../runner/process-registry.js";
import type { WorkflowOrchestrator } from "../workflow/orchestrator.js";

export function launchTUI(deps: {
  store: StateStore;
  registry: ProcessRegistry;
  orchestrator: WorkflowOrchestrator;
}): void {
  render(
    <App
      store={deps.store}
      registry={deps.registry}
      orchestrator={deps.orchestrator}
    />
  );
}
