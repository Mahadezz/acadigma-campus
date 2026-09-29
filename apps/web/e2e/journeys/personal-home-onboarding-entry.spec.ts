import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

// Needs the live Supabase project with migrations + seed applied (CI sets
// E2E_LIVE_SUPABASE=1 once the Supabase secrets exist — OQ-26). Skipped, not
// silently passing, elsewhere.
test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "live Supabase journey: set E2E_LIVE_SUPABASE=1 with a migrated project"
)

/**
 * Owner report 2026-09-29: a personal-only account had no in-app link to
 * "Create a school" / "Join a school with a code" — the workspace switcher's
 * chip was non-tappable whenever it had only one workspace (§6), and the
 * placeholder personal home (F-ID-03 §8 Part 4, ahead of F-ID-06) had no
 * action at all. Both are fixed in `workspace-switcher.tsx` and
 * `(personal)/personal/page.tsx`.
 *
 * This journey proves reachability end to end: personal home → the new CTA
 * → the create-school wizard's first step actually loads. It deliberately
 * stops there rather than submitting the wizard — `create-school-wizard.spec.ts`
 * already proves "submit → lands in /app" and re-running it here would spend
 * a second school against the same account's 3-per-day budget (AC16) for no
 * new coverage.
 *
 * Uses the seeded `owner@acadigma.test` (already has a school + personal
 * membership, like `switch-workspace.spec.ts`) rather than the single-use
 * `E2E_TEST_USER_EMAIL` fixture `create-school-wizard.spec.ts` depends on:
 * that account's very first sign-in lands it on `/onboarding` (forced,
 * F-ID-05 §8 Part 2) and any action here that completed or changed its
 * onboarding state would break that spec's own assumption on a later run.
 * The switcher's "only one workspace → not tappable" branch for a lone
 * PERSONAL workspace (the exact case the owner reported) is covered
 * deterministically instead, in `workspace-switcher.test.tsx` — reaching it
 * live would need a second, single-use, personal-only fixture account this
 * suite does not have.
 */
async function signIn(page: Page): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill("owner@acadigma.test")
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/app(\/.*)?$/)
}

test("personal home offers Create a school / Join a school with a code, both reaching onboarding", async ({
  page,
}, testInfo) => {
  await signIn(page)

  await page.getByRole("button", { name: /switch workspace/i }).click()
  await page
    .getByRole("dialog", { name: "Switch workspace" })
    .getByRole("button", { name: /Personal/ })
    .click()
  await expect(page).toHaveURL("/personal")
  await expect(
    page.getByRole("heading", { name: "Your personal workspace" })
  ).toBeVisible()

  const createSchool = page.getByRole("link", { name: "Create a school" })
  const joinWithCode = page.getByRole("link", {
    name: "Join a school with a code",
  })
  await expect(createSchool).toBeVisible()
  await expect(joinWithCode).toBeVisible()
  await expect(createSchool).toHaveAttribute(
    "href",
    "/onboarding/create-school"
  )
  await expect(joinWithCode).toHaveAttribute("href", "/onboarding")

  await expectNoA11yViolations(page, testInfo)

  await createSchool.click()
  await expect(page).toHaveURL(/\/onboarding\/create-school$/)
  await expect(
    page.getByRole("heading", { name: /tell us about your school/i })
  ).toBeVisible()

  // The switcher itself, opened from /personal, offers the same pair.
  await page.goBack()
  await expect(page).toHaveURL("/personal")
  await page.getByRole("button", { name: /switch workspace/i }).click()
  const sheet = page.getByRole("dialog", { name: "Switch workspace" })
  await expect(
    sheet.getByRole("link", { name: "Create a school" })
  ).toHaveAttribute("href", "/onboarding/create-school")
  await expect(
    sheet.getByRole("link", { name: "Join a school with a code" })
  ).toHaveAttribute("href", "/onboarding")
})
