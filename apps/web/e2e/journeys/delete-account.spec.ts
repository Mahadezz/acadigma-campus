import { randomUUID } from "node:crypto"

import { expect, test, type Page } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"

import { expectNoA11yViolations } from "../axe"

/**
 * F-ID-01 Part 7 (D-113), at both configured viewports, with axe:
 *
 * 1. The seeded owner (the only owner of the seeded school) reaches the
 *    account page from Settings in one tap and is blocked, with the school
 *    listed and a Transfer ownership button (AC11).
 * 2. A fresh account asks for deletion (DELETE + password), is signed out
 *    with the date on /login, signs back in, sees the grace banner, and
 *    keeps the account with one tap (AC12).
 *
 * The purge itself (AC13: tombstone, personal workspace gone, memberships
 * removed, audit intact, nothing before day 30) is proven in pgTAP,
 * `supabase/tests/39d_account_deletion.sql`. Live-only (OQ-27).
 */
test.skip(!process.env.E2E_LIVE_SUPABASE, "needs a live Supabase (OQ-27)")

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

test("the only owner of a school is blocked and told which school", async ({
  page,
}, testInfo) => {
  const email = process.env.E2E_OWNER_EMAIL
  const password = process.env.E2E_OWNER_PASSWORD
  test.skip(!email || !password, "E2E_OWNER_EMAIL / _PASSWORD are not set")
  await signIn(page, email ?? "", password ?? "")

  await page.goto("/app/settings")
  await page.getByRole("link", { name: /Your account/ }).click()
  await expect(page).toHaveURL(/\/account\/security/)
  await expect(page.getByText("Hand over your schools first")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Transfer ownership" }).first()
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Delete account" })
  ).toHaveCount(0)
  await expectNoA11yViolations(page, testInfo)
})

test("request deletion, sign back in, keep the account", async ({
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
  const email = `d113-${randomUUID()}@test.local`
  const password = `Pw-${randomUUID()}-Aa1`
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Deletion Journey" },
  })
  if (error) throw error

  await signIn(page, email, password)
  await page.goto("/account/security")
  await page.getByRole("button", { name: "Delete account" }).click()

  // Step 1: what goes and what the school keeps.
  await expect(page.getByText("Kept by your schools")).toBeVisible()
  await expectNoA11yViolations(page, testInfo)
  await page.getByRole("button", { name: "Continue" }).click()

  // Step 2: the button stays disabled until DELETE and a password are in.
  const submit = page.getByRole("button", { name: "Delete my account" })
  await expect(submit).toBeDisabled()
  await page.getByLabel("Type DELETE to confirm").fill("DELETE")
  await page.getByLabel("Your password").fill("wrong-password-e2e")
  await submit.click()
  await expect(page.getByText("That password is not correct.")).toBeVisible()
  await page.getByLabel("Your password").fill(password)
  await submit.click()

  // Every session ended; /login says when.
  await expect(page).toHaveURL(/\/login\?deletion=/)
  await expect(page.getByText(/Your account will be deleted on/)).toBeVisible()

  await signIn(page, email, password)
  await page.goto("/account/security")
  await expect(page.getByText(/Your account will be deleted on/)).toBeVisible()
  await expectNoA11yViolations(page, testInfo)
  await page.getByRole("button", { name: "Keep my account" }).click()
  await expect(page.getByText(/Your account will be deleted on/)).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Delete account" })
  ).toBeVisible()
})
