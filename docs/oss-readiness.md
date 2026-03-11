# OSS Readiness

This document is the public-alpha cross-repo guide for contributors who want to work on the
DevAgent stack.

## Supported repos

- `devagent-sdk`
- `devagent-runner`
- `devagent`
- `devagent-hub`

## Supported execution path

```text
devagent-hub -> devagent-runner -> devagent execute
```

Only the DevAgent executor path is production-grade today. `codex`, `claude`, and `opencode`
adapters remain experimental.

## Contributor bootstrap

Expected sibling layout:

```text
<workspace-root>/
  devagent-sdk/
  devagent-runner/
  devagent/
  devagent-hub/
```

Run from `devagent-hub`:

```bash
bun install
bun run bootstrap:local
```

## Review and workflow expectations

- follow each repo's `AGENTS.md`, `REVIEW.md`, and `WORKFLOW.md`
- keep the supported DevAgent-only path stable
- keep public docs aligned with real behavior
- do not claim validation without test or live-run evidence

## Public-alpha limitations

- packages are not published to a registry yet
- the sibling bootstrap flow is the official contributor setup
- only the DevAgent path is production-grade
- the project family is public alpha, not a polished end-user product

## Merge gate checklist

- repo-local tests pass
- OSS docs and metadata remain current
- no stale references to removed UI or legacy execution surfaces
- validation claims are backed by tests or the validation ledger
