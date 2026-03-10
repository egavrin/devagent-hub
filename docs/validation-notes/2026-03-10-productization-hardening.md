# 2026-03-10 Productization Hardening

## Expected

- `devagent-hub status` should be the primary human review surface for paused workflows.
- bootstrap should build and link the sibling `devagent-*` CLIs from one command.
- Hub should stop oversized runs before they turn into unreviewable PRs.
- Runner should stop tasks that exceed the configured stage timeout.

## Worked

- `status` now shows stage, approval state, latest artifact paths, latest result, rejection history, and the next operator action.
- `run reject` live-regenerated `plan` on `egavrin/taskkit-cli#26` and paused again with the updated artifact path visible through `status`.
- bootstrap now installs/builds `devagent-sdk`, `devagent-runner`, `devagent`, and `devagent-hub` in order and links:
  - `devagent`
  - `devagent-runner`
  - `devagent-hub`
- Hub now enforces:
  - `review.max_changed_files`
  - `review.run_max_changed_files`
  - `review.max_patch_bytes`
  - `review.run_max_patch_bytes`
- Runner now enforces `timeoutSec` and converts over-time runs into explicit structured failures.

## Failed

- The first live validation pass exposed a real packaging mismatch: the Bun-bundled Hub CLI could not load `better-sqlite3`.
- The first live validation pass against existing local state exposed a schema migration gap for `workflow_instances.status_reason`.
- The first plan-review live pass exposed that `plan.md` was only partially human-readable because the target repo was configured to use `claude`, not the validated `devagent` executor path.

## Remaining Blockers

- A full fresh end-to-end live validation should be rerun on a repo configured for the supported `devagent + chatgpt + gpt-5.4` path, not a `claude` workflow config.
- The current target repo used for plan-review validation still has an executor mismatch relative to the documented production path.
- Before freezing the new baseline, the remaining modified repos need commit cleanup:
  - review incidental `bun.lock` churn
  - refresh `baseline.json`
  - commit and push all intentional changes to `main`
