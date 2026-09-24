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
 * F-ID-03 §8 Part 4, §10 `switch-workspace-changes-shell`.
 *
 * `owner@acadigma.test` (`supabase/seed/seed.sql`) has two active
 * memberships — the seeded school (`last_active_workspace_id`, so sign-in
 * lands on `/app`) and the personal workspace `app.handle_new_user()`
 * creates for every account. Switching between them from the top-bar
 * `WorkspaceSwitcher` chip must change the whole shell, not just the URL.
 */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/app(\/.*)?$/)
}

test("switching from the school workspace to the personal one changes the shell", async ({
  page,
}, testInfo) => {
  await signIn(page, "owner@acadigma.test")

  const chip = page.getByRole("button", { name: /switch workspace/i })
  await expect(chip).toBeVisible()
  await chip.click()

  const sheet = page.getByRole("dialog", { name: "Switch workspace" })
  await expect(sheet).toBeVisible()

  // The seeded personal workspace is named "<full name> — Personal". The
  // button's accessible name also trails the role ("... — Personal owner"),
  // so this matches the workspace name as a substring, not the whole string.
  await sheet.getByRole("button", { name: /Personal/ }).click()

  await expect(page).toHaveURL("/personal")
  await expect(sheet).not.toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Your personal workspace" })
  ).toBeVisible()

  await expectNoA11yViolations(page, testInfo)

  // And back — proves the switch is not a one-way trip.
  await page.getByRole("button", { name: /switch workspace/i }).click()
  await page
    .getByRole("dialog", { name: "Switch workspace" })
    .getByRole("button", { name: "Acadigma Model School" })
    .click()
  await expect(page).toHaveURL(/\/app(\/.*)?$/)
})

test("a school-workspace member reaching /app directly still resolves via the gate", async ({
  page,
}) => {
  // Sanity check that the happy path itself never redirects an owner away
  // from their own school shell (guards the gate from being too strict).
  await signIn(page, "owner@acadigma.test")
  await page.goto("/app/dashboard")
  await expect(page).toHaveURL(/\/app\/dashboard$/)
})
