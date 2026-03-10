export type WorkflowStateErrorCode =
  | "STALE_BASELINE"
  | "STALE_BRANCH_REF"
  | "HISTORICAL_RUN_REQUIRES_MANUAL_INTERVENTION";

export class WorkflowStateError extends Error {
  readonly code: WorkflowStateErrorCode;

  constructor(code: WorkflowStateErrorCode, message: string) {
    super(message);
    this.name = "WorkflowStateError";
    this.code = code;
  }
}
