import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const hubRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@devagent-sdk/schema": resolve(hubRoot, "../devagent-sdk/packages/schema/src/index.ts"),
      "@devagent-sdk/types": resolve(hubRoot, "../devagent-sdk/packages/types/src/index.ts"),
      "@devagent-sdk/validation": resolve(hubRoot, "../devagent-sdk/packages/validation/src/index.ts"),
      "@devagent-runner/core": resolve(hubRoot, "../devagent-runner/packages/core/src/index.ts"),
      "@devagent-runner/adapters": resolve(hubRoot, "../devagent-runner/packages/adapters/src/index.ts"),
      "@devagent-runner/local-runner": resolve(hubRoot, "../devagent-runner/packages/local-runner/src/index.ts"),
    },
  },
  test: {
    include: ["src/__tests__/**/*.test.ts", "src/__tests__/**/*.test.tsx"],
    exclude: [".devagent-runner/**", ".live-dist/**", "dist/**", "node_modules/**"],
  },
});
