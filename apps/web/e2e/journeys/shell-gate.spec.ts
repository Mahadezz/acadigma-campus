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
 * F-ID-03 §8 Part 4 — the `(school)/app` shell gate (PR #17 review follow-up,
 * `docs/plan/HANDOFF-2026-09-24.md` item 3): a resolved workspace whose
 * `workspaceType`/`role` do not belong to `/app` must never render that
 * shell. `resolveShellGate` (`packages/domain/src/workspace/shellGate.ts`)
 * is unit-tested exhaustively; these two journeys prove the same decision
 * fires through the real Next.js layout, against a real cookie/session.
 */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: "Sign in" }).click()
}

test("a parent member never reaches /app — the gate sends them to /family instead", async ({
  page,
}, testInfo) => {
  // parent@acadigma.test's last_active_workspace_id is their personal
  // workspace (seed.sql §5), so sign-in lands on /personal first; switching
  // to the seeded school is what puts a `parent` membership in play.
  await signIn(page, "parent@acadigma.test")
  await expect(page).toHaveURL("/personal")

  await page.getByRole("button", { name: /switch workspace/i }).click()
  await page
    .getByRole("dialog", { name: "Switch workspace" })
    .getByRole("button", { name: "Acadigma Model School" })
    .click()

  // resolveShellGate("family", ...) allows type=school ∧ role=parent — the
  // family shell renders, not /app.
  await expect(page).toHaveURL("/family")
  await expect(
    // The seeded parent has no child linked yet (D-306: F-AC-02 Part 4 links).
    page.getByRole("heading", {
      name: "Your account isn't linked to a child yet",
    })
  ).toBeVisible()

  // Direct navigation is gated the same way as the redirect after switching —
  // this is the exact scenario the PR #17 review flagged: a parent whose
  // active workspace is the school, reaching /app by URL.
  await page.goto("/app/dashboard")
  await expect(page).toHaveURL("/family")

  await expectNoA11yViolations(page, testInfo)
})

test("a personal-workspace context never reaches /app — the gate sends it to /personal instead", async ({
  page,
}) => {
  // owner@acadigma.test lands on /app by default; switching to the personal
  // workspace (created for every account, F-ID-05 §4.1) makes `personal` the
  // active context even though a school membership still exists — exactly
  // the ambiguity AC9 describes ("a user whose only membership is personal").
  await signIn(page, "owner@acadigma.test")
  await expect(page).toHaveURL(/\/app(\/.*)?$/)

  await page.getByRole("button", { name: /switch workspace/i }).click()
  await page
    .getByRole("dialog", { name: "Switch workspace" })
    .getByRole("button", { name: /Personal/ })
    .click()
  await expect(page).toHaveURL("/personal")

  await page.goto("/app/dashboard")
  await expect(page).toHaveURL("/personal")
})
