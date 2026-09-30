import { randomUUID } from "node:crypto"

import { expect, test, type Page } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"

import { expectNoA11yViolations } from "../axe"

/**
 * D-115 (F-ID-01 "Re-acceptance of the current legal documents"), at both
 * configured viewports, with axe. A fresh account created without the
 * sign-up metadata stands for every account made before D-114: it holds no
 * Terms/Privacy row.
 *
 * R1 opening the app lands on /account/legal; R4 account deletion stays
 * reachable; Continue with the box unticked says why and stays; R2 ticking
 * it and continuing opens the app, and the app no longer asks. The DPA
 * branch (owner only, R3) is proven by pgTAP 39g and the unit tests.
 * Live-only (OQ-27).
 */
test.skip(!process.env.E2E_LIVE_SUPABASE, "needs a live Supabase (OQ-27)")

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

test("an account without the current Terms accepts them before using the app", async ({
  page,
}, testInfo) => {
  test.skip(
    !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "SUPABASE_SERVICE_ROLE_KEY is not set"
  )
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false } }
  )
  const email = `d115-${randomUUID()}@test.local`
  const password = `Pw-${randomUUID()}-Aa1`
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Reacceptance Journey" },
  })
  if (error) throw error

  await signIn(page, email, password)
  await page.goto("/app")
  await expect(page).toHaveURL(/\/account\/legal$/)
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Please accept our updated terms",
    })
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Terms of Use" }).first()
  ).toHaveAttribute("href", "/legal/terms")
  await expectNoA11yViolations(page, testInfo)
  // The screen at this project's viewport, kept in the report (DoD).
  await testInfo.attach("legal-reacceptance", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  })

  // Not ticked: the reason, and nothing sent.
  await page.getByRole("button", { name: "Continue" }).click()
  await expect(
    page.getByText(
      "Accept the Terms of Use and the Privacy Notice to continue."
    )
  ).toBeVisible()
  await expect(page).toHaveURL(/\/account\/legal$/)

  // The legal exit stays open (no school owned, so no export link).
  await expect(
    page.getByRole("link", { name: "Delete my account" })
  ).toHaveAttribute("href", "/account/security#delete-account")
  await expect(
    page.getByRole("link", { name: "Download this school's data" })
  ).toHaveCount(0)
  await page.goto("/account/security")
  await expect(
    page.getByRole("button", { name: "Delete account" })
  ).toBeVisible()

  await page.goto("/account/legal")
  await page.getByRole("checkbox").check()
  await page.getByRole("button", { name: "Continue" }).click()
  await expect(page).not.toHaveURL(/\/account\/legal/)

  // Accepted once: the app opens, and the screen sends you on.
  await page.goto("/app")
  await expect(page).not.toHaveURL(/\/account\/legal/)
  await page.goto("/account/legal")
  await expect(page).not.toHaveURL(/\/account\/legal/)
})
