// Half of `supabase/tests/coverage.sql`'s contract (D-56, M0 wrap-up): every
// `public` table with a `workspace_id` column must be named in at least one
// `supabase/tests/*.sql` file (ARCHITECTURE §9: "every new tenant table needs,
// at minimum, an isolation case in 02_tenant_isolation.sql and an escalation
// case in 03_role_escalation.sql before it ships").
//
// This is a static check, not a database query — NOT because `psql` itself
// couldn't do it (PR #17 Opus review, correcting D-56's first draft: `psql`
// is an ordinary client process on the GitHub Actions RUNNER, which already
// has the full checkout via `actions/checkout`, so it could read these files
// directly; only `pg_read_file()`, a SERVER-SIDE function that runs inside
// the Postgres SERVICE CONTAINER, has no path back to them). The split is
// kept anyway because the two checks have genuinely different dependencies —
// this one is pure static analysis, needs no live database connection at
// all, and can run in `CI / contracts` before `CI / db` even starts
// migrations; `coverage.sql`'s RLS-enabled check inherently needs the live
// catalog after migrations apply, so it stays a `db`-job step. Recorded as
// D-56.
//
// Which tables have `workspace_id` is itself derived statically, the same way
// `check-audit-catalog-parity.mjs` reads migrations rather than querying a
// live database: parse every `create table public.<name> (...)` block AND
// every `alter table public.<name> add column ... workspace_id ...` across
// `supabase/migrations/*.sql`, with SQL comments stripped first so a mention
// in a `--`/`/* */` comment can never be mistaken for a real column or for
// real test coverage.
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
 * Strips `--` line comments and `/* ... *\/` block comments, replacing each
 * with a space (not deleting it outright) so token boundaries and line
 * numbers in whatever is left are undisturbed. This repo's SQL has no
 * dollar-quoted string containing a literal `--` or `/*` that would need a
 * real parser to tell apart (PL/pgSQL bodies use `$$`/`$tag$`, not comment
 * syntax, for their own text) — good enough for a lint-style check, not
 * something a client would ever `EXECUTE`.
 */
function stripSqlComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--.*$/gm, "")
}

/**
 * Every `create table [if not exists] [public.]<name> ( ... )` block, with
 * its column-list text — paren-depth tracked rather than a single non-greedy
 * regex, since column definitions themselves contain parens (`numeric(10,2)`,
 * `references public.workspaces (id)`). The `public.` prefix is optional so
 * a table created relying on `search_path` still matches; a table qualified
 * with a DIFFERENT schema (`app.foo`, `auth.foo`) still does not, because
 * `(\w+)` can only capture up to the next `.`, never past it, so the
 * required `\s*\(` right after fails to match for those.
 */
function findCreateTableBlocks(source) {
  const blocks = []
  const opener = /create table\s+(?:if not exists\s+)?(?:public\.)?(\w+)\s*\(/gi
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

/**
 * Every `alter table [if exists] [public.]<name> add column ... workspace_id`
 * — no migration adds `workspace_id` this way today, but a future one might,
 * and this check must not silently miss it if one ever does.
 */
function findAlterTableAddWorkspaceId(source) {
  const pattern =
    /alter table\s+(?:if exists\s+)?(?:public\.)?(\w+)\s+add column\s+(?:if not exists\s+)?workspace_id\b/gi
  return [...source.matchAll(pattern)].map((match) => match[1])
}

/** A column declaration line starts with the bare name (this repo's style
 * throughout `supabase/migrations` — see e.g. `workspace_id uuid not null
 * references ...`), so this only matches a real column, never a comment
 * (already stripped) or a value that happens to contain the substring
 * "workspace_id". */
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
//
// All six original entries (consent_records, legal_acceptances, email_log,
// file_access_log, subscription_events, notifications) now have a real
// isolation + escalation case in `supabase/tests/14_rls_known_gaps.sql` —
// the allowlist is empty, which is the target state, not a special case.
const KNOWN_GAPS = new Map([])

const migrations = await readSqlFiles(MIGRATIONS_DIR)

const tenantTables = new Set()
for (const { source: rawSource } of migrations) {
  const source = stripSqlComments(rawSource)
  for (const block of findCreateTableBlocks(source)) {
    if (declaresWorkspaceId(block.columnsSource)) {
      tenantTables.add(block.tableName)
    }
  }
  for (const tableName of findAlterTableAddWorkspaceId(source)) {
    tenantTables.add(tableName)
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
// Comments stripped before matching: a table name merely mentioned in a
// `--`/`/* */` comment (prose, a cross-reference to another file, a TODO)
// must never be mistaken for that table actually being under test
// (PR #17 Opus review).
const testCorpus = testFiles
  .map(({ source }) => stripSqlComments(source))
  .join("\n")

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
