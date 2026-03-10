#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { repoPath, assert } from "../../src/baseline/test-helpers.js";

const repos = [
  repoPath("devagent"),
  repoPath("devagent-runner"),
  repoPath("devagent-hub"),
];

const symbols = [
  "TaskExecutionRequest",
  "TaskExecutionResult",
  "TaskExecutionEvent",
  "ArtifactRef",
];

for (const repo of repos) {
  for (const symbol of symbols) {
    let output = "";
    try {
      output = execFileSync(
        "rg",
        [
          "-n",
          `^(?:\\s*export\\s+type\\s+${symbol}\\s*=|\\s*type\\s+${symbol}\\s*=|\\s*export\\s+interface\\s+${symbol}\\b|\\s*interface\\s+${symbol}\\b)`,
          repo,
          "--glob",
          "!**/node_modules/**",
          "--glob",
          "!**/dist/**",
          "--glob",
          "!**/.git/**",
          "--glob",
          "!**/.devagent-runner/**",
          "--glob",
          "!**/.live-dist/**",
        ],
        { encoding: "utf-8" },
      ).trim();
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status !== 1) {
        throw error;
      }
    }
    assert(output === "", `Protocol drift detected for ${symbol}:\n${output}`);
  }
}

console.log("No private protocol type declarations detected.");
