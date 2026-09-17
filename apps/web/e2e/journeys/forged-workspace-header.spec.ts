import { expect, test } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

/**
 * F-ID-03 §4.3 failure case / §9 AC1 (the Base44 root cause, directly):
 * "Given a signed-in user with no membership in school S, when their client
 * sends x-workspace-id: S, then the server responds 403 WORKSPACE_NOT_MEMBER
 * ... and an audit_events row tenancy.context_rejected is written."
 *
 * The browser never sets `x-workspace-id` itself — `apps/web/lib/supabase/
 * middleware.ts` mirrors it from the `acadigma_workspace` cookie on every
 * request. So "a forged header" is simulated here exactly as an attacker
 * would actually produce one: writing a workspace id into that cookie that
 * the signed-in account holds no active membership for, then requesting a
 * protected school-shell route. `resolveWorkspaceContext` (packages/db) is
 * the one place that re-verifies it against `workspace_members` — this test
 * proves that boundary holds from the browser's side, at both viewports
 * (playwright.config.ts's "phone" and "desktop" projects both run this file).
 *
 * The audit row itself (`tenancy.context_rejected`, written via
 * `public.log_tenancy_context_rejected`) is asserted at the database level in
 * `supabase/tests/09_tenancy.sql`, not here — this journey only has an HTTP
 * client, not a database connection.
 */
const FORGED_WORKSPACE_COOKIE = "acadigma_workspace"
// Well-formed, and guaranteed foreign: no workspace with this id was ever
// seeded, and even if one existed, owner@acadigma.test holds no membership
// row for it (AC1 does not require the id to name a real workspace).
const FORGED_WORKSPACE_ID = "99999999-9999-4999-8999-999999999999"
// supabase/seed/seed.sql's fixed id for "Acadigma Model School" — the real
// workspace the dashboard page prints in a <code> tag when access is legitimate.
const REAL_SCHOOL_WORKSPACE_ID = "5eed0000-0000-4000-b000-000000000001"

test.describe("forged x-workspace-id header", () => {
  test("a signed-in user with no membership in the forged workspace gets the 403 page, not its data", async ({
    page,
    context,
  }, testInfo) => {
    await page.goto("/login")
    await page.getByLabel("Email").fill("owner@acadigma.test")
    await page.getByLabel("Password").fill("password123")
    await page.getByRole("button", { name: "Sign in" }).click()

    // Confirms the legitimate path works first: owner@acadigma.test reaches
    // their real school workspace before we forge anything (F-ID-03 §9 AC1's
    // "no data from S is returned" is only meaningful next to "but their own
    // workspace's data still is").
    await expect(page).toHaveURL(/\/app(\/.*)?$/)
    await expect(page.getByText(/signed in as owner/i)).toBeVisible()
    // The real workspace id is legitimately on screen before any forging.
    await expect(page.getByText(REAL_SCHOOL_WORKSPACE_ID)).toBeVisible()

    // Overwrite the active-workspace cookie with a workspace this account
    // never joined — the only "forged x-workspace-id" a browser can actually
    // produce, since the header itself is server-mirrored, never client-set.
    await context.addCookies([
      {
        name: FORGED_WORKSPACE_COOKIE,
        value: FORGED_WORKSPACE_ID,
        url: page.url(),
      },
    ])

    await page.goto("/app/dashboard")

    // Rendered by app/forbidden.tsx via Next's forbidden() boundary — same
    // URL, HTTP 403, no school data anywhere on the page.
    await expect(page.getByText(/you do not have access/i)).toBeVisible()
    await expect(page.getByText(REAL_SCHOOL_WORKSPACE_ID)).toHaveCount(0)

    await expectNoA11yViolations(page, testInfo)
  })
})
