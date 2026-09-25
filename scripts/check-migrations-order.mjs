// Migrations must sort after every migration already on main (LANES.md "Migration
// order at merge time"). `supabase db push` refuses a migration dated before the
// newest one already applied, and lanes merge in whatever order they finish — a PR
// written against one main can fall behind by the time it merges. This checks it
// mechanically, the same way check-migrations-append-only.mjs checks forward-only.
import { execFileSync } from "node:child_process"
import { basename } from "node:path"

const TIMESTAMP_RE = /^(\d{14})_/

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim()
}

function timestampOf(filename) {
  const match = TIMESTAMP_RE.exec(basename(filename))
  return match ? match[1] : null
}

// The suggested name keeps the offending file's lane digit (LANES.md: position 9,
// `YYYYMMDD<lane digit>NNN00`) where that still sorts after main's newest; otherwise
// it falls back to main's newest timestamp plus one sequence step, whole cloth.
// Returns null when main's sequence (NNN) is already at 999 for that day/lane: adding
// one more step carries into the lane-digit (or date) position, which would either
// silently hand out a filename in ANOTHER lane's range or roll onto a different day —
// neither is a safe thing to suggest automatically.
export function suggestTimestamp(newestMainTs, offendingTs) {
  const bumped = (BigInt(newestMainTs) + 100n).toString().padStart(14, "0")
  if (bumped.slice(0, 9) !== newestMainTs.slice(0, 9)) {
    return null
  }
  const laneDigit = offendingTs[8]
  const withLaneDigit = bumped.slice(0, 8) + laneDigit + bumped.slice(9)
  return withLaneDigit > newestMainTs ? withLaneDigit : bumped
}

function main() {
  const baseRef = process.argv[2] ?? "origin/main"

  let mergeBase
  try {
    mergeBase = git("merge-base", baseRef, "HEAD")
  } catch {
    console.log(
      `Cannot resolve ${baseRef}; skipping the migration-order check.`
    )
    return
  }

  const addedFiles = git(
    "diff",
    "--name-only",
    "--diff-filter=A",
    mergeBase,
    "HEAD",
    "--",
    "supabase/migrations"
  )
    .split("\n")
    .filter((f) => f.endsWith(".sql"))

  if (addedFiles.length === 0) {
    console.log("No new migrations in this PR.")
    return
  }

  const mainMigrations = git(
    "ls-tree",
    "-r",
    "--name-only",
    baseRef,
    "--",
    "supabase/migrations"
  )
    .split("\n")
    .filter((f) => f.endsWith(".sql"))

  const newestMainTs = mainMigrations
    .map(timestampOf)
    .filter(Boolean)
    .sort()
    .at(-1)

  if (!newestMainTs) {
    console.log(
      `No migrations on ${baseRef} yet; skipping the migration-order check.`
    )
    return
  }

  let failed = false
  for (const file of addedFiles) {
    const ts = timestampOf(file)
    if (!ts) continue // not this script's job — append-only check catches malformed names elsewhere
    if (ts <= newestMainTs) {
      const suggestion = suggestTimestamp(newestMainTs, ts)
      if (suggestion === null) {
        console.error(
          `::error file=${file}::this migration (${ts}) sorts at or before the newest migration on ${baseRef} (${newestMainTs}), and that day's sequence number is already at capacity (999) — rename it with a new day's date prefix (today's date or later) instead of bumping the sequence, since bumping past 999 would land on another lane's digit`
        )
        failed = true
        continue
      }
      const suggestedName = basename(file).replace(ts, suggestion)
      console.error(
        `::error file=${file}::this migration (${ts}) sorts at or before the newest migration on ${baseRef} (${newestMainTs}) — rename with 'git mv ${file} supabase/migrations/${suggestedName}' and update any references`
      )
      failed = true
    }
  }

  if (failed) process.exit(1)
  console.log(
    `All new migrations sort after ${baseRef}'s newest (${newestMainTs}).`
  )
}

function selfCheck() {
  const cases = [
    ["20260925000500", "20260924000100"], // ordinary stale timestamp
    ["20260925000599", "20260925000600"], // adjacent, different lane digit position value
  ]
  for (const [newestMainTs, offendingTs] of cases) {
    const suggestion = suggestTimestamp(newestMainTs, offendingTs)
    console.assert(
      suggestion !== null && suggestion.length === 14,
      `suggestion must be a 14-digit string: ${suggestion}`
    )
    console.assert(
      suggestion > newestMainTs,
      `suggestion ${suggestion} must sort after main's newest ${newestMainTs}`
    )
  }

  // NNN at capacity (999): bumping would carry into the lane digit — must refuse
  // rather than hand out a filename in another lane's range.
  const overflow = suggestTimestamp("20260925099900", "20260925099900")
  console.assert(
    overflow === null,
    `an NNN=999 newest timestamp must return null, got: ${overflow}`
  )

  console.log("selfCheck: ok")
}

if (process.argv.includes("--self-check")) {
  selfCheck()
} else {
  main()
}
