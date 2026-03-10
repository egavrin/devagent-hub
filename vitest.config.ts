import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/__tests__/**/*.test.ts", "src/__tests__/**/*.test.tsx"],
    exclude: [".devagent-runner/**", ".live-dist/**", "dist/**", "node_modules/**"],
  },
});
