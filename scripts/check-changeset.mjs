// A PR that changes apps/ or packages/ ships a changeset, so the release notes
// write themselves (D-14, RELEASES §3). Docs-, test- and CI-only PRs pass
// automatically; the `no-changeset` label is the reviewed escape hatch.
import { execFileSync } from "node:child_process"

const baseRef = process.env.BASE_REF ?? "origin/main"
const labels = (process.env.PR_LABELS ?? "")
  .split(",")
  .map((label) => label.trim())
  .filter(Boolean)

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim()
}

let mergeBase
try {
  mergeBase = git("merge-base", baseRef, "HEAD")
} catch {
  console.log(`Cannot resolve ${baseRef}; skipping the changeset check.`)
  process.exit(0)
}

const changed = git("diff", "--name-only", mergeBase, "HEAD")
  .split("\n")
  .filter(Boolean)

const touchesCode = changed.some(
  (file) =>
    (file.startsWith("apps/") || file.startsWith("packages/")) &&
    !file.includes(".test.") &&
    !file.startsWith("apps/web/e2e/")
)

if (!touchesCode) {
  console.log("No app or package changes; a changeset is not required.")
  process.exit(0)
}

const hasChangeset = changed.some(
  (file) =>
    file.startsWith(".changeset/") &&
    file.endsWith(".md") &&
    !file.endsWith("README.md")
)

if (hasChangeset) {
  console.log("Changeset present.")
  process.exit(0)
}

if (labels.includes("no-changeset")) {
  console.log(
    "::notice::`no-changeset` label present — reviewer, please confirm the reason is in the PR description."
  )
  process.exit(0)
}

console.error(
  "::error::This PR changes apps/ or packages/ but adds no changeset. Run `pnpm changeset`, or apply the `no-changeset` label and say why in the description."
)
process.exit(1)
