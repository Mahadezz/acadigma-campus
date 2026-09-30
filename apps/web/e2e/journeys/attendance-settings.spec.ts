import { expect, test, type Page } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"

import { expectNoA11yViolations } from "../axe"
import { isSchoolOffToday } from "../school-day"

test.skip(
  !process.env.E2E_LIVE_SUPABASE || !process.env.SUPABASE_SERVICE_ROLE_KEY,
  "live Supabase journey: needs E2E_LIVE_SUPABASE=1 and the service-role key to restore shared seed state"
)

// The seeded Model School (supabase/seed/seed.sql). Marking a register mutates it,
// so this journey wipes today's registers before and after (single worker per shard,
// one database per shard) and puts the seeded attendance policy back.
const WORKSPACE_ID = "5eed0000-0000-4000-b000-000000000001"
const SEEDED_POLICY = {
  cutoff: "09:15",
  late_counts_present: true,
  half_day_counts_present: true,
  min_attendance_bp: 7500,
}
const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Dhaka",
}).format(new Date())

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false } }
  )

async function resetSharedState(): Promise<void> {
  const db = admin()
  // Records cascade from their session.
  await db
    .from("attendance_sessions")
    .delete()
    .eq("workspace_id", WORKSPACE_ID)
    .eq("date", TODAY)
  await db
    .from("school_profiles")
    .update({ attendance_policy: SEEDED_POLICY })
    .eq("workspace_id", WORKSPACE_ID)
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/app(\/.*)?$/)
}

/**
 * F-OP-07 Part 3 demo (§4 W4): with one absence on the register, the owner
 * changes the policy and sees the live effect line and the below-minimum
 * warning before saving; saving persists across a reload. Roll-call steps
 * follow take-attendance.spec.ts. Both viewports via the phone/desktop projects.
 */
test("owner edits the attendance policy and sees the effect line and warning before saving", async ({
  page,
}, testInfo) => {
  test.skip(isSchoolOffToday(), "Seeded school is off on Fridays")
  testInfo.setTimeout(testInfo.timeout + 30_000)
  await resetSharedState()
  try {
    await signIn(page, "owner@acadigma.test")

    // Real roll call: everyone present, one absent.
    await page.goto("/app/attendance")
    await page
      .getByRole("link", { name: /^(Take attendance|View) — / })
      .first()
      .click()
    await page.getByRole("button", { name: "Mark all present" }).click()
    await page
      .getByRole("radiogroup")
      .first()
      .getByRole("radio", { name: "Absent" })
      .click()
    await page.getByRole("button", { name: "Save" }).click()
    // Full mode saves directly; the confirm sheet is basic-mode only.
    await expect(
      page.getByText(/^Saved: \d+ present, \d+ absent\.$/)
    ).toBeVisible()

    await page.goto("/app/settings/attendance")
    await expect(
      page.getByRole("heading", { name: "Attendance policy" })
    ).toBeVisible()
    await expect(page.getByTestId("attendance-effect")).toBeVisible()

    const halfDay = page.getByLabel("Half day counts as present")
    const halfBefore = await halfDay.isChecked()
    await halfDay.click()
    await expect(page.getByText("You have unsaved changes")).toBeVisible()

    const min = page.getByLabel("Minimum attendance")
    await min.fill("abc")
    await expect(min).toHaveAttribute("aria-invalid", "true")
    await expect(page.getByRole("button", { name: "Save" })).toBeDisabled()
    await min.fill("100")
    await expect(min).toHaveAttribute("aria-invalid", "false")
    // One absence: the sampled student cannot reach 100 %.
    await expect(page.getByText(/Below the 100 % minimum/)).toBeVisible()
    await expectNoA11yViolations(page, testInfo)

    await page.getByRole("button", { name: "Save" }).click()
    await expect(page.getByText("Saved.")).toBeVisible()

    await page.reload()
    expect(
      await page.getByLabel("Half day counts as present").isChecked()
    ).toBe(!halfBefore)
    await expect(page.getByLabel("Minimum attendance")).toHaveValue("100")
    await expectNoA11yViolations(page, testInfo)
  } finally {
    await resetSharedState()
  }
})

test("a teacher cannot open the attendance policy", async ({ page }) => {
  await signIn(page, "teacher@acadigma.test")
  // D-409: a loading.tsx above the page streams a 200 before forbidden() runs, so
  // the contract is the 403 *page* (no data), not the status line.
  await page.goto("/app/settings/attendance")
  await expect(page.getByText("You do not have access")).toBeVisible()
})
