import type { StateStore } from "../state/store.js";
import type { ProcessRegistry } from "../runner/process-registry.js";
import type { WorkflowOrchestrator } from "../workflow/orchestrator.js";
import type { WorkflowConfig } from "../workflow/config.js";
import type { GitHubGateway } from "../github/gateway.js";
interface AppProps {
    store: StateStore;
    registry: ProcessRegistry;
    orchestrator: WorkflowOrchestrator;
    config?: WorkflowConfig;
    github?: GitHubGateway;
    repo?: string;
}
export declare function App({ store, registry, orchestrator, config, github, repo }: AppProps): import("react/jsx-runtime").JSX.Element;
export {};
