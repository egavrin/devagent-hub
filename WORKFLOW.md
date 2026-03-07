---
version: 1
mode: watch

runner:
  approval_mode: full-auto
  max_iterations: 10

profiles:
  default:
    bin: devagent
  cheap:
    bin: opencode
    provider: deepseek
    model: deepseek-chat
  strong:
    bin: claude
    model: sonnet
  codex:
    bin: codex
    model: gpt-5.3-codex

roles:
  triage: cheap
  plan: strong
  implement: strong
  verify: default
  review: codex
  gate: strong
  repair: strong

selection_policy:
  rules:
    - phases: [implement]
      complexity: [large, epic]
      profile: strong
    - phases: [triage, gate]
      profile: cheap

skills:
  defaults: []
  by_stage:
    implement:
      - testing
    review:
      - security-checklist
  path_overrides:
    "src/runner/**":
      - runner-integration
    "src/workflow/**":
      - state-machine
    "src/__tests__/**":
      - testing

verify:
  commands:
    - bun test
    - bunx tsc --noEmit

pr:
  draft: true
  open_requires: [verify]

repair:
  max_rounds: 3

autopilot:
  poll_interval_seconds: 120
  max_concurrent_runs: 2
  eligible_labels: [devagent]
  priority_labels: [priority, urgent, critical]
  exclude_labels: [blocked, wontfix, duplicate]
  max_complexity: medium
  min_gate_confidence: 0.7
  max_changed_files: 20
---

# DevAgent Hub Workflow

This file configures the devagent-hub workflow engine.

## Modes

- **assisted** — human approves each stage transition
- **watch** — auto-review gates between stages, human only on blockers
- **autopilot** — self-discovers issues, prioritizes, runs end-to-end

## Profiles

| Profile | Runner | Model | Use case |
|---------|--------|-------|----------|
| cheap | opencode | deepseek-chat | Fast/cheap: triage, gates |
| strong | claude | sonnet | Reasoning: plan, implement, repair |
| codex | codex | gpt-5.3-codex | Cross-model review |
| default | devagent | (configured) | Verify (shell commands) |

## Skills

Skills are loaded from `.agents/skills/<name>/SKILL.md` and injected into runner prompts.
Path-override skills activate when changed files match the glob pattern.
