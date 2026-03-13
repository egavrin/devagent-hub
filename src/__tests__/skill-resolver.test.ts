import { rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../workflow/config.js";
import { resolveSkills } from "../workflow/skill-resolver.js";

const paths: string[] = [];

afterEach(async () => {
  await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("resolveSkills", () => {
  it("does not inject default stage skills when none are configured", () => {
    const config = defaultConfig();
    const resolved = resolveSkills(config, "implement", ["src/index.ts"]);

    expect(resolved).toEqual([]);
  });

  it("adds path-override skills when changed files match", () => {
    const config = defaultConfig();
    config.skills.path_overrides["src/workflows/**"] = ["state-machine"];
    const resolved = resolveSkills(config, "repair", ["src/workflows/service.ts"]);

    expect(resolved).toEqual(["state-machine"]);
  });
});
