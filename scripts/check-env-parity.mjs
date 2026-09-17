// Every `process.env.X` in the tree must exist in .env.example, and every key in
// .env.example must be read somewhere. A variable that only lives in one person's
// .env.local breaks every other checkout silently; this is the check that stops it.
// CI.md §2.1.
import { readFile, readdir } from "node:fs/promises"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = fileURLToPath(new URL("..", import.meta.url))

const SCAN_DIRS = ["apps", "packages", "scripts", "supabase/functions"]
const SCAN_EXTENSIONS = [".ts", ".tsx", ".mjs", ".js"]
const IGNORED_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "coverage",
  "playwright-report",
  "test-results",
])

/**
 * Variables the platform provides. They are read but never declared by us, so
 * requiring them in .env.example would be a lie.
 */
const PROVIDED_BY_PLATFORM = new Set([
  "NODE_ENV",
  "CI",
  "LOG_LEVEL",
  "PORT",
  "VERCEL_ENV",
  "VERCEL_GIT_COMMIT_SHA",
  "NEXT_PUBLIC_VERCEL_ENV",
  "NEXT_PUBLIC_SENTRY_DSN",
  "SUPABASE_URL",
  "SUPABASE_PROJECT_ID",
  "PLAYWRIGHT_PORT",
  "PLAYWRIGHT_BASE_URL",
  // Handed to the CI scripts by the workflow, not by a .env file.
  "BASE_REF",
  "PR_BODY",
  "PR_LABELS",
])

/** This file's own comments mention `process.env.X`; do not scan itself. */
const SELF = "scripts/check-env-parity.mjs"

async function* walk(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return // An optional directory that does not exist yet is not a failure.
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) yield* walk(path)
    } else if (SCAN_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      yield path
    }
  }
}

function parseExample(text) {
  const keys = new Set()
  for (const line of text.split("\n")) {
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line.trim())
    if (match?.[1]) keys.add(match[1])
  }
  return keys
}

const declared = parseExample(
  await readFile(join(repoRoot, ".env.example"), "utf8")
)

/** Where each referenced variable was first seen, for a useful error message. */
const referenced = new Map()
const ENV_PATTERN =
  /(?:process|Deno)\.env(?:\.get\(["']([A-Z0-9_]+)["']\)|\.([A-Z0-9_]+)|\[["']([A-Z0-9_]+)["']\])/g

for (const dir of SCAN_DIRS) {
  for await (const file of walk(join(repoRoot, dir))) {
    if (relative(repoRoot, file).replaceAll("\\", "/") === SELF) continue
    const source = await readFile(file, "utf8")
    for (const match of source.matchAll(ENV_PATTERN)) {
      const name = match[1] ?? match[2] ?? match[3]
      if (name && !referenced.has(name)) {
        referenced.set(name, relative(repoRoot, file).replaceAll("\\", "/"))
      }
    }
  }
}

const missing = [...referenced]
  .filter(([name]) => !declared.has(name) && !PROVIDED_BY_PLATFORM.has(name))
  .sort(([a], [b]) => a.localeCompare(b))

const unused = [...declared].filter((name) => !referenced.has(name)).sort()

// A variable read but not declared is the breakage this check exists to prevent:
// the next person's checkout will not have it.
for (const [name, file] of missing) {
  console.error(
    `::error file=${file}::${name} is read here but missing from .env.example`
  )
}

// A variable declared but not yet read is usually a key reserved for a feature that
// has not landed. Worth seeing, not worth blocking a merge over.
for (const name of unused) {
  console.log(
    `::warning file=.env.example::${name} is declared but nothing reads it yet`
  )
}

if (missing.length > 0) {
  console.error(`\n.env.example parity failed: ${missing.length} undeclared.`)
  process.exit(1)
}

console.log(
  `.env.example parity OK — ${declared.size} declared, ${unused.length} not yet read.`
)
