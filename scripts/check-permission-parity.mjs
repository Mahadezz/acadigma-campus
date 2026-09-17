// Every permission string used in the app must exist in the domain matrix, and every
// action in the matrix must be used or deliberately reserved. A typo in
// `can(role, "attendence.write")` is not a type error at a string call site; it is a
// silently-denied action. CI.md §2.5.
import { readFile, readdir } from "node:fs/promises"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = fileURLToPath(new URL("..", import.meta.url))
const SCAN_DIRS = ["apps", "packages"]
const IGNORED_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "coverage",
])

/** Read the matrix from source rather than importing it, so this needs no build. */
const permissionsSource = await readFile(
  join(repoRoot, "packages", "domain", "src", "permissions.ts"),
  "utf8"
)
const actionsBlock = /export const ACTIONS = \[(.*?)\] as const/s.exec(
  permissionsSource
)
if (!actionsBlock?.[1]) {
  console.error(
    "::error::Could not find the ACTIONS list in packages/domain/src/permissions.ts"
  )
  process.exit(1)
}
const declared = new Set(
  [...actionsBlock[1].matchAll(/"([a-z]+\.[a-z]+)"/g)].map((m) => m[1])
)

async function* walk(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) yield* walk(path)
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
      yield path
    }
  }
}

// Matches can("teacher", "attendance.write"), assertCan(...), requires: "..." .
const USE_PATTERN =
  /(?:can|canAll|canAny|assertCan|rolesWithAction)\([^)]*?"([a-z]+\.[a-z]+)"|requires:\s*"([a-z]+\.[a-z]+)"/g

const used = new Map()
for (const dir of SCAN_DIRS) {
  for await (const file of walk(join(repoRoot, dir))) {
    if (file.endsWith(join("domain", "src", "permissions.ts"))) continue
    const source = await readFile(file, "utf8")
    for (const match of source.matchAll(USE_PATTERN)) {
      const action = match[1] ?? match[2]
      if (action && !used.has(action)) {
        used.set(action, relative(repoRoot, file).replaceAll("\\", "/"))
      }
    }
  }
}

const unknown = [...used].filter(([action]) => !declared.has(action))
for (const [action, file] of unknown) {
  console.error(
    `::error file=${file}::"${action}" is not in the domain permissions matrix`
  )
}

if (unknown.length > 0) process.exit(1)

console.log(
  `Permission parity OK — ${declared.size} declared, ${used.size} referenced in code.`
)
