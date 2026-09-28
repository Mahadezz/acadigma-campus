import { expect, test, type Page } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"

import { expectNoA11yViolations } from "../axe"

/**
 * F-ID-11 Part 1 (D-308) `offline-read-cache`, at both viewports with axe:
 * pages opened online reload offline with a "Last updated" stamp, a page never
 * opened shows "This needs internet the first time", a generate button reads
 * "Needs internet", and sign-out leaves no `acadigma-data-*` cache behind
 * (Cache Storage read directly).
 *
 * The service worker only exists in a production build (`next start`, which is
 * what this config runs). Needs a seeded school owner, so it carries the same
 * skip guard as the other live journeys (OQ-27).
 */
test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "needs a seeded school owner account (OQ-27)"
)

test.beforeEach(() => {
  test.skip(
    !process.env.E2E_OWNER_EMAIL || !process.env.E2E_OWNER_PASSWORD,
    "E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD are not set"
  )
})

/** `supabase/seed/seed.sql`: the seeded school and its teacher. */
const SEED_SCHOOL = "5eed0000-0000-4000-b000-000000000001"
const SEED_TEACHER = "5eed0000-0000-4000-a000-000000000002"

const dataCaches = (page: Page) =>
  page.evaluate(async () =>
    (await caches.keys()).filter((name) => name.startsWith("acadigma-data-"))
  )

const cachedUrls = (page: Page) =>
  page.evaluate(async () => {
    if (!(await caches.has("acadigma-data-pages"))) return []
    const cache = await caches.open("acadigma-data-pages")
    return (await cache.keys()).map((r) => new URL(r.url).pathname)
  })

test("opened pages read offline, generate buttons need internet, workspace switch and sign-out wipe the cache", async ({
  page,
  context,
}, testInfo) => {
  await page.goto("/login")
  await page.getByLabel("Email").fill(process.env.E2E_OWNER_EMAIL ?? "")
  await page.getByLabel("Password").fill(process.env.E2E_OWNER_PASSWORD ?? "")
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.waitForURL((url) => !url.pathname.startsWith("/login"))

  // The worker controls the page once it has activated (clientsClaim).
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null)
  // The first check after sign-in wipes the cache (no snapshot yet, D-308);
  // let it finish before opening pages, or it takes the first one with it.
  await page.waitForFunction(
    () => localStorage.getItem("acadigma-offline-snapshot") !== null
  )

  // Open two pages online: a full load each, so the worker caches them.
  await page.goto("/app/reports")
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible()
  await page.goto("/app/classes")
  await expect(page.getByRole("heading", { name: "Classes" })).toBeVisible()
  // The worker stores each page as it is served.
  await expect
    .poll(async () => (await cachedUrls(page)).sort(), { timeout: 15_000 })
    .toEqual(expect.arrayContaining(["/app/classes", "/app/reports"]))

  await context.setOffline(true)

  // AC1: the roster page reloads from the cache, stamped.
  await page.reload()
  await expect(page.getByRole("heading", { name: "Classes" })).toBeVisible()
  await expect(page.getByTestId("last-updated")).toHaveText(
    /^Last updated \d{2}:\d{2} today$/
  )
  await expect(
    page.getByRole("status").filter({ hasText: "offline" })
  ).toBeVisible()
  await expectNoA11yViolations(page, testInfo)

  // AC10: the generate button reads "Needs internet", disabled.
  await page.goto("/app/reports")
  const needsInternet = page.getByRole("button", { name: "Needs internet" })
  await expect(needsInternet).toBeVisible()
  await expect(needsInternet).toBeDisabled()
  await expect(page.getByRole("button", { name: /generate/i })).toHaveCount(0)
  await expectNoA11yViolations(page, testInfo)

  // AC1: a page never opened says it needs internet the first time.
  await page.goto("/app/exams")
  await expect(
    page.getByText(/This needs internet the first time/)
  ).toBeVisible()
  await expect(page.getByRole("button", { name: /Retry/ })).toBeVisible()
  await expectNoA11yViolations(page, testInfo)

  // §5.8: a workspace switch leaves none of the old workspace's pages.
  await context.setOffline(false)
  await page.goto("/app/classes")
  await expect
    .poll(() => cachedUrls(page))
    .toEqual(expect.arrayContaining(["/app/classes"]))
  await page.getByRole("button", { name: /switch workspace/i }).click()
  await page
    .getByRole("dialog", { name: "Switch workspace" })
    .getByRole("button", { name: /Personal/ })
    .click()
  await expect(page).toHaveURL("/personal")
  await expect
    .poll(async () =>
      (await cachedUrls(page)).filter((p) => p.startsWith("/app"))
    )
    .toEqual([])
  await page.getByRole("button", { name: /switch workspace/i }).click()
  await page
    .getByRole("dialog", { name: "Switch workspace" })
    .getByRole("button", { name: /Model School/ })
    .click()
  await page.waitForURL(/\/app/)

  // AC8: sign out (online) → no acadigma-data-* cache is left.
  await page.goto("/app/classes")
  await page.getByRole("button", { name: "Account menu" }).click()
  await page.getByRole("menuitem", { name: "Log out" }).click()
  await page.waitForURL(/\/login/)
  await expect.poll(() => dataCaches(page)).toEqual([])

  // …so offline, the roster is gone too.
  await context.setOffline(true)
  await page.goto("/app/classes")
  await expect(
    page.getByText(/This needs internet the first time/)
  ).toBeVisible()
  await context.setOffline(false)
})

/**
 * §4.8 / AC-9 (security review): a teacher removed from the school keeps no
 * school page cached — the next open, online, finds the membership gone and
 * wipes.
 * Removes and restores the seeded teacher with the local service-role key,
 * so it runs on one viewport only (the two would race on the same row).
 */
test("a removed member's next open leaves no school page cached", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "mutates a shared seeded row")
  test.skip(
    !process.env.SUPABASE_SERVICE_ROLE_KEY,
    "SUPABASE_SERVICE_ROLE_KEY is not set (local stack only)"
  )
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false } }
  )
  const setStatus = async (status: "active" | "removed") => {
    const { error } = await admin
      .from("workspace_members")
      .update({ status })
      .eq("workspace_id", SEED_SCHOOL)
      .eq("user_id", SEED_TEACHER)
    expect(error).toBeNull()
  }

  await page.goto("/login")
  await page.getByLabel("Email").fill("teacher@acadigma.test")
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.waitForURL(/\/app/)
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null)
  // The first check after sign-in wipes the cache (no snapshot yet, D-308);
  // let it finish before opening pages, or it takes the first one with it.
  await page.waitForFunction(
    () => localStorage.getItem("acadigma-offline-snapshot") !== null
  )
  await page.goto("/app/classes")
  await expect
    .poll(async () => (await cachedUrls(page)).length, { timeout: 15_000 })
    .toBeGreaterThan(0)

  try {
    await setStatus("removed")
    await page.reload()
    // She lands in her own personal workspace, whose page may be cached
    // afresh; nothing from the school may remain.
    await expect
      .poll(
        async () =>
          (await cachedUrls(page)).filter((p) => p.startsWith("/app")),
        { timeout: 15_000 }
      )
      .toEqual([])
  } finally {
    await setStatus("active")
  }
})
