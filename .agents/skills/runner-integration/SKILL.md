---
name: runner-integration
description: Work on Hub-to-Runner integration through the canonical SDK request/event/result path.
---

# Runner Integration

Hub does not launch executors directly. It resolves an `ExecutorSpec`, builds a
`TaskExecutionRequest`, sends it through `src/runner-client/local-runner-client.ts`, and ingests
normalized events, artifacts, and results back into the canonical workflow state.

## Key Files

- `src/runner-client/local-runner-client.ts`
- `src/workflows/service.ts`
- `src/workflow/config.ts`
- `WORKFLOW.md`

## Rules

- Keep executor dispatch inside `LocalRunnerClient` and `WorkflowService.resolveExecutor()`.
- Hub should only depend on SDK request, event, artifact, and result contracts. Do not add direct
  executor shelling in CLI or workflow code.
- Runner profile and bin selection must flow from `WORKFLOW.md` through `resolveWorkflowConfig()`
  and the selected executor profile.
- Preserve the DevAgent-first validated path. Non-DevAgent adapters can remain available, but do
  not describe them as production-grade without matching validation evidence.
- When request generation, expected artifacts, or event/result handling changes, update the Hub
  tests before relying on downstream runner behavior.

## Testing

Prioritize:

- `src/__tests__/local-runner-client.test.ts`
- `src/__tests__/workflow-service.test.ts`
- `src/__tests__/baseline-compatibility.test.ts`
- `src/__tests__/baseline-machine-path.test.ts`

Run:

```bash
bun run test
bunx tsc --noEmit
bun run build
```
