---
version: 1
mode: watch

runner:
  bin: devagent
  provider: chatgpt
  model: gpt-5.4
  approval_mode: full-auto
  max_iterations: 10

profiles:
  default:
    bin: devagent
    provider: chatgpt
    model: gpt-5.4
  reviewer:
    bin: devagent
    provider: chatgpt
    model: gpt-5.4
  repair:
    bin: devagent
    provider: chatgpt
    model: gpt-5.4

roles:
  triage: default
  plan: default
  implement: default
  verify: default
  review: reviewer
  repair: repair
  gate: default

skills:
  defaults: []
  by_stage:
    implement:
      - testing
    review:
      - security-checklist
  path_overrides:
    "src/workflows/**":
      - state-machine
    "src/__tests__/**":
      - testing

verify:
  commands:
    - node ./node_modules/vitest/vitest.mjs run --config vitest.config.ts
    - bunx tsc --noEmit
    - bun run build

pr:
  draft: true
  open_requires: [review]

repair:
  max_rounds: 3
---

# DevAgent Hub Workflow

`devagent-hub` reads this file from the target repo and preserves these semantics:

- stage-to-profile mapping
- verify commands
- repair max rounds
- skill selection by stage and path
- PR draft/open rules

Hub resolves the selected profile into an SDK `ExecutorSpec`, submits a `TaskExecutionRequest` to
`devagent-runner`, and waits for normalized events/results/artifacts. Hub does not shell out to
executors directly.

## Recommended Local Validation Profile

For the current local environment, use:

```yaml
runner:
  bin: devagent
  provider: chatgpt
  model: gpt-5.4
```

That is the live-validated path for end-to-end issue-to-PR runs through Hub.

## Stage Semantics

- `triage`: produce a triage report
- `plan`: produce a plan and pause for approval
- `implement`: modify the workspace
- `verify`: run `verify.commands`
- `review`: produce a review report; if it is not clean, Hub enters the repair loop
- `repair`: apply fixes, then Hub reruns `verify` and `review`

## Human Review Loops

Hub exposes these operator actions on top of the staged workflow:

- `run resume <workflow-id>`: approve the pending plan and continue into implementation
- `run reject <workflow-id> --note "..."`
  - if the workflow is waiting on `plan`, Hub reruns `plan` with the human note and pauses again
  - if the workflow is waiting on `review`, Hub runs `repair -> verify -> review` with the human note and pauses again
- `pr open <workflow-id>`: approve final handoff and open the PR
- `pr repair <workflow-id>`: fetch GitHub review comments plus failing CI logs for the opened PR, run `repair -> verify -> review` on the same branch, push updates, and resolve addressed review threads
  - review comments are passed to the repair task with file and line context when GitHub provides them
  - `verify.commands` should mirror the repo's real local CI-equivalent checks; do not point them at commands that are known to fail in a runner worktree

## Baseline Safety

Hub records the pinned baseline snapshot when a workflow starts:

- target repo base branch and base SHA
- pinned system SHAs for `devagent-sdk`, `devagent-runner`, `devagent`, and `devagent-hub`
- protocol version

On `run resume`, `pr open`, and `pr repair`, Hub compares the stored snapshot with the current
workspace state and fails explicitly if the workflow is stale or historical.

## Repair Loop

If the latest `review-report` does not say `No defects found.`, Hub treats the review as blocking
and runs:

```text
repair -> verify -> review
```

until the review is clean or `repair.max_rounds` is reached.
