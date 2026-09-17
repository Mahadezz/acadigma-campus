/**
 * Root config: coverage and reporters only. Projects come from vitest.workspace.ts.
 * Thresholds follow ARCHITECTURE §9 — packages/domain is the business-rule core and
 * is held to a higher bar than the repo as a whole.
 */
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["packages/*/src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/index.ts",
        "packages/db/src/types.generated.ts",
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
        "packages/domain/src/**/*.ts": {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
      },
    },
  },
})
