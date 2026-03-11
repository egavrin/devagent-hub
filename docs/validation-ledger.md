# Reliability Validation Ledger

This ledger is the operator record for the current `devagent-hub` hardening cycle.

Only runs that use:

- a fresh issue
- a fresh branch from current `main`
- the pinned baseline snapshot
- the production-grade `devagent` executor path

count toward the reliability bar.

## Current Bar

Required fresh `devagent-hub` loops:

1. happy path: issue -> triage -> plan -> approval -> implement -> verify -> review -> approval -> PR
2. rejection path: reject `plan` once, regenerate, approve, then PR
3. repair path: open PR, inject review comment or CI failure, run `pr repair`, update the same PR

## Pinned Baseline

See [../baseline.json](../baseline.json).

Record the exact baseline snapshot used by each counted run in the ledger entries below.

## Ledger Entries

| Date | Repo | Issue | Workflow | Loop type | Baseline snapshot | Expected outcome | Actual outcome | Blocker / fix |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-03-11 | `egavrin/devagent-hub` | [#37](https://github.com/egavrin/devagent-hub/issues/37) | `8f4b618d-958b-45cc-9018-38a3bd6368a1` | happy path | `sdk=ab28cf433161ed8863e8785014e734c20f7a79b7`, `runner=ccc742b41ae3a4052296177034385886a553d9ff`, `devagent=cc5bd206367956143d7270e10de9d0f55957dfff`, `hub=3a42aed0376f32c2380e261d713586aba9899322`, `protocol=0.1` | Fresh issue reaches PR from the validated current baseline after plan and final approval gates. | Passed. Plan reviewed through `status`, verify and review passed cleanly, and Hub opened draft [PR #38](https://github.com/egavrin/devagent-hub/pull/38) from `devagent/workflow/37-4eb8d6d1`. | Self-hosting validation required committing the local baseline alignment inside the isolated validation clone so workflow branches would not inherit unrelated `baseline.json` churn. |
| 2026-03-11 | `egavrin/devagent-hub` | [#34](https://github.com/egavrin/devagent-hub/issues/34) | `aa324b3b-c17c-454b-977b-1580fb95845e` | rejection path | `sdk=ab28cf433161ed8863e8785014e734c20f7a79b7`, `runner=ccc742b41ae3a4052296177034385886a553d9ff`, `devagent=cc5bd206367956143d7270e10de9d0f55957dfff`, `hub=3a42aed0376f32c2380e261d713586aba9899322`, `protocol=0.1` | Fresh issue rejects the first `plan`, regenerates it, and later reaches PR. | Passed. The first `plan` was rejected with an explicit scope note, Hub regenerated `plan`, the second plan was reviewed via `status`, and Hub opened draft [PR #36](https://github.com/egavrin/devagent-hub/pull/36) from `devagent/workflow/34-eae22c52`. | None after moving the counted runs into a clean sibling workspace root that resolved the correct current repo SHAs. |
| 2026-03-11 | `egavrin/devagent-hub` | [#34](https://github.com/egavrin/devagent-hub/issues/34) | `aa324b3b-c17c-454b-977b-1580fb95845e` | repair path | `sdk=ab28cf433161ed8863e8785014e734c20f7a79b7`, `runner=ccc742b41ae3a4052296177034385886a553d9ff`, `devagent=cc5bd206367956143d7270e10de9d0f55957dfff`, `hub=3a42aed0376f32c2380e261d713586aba9899322`, `protocol=0.1` | Fresh issue reaches PR, ingests review feedback, and `pr repair` updates the same PR. | Passed. After [PR #36](https://github.com/egavrin/devagent-hub/pull/36) was opened, an inline review comment was added on `WORKFLOW.md`; `devagent-hub pr repair aa324b3b-c17c-454b-977b-1580fb95845e` consumed that review thread, ran `repair -> verify -> review`, and completed with the same PR still attached to the workflow. | The first self-hosting attempts exposed stale sibling clones under `_baseline-live`; counted repair validation moved to `_baseline-live-current`, which points at the current source repos. |
| 2026-03-10 | `egavrin/devagent-hub` | [#25](https://github.com/egavrin/devagent-hub/issues/25) | `8a9ad7a1-263d-48e1-823a-63582344600f` | happy path | `sdk=ab28cf433161ed8863e8785014e734c20f7a79b7`, `runner=e0a588445f38d97b1cd7ddf4b329dd7110154739`, `devagent=18b5e4224b9acd49f4510a64ec483df48047242a`, `hub=eda91cdd749e171487605930a2ebe3705dcadea2`, `protocol=0.1` | Fresh issue reaches PR from current `main` after plan and final approval gates. | Passed. Plan reviewed through `status`, final review approved, and Hub opened draft [PR #27](https://github.com/egavrin/devagent-hub/pull/27) from `devagent/workflow/25-7c07eb19`. | First `pr open` attempt exposed isolated-home Git credential setup and retry-idempotency gaps. Fixed by configuring `gh auth setup-git` inside the isolated validation home and hardening `openPr()` so approved final handoffs can be retried safely after a partial failure. |
| 2026-03-10 | `egavrin/devagent-hub` | [#26](https://github.com/egavrin/devagent-hub/issues/26) | `25122457-0b62-46af-9d4b-65efad027fe1` | rejection path | `sdk=ab28cf433161ed8863e8785014e734c20f7a79b7`, `runner=e0a588445f38d97b1cd7ddf4b329dd7110154739`, `devagent=18b5e4224b9acd49f4510a64ec483df48047242a`, `hub=eda91cdd749e171487605930a2ebe3705dcadea2`, `protocol=0.1` | Fresh issue rejects the first `plan`, regenerates it, and later reaches PR. | Passed. The first `plan` was rejected with a human note, Hub regenerated `plan`, the second plan was reviewed via `status`, and Hub opened draft [PR #28](https://github.com/egavrin/devagent-hub/pull/28) from `devagent/workflow/26-6c4ba48a`. | A parallel `run start` exposed a SQLite `database is locked` failure during non-baseline concurrent starts. Counted validation continued sequentially. |
| 2026-03-10 | `egavrin/devagent-hub` | [#25](https://github.com/egavrin/devagent-hub/issues/25) | `8a9ad7a1-263d-48e1-823a-63582344600f` | repair path | `sdk=ab28cf433161ed8863e8785014e734c20f7a79b7`, `runner=e0a588445f38d97b1cd7ddf4b329dd7110154739`, `devagent=18b5e4224b9acd49f4510a64ec483df48047242a`, `hub=eda91cdd749e171487605930a2ebe3705dcadea2`, `protocol=0.1` | Fresh issue reaches PR, ingests review/CI feedback, and `pr repair` updates the same PR. | Passed. After [PR #27](https://github.com/egavrin/devagent-hub/pull/27) was opened, an inline review comment was added on `WORKFLOW.md`; `devagent-hub pr repair 8a9ad7a1-263d-48e1-823a-63582344600f` consumed that comment, ran `repair -> verify -> review`, and updated the same PR head from `8d4ffded6232129d9b83bc791bfe9c824db1468c` to `daa1c947250a62915b323c30434feaaef18a6257`. | None after the `openPr()` retry fix and isolated-home Git credential setup were in place. |

## Failed Fresh Attempts

These do not count toward the 3-loop bar, but they are part of the current hardening record.

| Date | Repo | Issue | Workflow | Expected outcome | Actual outcome | Blocker / fix |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-03-10 | `egavrin/devagent-hub` | [#18](https://github.com/egavrin/devagent-hub/issues/18) | `813f95ed-5ddd-47fa-83d9-3f50fe06333b` | Reach `plan` pause on the fresh clone. | Failed at `triage`. | Isolated Hub home did not include DevAgent credentials. Fixed by wiring the validation home to `~/.config/devagent/credentials.json`. |
| 2026-03-10 | `egavrin/devagent-hub` | [#22](https://github.com/egavrin/devagent-hub/issues/22) | `43ebe69e-c4ef-47e2-99ee-5561f509bc12` | Fresh issue reaches final approval or PR. | Failed at `verify`. | Self-hosting worktree verification exposed two repo assumptions: bootstrap-path tests assumed `hubRoot/..` was the sibling workspace root, and Vitest alias resolution assumed the repo lived directly beside `devagent-sdk` / `devagent-runner`. Fixed in Hub by switching bootstrap tests to `resolveWorkspaceRoot(hubRoot)`, removing the bootstrap-path hard stop, and teaching `vitest.config.ts` to resolve the sibling workspace root dynamically. |
| 2026-03-10 | `egavrin/devagent-hub` | [#22](https://github.com/egavrin/devagent-hub/issues/22) | `83b94b12-ceca-40e6-a0f3-4372ae2768b9` | Fresh issue reaches final approval or PR after the worktree fixes. | Failed at `verify`. | Remaining failure was doc parity drift in `WORKFLOW.md`: the file still used bare `pr open` / `pr repair` wording instead of the documented `devagent-hub ...` commands. Fixed by updating `WORKFLOW.md` command examples and explicit pre-PR approval wording. |

## Operator Notes

- A run only counts if `devagent-hub status <workflow-id>` was used to review the pause state and artifact paths.
- Historical runs, pre-rewrite branches, and stale baseline failures are migration-safety inputs only. Do not count them toward the reliability bar.
- If a run fails, keep the failed entry in this ledger with the blocker and the fix that unblocked the next attempt.
