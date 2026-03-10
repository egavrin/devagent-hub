# Baseline Validation

This repo owns the pinned baseline manifest for the four-repo machine path.

## Pinned Baseline

The canonical baseline is stored in [baseline.json](/Users/eg/Documents/devagent-hub/baseline.json).

Validation assumes:

- all four repos are checked out as siblings
- each repo is on `main`
- each repo matches the SHA recorded in the manifest
- protocol version is `0.1`

## Local Checklist

```bash
cd /Users/eg/Documents/devagent-sdk && bun install && bun run typecheck && bun run test
cd /Users/eg/Documents/devagent-runner && bun install && bun run typecheck && bun run test
cd /Users/eg/Documents/devagent && bun install && bun run typecheck && bun run test
cd /Users/eg/Documents/devagent-hub && bun install && bunx tsc --noEmit && bun run test && bun run build
cd /Users/eg/Documents/devagent-hub && bun run baseline:drift
cd /Users/eg/Documents/devagent-hub && bun run baseline:compat
cd /Users/eg/Documents/devagent-hub && bun run baseline:smoke
```

`baseline:check` is intentionally strict and should be run only when the working trees are expected to
match the pinned manifest exactly.

## Fresh-Clone Bootstrap

Fresh live validation assumes the four baseline repos are checked out as siblings, for example:

```text
/Users/eg/Documents/_baseline-live/
  devagent-sdk/
  devagent-runner/
  devagent/
  devagent-hub/
```

Bootstrap the fresh clone environment in this order:

```bash
cd /Users/eg/Documents/_baseline-live/devagent-sdk && git checkout main && bun install && bun run build
cd /Users/eg/Documents/_baseline-live/devagent-runner && git checkout main && bun install && bun run build
cd /Users/eg/Documents/_baseline-live/devagent && git checkout main && bun install
cd /Users/eg/Documents/_baseline-live/devagent-hub && git checkout main && bun install
```

If sibling `file:` dependencies were missing when `bun install` last ran in the target repo, rerun
`bun install` in that target repo after the sibling repos are present and built. This applies
especially before running `verify.commands` in fresh live workflows.

Repo-specific skill availability must also be present in the clean clone:

- `devagent` fresh-clone workflows expect repo-owned `testing` and `security-checklist` skills
- `devagent-hub` fresh-clone workflows expect valid frontmatter in repo-owned skills under `.agents/skills/`

## What The Baseline Scripts Cover

- `baseline:check`
  - verifies each sibling repo matches the manifest SHA and has a clean working tree
  - treats `devagent-hub` as a self-reference exemption because a checked-in manifest cannot pin the same commit that updates it
- `baseline:drift`
  - fails if protocol types are declared outside `devagent-sdk`
- `baseline:compat`
  - validates SDK fixtures and Hub-generated SDK requests
- `baseline:smoke`
  - runs the local machine path through `devagent-runner -> devagent execute`
  - covers `triage`, `plan`, `implement`, `verify`, `review`, `repair`
  - includes failure drills for invalid requests, bad verification commands, missing artifact directory, unsupported capability, and cancellation

## Stale-State Rules

Hub stores a baseline snapshot on workflow start:

- target branch
- target base SHA
- pinned system baseline `{ sdkSha, runnerSha, devagentSha, hubSha, protocolVersion }`

On `run resume`, `pr open`, and `pr repair`, Hub compares the stored snapshot with current repo state.

If the baseline no longer matches, Hub fails explicitly with:

- `STALE_BASELINE`
- `STALE_BRANCH_REF`
- `HISTORICAL_RUN_REQUIRES_MANUAL_INTERVENTION`

## Live Validation Ladder

Run fresh baseline validation in this order:

1. local baseline checks
2. fresh `devagent` issue to approval to PR from current `main`
3. fresh `devagent-hub` issue to approval to PR from current `main`
4. repair loop on a fresh PR using `devagent-hub pr repair`
5. stale-history resilience checks against pre-rewrite runs, branches, or PR heads

Avoid resuming pre-rewrite `devagent` branches as a baseline scenario. Those are migration-safety
inputs only.
