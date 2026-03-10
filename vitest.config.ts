import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const hubRoot = dirname(fileURLToPath(import.meta.url));
const repoNames = ["devagent-sdk", "devagent-runner", "devagent", "devagent-hub"] as const;

function resolveWorkspaceRoot(): string {
  let current = resolve(hubRoot, "..");

  while (true) {
    if (repoNames.every((repoName) => existsSync(join(current, repoName)))) {
      return current;
    }

    const parent = resolve(current, "..");
    if (parent === current) {
      return resolve(hubRoot, "..");
    }
    current = parent;
  }
}

const workspaceRoot = resolveWorkspaceRoot();

export default defineConfig({
  resolve: {
    alias: {
      "@devagent-sdk/schema": resolve(workspaceRoot, "devagent-sdk/packages/schema/src/index.ts"),
      "@devagent-sdk/types": resolve(workspaceRoot, "devagent-sdk/packages/types/src/index.ts"),
      "@devagent-sdk/validation": resolve(workspaceRoot, "devagent-sdk/packages/validation/src/index.ts"),
      "@devagent-runner/core": resolve(workspaceRoot, "devagent-runner/packages/core/src/index.ts"),
      "@devagent-runner/adapters": resolve(workspaceRoot, "devagent-runner/packages/adapters/src/index.ts"),
      "@devagent-runner/local-runner": resolve(workspaceRoot, "devagent-runner/packages/local-runner/src/index.ts"),
    },
  },
  test: {
    include: ["src/__tests__/**/*.test.ts", "src/__tests__/**/*.test.tsx"],
    exclude: [".devagent-runner/**", ".live-dist/**", "dist/**", "node_modules/**"],
  },
});
