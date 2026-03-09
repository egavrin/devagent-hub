import { describe, it, expect } from "vitest";
import { resolveSkills } from "../workflow/skill-resolver.js";
import { defaultConfig } from "../workflow/config.js";
describe("resolveSkills", () => {
    it("returns empty array when no skills configured", () => {
        const config = defaultConfig();
        config.skills = { defaults: [], by_stage: {}, path_overrides: {} };
        expect(resolveSkills(config, "triage")).toEqual([]);
    });
    it("returns default skills for any phase", () => {
        const config = defaultConfig();
        config.skills.defaults = ["code-review", "testing"];
        expect(resolveSkills(config, "triage")).toEqual(["code-review", "testing"]);
        expect(resolveSkills(config, "implement")).toEqual(["code-review", "testing"]);
    });
    it("adds stage-specific skills", () => {
        const config = defaultConfig();
        config.skills.defaults = ["base"];
        config.skills.by_stage = { implement: ["refactoring", "tdd"] };
        expect(resolveSkills(config, "implement")).toEqual(["base", "refactoring", "tdd"]);
        expect(resolveSkills(config, "triage")).toEqual(["base"]);
    });
    it("adds path-override skills when files match", () => {
        const config = defaultConfig();
        config.skills = { defaults: [], by_stage: {}, path_overrides: {
                "packages/providers/**": ["provider-testing"],
                "**/*.test.ts": ["unit-testing"],
            } };
        const files = ["packages/providers/src/index.ts", "src/main.ts"];
        expect(resolveSkills(config, "implement", files)).toEqual(["provider-testing"]);
        const testFiles = ["src/foo.test.ts"];
        expect(resolveSkills(config, "implement", testFiles)).toEqual(["unit-testing"]);
    });
    it("deduplicates skills across sources", () => {
        const config = defaultConfig();
        config.skills.defaults = ["testing"];
        config.skills.by_stage = { implement: ["testing", "refactoring"] };
        expect(resolveSkills(config, "implement")).toEqual(["testing", "refactoring"]);
    });
    it("ignores path overrides when no files provided", () => {
        const config = defaultConfig();
        config.skills = { defaults: [], by_stage: {}, path_overrides: { "src/**": ["src-skill"] } };
        expect(resolveSkills(config, "implement")).toEqual([]);
    });
});
