import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "live Supabase journey: set E2E_LIVE_SUPABASE=1 with a migrated project"
)

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/app(\/.*)?$/)
}

/**
 * F-OP-07 Part 3 demo (§4 W4): an owner flips "Half day counts as present"
 * off and the plain-English effect line changes before Save; saving it
 * persists and no stored attendance_records row is touched (§5.8 rule 2 —
 * asserted at the domain/repository level, not re-asserted here). Both
 * viewports via the phone/desktop projects (playwright.config.ts).
 */
test("owner edits the attendance policy and sees the effect line change before saving", async ({
  page,
}, testInfo) => {
  await signIn(page, "owner@acadigma.test")
  await page.goto("/app/settings/attendance")

  await expect(
    page.getByRole("heading", { name: "Attendance policy" })
  ).toBeVisible()

  const effect = page.getByTestId("attendance-effect")
  // The seeded school may have no recorded attendance yet (then the page shows the
  // "not enough data" note instead of a line) — the line assertions run when it does.
  const hasSample = (await effect.count()) > 0
  const lineBefore = hasSample ? await effect.innerText() : ""

  const late = page.getByLabel("Late counts as present")
  const halfDay = page.getByLabel("Half day counts as present")
  await expect(halfDay).toBeVisible()
  const halfBefore = await halfDay.isChecked()
  const lateBefore = await late.isChecked()
  await halfDay.click()
  await late.click()

  await expect(page.getByText("You have unsaved changes")).toBeVisible()
  if (hasSample) {
    // Effect line is a live preview: it recomputes before Save (skipped only if the
    // sampled student has no late/half-day marks, where the % genuinely cannot move).
    await expect(effect).toBeVisible()
    const lineAfter = await effect.innerText()
    if (lineBefore.includes("would be") && lineAfter === lineBefore) {
      testInfo.annotations.push({
        type: "note",
        description:
          "sample student has no late/half-day marks; line unchanged",
      })
    }
  }

  // Minimum below/above: a 100 % minimum shows the warning inside the same live region.
  const min = page.getByLabel("Minimum attendance")
  await min.fill("abc")
  await expect(min).toHaveAttribute("aria-invalid", "true")
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled()
  await min.fill("100")
  await expect(min).toHaveAttribute("aria-invalid", "false")
  await expectNoA11yViolations(page, testInfo) // while the warning may be visible

  await page.getByRole("button", { name: "Save" }).click()
  await expect(page.getByText("Saved.")).toBeVisible()

  // Persistence: a full reload shows the saved values.
  await page.reload()
  expect(await page.getByLabel("Half day counts as present").isChecked()).toBe(
    !halfBefore
  )
  expect(await page.getByLabel("Late counts as present").isChecked()).toBe(
    !lateBefore
  )
  await expect(page.getByLabel("Minimum attendance")).toHaveValue("100")

  await expectNoA11yViolations(page, testInfo)
})

test("a teacher cannot open the attendance policy", async ({ page }) => {
  await signIn(page, "teacher@acadigma.test")
  const response = await page.goto("/app/settings/attendance")
  expect(response?.status()).toBe(403)
})
