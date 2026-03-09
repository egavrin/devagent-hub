import type { StateStore } from "../state/store.js";
import type { ProcessRegistry } from "../runner/process-registry.js";
import type { WorkflowOrchestrator } from "../workflow/orchestrator.js";
import type { WorkflowConfig } from "../workflow/config.js";
import type { GitHubGateway } from "../github/gateway.js";
export declare function launchTUI(deps: {
    store: StateStore;
    registry: ProcessRegistry;
    orchestrator: WorkflowOrchestrator;
    config?: WorkflowConfig;
    github?: GitHubGateway;
    repo?: string;
}): void;
