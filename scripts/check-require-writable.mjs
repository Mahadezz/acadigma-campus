// D-300: every tenant write path calls `requireWritable` (D-29 PLAN_READ_ONLY).
//
// Scans every `"use server"` file and every `route.ts` under apps/. A file that
// resolves a workspace context anywhere (`requireWorkspace(` / `requireShell(` /
// `resolveWorkspaceContext(`) is a tenant file; in it, every exported WRITE must
// call `requireWritable(` — directly, or through a same-file helper that does —
// or be listed in EXEMPT with the reason. Fail-closed: an action that reaches
// the context through a helper is still checked.
//   - Route handlers: POST, PUT, PATCH, DELETE are writes.
//   - Server actions: everything is a write unless its name starts with a read
//     verb (get, list, search, export, download, preview, check, count, find).
// ponytail: name-based read detection; a write misnamed as a read slips past this
// check but is still refused by the database trigger (app.tg_require_writable).
// Unit tests: `node --test scripts/check-require-writable.test.mjs`.
import { readFile, readdir } from "node:fs/promises"
import { join, relative } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

/** `"<file relative to repo root, forward slashes>#<export name>"` → reason. */
export const EXEMPT = {
  "apps/web/app/(onboarding)/actions.ts#saveOnboardingDraft":
    "user-level onboarding_progress row, no workspace (the file only names requireWorkspace in a comment)",
  "apps/web/app/(onboarding)/actions.ts#completeOnboarding":
    "user-level profiles/onboarding_progress write, no workspace",
  "apps/web/app/(onboarding)/actions.ts#createSchoolWorkspace":
    "creates the workspace; tg_require_writable passes a fresh workspace",
}

const READ_NAME =
  /^(get|list|search|export|download|preview|check|count|find)[A-Z]/
const WRITE_METHOD = /^(POST|PUT|PATCH|DELETE)$/
const TENANT_CONTEXT =
  /\b(requireWorkspace|requireShell|resolveWorkspaceContext)\(/
const USE_SERVER =
  /^\s*(\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*["']use server["']/

/** Every top-level function in `source`, with its body (up to the next one). */
function functions(source) {
  const matches = [
    ...source.matchAll(
      /^(export )?(?:async )?function (\w+)|^(export )?const (\w+)\s*=\s*async/gm
    ),
  ]
  return matches.map((m, i) => ({
    exported: Boolean(m[1] || m[3]),
    name: m[2] ?? m[4],
    body: source.slice(m.index, matches[i + 1]?.index ?? source.length),
  }))
}

/** @param {{file: string, source: string}[]} files @returns {string[]} */
export function findViolations(files, exempt = EXEMPT) {
  const violations = []
  for (const { file, source } of files) {
    const isRoute = /\/route\.tsx?$/.test(file)
    if (!isRoute && !USE_SERVER.test(source)) continue
    if (!TENANT_CONTEXT.test(source)) continue

    const fns = functions(source)
    const guards = fns
      .filter((f) => /\brequireWritable\(/.test(f.body))
      .map((f) => f.name)
    const callsGuard = (body) =>
      /\brequireWritable\(/.test(body) ||
      guards.some((g) => new RegExp(`\\b${g}\\(`).test(body))

    for (const { exported, name, body } of fns) {
      if (!exported) continue
      const isWrite = isRoute ? WRITE_METHOD.test(name) : !READ_NAME.test(name)
      if (
        !isWrite ||
        callsGuard(body) ||
        Object.hasOwn(exempt, `${file}#${name}`)
      )
        continue
      violations.push(
        `${file}: ${name} writes to a workspace but never calls requireWritable (D-300)`
      )
    }
  }
  return violations
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!["node_modules", ".next", ".turbo", "dist"].includes(entry.name))
        yield* walk(path)
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.(test|spec)\.tsx?$/.test(entry.name)
    ) {
      yield path
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoRoot = fileURLToPath(new URL("..", import.meta.url))
  const files = []
  for await (const path of walk(join(repoRoot, "apps"))) {
    files.push({
      file: relative(repoRoot, path).replaceAll("\\", "/"),
      source: await readFile(path, "utf8"),
    })
  }
  const violations = findViolations(files)
  if (violations.length > 0) {
    for (const v of violations) console.error(`::error::${v}`)
    console.error(
      "Call `requireWritable(ctx, client)` after the policy check and return `err(planReadOnlyApiError(...))`, " +
        "or add the action to EXEMPT in scripts/check-require-writable.mjs with the reason."
    )
    process.exit(1)
  }
  console.log("requireWritable: every tenant write path is guarded.")
}
