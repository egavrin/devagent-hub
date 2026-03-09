import type { GitHubGateway } from "../github/gateway.js";
import type { WorkflowConfig } from "../workflow/config.js";
import { CanonicalStore } from "../persistence/canonical-store.js";
import { LocalRunnerClient } from "../runner-client/local-runner-client.js";
import type { Project, WorkItem, WorkflowInstance } from "../canonical/types.js";
export declare class WorkflowService {
    private readonly store;
    private readonly github;
    private readonly runnerClient;
    private readonly project;
    private readonly config;
    constructor(store: CanonicalStore, github: GitHubGateway, runnerClient: LocalRunnerClient, project: Project, config: WorkflowConfig);
    syncIssues(): Promise<WorkItem[]>;
    ensureIssue(externalId: string): Promise<WorkItem>;
    start(issueExternalId: string): Promise<WorkflowInstance>;
    resume(workflowId: string): Promise<WorkflowInstance>;
    openPr(workflowId: string): Promise<WorkflowInstance>;
    listWorkflows(): WorkflowInstance[];
    getSnapshot(workflowId: string): {
        workflow: WorkflowInstance;
        tasks: import("../canonical/types.js").Task[];
        approvals: import("../canonical/types.js").Approval[];
    };
    cancel(workflowId: string): Promise<WorkflowInstance>;
    private upsertIssue;
    private getWorkItem;
    private resolveExecutor;
    private runStage;
}
