// `pnpm audit` with a reviewed, expiring allowlist (CI.md §2.7, SECURITY §6).
//
// An exception is a decision with a date on it. Without expiry, the first
// unfixable advisory becomes permanent and the gate quietly stops meaning anything.
import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const run = promisify(execFile)
const repoRoot = fileURLToPath(new URL("..", import.meta.url))
const BLOCKING = new Set(["high", "critical"])

async function loadExceptions() {
  try {
    const raw = await readFile(join(repoRoot, ".audit-exceptions.json"), "utf8")
    return JSON.parse(raw).exceptions ?? []
  } catch {
    return []
  }
}

const exceptions = await loadExceptions()
const today = new Date().toISOString().slice(0, 10)

// An expired exception fails on its own: it is a commitment that came due.
const expired = exceptions.filter((entry) => entry.expires < today)
for (const entry of expired) {
  console.error(
    `::error file=.audit-exceptions.json::exception for ${entry.advisory} expired on ${entry.expires}`
  )
}

let report = { advisories: {} }
try {
  const { stdout } = await run(
    "pnpm",
    ["audit", "--audit-level", "high", "--json"],
    {
      cwd: repoRoot,
      maxBuffer: 32 * 1024 * 1024,
      shell: process.platform === "win32",
    }
  )
  report = JSON.parse(stdout)
} catch (error) {
  // pnpm exits non-zero when it finds something; the JSON is still on stdout.
  try {
    report = JSON.parse(error.stdout ?? "{}")
  } catch {
    console.error("::error::pnpm audit produced no parseable report")
    process.exit(1)
  }
}

const allowed = new Set(
  exceptions
    .filter((entry) => entry.expires >= today)
    .map((entry) => entry.advisory)
)

const blocking = Object.values(report.advisories ?? {}).filter((advisory) => {
  const id = String(advisory.github_advisory_id ?? advisory.id)
  return BLOCKING.has(advisory.severity) && !allowed.has(id)
})

for (const advisory of blocking) {
  const id = advisory.github_advisory_id ?? advisory.id
  console.error(
    `::error::${advisory.severity} — ${advisory.module_name}: ${advisory.title} (${id})`
  )
}

if (blocking.length > 0 || expired.length > 0) {
  console.error(
    `\nAudit failed: ${blocking.length} unexcepted high/critical advisories, ${expired.length} expired exceptions.`
  )
  process.exit(1)
}

console.log(`Audit clean — ${allowed.size} active exception(s), none expired.`)
