// Playwright results as a Markdown table, including the flaky count — a test that
// only passes on retry blocks the merge until it is justified (TESTING §8).
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = fileURLToPath(new URL("..", import.meta.url))
const resultsFile = join(
  repoRoot,
  "apps",
  "web",
  "test-results",
  "results.json"
)

const lines = ["### e2e", ""]

try {
  const report = JSON.parse(await readFile(resultsFile, "utf8"))
  const counts = { passed: 0, failed: 0, flaky: 0, skipped: 0 }

  // Playwright reports an outcome, not a result: "expected" means it passed,
  // "unexpected" means it failed, and "flaky" means it failed and then passed on
  // retry — which is the one worth surfacing.
  const OUTCOME = {
    expected: "passed",
    unexpected: "failed",
    flaky: "flaky",
    skipped: "skipped",
  }

  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const key = OUTCOME[test.status]
        if (key) counts[key] += 1
      }
    }
    for (const child of suite.suites ?? []) visit(child)
  }
  for (const suite of report.suites ?? []) visit(suite)

  lines.push(
    "| Result | Count |",
    "| --- | ---: |",
    `| passed | ${counts.passed} |`,
    `| failed | ${counts.failed} |`,
    `| flaky | ${counts.flaky} |`,
    `| skipped | ${counts.skipped} |`
  )
  if (counts.flaky > 0) {
    lines.push(
      "",
      `> ${counts.flaky} test(s) passed only on retry. Investigate before merging.`
    )
  }
} catch {
  lines.push("_No Playwright JSON report was produced._")
}

console.log(lines.join("\n"))
