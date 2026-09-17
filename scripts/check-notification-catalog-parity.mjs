// F-ID-07 §5.1, §9.7-§9.8: an event that is not in the catalogue must never ship,
// and every catalogue entry must have translated strings a recipient can actually
// read. This script checks both halves without needing to execute any TypeScript:
// it reads `packages/domain/src/notifications/catalog.ts` as text (the same
// approach `check-permission-parity.mjs` uses for the permissions matrix) rather
// than importing it, so it needs no build step.
//
//   1. Every event id passed to a `notify(...)` call anywhere in the app must exist
//      in the catalogue. (Nothing calls `notify()` yet in this session's slice of
//      F-ID-07 Part 1 — `app.notify` and its callers are separate work — so today
//      this half simply finds zero usages and passes; it is here so the first PR
//      that adds a caller is checked automatically, per the task's brief.)
//   2. Every catalogue event id has both an English and a Bangla title+body under
//      `notifications.events.<dot.path>` in `apps/web/messages/{en,bn}.json`.
import { readFile, readdir } from "node:fs/promises"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = fileURLToPath(new URL("..", import.meta.url))
const CATALOG_FILE = join(
  repoRoot,
  "packages",
  "domain",
  "src",
  "notifications",
  "catalog.ts"
)
const MESSAGE_FILES = [
  join(repoRoot, "apps", "web", "messages", "en.json"),
  join(repoRoot, "apps", "web", "messages", "bn.json"),
]

const SCAN_DIRS = ["apps", "packages"]
const IGNORED_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "coverage",
])
const EVENT_ID_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/

// ---------------------------------------------------------------------------
// 1. Read the catalogue's declared event ids straight from source.
// ---------------------------------------------------------------------------
const catalogSource = await readFile(CATALOG_FILE, "utf8")
const declared = [
  ...catalogSource.matchAll(/entry\(\s*"([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)"/g),
].map((m) => m[1])

if (declared.length === 0) {
  console.error(
    `::error file=${relative(repoRoot, CATALOG_FILE)}::Could not find any entry("event.id", ...) declarations — is the catalogue file shape unchanged?`
  )
  process.exit(1)
}

const declaredSet = new Set(declared)
if (declaredSet.size !== declared.length) {
  console.error(
    "::error::The notification catalogue declares the same event id more than once."
  )
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 2. Every event id passed to notify(...) anywhere in the app must be declared.
// ---------------------------------------------------------------------------
async function* walk(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const dirent of entries) {
    const path = join(dir, dirent.name)
    if (dirent.isDirectory()) {
      if (!IGNORED_DIRS.has(dirent.name)) yield* walk(path)
    } else if (
      /\.tsx?$/.test(dirent.name) &&
      !dirent.name.endsWith(".test.ts")
    ) {
      yield path
    }
  }
}

// Matches notify("attendance.low", ...) and notify({ event: "attendance.low", ...
const NOTIFY_CALL_PATTERN = /\bnotify\(([^)]*)\)/gs
const EVENT_LITERAL_PATTERN = /["'`]([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)["'`]/g

const usedElsewhere = new Map() // event id -> first file it was found in
for (const dir of SCAN_DIRS) {
  for await (const file of walk(join(repoRoot, dir))) {
    if (file === CATALOG_FILE) continue
    const source = await readFile(file, "utf8")
    for (const call of source.matchAll(NOTIFY_CALL_PATTERN)) {
      for (const literal of call[1].matchAll(EVENT_LITERAL_PATTERN)) {
        const event = literal[1]
        if (!usedElsewhere.has(event)) {
          usedElsewhere.set(
            event,
            relative(repoRoot, file).replaceAll("\\", "/")
          )
        }
      }
    }
  }
}

const undeclaredUses = [...usedElsewhere].filter(
  ([event]) => !declaredSet.has(event)
)
for (const [event, file] of undeclaredUses) {
  console.error(
    `::error file=${file}::notify() is called with "${event}", which is not in the notification event catalogue (F-ID-07 §5.1)`
  )
}

// ---------------------------------------------------------------------------
// 3. Every declared event has en + bn title/body strings.
// ---------------------------------------------------------------------------
function readAtPath(root, segments) {
  let node = root
  for (const segment of segments) {
    if (node === null || typeof node !== "object" || !(segment in node)) {
      return undefined
    }
    node = node[segment]
  }
  return node
}

const messageTrees = await Promise.all(
  MESSAGE_FILES.map(async (file) => ({
    file,
    tree: JSON.parse(await readFile(file, "utf8")),
  }))
)

const missingStrings = []
for (const event of declaredSet) {
  if (!EVENT_ID_PATTERN.test(event)) {
    console.error(
      `::error file=${relative(repoRoot, CATALOG_FILE)}::"${event}" is not a valid {domain}.{event} id`
    )
    process.exit(1)
  }
  const segments = ["notifications", "events", ...event.split(".")]
  for (const { file, tree } of messageTrees) {
    const title = readAtPath(tree, [...segments, "title"])
    const body = readAtPath(tree, [...segments, "body"])
    if (typeof title !== "string" || title.trim().length === 0) {
      missingStrings.push([event, file, "title"])
    }
    if (typeof body !== "string" || body.trim().length === 0) {
      missingStrings.push([event, file, "body"])
    }
  }
}

for (const [event, file, key] of missingStrings) {
  console.error(
    `::error file=${relative(repoRoot, file)}::Missing notifications.events.${event}.${key}`
  )
}

// ---------------------------------------------------------------------------
if (undeclaredUses.length > 0 || missingStrings.length > 0) {
  process.exit(1)
}

console.log(
  `Notification catalogue parity OK — ${declaredSet.size} events declared, ` +
    `${usedElsewhere.size} referenced via notify() in code, ` +
    `${MESSAGE_FILES.length} locale files fully translated.`
)
