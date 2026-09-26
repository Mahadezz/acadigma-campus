import { expect, test } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

/**
 * F-AC-03 §10 "take-attendance-one-thumb" (demo cut, D-104), at both
 * configured viewports, with axe. The owner opens Attendance, opens the
 * first class, taps "Mark all present", flips one student to absent, saves,
 * and sees the class marked on the Today screen. Timed against the spec's
 * 30-second budget for the whole interaction.
 *
 * Needs a seeded, verified owner of a school with an enrolled section and
 * today a school day (e.g. Class 6 – ক from supabase/seed/demo-class-6-ka.sql),
 * so it carries the same skip guard as the other live journeys (OQ-27).
 */
test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "needs a seeded school owner account (OQ-27)"
)

test.beforeEach(() => {
  test.skip(
    !process.env.E2E_OWNER_EMAIL || !process.env.E2E_OWNER_PASSWORD,
    "E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD are not set"
  )
})

test("owner marks all present, flips one absent and saves", async ({
  page,
}, testInfo) => {
  await page.goto("/login")
  await page.getByLabel("Email").fill(process.env.E2E_OWNER_EMAIL ?? "")
  await page.getByLabel("Password").fill(process.env.E2E_OWNER_PASSWORD ?? "")
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.waitForURL((url) => !url.pathname.startsWith("/login"))

  await page.goto("/app/attendance")
  await expect(
    page.getByRole("heading", { name: "Attendance today" })
  ).toBeVisible()
  await expectNoA11yViolations(page, testInfo)

  const started = Date.now()
  await page
    .getByRole("link", { name: /^(Take attendance|View) — / })
    .first()
    .click()
  await expectNoA11yViolations(page, testInfo)

  const markAll = page.getByRole("button", { name: "Mark all present" })
  if (await markAll.isEnabled()) await markAll.click()
  await page
    .getByRole("radiogroup")
    .first()
    .getByRole("radio", { name: "Absent" })
    .click()
  await page.getByRole("button", { name: "Save" }).click()
  await expect(
    page.getByText(/^Saved: \d+ present, \d+ absent\.$/)
  ).toBeVisible()
  expect(Date.now() - started).toBeLessThan(30_000)

  await page.getByRole("link", { name: "Attendance today" }).click()
  await expect(page.getByText(/classes marked/)).toBeVisible()
  await expectNoA11yViolations(page, testInfo)
})
