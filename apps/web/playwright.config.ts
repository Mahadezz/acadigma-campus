import { defineConfig, devices } from "@playwright/test"

/**
 * End-to-end configuration (ARCHITECTURE §9).
 *
 * Two viewports, always: 360×800 is the phone the product is designed for, and
 * 1280×800 is the desk it is also used from. A journey that only passes on one of
 * them is not done.
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000)
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  // Journeys share no state, so they can all run at once.
  fullyParallel: true,
  // A `test.only` left in a branch should fail CI, not silently skip the suite.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },

  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    // Machine-readable, so scripts/e2e-summary.mjs can build the job summary.
    ["json", { outputFile: "test-results/results.json" }],
    process.env.CI ? ["github"] : ["list"],
  ],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "phone",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 360, height: 800 },
      },
    },
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],

  webServer: {
    // `next start` serves the production build — the artefact CI actually ships.
    // Invoked directly rather than through `pnpm start`: the extra process layer
    // leaves the server's stdout attached to a pipe nothing drains, and on Windows
    // the server blocks on write as soon as it logs anything.
    command: `pnpm exec next start --port ${PORT} --hostname 127.0.0.1`,
    // Readiness is the health endpoint, not `/` — it answers without rendering the
    // app, so a slow first paint cannot be mistaken for a server that never came up.
    url: `${BASE_URL}/api/health`,
    stdout: "ignore",
    stderr: "pipe",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
})
