/**
 * Stage input/output schemas — mirrored from @devagent/core/workflow-contract.
 * These types define the typed I/O for each workflow phase.
 */
export declare const WORKFLOW_PHASES: readonly ["triage", "plan", "implement", "verify", "review", "repair"];
export type WorkflowPhase = (typeof WORKFLOW_PHASES)[number];
export interface TriageInput {
    issueNumber: number;
    title: string;
    body: string;
    labels: string[];
    author: string;
}
export interface PlanInput {
    issueNumber: number;
    title: string;
    body: string;
    labels: string[];
    author: string;
    triageReport?: TriageOutput;
}
export interface ImplementInput {
    issueNumber: number;
    title: string;
    body: string;
    acceptedPlan: PlanOutput;
}
export interface VerifyInput {
    commands: string[];
    changedFiles?: string[];
}
export interface ReviewInput {
    issueNumber: number;
    prNumber?: number | null;
    branch?: string | null;
    diff?: string;
}
export interface RepairInput {
    round: number;
    issueNumber: number;
    prNumber?: number | null;
    findings: ReviewFinding[];
    ciFailures?: string[];
}
export interface GateInput {
    sourcePhase: "triage" | "plan" | "implement";
    issueNumber: number;
    stageOutput: Record<string, unknown>;
}
export interface TriageOutput {
    summary: string;
    complexity: "trivial" | "small" | "medium" | "large" | "epic";
    suggestedLabels: string[];
    suggestedAssignee?: string;
    blockers?: string[];
    relatedFiles?: string[];
}
export interface PlanOutput {
    summary: string;
    steps: PlanStep[];
    filesToCreate: string[];
    filesToModify: string[];
    testStrategy: string;
    risks: string[];
}
export interface ImplementOutput {
    summary: string;
    changedFiles: string[];
    suggestedCommitMessage: string;
    diffSummary: string;
}
export interface VerifyOutput {
    summary: string;
    passed: boolean;
    results: VerifyCommandResult[];
}
export interface ReviewOutput {
    summary: string;
    verdict: "pass" | "block";
    findings: ReviewFinding[];
    blockingCount: number;
}
export interface RepairOutput {
    summary: string;
    fixedFindings: string[];
    remainingFindings: number;
    verificationPassed: boolean;
    changedFiles: string[];
}
export interface GateOutput {
    summary: string;
    verdict: "pass" | "block";
    findings: ReviewFinding[];
    blockingCount: number;
    confidence: number;
}
export interface PlanStep {
    description: string;
    file?: string;
    type: "create" | "modify" | "delete" | "test" | "config";
}
export interface VerifyCommandResult {
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
    passed: boolean;
}
export interface ReviewFinding {
    file: string;
    line?: number;
    severity: "critical" | "major" | "minor" | "suggestion";
    message: string;
    category: string;
}
export interface RunnerDescription {
    id?: string;
    version: string;
    contractVersion?: number;
    supportedPhases: string[];
    availableProviders: string[];
    supportedApprovalModes: string[];
    supportedReasoningLevels: string[];
    mcpServers?: string[];
    tools?: string[];
    load?: number;
    healthStatus?: string;
}
