import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary"],
      include: ["src/static.ts"],
      thresholds: {
        lines: 100,
      },
    },
  },
});
