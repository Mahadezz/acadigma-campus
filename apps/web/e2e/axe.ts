import AxeBuilder from "@axe-core/playwright"
import { expect, type Page, type TestInfo } from "@playwright/test"

/**
 * WCAG 2.1 A and AA, which is the bar ARCHITECTURE §6 sets: 44px targets, focus
 * rings, landmarks, live regions and 4.5:1 contrast.
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]

/**
 * Runs axe over the current page and fails the test on any violation, attaching the
 * full report so a CI failure is diagnosable without reproducing it locally.
 *
 * ```ts
 * await expectNoA11yViolations(page, testInfo)
 * ```
 */
export async function expectNoA11yViolations(
  page: Page,
  testInfo: TestInfo,
  /** CSS selectors to exclude, e.g. a third-party widget we do not control. */
  exclude: string[] = []
): Promise<void> {
  // Scan the settled screen, not a frame mid fade-in: axe measured a badge
  // and a button part-way through their enter transitions as 1.57:1 and
  // 2.74:1 (e2e-live, D-76). Finite animations only — a spinner never ends —
  // and time-based only: a scroll-driven one (the front door's header, D-411)
  // finishes only when the page is scrolled.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(
          (a) =>
            a.timeline === document.timeline &&
            a.effect?.getComputedTiming().endTime !== Infinity
        )
        .map((a) => a.finished.catch(() => undefined))
    )
  )

  // Next 15 streams page metadata: right after a client-side navigation the
  // new <title> can land a moment after the content, and axe scanning in
  // that gap reported document-title (e2e-live, D-76). Give it a moment; a
  // page that really has no title still fails below.
  await page
    .waitForFunction(() => document.title.trim() !== "", null, {
      timeout: 5_000,
    })
    .catch(() => undefined)

  let builder = new AxeBuilder({ page }).withTags(TAGS)
  for (const selector of exclude) {
    builder = builder.exclude(selector)
  }

  const results = await builder.analyze()

  await testInfo.attach("axe-results.json", {
    body: JSON.stringify(results.violations, null, 2),
    contentType: "application/json",
  })

  expect(
    results.violations,
    results.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join("\n")
  ).toEqual([])
}
