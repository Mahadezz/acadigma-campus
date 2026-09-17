// The mechanical half of "a docs change is part of every PR" (HANDBOOK §10,
// CI.md §2.11). This cannot verify that docs are *good* — it verifies they were not
// forgotten. Reviewers do the rest.
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const baseRef = process.env.BASE_REF ?? "origin/main"
const prBody = process.env.PR_BODY ?? ""

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim()
}

let mergeBase
try {
  mergeBase = git("merge-base", baseRef, "HEAD")
} catch {
  console.log(`Cannot resolve ${baseRef}; skipping the docs-sync check.`)
  process.exit(0)
}

const changed = git("diff", "--name-only", mergeBase, "HEAD")
  .split("\n")
  .filter(Boolean)
const added = git("diff", "--name-only", "--diff-filter=A", mergeBase, "HEAD")
  .split("\n")
  .filter(Boolean)

const failures = []
const applied = []

const touched = (prefix) => changed.some((file) => file.startsWith(prefix))
const changedDocs = changed.filter((file) => file.startsWith("docs/"))

// 1. A schema change is a data-model change.
if (touched("supabase/migrations/")) {
  applied.push("migrations → DATA-MODEL.md")
  if (!changed.includes("docs/architecture/DATA-MODEL.md")) {
    failures.push(
      "supabase/migrations/** changed but docs/architecture/DATA-MODEL.md did not."
    )
  }
}

// 2. A code change either documents itself or says, explicitly, why it need not.
if (touched("apps/") || touched("packages/")) {
  applied.push("code → docs/** or an explicit opt-out")
  const optOut = /^docs:\s*none\s*[—-]\s*\S/m.test(prBody)
  if (changedDocs.length === 0 && !optOut) {
    failures.push(
      "apps/** or packages/** changed with no docs/** change. Update the docs, or put a line `docs: none — <reason>` in the PR description."
    )
  }
}

// 3. A new doc that nothing links to is a doc nobody reads.
const newDocs = added.filter(
  (file) =>
    file.startsWith("docs/") &&
    file.endsWith(".md") &&
    file !== "docs/README.md"
)
if (newDocs.length > 0) {
  applied.push("new docs → listed in docs/README.md")
  let index = ""
  try {
    index = readFileSync("docs/README.md", "utf8")
  } catch {
    failures.push(
      "docs/README.md is missing, so new documents cannot be indexed."
    )
  }
  for (const doc of newDocs) {
    const relative = doc.replace(/^docs\//, "")
    if (index && !index.includes(relative)) {
      failures.push(`${doc} is new but is not listed in docs/README.md.`)
    }
  }
}

// 4. Decision numbers are identifiers, not suggestions.
if (changed.includes("docs/decisions/DECISION-LOG.md")) {
  applied.push("DECISION-LOG → no duplicate D-nn")
  const log = readFileSync("docs/decisions/DECISION-LOG.md", "utf8")
  const numbers = [...log.matchAll(/^##\s+(D-\d+)/gm)].map((match) => match[1])
  const seen = new Set()
  for (const number of numbers) {
    if (seen.has(number))
      failures.push(`${number} appears more than once in DECISION-LOG.md.`)
    seen.add(number)
  }
}

console.log(
  `Rules applied: ${applied.length > 0 ? applied.join("; ") : "none"}`
)

for (const failure of failures) {
  console.error(`::error::${failure}`)
}

process.exit(failures.length > 0 ? 1 : 0)
