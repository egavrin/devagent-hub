# DevAgent Hub

Workflow control plane for AI coding agents. Orchestrates the full issue-to-PR lifecycle across multiple runner backends.

## How it works

```
GitHub Issue → Triage → Plan → Implement → Verify → Review → PR
```

Each stage is executed by a configurable AI agent (DevAgent, Claude Code, Codex, OpenCode). A review gate between stages can auto-approve or request rework.

## Three modes

| Mode | Behavior |
|------|----------|
| **assisted** | Human approves each stage transition |
| **watch** | Auto-review gates, human only on blockers |
| **autopilot** | Discovers issues, prioritizes, runs end-to-end |

## Quick start

```sh
bun install
bun run build

# Run a workflow for an issue
devagent-hub run --repo org/repo --issue 42

# Watch mode
devagent-hub run --repo org/repo --issue 42 --mode watch

# Autopilot
devagent-hub autopilot --repo org/repo

# TUI dashboard
devagent-hub tui --repo org/repo

# Check run status
devagent-hub status <run-id>
devagent-hub list
```

## Configuration

Edit `WORKFLOW.md` in your repo root. See [WORKFLOW.md](WORKFLOW.md) for the full config reference.

### Multi-agent setup

```yaml
profiles:
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
  implement: strong
  review: codex       # cross-model review
```

## Development

```sh
bun test              # run tests
bunx tsc --noEmit     # typecheck
bun run lint          # lint
```

## License

MIT
