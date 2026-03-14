#!/usr/bin/env node

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const entry = resolve(root, "..", "dist", "cli", "index.js");

if (!existsSync(entry)) {
  process.stderr.write("devagent-hub is not built. Run `bun run build` before invoking the local wrapper.\n");
  process.exit(1);
}

await import(pathToFileURL(entry).href);
