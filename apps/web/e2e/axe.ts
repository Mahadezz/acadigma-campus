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
