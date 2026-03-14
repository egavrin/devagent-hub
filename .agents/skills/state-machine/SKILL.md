---
name: state-machine
description: Review and modify the canonical workflow, approval, and issue-unit state machine without breaking staged orchestration.
---

# State Machine

The canonical workflow state lives in:

- `src/workflows/service.ts`
- `src/persistence/canonical-store.ts`
- `src/canonical/types.ts`
- `src/workflow/config.ts`

## Current Workflow Definitions

- `legacy-issue-v1`
  `triage -> plan -> implement -> verify -> review -> repair -> done`
- `feature-delivery-local-v1`
  `task-intake -> design -> breakdown -> issue-generation -> triage -> plan -> test-plan -> implement -> verify -> review -> repair -> completion -> done`

## Rules

- Keep stage progression, approval pauses, and repair loops inside `WorkflowService`.
- Persist workflow, task, approval, artifact, context-bundle, and issue-unit changes through
  `CanonicalStore`.
- Preserve the hard approval checkpoints after `design`, after `plan`, and before PR handoff when
  the selected workflow definition requires them.
- Feature-delivery workflows depend on issue-unit sequencing and dependency tracking; do not bypass
  that logic with ad hoc status edits.
- If you change stage order, approval behavior, or terminal-state handling, update the seeded
  workflow definitions and the workflow-service tests together.

## Testing

Prioritize:

- `src/__tests__/workflow-service.test.ts`
- `src/__tests__/canonical-store.test.ts`
- `src/__tests__/workflow-config.test.ts`

Run:

```bash
bun run test
bunx tsc --noEmit
```
