import { expect, test } from "@playwright/test"

/**
 * F-ID-09 Parts 1-3 — the audit viewer at `/app/audit`.
 *
 * DB-free coverage only, matching the rest of this suite (`smoke.spec.ts`): no
 * seeded auth fixture exists yet anywhere in this repo (F-ID-01 has not shipped
 * one), so an authenticated journey through the list / filter sheet / empty state
 * is not something ANY route in this codebase can exercise through Playwright yet
 * — not a gap specific to this feature. What IS testable without a database is
 * the same thing `smoke.spec.ts` already proves for `/app/dashboard`: the route
 * is guarded, and a signed-out visitor is sent to sign-in with a return path
 * rather than a silent redirect loop or, worse, a page that renders anyway.
 *
 * Runs at both configured viewports (phone 360×800, desktop 1280×800 —
 * playwright.config.ts's `projects`).
 */
test.describe("audit viewer — /app/audit", () => {
  test("signed-out users are sent to sign-in with a return path", async ({
    page,
  }) => {
    await page.goto("/app/audit")
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Faudit$/)
  })
})
