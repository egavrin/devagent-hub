#!/usr/bin/env bun

import { loadBaselineManifest, readBaselineRepoStatuses, resolveHubRoot, resolveWorkspaceRoot } from "../../src/baseline/manifest.js";
import { assert } from "../../src/baseline/test-helpers.js";

const manifest = loadBaselineManifest(resolveHubRoot());
const statuses = readBaselineRepoStatuses(manifest, resolveWorkspaceRoot(resolveHubRoot()));

for (const status of statuses) {
  const expected = manifest.repos[status.name];
  if (status.name === "devagent-hub") {
    if (status.headSha !== expected.sha) {
      console.log(
        `${status.name} manifest pins ${expected.sha}; current HEAD is ${status.headSha} (self-reference exempt)`,
      );
    } else {
      console.log(`${status.name} ${status.headSha} clean`);
    }
  } else {
    assert(
      status.headSha === expected.sha,
      `${status.name} expected ${expected.sha} but found ${status.headSha}`,
    );
    console.log(`${status.name} ${status.headSha} clean`);
  }
  assert(status.clean, `${status.name} working tree is not clean`);
}

console.log(`protocol ${manifest.protocolVersion}`);
