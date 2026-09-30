import { expect, test, type Page } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"

import { expectNoA11yViolations } from "../axe"
import { isSchoolOffToday } from "../school-day"

test.skip(
  !process.env.E2E_LIVE_SUPABASE || !process.env.SUPABASE_SERVICE_ROLE_KEY,
  "live Supabase journey: needs E2E_LIVE_SUPABASE=1 and the service-role key to restore shared seed state"
)

// F-AC-04 Part 1 (D-214): staff self check-in on the dashboard and the
// basic-mode home. Checking in writes today's row in the shared seeded school,
// so this journey deletes today's staff rows before and after (one worker per
// shard, one database per shard).
const WORKSPACE_ID = "5eed0000-0000-4000-b000-000000000001"
const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Dhaka",
}).format(new Date())

async function resetStaffRows(): Promise<void> {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false } }
  )
  await db
    .from("staff_attendance")
    .delete()
    .eq("workspace_id", WORKSPACE_ID)
    .eq("date", TODAY)
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/app(\/.*)?$/)
}

const card = (page: Page) =>
  page.getByRole("region", { name: "Your attendance" })

test("a teacher checks in and out from the dashboard; the home card agrees", async ({
  page,
}, testInfo) => {
  test.skip(isSchoolOffToday(), "Seeded school is off on Fridays")
  await resetStaffRows()
  try {
    await signIn(page, "teacher@acadigma.test")
    await page.goto("/app/dashboard")
    await expect(card(page)).toBeVisible()
    await expectNoA11yViolations(page, testInfo)
    await testInfo.attach("staff-check-in-ready", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    })

    await card(page).getByRole("button", { name: "Check in" }).click()
    await expect(card(page).getByText(/^(Present|Late) · in at /)).toBeVisible()
    await expectNoA11yViolations(page, testInfo)
    await testInfo.attach("staff-check-in-checked-in", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    })

    // The state is the database's: it survives a reload, on the other screen too.
    await page.goto("/app/home")
    await expect(card(page).getByText(/^(Present|Late) · in at /)).toBeVisible()
    await expect(
      card(page).getByRole("button", { name: "Check in" })
    ).toHaveCount(0)

    await card(page).getByRole("button", { name: "Check out" }).click()
    await expect(card(page).getByText(/^Checked out at /)).toBeVisible()
    await expect(
      card(page).getByRole("button", { name: /Check (in|out)/ })
    ).toHaveCount(0)
    await testInfo.attach("staff-check-in-checked-out", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    })
  } finally {
    await resetStaffRows()
  }
})

test("on a non-school day the card says so and offers no check-in", async ({
  page,
}, testInfo) => {
  test.skip(!isSchoolOffToday(), "Only runs on the seeded school's Friday")
  await signIn(page, "teacher@acadigma.test")
  await page.goto("/app/dashboard")
  await expect(card(page).getByText("No school today")).toBeVisible()
  await expect(card(page).getByRole("button")).toHaveCount(0)
  await expectNoA11yViolations(page, testInfo)
  await testInfo.attach("staff-check-in-no-school", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  })
})
