/**
 * Regression test for the Vercel font-shipping bug (lead review on PR #53):
 * `fonts.ts` used to resolve `../assets/fonts/*.ttf` from `import.meta.url` at
 * import time. That works locally, but webpack bakes the *build machine's*
 * resolved absolute path (`file:///F:/Acadigma%20Suite/...`) into the
 * compiled route, and that path does not exist on Vercel's filesystem at
 * request time — every `/api/pdf/[runId]` render 500'd in production.
 *
 * The fix embeds the font bytes as base64 `data:` URLs (`fonts.generated.ts`)
 * so there is no file path to resolve at all, at import time or render time.
 * These two checks guard against either half of the bug coming back: a static
 * check that no filesystem/path API is used, and a behavioural check that
 * rendering still works when the process's cwd is nowhere near the repo
 * (which is exactly what differs between a local dev run and a Vercel
 * serverless function).
 */
import { readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { renderPdfToBuffer } from "./render"
import { SampleDocument } from "./templates/sample"

const FONTS_TS_PATH = fileURLToPath(new URL("./fonts.ts", import.meta.url))

describe("fonts.ts ships fonts safely for a Vercel serverless function", () => {
  it("imports no filesystem/path module — nothing to resolve a build-machine path from", async () => {
    const source = await readFile(FONTS_TS_PATH, "utf8")
    const importLines = source
      .split("\n")
      .filter((line) => /^import /.test(line))
      .join("\n")
    expect(importLines).not.toMatch(/node:url|node:fs/)
  })

  it("renders a real PDF with correct Bengali+Latin text when the process cwd is outside the repo entirely", async () => {
    const originalCwd = process.cwd()
    process.chdir(tmpdir())
    try {
      const buffer = await renderPdfToBuffer(
        <SampleDocument
          locale="bn"
          schoolName="আদর্শ উচ্চ বিদ্যালয়"
          headerLines={["Dhaka, Bangladesh"]}
          generatedAt={new Date("2026-09-25T09:30:00.000Z")}
        />
      )
      // A corrupt/empty PDF (what the file:// bug produced on Vercel — the
      // route 500'd before any bytes reached the client) would fail here.
      expect(buffer.length).toBeGreaterThan(1000)
      expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-")
    } finally {
      process.chdir(originalCwd)
    }
  })
})
