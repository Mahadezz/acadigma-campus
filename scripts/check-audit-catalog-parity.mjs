// The SQL action catalogue (public.audit_action_catalog, seeded in
// supabase/migrations/20260924000100_audit_substrate.sql) and its TypeScript
// mirror (packages/domain/src/audit/catalog.ts) must name the exact same actions.
// A drift here is exactly the Base44 prototype's "garbage action string" failure
// mode reappearing one layer up — F-ID-09 §5.1, acceptance criterion 17.
//
// Both sides build their full set the same way: a curated list of named business
// actions, plus three generated `<table>.insert|update|delete` rows per table in a
// shared table list. So parity reduces to two comparisons — curated actions, and
// the table list — rather than diffing ~80 fully-expanded strings, which is both
// more robust to formatting and pinpoints exactly what to fix.
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const repoRoot = fileURLToPath(new URL("..", import.meta.url))

const MIGRATION_PATH = "supabase/migrations/20260924000100_audit_substrate.sql"
const CATALOG_PATH = "packages/domain/src/audit/catalog.ts"

const migrationSource = await readFile(
  new URL(MIGRATION_PATH, `file://${repoRoot}/`),
  "utf8"
)
const catalogSource = await readFile(
  new URL(CATALOG_PATH, `file://${repoRoot}/`),
  "utf8"
)

function fail(message) {
  console.error(`::error::${message}`)
  process.exitCode = 1
}

// ---------------------------------------------------------------------------
// 1. Curated actions
// ---------------------------------------------------------------------------
// SQL: the `insert into public.audit_action_catalog (...) values` block, up to
// its closing `on conflict`. Actions are the first quoted string of each tuple.
const sqlCuratedBlockMatch = migrationSource.match(
  /insert into public\.audit_action_catalog[\s\S]*?values\s*([\s\S]*?)\non conflict/
)
if (!sqlCuratedBlockMatch) {
  fail(`Could not find the curated INSERT block in ${MIGRATION_PATH}`)
  process.exit(1)
}
const sqlCurated = new Set(
  [
    ...sqlCuratedBlockMatch[1].matchAll(
      /\(\s*'([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)'/g
    ),
  ].map((m) => m[1])
)

// TS: every `action: "x.y"` inside the AUDIT_ACTION_CATALOG array literal.
const tsCatalogBlockMatch = catalogSource.match(
  /export const AUDIT_ACTION_CATALOG:[\s\S]*?=\s*\[([\s\S]*?)\n\]\n/
)
if (!tsCatalogBlockMatch) {
  fail(`Could not find AUDIT_ACTION_CATALOG in ${CATALOG_PATH}`)
  process.exit(1)
}
const tsCurated = new Set(
  [
    ...tsCatalogBlockMatch[1].matchAll(
      /action:\s*"([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)"/g
    ),
  ].map((m) => m[1])
)

// ---------------------------------------------------------------------------
// 2. The generic-table list (each entry expands to 3 <table>.<op> actions)
// ---------------------------------------------------------------------------
const sqlTablesMatch = migrationSource.match(
  /v_tables text\[\] := array\[([\s\S]*?)\];/
)
if (!sqlTablesMatch) {
  fail(`Could not find v_tables in ${MIGRATION_PATH}`)
  process.exit(1)
}
const sqlTables = new Set(
  [...sqlTablesMatch[1].matchAll(/'([a-z][a-z0-9_]*)'/g)].map((m) => m[1])
)

const tsTablesMatch = catalogSource.match(
  /export const GENERIC_AUDIT_TABLES:[\s\S]*?=\s*\[([\s\S]*?)\]\n/
)
if (!tsTablesMatch) {
  fail(`Could not find GENERIC_AUDIT_TABLES in ${CATALOG_PATH}`)
  process.exit(1)
}
const tsTables = new Set(
  [...tsTablesMatch[1].matchAll(/"([a-z][a-z0-9_]*)"/g)].map((m) => m[1])
)

// ---------------------------------------------------------------------------
// 3. Report
// ---------------------------------------------------------------------------
function reportSetDiff(label, sqlSet, tsSet) {
  const onlyInSql = [...sqlSet].filter((x) => !tsSet.has(x))
  const onlyInTs = [...tsSet].filter((x) => !sqlSet.has(x))
  for (const item of onlyInSql) {
    fail(
      `${label} "${item}" is seeded in ${MIGRATION_PATH} but missing from ${CATALOG_PATH}`
    )
  }
  for (const item of onlyInTs) {
    fail(
      `${label} "${item}" is declared in ${CATALOG_PATH} but not seeded in ${MIGRATION_PATH}`
    )
  }
  return onlyInSql.length === 0 && onlyInTs.length === 0
}

const curatedOk = reportSetDiff("curated action", sqlCurated, tsCurated)
const tablesOk = reportSetDiff("generic-audit table", sqlTables, tsTables)

if (curatedOk && tablesOk) {
  console.log(
    `Audit catalogue parity OK — ${sqlCurated.size} curated actions, ${sqlTables.size} generic-audit tables.`
  )
} else {
  process.exit(1)
}
