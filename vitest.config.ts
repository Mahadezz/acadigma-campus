/**
 * Root config: coverage, reporters, and the workspace project topology.
 * Thresholds follow ARCHITECTURE §9 — packages/domain is the business-rule core and
 * is held to a higher bar than the repo as a whole.
 *
 * Node-environment packages are pure TypeScript; the web app runs in jsdom because
 * component tests need a DOM. Playwright owns the browser end of the pyramid and is
 * configured separately in apps/web/playwright.config.ts.
 *
 * Vitest 4 removed the separate `vitest.workspace.ts` file (deprecated since 3.2);
 * project topology now lives here under `test.projects` — see
 * https://vitest.dev/guide/projects (D-49: bumped 2026-09-24 for GHSA-82fw-gwwq-j7x9).
 */
import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

/**
 * `server-only` is not an installed dependency anywhere in this repo — Next.js
 * resolves the literal import via its own webpack/Turbopack alias at build time,
 * which vitest never goes through. Every server module under `apps/web` starts
 * with `import "server-only"`, so unit tests that import one need a stand-in; see
 * `apps/web/test/server-only-stub.ts`. Test files that need `node` rather than
 * `jsdom` semantics still override the environment per-file with
 * `// @vitest-environment node` — that does not affect module resolution.
 */
const serverOnlyStub = fileURLToPath(
  new URL("./apps/web/test/server-only-stub.ts", import.meta.url)
)

/**
 * apps/web/tsconfig.json maps `"@/*": ["./*"]` (relative to apps/web); Vite/
 * vitest does not read tsconfig paths on its own, so any apps/web test that
 * imports a sibling module by its `@/...` alias (rather than mocking it
 * outright) needs the same mapping here.
 */
const webRoot = fileURLToPath(new URL("./apps/web/", import.meta.url))

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["packages/*/src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
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
    projects: [
      {
        test: {
          name: "domain",
          root: "./packages/domain",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "pdf",
          root: "./packages/pdf",
          environment: "node",
          include: ["src/**/*.test.{ts,tsx}"],
          // @react-pdf/renderer's own font/render pipeline is slower than a
          // pure-domain unit test; the golden suite renders several PDFs.
          testTimeout: 20_000,
        },
      },
      {
        test: {
          name: "contracts",
          root: "./packages/contracts",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "db",
          root: "./packages/db",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "web",
          root: "./apps/web",
          environment: "jsdom",
          include: ["{app,lib,components}/**/*.test.{ts,tsx}"],
          setupFiles: ["./test/rtl-cleanup.ts"],
        },
        resolve: {
          alias: [
            { find: "server-only", replacement: serverOnlyStub },
            { find: /^@\//, replacement: webRoot },
          ],
        },
        // apps/web's own tsconfig sets `"jsx": "preserve"` (Next compiles
        // JSX itself, untouched by this file); vitest/esbuild would
        // otherwise fall back to the classic transform for this project's
        // .tsx files, which needs `React` in scope in every component —
        // unlike the "ui" project below, whose tsconfig already says
        // `"jsx": "react-jsx"`. Scoped to this one project only; Next's real
        // build never reads this config.
        esbuild: { jsx: "automatic" },
      },
      {
        test: {
          name: "ui",
          root: "./packages/ui",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
})
