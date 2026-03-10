---
name: runner-integration
description: Work on Hub-to-Runner integration through the canonical SDK request/event/result path.
---

# Runner Integration

Hub does not launch executors directly. It creates SDK requests and submits them through
`src/runner-client/local-runner-client.ts`.

## Rules

- Executor selection belongs in `WorkflowService.resolveExecutor()`.
- Hub only knows `ExecutorSpec`, `TaskExecutionRequest`, `TaskExecutionEvent`, and `TaskExecutionResult`.
- Workspace lifecycle and executor CLI wiring stay in `devagent-runner`.
- If you change request generation or event/result handling, update:
  - `src/__tests__/baseline-compatibility.test.ts`
  - `src/__tests__/baseline-machine-path.test.ts`
  - `src/__tests__/workflow-service.test.ts`

## Rules

- `launch()` must return `{ exitCode, outputPath, eventsPath, output }` — never throw.
- Write input JSON to `<artifactsDir>/<runId>/<phase>-input.json` before executing.
- Write parsed output to `<phase>-output.json` and raw events to `<phase>-events.jsonl`.
- Parse the agent's text response into structured JSON matching the phase schema. Handle markdown fences, extract `{...}` from free text.
- Return `exitCode: 2` for unsupported phases, not an exception.
- `describe()` shells out to `<bin> --version` with a 5s timeout. Returns `null` on failure.
- Register bin names in `LauncherFactory` (`OPENCODE_BINS`, `CLAUDE_BINS`, `CODEX_BINS` sets) and add detection in `isXxxBin()`, `createAdapter()`, `createStreamingAdapter()`, and `describeRunners()`.
- Runners that don't support streaming return the sync adapter from `createStreamingAdapter()`.

## Phase prompts

Each phase prompt must instruct the agent to output ONLY valid JSON with the fields expected by the orchestrator. See `PHASE_PROMPTS` in existing runners for the exact schemas per phase (triage, plan, implement, verify, review, repair, gate).

## Testing

Add a test in `src/__tests__/selection-policy.test.ts` confirming `factory.getLauncher(phase).id` returns the correct runner id for the new bin.
