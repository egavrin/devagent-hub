import { describe, it, expect } from "vitest";
import { seedBacklog } from "../workflow/backlog-seeder.js";
function makeBrief(overrides = {}) {
    return {
        name: "TestProject",
        description: "A test project.",
        goals: ["goal 1"],
        constraints: ["constraint 1"],
        techStack: ["TypeScript"],
        features: [
            { name: "Feature A", description: "Desc A", priority: "must-have" },
            { name: "Feature B", description: "Desc B", priority: "should-have" },
            { name: "Feature C", description: "Desc C", priority: "nice-to-have" },
        ],
        milestones: [
            { name: "M1", features: ["Feature A", "Feature B"], description: "First milestone" },
            { name: "M2", features: ["Feature C"], description: "Second milestone" },
        ],
        ...overrides,
    };
}
describe("seedBacklog", () => {
    it("generates one item per feature", () => {
        const brief = makeBrief();
        const items = seedBacklog(brief);
        expect(items).toHaveLength(3);
    });
    it("titles include project name and feature name", () => {
        const brief = makeBrief();
        const items = seedBacklog(brief);
        expect(items[0].title).toBe("[TestProject] Feature A");
        expect(items[1].title).toBe("[TestProject] Feature B");
    });
    it("assigns correct priority numbers", () => {
        const brief = makeBrief();
        const items = seedBacklog(brief);
        const featureA = items.find((i) => i.title.includes("Feature A"));
        const featureB = items.find((i) => i.title.includes("Feature B"));
        const featureC = items.find((i) => i.title.includes("Feature C"));
        expect(featureA.priority).toBe(0); // must-have
        expect(featureB.priority).toBe(1); // should-have
        expect(featureC.priority).toBe(2); // nice-to-have
    });
    it("assigns milestone to items", () => {
        const brief = makeBrief();
        const items = seedBacklog(brief);
        const featureA = items.find((i) => i.title.includes("Feature A"));
        const featureC = items.find((i) => i.title.includes("Feature C"));
        expect(featureA.milestone).toBe("M1");
        expect(featureC.milestone).toBe("M2");
    });
    it("labels include devagent, milestone, and priority", () => {
        const brief = makeBrief();
        const items = seedBacklog(brief);
        const featureA = items.find((i) => i.title.includes("Feature A"));
        expect(featureA.labels).toContain("devagent");
        expect(featureA.labels).toContain("M1");
        expect(featureA.labels).toContain("must-have");
    });
    it("orders M1 items before M2 items", () => {
        const brief = makeBrief();
        const items = seedBacklog(brief);
        const m1Indices = items
            .map((item, i) => (item.milestone === "M1" ? i : -1))
            .filter((i) => i >= 0);
        const m2Indices = items
            .map((item, i) => (item.milestone === "M2" ? i : -1))
            .filter((i) => i >= 0);
        expect(Math.max(...m1Indices)).toBeLessThan(Math.min(...m2Indices));
    });
    it("within a milestone, must-have comes before should-have", () => {
        const brief = makeBrief();
        const items = seedBacklog(brief);
        const m1Items = items.filter((i) => i.milestone === "M1");
        expect(m1Items[0].title).toContain("Feature A"); // must-have
        expect(m1Items[1].title).toContain("Feature B"); // should-have
    });
    it("body includes feature description and tech stack", () => {
        const brief = makeBrief();
        const items = seedBacklog(brief);
        expect(items[0].body).toContain("Desc A");
        expect(items[0].body).toContain("TypeScript");
    });
    it("body includes project name", () => {
        const brief = makeBrief();
        const items = seedBacklog(brief);
        expect(items[0].body).toContain("TestProject");
    });
    it("handles features not assigned to any milestone", () => {
        const brief = makeBrief({
            features: [
                { name: "Orphan", description: "No milestone", priority: "should-have" },
            ],
            milestones: [],
        });
        const items = seedBacklog(brief);
        expect(items).toHaveLength(1);
        expect(items[0].title).toBe("[TestProject] Orphan");
        expect(items[0].milestone).toBeUndefined();
        expect(items[0].labels).toContain("devagent");
        expect(items[0].labels).toContain("should-have");
    });
    it("handles empty features list", () => {
        const brief = makeBrief({ features: [], milestones: [] });
        const items = seedBacklog(brief);
        expect(items).toHaveLength(0);
    });
    it("dependencies chain within milestone", () => {
        const brief = makeBrief();
        const items = seedBacklog(brief);
        // First item should have no dependencies
        expect(items[0].dependencies).toHaveLength(0);
        // Second item in M1 should depend on the first
        const m1Items = items.filter((i) => i.milestone === "M1");
        if (m1Items.length > 1) {
            expect(m1Items[1].dependencies).toContain(m1Items[0].title);
        }
    });
});
