// Migrations must sort after every migration already on main (LANES.md "Migration
// order at merge time"). `supabase db push` refuses a migration dated before the
// newest one already applied, and lanes merge in whatever order they finish — a PR
// written against one main can fall behind by the time it merges. This checks it
// mechanically, the same way check-migrations-append-only.mjs checks forward-only.
//
// Migration timestamps are the real UTC time the file was written
// (`date -u +%Y%m%d%H%M%S`, LANES.md) — there is no per-lane digit or sequence
// number to reason about here; lane digits apply only to decision numbers and
// pgTAP file ranges.
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

function utcTimestamp(date) {
  const pad = (n) => String(n).padStart(2, "0")
  return (
    String(date.getUTCFullYear()) +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds())
  )
}

// The simplest correct suggestion: the current UTC time, since that's what a
// re-dated migration should carry anyway. Only if "now" has somehow not caught
// up with main's newest yet (clock skew, or another lane merged a
// later-than-now timestamp) does it fall back to one second past main's newest.
export function suggestTimestamp(newestMainTs, now = new Date()) {
  const nowTs = utcTimestamp(now)
  return nowTs > newestMainTs
    ? nowTs
    : (BigInt(newestMainTs) + 1n).toString().padStart(14, "0")
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
      const suggestion = suggestTimestamp(newestMainTs)
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
  const now = new Date("2026-09-25T12:00:00Z")
  const nowTs = "20260925120000"

  // Ordinary case: main's newest is in the past relative to now -> suggest now.
  const ordinary = suggestTimestamp("20260924000000", now)
  console.assert(ordinary === nowTs, `expected now (${nowTs}), got ${ordinary}`)

  // Edge case: main's newest is later than "now" (clock skew, or another lane
  // just merged a later real-time timestamp) -> bump main's newest by one second.
  const skewed = suggestTimestamp("20260925120005", now)
  console.assert(
    skewed === "20260925120006",
    `expected one second past main's newest, got ${skewed}`
  )

  console.assert(
    /^\d{14}$/.test(ordinary) && /^\d{14}$/.test(skewed),
    "suggestions must be 14-digit strings"
  )

  console.log("selfCheck: ok")
}

if (process.argv.includes("--self-check")) {
  selfCheck()
} else {
  main()
}
