# Contributing to DevAgent Hub

## Who this repo is for

Contributors working on workflow orchestration, approvals, persistence, GitHub integration,
operator CLI flows, and the cross-repo bootstrap path.

## Prerequisites

- Bun `1.3.10+`
- Node `20+`
- sibling checkout of:
  - `devagent-sdk`
  - `devagent-runner`
  - `devagent`
  - `devagent-hub`

## Supported setup path

```bash
bun install
bun run bootstrap:local
```

Run that from the `devagent-hub` repo root.

## Local checks before opening a PR

```bash
bunx tsc --noEmit
bun run test
bun run build
bun run baseline:drift
bun run baseline:compat
bun run baseline:smoke
bun run check:oss
```

## Contribution rules

- Keep Hub on the validated `Hub -> Runner -> DevAgent execute` path.
- Do not reintroduce direct executor launching or removed UI surfaces.
- Keep docs aligned with the current CLI-only operator experience.
- Keep PRs small, especially around workflow safety, repairs, and baseline logic.
