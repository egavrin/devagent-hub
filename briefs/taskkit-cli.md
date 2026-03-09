# TaskKit CLI

A lightweight CLI task tracker with JSON-file persistence, commands to add/list/complete/remove tasks, priority tags, filters, and tests.

## Goals
- Fast and simple task tracking from the terminal
- Git-friendly JSON storage format
- Zero external dependencies for core functionality
- Comprehensive test coverage

## Constraints
- No external database required
- Single-file persistence (tasks.json)
- Must work with Bun runtime
- All commands must be non-interactive (flags only)

## Tech Stack
- Bun
- TypeScript
- Vitest
- ESLint
- GitHub Actions

## Features
### Project scaffold and CI (must-have)
Initialize project with package.json, tsconfig.json, ESLint config, Vitest config, GitHub Actions CI workflow, and a basic README with quickstart instructions.

### Task model and JSON persistence (must-have)
Define a Task type with id, title, description, status (todo/in-progress/done), priority (low/normal/high/urgent), tags array, createdAt, and updatedAt. Implement a TaskStore class that reads/writes tasks.json with atomic file operations.

### CLI add and list commands (must-have)
Implement `taskkit add --title "..." [--description "..."] [--priority high] [--tags "bug,ui"]` and `taskkit list [--status todo] [--priority high] [--tag bug]` commands with formatted table output.

### CLI complete and remove commands (must-have)
Implement `taskkit done <id>` to mark a task as done and `taskkit rm <id>` to remove a task. Both must validate the task exists and print confirmation.

### Filtering and search (should-have)
Add `taskkit list --status in-progress --priority high --tag backend` with combined filters. Add `taskkit search <query>` for full-text search across title and description.

### Import and export (nice-to-have)
Add `taskkit export [--format json|csv]` and `taskkit import <file>` for data portability. JSON export should be the default and produce valid tasks.json format.

## Milestones
### M1: Foundation
- Project scaffold and CI
- Task model and JSON persistence

### M2: Core CLI
- CLI add and list commands
- CLI complete and remove commands

### M3: Polish
- Filtering and search
- Import and export
