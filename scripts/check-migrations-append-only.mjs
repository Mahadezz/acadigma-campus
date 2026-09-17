// Migrations are forward-only (ARCHITECTURE §4, RELEASES §7.2). Editing a file that
// has already been applied leaves production and the repository describing different
// schemas, and nothing later will notice. So: against the merge base, a migration may
// be added, never modified or deleted. CI.md §2.3 step 2.
import { execFileSync } from "node:child_process"

const baseRef = process.argv[2] ?? "origin/main"

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim()
}

let mergeBase
try {
  mergeBase = git("merge-base", baseRef, "HEAD")
} catch {
  console.log(`Cannot resolve ${baseRef}; skipping the append-only check.`)
  process.exit(0)
}

// --diff-filter=MD: modified or deleted. Added files are exactly what we want.
const changed = git(
  "diff",
  "--name-only",
  "--diff-filter=MD",
  mergeBase,
  "HEAD",
  "--",
  "supabase/migrations"
)
  .split("\n")
  .filter(Boolean)

if (changed.length > 0) {
  for (const file of changed) {
    console.error(
      `::error file=${file}::this migration already exists on ${baseRef} — migrations are forward-only, add a new one instead`
    )
  }
  process.exit(1)
}

console.log("Migrations are append-only.")
