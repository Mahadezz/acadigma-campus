import { expect, test } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

/**
 * F-ID-05 Part 3 §8: "e2e resume-after-reload at 360×800." Runs at both
 * configured viewports (`playwright.config.ts`'s two projects), per CLAUDE.md
 * rule 12. Needs a seeded, verified Supabase account with zero school
 * memberships — the same fixture `apps/web/e2e/onboarding.spec.ts` already
 * gates on (OQ-27), so this file carries the identical skip guard.
 *
 * Demo (§8 Part 3): "fill two steps on a phone, kill the tab, reopen — the
 * draft is there." Reloading stands in for "kill the tab, reopen": both
 * read the same server-side `onboarding_progress` row on next render, so a
 * hard reload exercises exactly the persistence path a killed-and-reopened
 * tab would.
 */
test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "needs a seeded, verified Supabase account with zero school memberships (OQ-27)"
)

test.beforeEach(() => {
  test.skip(
    !process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD,
    "E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD are not set"
  )
})

test("create-school wizard: steps 1-2 persist across a reload, then stops at the Part 3 boundary", async ({
  page,
}, testInfo) => {
  const email = process.env.E2E_TEST_USER_EMAIL ?? ""
  const password = process.env.E2E_TEST_USER_PASSWORD ?? ""

  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/onboarding$/)

  await page.getByRole("link", { name: /create a school/i }).click()
  await expect(page).toHaveURL(/\/onboarding\/create-school$/)
  await expect(
    page.getByRole("heading", { name: /tell us about your school/i })
  ).toBeVisible()

  await expectNoA11yViolations(page, testInfo)

  // --- Step 1: Identity ---------------------------------------------------
  await page.getByLabel("School name").fill("Ideal School & College")
  // EIIN left blank on purpose — optional (§4.3), and blank must not block
  // Continue (the "" vs undefined normalisation this Part's wizard.tsx docs).
  await page.getByRole("radio", { name: "Bangla" }).click()
  await page.getByLabel("Education board").click()
  await page.getByRole("option", { name: "Dhaka" }).click()
  await page.getByRole("button", { name: "Continue" }).click()

  // --- Step 2: Where and when ----------------------------------------------
  await expect(
    page.getByRole("heading", { name: /where and when/i })
  ).toBeVisible()
  await expectNoA11yViolations(page, testInfo)

  // Sat-Thu is preselected by default (§5); Friday stays off. Toggle Sunday
  // off to prove a real change round-trips through the reload below.
  await expect(
    page.getByRole("checkbox", { name: "Saturday" })
  ).toHaveAttribute("aria-checked", "true")
  await page.getByRole("checkbox", { name: "Sunday" }).click()

  // --- Reload: the draft must still be there (§8 Part 3 demo) -------------
  await page.reload()
  await expect(
    page.getByRole("heading", { name: /where and when/i })
  ).toBeVisible()
  await expect(page.getByRole("checkbox", { name: "Sunday" })).toHaveAttribute(
    "aria-checked",
    "false"
  )

  // Going back to step 1 shows the name/board/medium filled in earlier —
  // proving step 1's data survived the reload too, not just step 2's.
  await page.getByRole("button", { name: "Back" }).click()
  await expect(page.getByLabel("School name")).toHaveValue(
    "Ideal School & College"
  )
  await page.getByRole("button", { name: "Continue" }).click()

  // --- Finish step 2: Part 3's boundary (Part 4 owns steps 3-5) -----------
  await page.getByRole("button", { name: "Continue" }).click()
  await expect(
    page.getByRole("heading", { name: /more on the way/i })
  ).toBeVisible()
  await expectNoA11yViolations(page, testInfo)

  // The stopping screen also survives a reload.
  await page.reload()
  await expect(
    page.getByRole("heading", { name: /more on the way/i })
  ).toBeVisible()

  await page.getByRole("link", { name: /back to onboarding/i }).click()
  await expect(page).toHaveURL(/\/onboarding$/)
})
