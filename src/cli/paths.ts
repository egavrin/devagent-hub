import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function resolveHubConfigDir(): string {
  const configured = process.env.DEVAGENT_HUB_CONFIG_DIR?.trim();
  if (configured) {
    return resolve(configured);
  }
  return join(homedir(), ".config", "devagent-hub");
}

export function resolveHubDbPath(): string {
  return join(resolveHubConfigDir(), "state.db");
}
