/**
 * Unified argument builder for DevAgent subprocess invocation.
 * Both RunLauncher and StreamingLauncher must use this to ensure
 * identical argument construction.
 */

// ─── Valid values (must match DevAgent's workflow-contract.ts) ────

const VALID_PHASES = new Set([
  "triage", "plan", "implement", "verify", "review", "repair", "gate",
]);

const VALID_APPROVAL_MODES = new Set([
  "suggest", "auto-edit", "full-auto",
]);

const VALID_REASONING_LEVELS = new Set([
  "low", "medium", "high", "xhigh",
]);

// ─── Types ───────────────────────────────────────────────────

export interface LaunchParams {
  phase: string;
  repoPath: string;
  inputPath: string;
  outputPath: string;
  eventsPath: string;
}

export interface LaunchOptions {
  provider?: string;
  model?: string;
  maxIterations?: number;
  approvalMode?: string;
  reasoning?: string;
}

export class InvalidLaunchConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidLaunchConfigError";
  }
}

// ─── Validation ──────────────────────────────────────────────

export function validatePhase(phase: string): void {
  if (!VALID_PHASES.has(phase)) {
    throw new InvalidLaunchConfigError(
      `Invalid workflow phase "${phase}". Valid phases: ${[...VALID_PHASES].join(", ")}`,
    );
  }
}

export function validateApprovalMode(mode: string): void {
  if (!VALID_APPROVAL_MODES.has(mode)) {
    throw new InvalidLaunchConfigError(
      `Invalid approval mode "${mode}". Valid modes: ${[...VALID_APPROVAL_MODES].join(", ")}`,
    );
  }
}

export function validateReasoningLevel(level: string): void {
  if (!VALID_REASONING_LEVELS.has(level)) {
    throw new InvalidLaunchConfigError(
      `Invalid reasoning level "${level}". Valid levels: ${[...VALID_REASONING_LEVELS].join(", ")}`,
    );
  }
}

// ─── Arg Builder ─────────────────────────────────────────────

/**
 * Build the argument array for `devagent workflow run`.
 * Validates all values before constructing the args.
 * Throws InvalidLaunchConfigError on invalid input.
 */
export function buildLaunchArgs(
  params: LaunchParams,
  options: LaunchOptions,
): string[] {
  // Validate required fields
  validatePhase(params.phase);

  if (options.approvalMode) {
    validateApprovalMode(options.approvalMode);
  }
  if (options.reasoning) {
    validateReasoningLevel(options.reasoning);
  }

  // Build args
  const args: string[] = [
    "workflow", "run",
    "--phase", params.phase,
    "--input", params.inputPath,
    "--output", params.outputPath,
    "--events", params.eventsPath,
    "--repo", params.repoPath,
  ];

  if (options.provider) {
    args.push("--provider", options.provider);
  }
  if (options.model) {
    args.push("--model", options.model);
  }
  if (options.maxIterations !== undefined) {
    const iterations = options.maxIterations === 0 ? 999999 : options.maxIterations;
    if (iterations > 0) {
      args.push("--max-iterations", String(iterations));
    }
  }
  if (options.approvalMode) {
    args.push("--approval-mode", options.approvalMode);
  }
  if (options.reasoning) {
    args.push("--reasoning", options.reasoning);
  }

  return args;
}
