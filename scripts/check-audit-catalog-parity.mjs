// The SQL action catalogue (public.audit_action_catalog, seeded across
// supabase/migrations/*.sql) and its TypeScript mirror
// (packages/domain/src/audit/catalog.ts) must name the exact same actions.
// A drift here is exactly the Base44 prototype's "garbage action string" failure
// mode reappearing one layer up — F-ID-09 §5.1, acceptance criterion 17.
//
// Both sides build their full set the same way: a curated list of named business
// actions, plus three generated `<table>.insert|update|delete` rows per table in a
// shared table list. So parity reduces to two comparisons — curated actions, and
// the table list — rather than diffing ~80 fully-expanded strings, which is both
// more robust to formatting and pinpoints exactly what to fix.
//
// Originally read only 20260924000100_audit_substrate.sql (the migration that
// introduced the catalogue); generalised to scan every migration so a LATER
// migration can seed more curated actions or generic-audit tables for a new
// tenant table without ever editing an already-applied one (F-OP-06 Part 1,
// D-63 — supabase/migrations/20260925000900_staff_schema.sql is the first
// migration to use this).
import { readFile, readdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const repoRoot = fileURLToPath(new URL("..", import.meta.url))

const MIGRATIONS_DIR = "supabase/migrations"
const CATALOG_PATH = "packages/domain/src/audit/catalog.ts"

async function readMigrationSources() {
  const dir = new URL(`${MIGRATIONS_DIR}/`, `file://${repoRoot}/`)
  const files = (await readdir(dir))
    .filter((name) => name.endsWith(".sql"))
    .sort()
  return Promise.all(files.map((name) => readFile(new URL(name, dir), "utf8")))
}

const migrationSources = await readMigrationSources()
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
// SQL: every `insert into public.audit_action_catalog (...) values` block, up
// to its closing `on conflict`, across all migrations. Actions are the first
// quoted string of each tuple — a dynamically-built action (this migration's
// own `v_table || '.insert'` generic-table loop) never starts with a quote
// right after `(`, so it can never be mistaken for a curated one.
const sqlCurated = new Set()
for (const source of migrationSources) {
  for (const blockMatch of source.matchAll(
    /insert into public\.audit_action_catalog[\s\S]*?values\s*([\s\S]*?)\non conflict/g
  )) {
    for (const m of blockMatch[1].matchAll(
      /\(\s*'([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)'/g
    )) {
      sqlCurated.add(m[1])
    }
  }
}
if (sqlCurated.size === 0) {
  fail(
    `Found zero curated actions across ${MIGRATIONS_DIR} — likely a parse failure, not an empty catalogue.`
  )
  process.exit(1)
}

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
const sqlTables = new Set()
for (const source of migrationSources) {
  for (const arrayMatch of source.matchAll(
    /v_tables text\[\] := array\[([\s\S]*?)\];/g
  )) {
    for (const m of arrayMatch[1].matchAll(/'([a-z][a-z0-9_]*)'/g)) {
      sqlTables.add(m[1])
    }
  }
}
if (sqlTables.size === 0) {
  fail(`Could not find any v_tables array across ${MIGRATIONS_DIR}`)
  process.exit(1)
}

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
      `${label} "${item}" is seeded in ${MIGRATIONS_DIR} but missing from ${CATALOG_PATH}`
    )
  }
  for (const item of onlyInTs) {
    fail(
      `${label} "${item}" is declared in ${CATALOG_PATH} but not seeded in ${MIGRATIONS_DIR}`
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
