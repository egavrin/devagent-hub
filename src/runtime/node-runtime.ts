import { existsSync } from "node:fs";

const NODE_CANDIDATES = [
  "/opt/homebrew/bin/node",
  "/usr/local/bin/node",
  "/usr/bin/node",
] as const;

export function resolveNodeRuntime(): string {
  if (!process.versions.bun) {
    return process.execPath;
  }

  const configured = process.env.DEVAGENT_HUB_NODE_PATH?.trim();
  if (configured && existsSync(configured)) {
    return configured;
  }

  for (const candidate of NODE_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return process.execPath;
}

export function buildNodeScriptCommand(scriptPath: string): string {
  return `${quoteCommandArg(resolveNodeRuntime())} ${quoteCommandArg(scriptPath)}`;
}

function quoteCommandArg(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}
