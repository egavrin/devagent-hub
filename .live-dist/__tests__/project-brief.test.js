import { describe, it, expect } from "vitest";
import { parseProjectBrief, loadProjectBrief } from "../workflow/project-brief.js";
import { seedBacklog } from "../workflow/backlog-seeder.js";
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const SAMPLE_BRIEF = `
# TaskKit CLI
A lightweight task management CLI tool.

## Goals
- Fast and simple task tracking
- Git-friendly storage format

## Constraints
- No external database
- Single binary distribution

## Tech Stack
- TypeScript
- Node.js

## Features
### Add Task (must-have)
Create new tasks with title and description.

### List Tasks (must-have)
Display tasks in table format with filters.

### Complete Task (must-have)
Mark tasks as done.

### Export (nice-to-have)
Export tasks to JSON/CSV.

## Milestones
### M1: Core
- Add Task
- List Tasks
- Complete Task

### M2: Polish
- Export
`;
describe("parseProjectBrief", () => {
    it("parses project name", () => {
        const brief = parseProjectBrief(SAMPLE_BRIEF);
        expect(brief.name).toBe("TaskKit CLI");
    });
    it("parses description", () => {
        const brief = parseProjectBrief(SAMPLE_BRIEF);
        expect(brief.description).toBe("A lightweight task management CLI tool.");
    });
    it("parses goals as array", () => {
        const brief = parseProjectBrief(SAMPLE_BRIEF);
        expect(brief.goals).toEqual([
            "Fast and simple task tracking",
            "Git-friendly storage format",
        ]);
    });
    it("parses constraints", () => {
        const brief = parseProjectBrief(SAMPLE_BRIEF);
        expect(brief.constraints).toEqual([
            "No external database",
            "Single binary distribution",
        ]);
    });
    it("parses tech stack", () => {
        const brief = parseProjectBrief(SAMPLE_BRIEF);
        expect(brief.techStack).toEqual(["TypeScript", "Node.js"]);
    });
    it("parses features with priorities", () => {
        const brief = parseProjectBrief(SAMPLE_BRIEF);
        expect(brief.features).toHaveLength(4);
        expect(brief.features[0]).toEqual({
            name: "Add Task",
            description: "Create new tasks with title and description.",
            priority: "must-have",
        });
        expect(brief.features[1]).toEqual({
            name: "List Tasks",
            description: "Display tasks in table format with filters.",
            priority: "must-have",
        });
        expect(brief.features[2]).toEqual({
            name: "Complete Task",
            description: "Mark tasks as done.",
            priority: "must-have",
        });
        expect(brief.features[3]).toEqual({
            name: "Export",
            description: "Export tasks to JSON/CSV.",
            priority: "nice-to-have",
        });
    });
    it("parses milestones with feature references", () => {
        const brief = parseProjectBrief(SAMPLE_BRIEF);
        expect(brief.milestones).toHaveLength(2);
        expect(brief.milestones[0].name).toBe("M1: Core");
        expect(brief.milestones[0].features).toEqual([
            "Add Task",
            "List Tasks",
            "Complete Task",
        ]);
        expect(brief.milestones[1].name).toBe("M2: Polish");
        expect(brief.milestones[1].features).toEqual(["Export"]);
    });
    it("seedBacklog generates correct number of items", () => {
        const brief = parseProjectBrief(SAMPLE_BRIEF);
        const items = seedBacklog(brief);
        // 4 features = 4 backlog items
        expect(items).toHaveLength(4);
    });
    it("seedBacklog items have proper labels", () => {
        const brief = parseProjectBrief(SAMPLE_BRIEF);
        const items = seedBacklog(brief);
        // First item: Add Task — must-have, M1: Core
        expect(items[0].labels).toContain("devagent");
        expect(items[0].labels).toContain("M1: Core");
        expect(items[0].labels).toContain("must-have");
        // Last item: Export — nice-to-have, M2: Polish
        const exportItem = items.find((i) => i.title.includes("Export"));
        expect(exportItem).toBeDefined();
        expect(exportItem.labels).toContain("devagent");
        expect(exportItem.labels).toContain("M2: Polish");
        expect(exportItem.labels).toContain("nice-to-have");
    });
    it("seedBacklog respects milestone ordering", () => {
        const brief = parseProjectBrief(SAMPLE_BRIEF);
        const items = seedBacklog(brief);
        // M1 items should come before M2 items
        const m1Indices = items
            .map((item, i) => (item.milestone === "M1: Core" ? i : -1))
            .filter((i) => i >= 0);
        const m2Indices = items
            .map((item, i) => (item.milestone === "M2: Polish" ? i : -1))
            .filter((i) => i >= 0);
        const maxM1 = Math.max(...m1Indices);
        const minM2 = Math.min(...m2Indices);
        expect(maxM1).toBeLessThan(minM2);
    });
    it("loadProjectBrief reads from file", () => {
        const dir = mkdtempSync(join(tmpdir(), "brief-test-"));
        const filePath = join(dir, "brief.md");
        writeFileSync(filePath, SAMPLE_BRIEF, "utf-8");
        try {
            const brief = loadProjectBrief(filePath);
            expect(brief.name).toBe("TaskKit CLI");
            expect(brief.features).toHaveLength(4);
            expect(brief.milestones).toHaveLength(2);
        }
        finally {
            try {
                unlinkSync(filePath);
            }
            catch { }
        }
    });
});
