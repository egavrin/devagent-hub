import type { Approval, ExecutionAttempt, PersistedTaskEvent, Project, Task, WorkItem, WorkflowInstance } from "../canonical/types.js";
import type { ArtifactRef, TaskExecutionEvent, WorkflowTaskType } from "@devagent-sdk/types";
export declare class CanonicalStore {
    private readonly db;
    constructor(path: string);
    close(): void;
    upsertProject(project: Project): Project;
    listProjects(): Project[];
    upsertWorkItem(workItem: WorkItem): WorkItem;
    getWorkItemByExternalId(projectId: string, externalId: string): WorkItem | undefined;
    listWorkItems(projectId: string): WorkItem[];
    createWorkflowInstance(input: {
        projectId: string;
        workItemId: string;
        stage: WorkflowInstance["stage"];
        status: WorkflowInstance["status"];
        branch: string;
    }): WorkflowInstance;
    updateWorkflowInstance(id: string, patch: Partial<WorkflowInstance>): WorkflowInstance;
    getWorkflowInstance(id: string): WorkflowInstance | undefined;
    getWorkflowBranch(id: string): string;
    listWorkflowInstances(): WorkflowInstance[];
    createTask(input: {
        workflowInstanceId: string;
        type: WorkflowTaskType;
        status: Task["status"];
        executorId: string;
        runnerId: string;
    }): Task;
    updateTask(id: string, patch: Partial<Task>): Task;
    getTask(id: string): Task | undefined;
    listTasks(workflowInstanceId: string): Task[];
    createAttempt(input: {
        taskId: string;
        executorId: string;
        runnerId: string;
        workspacePath?: string;
    }): ExecutionAttempt;
    finishAttempt(id: string, result: {
        status: ExecutionAttempt["status"];
        resultPath?: string;
        workspacePath?: string;
    }): ExecutionAttempt;
    getAttempt(id: string): ExecutionAttempt | undefined;
    listAttempts(taskId: string): ExecutionAttempt[];
    createApproval(input: {
        workflowInstanceId: string;
        stage: WorkflowTaskType;
        status?: Approval["status"];
        note?: string;
    }): Approval;
    getPendingApproval(workflowInstanceId: string): Approval | undefined;
    updateApproval(id: string, status: Approval["status"], note?: string): Approval;
    recordEvent(taskId: string, event: TaskExecutionEvent): void;
    listEvents(taskId: string): PersistedTaskEvent[];
    recordArtifacts(taskId: string, artifacts: ArtifactRef[]): void;
    listArtifacts(taskId: string): ArtifactRef[];
    getWorkflowSnapshot(id: string): {
        workflow: WorkflowInstance;
        tasks: Task[];
        approvals: Approval[];
    };
}
