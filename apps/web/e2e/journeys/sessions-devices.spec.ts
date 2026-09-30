import { randomUUID } from "node:crypto"

import { expect, test, type Page } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"

import { expectNoA11yViolations } from "../axe"

/**
 * F-ID-01 Part 6 (D-116), at both configured viewports, with axe. Two
 * browsers signed in to one fresh account: the second one reports itself as
 * Firefox on Android, which also proves the server forwards the browser's
 * user agent to Supabase.
 *
 * S1 the list shows both and marks this device; S2 signing the other one
 * out removes it and that browser's next page load lands on /login (AC10);
 * S4 Sign out everywhere asks first (Cancel keeps everything), then ends
 * this session too; S5 axe. S3 (isolation) is
 * pgTAP 39h. Live-only (OQ-27).
 */
test.skip(!process.env.E2E_LIVE_SUPABASE, "needs a live Supabase (OQ-27)")

const OTHER_UA =
  "Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0"

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

test("see signed-in devices, sign one out, then sign out everywhere", async ({
  page,
  browser,
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
  const email = `d116-${randomUUID()}@test.local`
  const password = `Pw-${randomUUID()}-Aa1`
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Devices Journey" },
  })
  if (error) throw error

  const otherContext = await browser.newContext({ userAgent: OTHER_UA })
  const other = await otherContext.newPage()
  try {
    await signIn(other, email, password)
    await signIn(page, email, password)

    // S1
    await page.goto("/account/security")
    const rows = page.getByTestId("device-row")
    await expect(rows).toHaveCount(2)
    await expect(rows.first()).toContainText("This device")
    await expect(rows.nth(1)).toContainText("Firefox on Android")
    await expect(page.locator("#devices")).toContainText("Signed-in devices")
    await page.locator("#devices").scrollIntoViewIfNeeded()
    await expectNoA11yViolations(page, testInfo)
    await testInfo.attach("signed-in-devices", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    })

    // S2
    await page
      .getByRole("button", { name: "Sign out Firefox on Android" })
      .click()
    await expect(page.getByText("That device is signed out.")).toBeVisible()
    await expect(rows).toHaveCount(1)
    await page.reload()
    await expect(page.getByTestId("device-row")).toHaveCount(1)

    await other.goto("/account/security")
    await expect(other).toHaveURL(/\/login/)

    // S4 — asks first; Cancel changes nothing.
    await page.getByRole("button", { name: "Sign out everywhere" }).click()
    const confirm = page.getByRole("alertdialog")
    await expect(confirm).toContainText("including this one")
    await expectNoA11yViolations(page, testInfo)
    await confirm.getByRole("button", { name: "Cancel" }).click()
    await expect(confirm).toHaveCount(0)
    await page.reload()
    await expect(page).toHaveURL(/\/account\/security$/)
    await expect(page.getByTestId("device-row")).toHaveCount(1)

    await page.getByRole("button", { name: "Sign out everywhere" }).click()
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Sign out everywhere" })
      .click()
    await expect(page).toHaveURL(/\/login$/)
    await page.goto("/account/security")
    await expect(page).toHaveURL(/\/login/)
  } finally {
    await otherContext.close()
  }
})
