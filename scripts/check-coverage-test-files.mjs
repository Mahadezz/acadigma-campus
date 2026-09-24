// Half of `supabase/tests/coverage.sql`'s contract (D-56, M0 wrap-up): every
// `public` table with a `workspace_id` column must be named in at least one
// `supabase/tests/*.sql` file (ARCHITECTURE §9: "every new tenant table needs,
// at minimum, an isolation case in 02_tenant_isolation.sql and an escalation
// case in 03_role_escalation.sql before it ships").
//
// This is a static check, not a database query, on purpose: `coverage.sql`
// runs as `psql` against the CI Postgres SERVICE CONTAINER
// (`.github/workflows/ci.yml`'s `db` job), which is a separate machine from
// the GitHub Actions runner that checked out this repository — there is no
// path from that container back to `supabase/tests/*.sql` on disk for
// `pg_read_file` to read, even though `PGUSER=postgres` is a superuser there.
// The runner itself always has the checkout, so this script does the
// file-presence half here, and `coverage.sql` stays pure catalog SQL
// (RLS-enabled) run in the `db` job. Recorded as D-56.
//
// Which tables have `workspace_id` is itself derived statically, the same way
// `check-audit-catalog-parity.mjs` reads migrations rather than querying a
// live database: parse every `create table public.<name> (...)` block across
// `supabase/migrations/*.sql` and check whether its column list declares
// `workspace_id`. No migration in this repo adds `workspace_id` via a later
// `alter table`, so this single pass is complete.
import { readFile, readdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const repoRoot = fileURLToPath(new URL("..", import.meta.url))
const MIGRATIONS_DIR = "supabase/migrations"
const TESTS_DIR = "supabase/tests"
// Infrastructure, not a behavioural test asserting anything about a specific
// table — excluded so this script cannot pass merely because a table's name
// happens to appear in the file that is itself checking for that mention.
const EXCLUDED_TEST_FILES = new Set(["coverage.sql"])

function fail(message) {
  console.error(`::error::${message}`)
  process.exitCode = 1
}

async function readSqlFiles(dirRelativePath) {
  const dir = new URL(`${dirRelativePath}/`, `file://${repoRoot}/`)
  const entries = await readdir(dir)
  const files = entries.filter((name) => name.endsWith(".sql")).sort()
  const contents = await Promise.all(
    files.map((name) => readFile(new URL(name, dir), "utf8"))
  )
  return files.map((name, i) => ({ name, source: contents[i] }))
}

/**
 * Every `create table [if not exists] public.<name> ( ... )` block, with its
 * column-list text — paren-depth tracked rather than a single non-greedy
 * regex, since column definitions themselves contain parens (`numeric(10,2)`,
 * `references public.workspaces (id)`).
 */
function findCreateTableBlocks(source) {
  const blocks = []
  const opener = /create table\s+(?:if not exists\s+)?public\.(\w+)\s*\(/gi
  let match
  while ((match = opener.exec(source))) {
    const tableName = match[1]
    const bodyStart = match.index + match[0].length
    let depth = 1
    let i = bodyStart
    for (; i < source.length && depth > 0; i++) {
      if (source[i] === "(") depth++
      else if (source[i] === ")") depth--
    }
    if (depth !== 0) {
      fail(
        `Unbalanced parentheses parsing "create table public.${tableName}" — could not find its closing ")".`
      )
      continue
    }
    blocks.push({ tableName, columnsSource: source.slice(bodyStart, i - 1) })
  }
  return blocks
}

/** A column declaration line starts with the bare name (this repo's style
 * throughout `supabase/migrations` — see e.g. `workspace_id uuid not null
 * references ...`), so this only matches a real column, not a comment or a
 * value that happens to contain the substring "workspace_id". */
function declaresWorkspaceId(columnsSource) {
  return /(^|,)\s*workspace_id\s+\S/m.test(columnsSource)
}

// Pre-existing gaps found the first time this check ran (M0 wrap-up, D-56) —
// real tenant tables with no isolation/escalation case anywhere in
// `supabase/tests`, predating this script and out of this Part's scope to
// fix (each needs its own RLS test design, not a mechanical addition). This
// allowlist is a baseline, not a target: it must only ever shrink. Adding a
// NEW table here instead of writing its test is exactly the drift this
// script exists to prevent, and is a blocking review comment.
const KNOWN_GAPS = new Map([
  ["consent_records", "F-ID-05/PDPA consent capture — not yet built"],
  ["legal_acceptances", "F-ID-05/PDPA DPA acceptance — not yet built"],
  ["email_log", "F-ID-07 notifications — delivery log has no RLS test yet"],
  ["file_access_log", "F-ID-09/F-TE-05 file access log — no RLS test yet"],
  [
    "subscription_events",
    "F-CM-06 Part 4+ — subscription lifecycle events have no RLS test yet",
  ],
])

const migrations = await readSqlFiles(MIGRATIONS_DIR)

const tenantTables = new Set()
for (const { source } of migrations) {
  for (const block of findCreateTableBlocks(source)) {
    if (declaresWorkspaceId(block.columnsSource)) {
      tenantTables.add(block.tableName)
    }
  }
}

if (tenantTables.size === 0) {
  fail(
    `Found zero tables with a workspace_id column across ${MIGRATIONS_DIR} — that is almost certainly this script failing to parse, not a real empty schema.`
  )
  process.exit(1)
}

const testFiles = (await readSqlFiles(TESTS_DIR)).filter(
  ({ name }) => !EXCLUDED_TEST_FILES.has(name)
)
const testCorpus = testFiles.map(({ source }) => source).join("\n")

const uncovered = [...tenantTables]
  .filter((table) => !new RegExp(`\\b${table}\\b`).test(testCorpus))
  .sort()

const newGaps = uncovered.filter((table) => !KNOWN_GAPS.has(table))
const staleAllowlistEntries = [...KNOWN_GAPS.keys()].filter(
  (table) => !uncovered.includes(table)
)

for (const table of newGaps) {
  fail(
    `public.${table} has a workspace_id column but is not named in any ${TESTS_DIR}/*.sql file (ARCHITECTURE §9: every tenant table needs an isolation and an escalation case).`
  )
}

// The allowlist must only shrink (see its own comment) — a stale entry means
// coverage was added and nobody deleted the line documenting the gap.
for (const table of staleAllowlistEntries) {
  fail(
    `public.${table} is now named in a ${TESTS_DIR}/*.sql file — remove it from KNOWN_GAPS in ${import.meta.url.split("/").pop()}.`
  )
}

if (newGaps.length > 0 || staleAllowlistEntries.length > 0) {
  process.exit(1)
}

const gapCount = uncovered.length
console.log(
  `Coverage OK — ${tenantTables.size} workspace_id tables; ${
    tenantTables.size - gapCount
  } named in a ${TESTS_DIR}/*.sql file, ${gapCount} tracked in KNOWN_GAPS.`
)
