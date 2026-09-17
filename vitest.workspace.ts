/**
 * Unit-test topology. Node-environment packages are pure TypeScript; the web app
 * runs in jsdom because component tests need a DOM. Playwright owns the browser
 * end of the pyramid and is configured separately in apps/web/playwright.config.ts.
 */
import { defineWorkspace } from "vitest/config"

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
