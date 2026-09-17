/**
 * Unit-test topology. Node-environment packages are pure TypeScript; the web app
 * runs in jsdom because component tests need a DOM. Playwright owns the browser
 * end of the pyramid and is configured separately in apps/web/playwright.config.ts.
 */
import { fileURLToPath } from "node:url"

import { defineWorkspace } from "vitest/config"

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

export default defineWorkspace([
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
    },
    resolve: {
      alias: [
        { find: "server-only", replacement: serverOnlyStub },
        { find: /^@\//, replacement: webRoot },
      ],
    },
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
])
