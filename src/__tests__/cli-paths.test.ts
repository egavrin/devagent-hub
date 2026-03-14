import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { resolveHubConfigDir, resolveHubDbPath } from "../cli/paths.js";

let tempDir: string | undefined;

afterEach(() => {
  delete process.env.DEVAGENT_HUB_CONFIG_DIR;
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("hub paths", () => {
  it("uses DEVAGENT_HUB_CONFIG_DIR when provided", () => {
    tempDir = mkdtempSync(join(tmpdir(), "devagent-hub-config-"));
    process.env.DEVAGENT_HUB_CONFIG_DIR = tempDir;

    expect(resolveHubConfigDir()).toBe(tempDir);
    expect(resolveHubDbPath()).toBe(join(tempDir, "state.db"));
  });
});
