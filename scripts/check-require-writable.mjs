// D-300: every tenant write path calls `requireWritable` (D-29 PLAN_READ_ONLY).
//
// Scans every `"use server"` file and every `route.ts` under apps/. An exported
// function that resolves a workspace context (`requireWorkspace(` /
// `requireShell(` / `resolveWorkspaceContext(`) and is a WRITE must also call
// `requireWritable(`, or be listed in EXEMPT with the reason.
//   - Route handlers: POST, PUT, PATCH, DELETE are writes.
//   - Server actions: everything is a write unless its name starts with a read
//     verb (get, list, search, export, download, preview, check, count, find).
// ponytail: name-based read detection; a write misnamed as a read slips past this
// check but is still refused by the database trigger (app.tg_require_writable).
import { readFile, readdir } from "node:fs/promises"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = fileURLToPath(new URL("..", import.meta.url))

/** `"<file relative to repo root, forward slashes>#<export name>"` → reason. */
const EXEMPT = {}

const IGNORED_DIRS = new Set(["node_modules", ".next", ".turbo", "dist"])
const READ_NAME =
  /^(get|list|search|export|download|preview|check|count|find)[A-Z]/
const WRITE_METHOD = /^(POST|PUT|PATCH|DELETE)$/
const TENANT_CONTEXT =
  /\b(requireWorkspace|requireShell|resolveWorkspaceContext)\(/

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) yield* walk(path)
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.(test|spec)\.tsx?$/.test(entry.name)
    ) {
      yield path
    }
  }
}

const violations = []
let checked = 0

for await (const path of walk(join(repoRoot, "apps"))) {
  const file = relative(repoRoot, path).replaceAll("\\", "/")
  const source = await readFile(path, "utf8")
  const isRoute = /\/route\.tsx?$/.test(file)
  const isServerActions =
    /^\s*(\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*["']use server["']/.test(source)
  if (!isRoute && !isServerActions) continue

  if (isServerActions && /^export const \w+\s*=\s*async/m.test(source)) {
    violations.push(
      `${file}: declare server actions as \`export async function\` so this check can see them`
    )
  }

  const exports = [...source.matchAll(/^export (?:async )?function (\w+)/gm)]
  exports.forEach((match, i) => {
    const name = match[1]
    const body = source.slice(
      match.index,
      exports[i + 1]?.index ?? source.length
    )
    const isWrite = isRoute ? WRITE_METHOD.test(name) : !READ_NAME.test(name)
    if (!isWrite || !TENANT_CONTEXT.test(body)) return
    checked++
    if (
      /\brequireWritable\(/.test(body) ||
      Object.hasOwn(EXEMPT, `${file}#${name}`)
    )
      return
    violations.push(
      `${file}: ${name} writes to a workspace but never calls requireWritable (D-300)`
    )
  })
}

if (violations.length > 0) {
  for (const v of violations) console.error(`::error::${v}`)
  console.error(
    "Call `requireWritable(ctx, client)` after the policy check and return `err(planReadOnlyApiError(...))`, " +
      "or add the action to EXEMPT in scripts/check-require-writable.mjs with the reason."
  )
  process.exit(1)
}
console.log(
  `requireWritable: ${checked} tenant write path(s) checked, all guarded.`
)
