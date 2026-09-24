import { expect, test } from "@playwright/test"

import { expectNoA11yViolations } from "./axe"

/**
 * F-ID-05 Part 2 — the `/onboarding` chooser.
 *
 * The redirect-guard case is DB-free coverage, matching `smoke.spec.ts` and
 * `audit.spec.ts`: no seeded auth fixture exists anywhere in this repo yet
 * (OQ-27 — "seed the live project, then set E2E_LIVE_SUPABASE" — is still
 * open per docs/plan/HANDOFF-2026-09-24.md), so an authenticated journey
 * through any route in this codebase is not something Playwright can
 * exercise here yet. That is not a gap specific to this feature.
 *
 * The chooser-rendering + axe journey below is gated on E2E_LIVE_SUPABASE
 * and a seeded test account's credentials, exactly per CLAUDE.md's "seeded
 * account journeys carry the skip guard until OQ-27". It stays skipped until
 * OQ-27 lands the fixture; see docs/test-reports/2026-09-25-F-ID-05-p2.md.
 */
test.describe("onboarding chooser — /onboarding", () => {
  test("signed-out users are sent to sign-in with a return path", async ({
    page,
  }) => {
    await page.goto("/onboarding")
    await expect(page).toHaveURL(/\/login\?next=%2Fonboarding$/)
  })

  test("a verified, membership-less account sees exactly two cards and the tutoring exit, axe clean", async ({
    page,
  }, testInfo) => {
    test.skip(
      !process.env.E2E_LIVE_SUPABASE,
      "needs a seeded, verified Supabase account with zero school memberships (OQ-27)"
    )

    const email = process.env.E2E_TEST_USER_EMAIL
    const password = process.env.E2E_TEST_USER_PASSWORD
    test.skip(
      !email || !password,
      "E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD are not set"
    )

    await page.goto("/login")
    await page.getByLabel("Email").fill(email ?? "")
    await page.getByLabel("Password").fill(password ?? "")
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL(/\/onboarding$/)

    // Both cards render disabled ("Coming soon") — /onboarding/create-school
    // and /onboarding/join don't exist until Parts 3-5, so they are not
    // links (see F-ID-05 §11's Part 2 status note).
    await expect(page.getByText(/create a school/i)).toBeVisible()
    await expect(page.getByText(/join a school/i)).toBeVisible()
    await expect(page.getByText("Coming soon")).toHaveCount(2)
    const tutoringLink = page.getByRole("button", {
      name: /tutoring on my own/i,
    })
    await expect(tutoringLink).toBeVisible()

    await expectNoA11yViolations(page, testInfo)

    // AC11: the tutoring exit sets onboarding_completed_at and lands on
    // /personal. (Whether a later sign-in stops landing on /onboarding is
    // resolveLandingRoute's job at the login action, F-ID-03 §4.4 — out of
    // this route's scope; this only proves the exit itself worked.)
    await tutoringLink.click()
    await expect(page).toHaveURL(/\/personal/)
  })
})
