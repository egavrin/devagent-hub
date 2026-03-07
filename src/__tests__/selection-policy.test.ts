import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LauncherFactory } from "../runner/launcher-factory.js";
import { defaultConfig } from "../workflow/config.js";
import type { WorkflowConfig } from "../workflow/config.js";

describe("LauncherFactory — selection policy", () => {
  it("resolves profile from roles when no policy", () => {
    const config = defaultConfig();
    config.profiles = { default: {}, fast: { model: "gpt-4o-mini" } };
    config.roles = { triage: "fast", plan: "default" };

    const factory = new LauncherFactory(config);
    expect(factory.resolveProfile("triage")).toBe("fast");
    expect(factory.resolveProfile("plan")).toBe("default");
  });

  it("uses selection policy rules when defined", () => {
    const config = defaultConfig();
    config.profiles = {
      default: {},
      strong: { model: "claude-opus-4-6" },
      cheap: { model: "deepseek-chat" },
    };
    config.roles = { triage: "default", plan: "default", implement: "default" };
    config.selection_policy = {
      rules: [
        { phases: ["implement"], complexity: ["large", "epic"], profile: "strong" },
        { phases: ["triage", "review"], profile: "cheap" },
      ],
    };

    const factory = new LauncherFactory(config);

    // triage matches second rule
    expect(factory.resolveProfile("triage")).toBe("cheap");

    // implement without complexity context falls through to roles
    expect(factory.resolveProfile("implement")).toBe("default");

    // implement with large complexity matches first rule
    expect(factory.resolveProfile("implement", { complexity: "large" })).toBe("strong");

    // implement with small complexity doesn't match first rule, falls to roles
    expect(factory.resolveProfile("implement", { complexity: "small" })).toBe("default");
  });

  it("wildcard phase matches all", () => {
    const config = defaultConfig();
    config.profiles = { default: {}, fallback: { model: "gpt-4o" } };
    config.roles = { triage: "default" };
    config.selection_policy = {
      rules: [{ phases: ["*"], profile: "fallback" }],
    };

    const factory = new LauncherFactory(config);
    expect(factory.resolveProfile("triage")).toBe("fallback");
    expect(factory.resolveProfile("implement")).toBe("fallback");
  });

  it("skips rules referencing nonexistent profiles", () => {
    const config = defaultConfig();
    config.profiles = { default: {} };
    config.roles = { triage: "default" };
    config.selection_policy = {
      rules: [{ phases: ["triage"], profile: "nonexistent" }],
    };

    const factory = new LauncherFactory(config);
    expect(factory.resolveProfile("triage")).toBe("default");
  });

  it("identifies opencode bin correctly", () => {
    const config = defaultConfig();
    config.profiles = {
      default: {},
      opencode_profile: { bin: "opencode", provider: "deepseek", model: "deepseek-chat" },
    };
    config.roles = { triage: "opencode_profile" };

    const factory = new LauncherFactory(config);
    const adapter = factory.getLauncher("triage");
    expect(adapter.id).toBe("opencode");
  });
});
