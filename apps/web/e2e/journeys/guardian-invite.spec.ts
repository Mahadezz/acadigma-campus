import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

/**
 * F-AC-02 §10 "guardian-invite-accept-see-only-own-children" (Part 4 demo
 * cut, D-108) — the demo's last step, at both viewports, with axe:
 *
 *   owner publishes an exam → invites a student's guardian (copyable link)
 *   → the parent opens the link signed out, signs in, sees which child it is
 *   for and accepts → /family lists that child and the published result →
 *   the owner removes the access → the child is gone from /family.
 *
 * Needs a seeded, verified school owner (grade scale, a subject, Class 6 – ক
 * from supabase/seed/demo-class-6-ka.sql) and a second verified account
 * that is not a member of the school, so it carries the live skip guard
 * (OQ-27). Each viewport uses its own student (roll 1 / roll 2) and ends by
 * revoking, so the journey can run again.
 */
test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "needs seeded owner and parent accounts (OQ-27)"
)

test.beforeEach(() => {
  test.skip(
    !process.env.E2E_OWNER_EMAIL ||
      !process.env.E2E_OWNER_PASSWORD ||
      !process.env.E2E_PARENT_EMAIL ||
      !process.env.E2E_PARENT_PASSWORD,
    "E2E_OWNER_* / E2E_PARENT_* are not set"
  )
})

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
}

async function publishAnExam(page: Page, name: string) {
  await page.goto("/app/exams")
  await page.getByRole("button", { name: "New exam" }).click()
  await page.getByLabel("Exam name").fill(name)
  await page
    .getByRole("group", { name: "Subjects" })
    .getByRole("checkbox")
    .first()
    .check()
  await page.getByRole("button", { name: "Create exam" }).click()
  await expect(page).toHaveURL(/\/app\/exams\/[0-9a-f-]{36}$/)
  for (const step of ["Schedule", "Start exam", "Open marks entry"]) {
    await page.getByRole("button", { name: step }).click()
    await expect(page.getByRole("button", { name: step })).toHaveCount(0)
  }
  await page
    .getByRole("link", { name: /^Enter marks — / })
    .first()
    .click()
  await expect(page).toHaveURL(/\/app\/marks\/[0-9a-f-]{36}$/)
  await page.waitForLoadState("networkidle") // typed marks need a hydrated page
  const inputs = page.getByRole("textbox")
  const count = await inputs.count()
  await inputs.first().click()
  for (let i = 0; i < count; i += 1) {
    await page.keyboard.type(String(60 + (i % 40)))
    await page.keyboard.press("Enter")
  }
  await expect(page.getByText(`${count}/${count}`)).toBeVisible()
  await page.getByRole("button", { name: "Save" }).click()
  await expect(page.getByText("Saved.")).toBeVisible()
  await page.getByRole("link", { name: "Back to the exam" }).click()
  await page.getByRole("button", { name: "Lock marks" }).click()
  await page.getByRole("button", { name: "Compute results" }).click()
  await expect(page.getByText(/Results computed: \d+ students/)).toBeVisible()
  await page.getByRole("button", { name: "Publish", exact: true }).click()
  await page
    .getByRole("dialog", { name: "Publish results" })
    .getByRole("button", { name: `Publish ${count} · withhold 0` })
    .click()
  await expect(page.getByText("Published", { exact: true })).toBeVisible()
}

test("admin invites a guardian, the parent accepts and sees the published result", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(240_000)
  const examName = `Guardian ${testInfo.project.name} ${Date.now()}`
  const code = `STU-2026-0000${testInfo.project.name === "phone" ? 1 : 2}`

  // --- Owner: publish, then invite the student's guardian ---------------
  await page.goto("/login")
  await signIn(
    page,
    process.env.E2E_OWNER_EMAIL ?? "",
    process.env.E2E_OWNER_PASSWORD ?? ""
  )
  await expect(page).toHaveURL(/\/app(\/.*)?$/)
  await publishAnExam(page, examName)

  await page.goto(`/app/students?q=${code}`)
  // The search leaves one row: its name links to the profile.
  await page
    .locator('main a[href^="/app/students/"]:not([href$="/import"]):visible')
    .first()
    .click()
  await expect(page).toHaveURL(/\/app\/students\/[0-9a-f-]{36}$/)
  const profileUrl = page.url()
  const studentName =
    (await page
      .getByRole("main")
      .getByRole("heading", { level: 1 })
      .textContent()) ?? ""

  await page
    .getByRole("button", { name: /^Invite .+ to the parent app$/ })
    .click()
  const linkBox = page.getByRole("textbox", { name: "Invitation link" })
  await expect(linkBox).toHaveValue(/\/invite#[0-9a-f]{64}$/)
  await expect(
    page.getByRole("link", { name: "Send on WhatsApp" })
  ).toHaveAttribute("href", /^https:\/\/wa\.me\/8801\d{9}\?text=/)
  await expectNoA11yViolations(page, testInfo)
  await page.screenshot({
    path: testInfo.outputPath(`invite-link-${testInfo.project.name}.png`),
  })
  const inviteUrl = await linkBox.inputValue()

  // --- Parent: open the link signed out, sign in, accept ---------------
  const parentContext = await browser.newContext({
    viewport: page.viewportSize(),
  })
  const parent = await parentContext.newPage()
  await parent.goto(inviteUrl)
  await expect(parent).toHaveURL(/\/invite$/) // the token left the address bar
  await parent.getByRole("link", { name: "Sign in" }).click()
  await signIn(
    parent,
    process.env.E2E_PARENT_EMAIL ?? "",
    process.env.E2E_PARENT_PASSWORD ?? ""
  )
  await expect(parent).toHaveURL(/\/invite$/)
  await expect(
    parent.getByText(new RegExp(`E2E Demo School|${studentName}`)).first()
  ).toBeVisible()
  await expectNoA11yViolations(parent, testInfo)
  await parent.getByRole("button", { name: "Accept" }).click()

  await expect(parent).toHaveURL(/\/family$/)
  await expect(
    parent.getByRole("heading", { name: "Your children" })
  ).toBeVisible()
  await expect(parent.getByText(studentName).first()).toBeVisible()
  await expect(parent.getByText(new RegExp(examName)).first()).toBeVisible()
  await expectNoA11yViolations(parent, testInfo)
  await parent.screenshot({
    path: testInfo.outputPath(`family-${testInfo.project.name}.png`),
    fullPage: true,
  })

  // --- Owner removes the access; the child leaves /family ----------------
  await page.goto(profileUrl)
  await page.getByRole("button", { name: "Remove access" }).first().click()
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove access" })
    .click()
  await expect(
    page.getByRole("button", { name: /^Invite .+ to the parent app$/ }).first()
  ).toBeVisible()

  await parent.reload()
  await expect(parent.getByText(new RegExp(examName))).toHaveCount(0)
  await parentContext.close()
})
