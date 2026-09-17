// Turns Vitest's coverage summary into a Markdown table for $GITHUB_STEP_SUMMARY.
// Writes to stdout so the caller decides where it lands. CI.md §2.4.
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = fileURLToPath(new URL("..", import.meta.url))
const summaryFile = join(repoRoot, "coverage", "coverage-summary.json")

const lines = ["### unit — coverage", ""]

try {
  const { total } = JSON.parse(await readFile(summaryFile, "utf8"))
  lines.push("| Metric | Covered | Total | % |", "| --- | ---: | ---: | ---: |")
  for (const key of ["lines", "statements", "functions", "branches"]) {
    const metric = total[key]
    lines.push(
      `| ${key} | ${metric.covered} | ${metric.total} | ${metric.pct}% |`
    )
  }
} catch {
  lines.push("_No coverage summary was produced._")
}

console.log(lines.join("\n"))
