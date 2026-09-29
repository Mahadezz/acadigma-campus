/**
 * D-80: the production demo seed (scripts/demo-seed.sh + supabase/seed/demo-*.sql)
 * against the CI `db-integration` stack (local Supabase: real GoTrue, real
 * Postgres, every migration and seed.sql applied).
 *
 * Proves: one run builds the demo school through the real functions; a
 * second run changes nothing in it (every row, audit rows included); no
 * workspace that existed before is touched; and the script refuses when the
 * demo name is ambiguous.
 *
 * Rows are read with psql inside the local database container (as postgres),
 * so audit_events and every column are visible. Opt-in locally
 * (`supabase start`, then DB_LOCAL_SUPABASE=1 and the two keys).
 */
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const URL = process.env.DB_LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321"
const ANON_KEY = process.env.DB_LOCAL_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.DB_LOCAL_SUPABASE_SERVICE_KEY
const RUN = process.env.DB_LOCAL_SUPABASE === "1" && !!ANON_KEY && !!SERVICE_KEY

const ROOT = fileURLToPath(new URL("../../../", import.meta.url))
const DB_CONTAINER = "supabase_db_kekfmibwjejdhxjkmezo" // config.toml project_id
const DEMO_NAME = "Acadigma Demo School (ডেমো)"
const PASSWORD = `Demo-${randomUUID()}`
// The two schools seed.sql creates: the stand-in for "every other school".
// Workspaces other integration files create in parallel are left out, since
// those files change them while this one runs.
const SEED_SCHOOLS =
  "5eed0000-0000-4000-b000-000000000001,5eed0000-0000-4000-b000-000000000002"

function sql(query: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      DB_CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
    ],
    { input: query, encoding: "utf8" }
  ).trim()
}

function seed(): void {
  execFileSync("bash", ["scripts/demo-seed.sh"], {
    cwd: ROOT,
    env: {
      ...process.env,
      SUPABASE_URL: URL,
      SUPABASE_SERVICE_KEY: SERVICE_KEY,
      DEMO_PASSWORD: PASSWORD,
      DB_TARGET: "--local",
    },
    stdio: "pipe",
  })
}

/** md5 of every row of every public table with a workspace_id, plus the
 * workspaces rows themselves, for the given workspace ids. */
function fingerprint(ids: string): string {
  return sql(`
    select string_agg(t.table_name || '=' || (xpath('/row/h/text()', query_to_xml(format(
             'select md5(coalesce(string_agg(x::text, ''|'' order by x::text), '''')) as h
                from public.%I x where x.workspace_id = any(%L::uuid[])',
             t.table_name, '{${ids}}'), false, true, '')))[1]::text, ',' order by t.table_name)
      || ';workspaces=' || (select md5(coalesce(string_agg(w::text, '|' order by w::text), ''))
                             from public.workspaces w where w.id = any('{${ids}}'::uuid[]))
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and c.column_name = 'workspace_id'
       and t.table_type = 'BASE TABLE';`)
}

function demoCount(query: string): number {
  return Number(
    sql(
      query.replaceAll(
        "$DEMO",
        `(select id from public.workspaces where name = '${DEMO_NAME}')`
      )
    )
  )
}

describe.skipIf(!RUN)("demo school seed (D-80, local Supabase)", () => {
  it("builds the demo school once, a second run changes nothing, other workspaces are untouched", () => {
    const before = SEED_SCHOOLS
    const othersBefore = fingerprint(before)

    seed()

    expect(
      demoCount(
        "select count(*) from public.workspaces where name = '" +
          DEMO_NAME +
          "'"
      )
    ).toBe(1)
    expect(
      demoCount(`select count(*) from public.enrollments e join public.sections s on s.id = e.section_id
                    where s.workspace_id = $DEMO and s.name = 'ক' and e.status = 'active'`)
    ).toBe(40)
    expect(
      demoCount(
        "select count(*) from public.attendance_sessions where workspace_id = $DEMO"
      )
    ).toBeGreaterThanOrEqual(15)
    expect(
      demoCount(`select count(*) from public.results r join public.exams x on x.id = r.exam_id
                    where x.workspace_id = $DEMO and x.status = 'published'`)
    ).toBe(40)
    expect(
      demoCount(`select count(*) from public.guardian_users gu join auth.users u on u.id = gu.user_id
                    where gu.workspace_id = $DEMO and gu.status = 'active' and u.email = 'parent.demo@example.com'`)
    ).toBe(1)
    expect(
      demoCount(`select count(*) from public.user_preferences p join auth.users u on u.id = p.user_id
                    where u.email = 'teacher.demo@example.com' and p.ui_mode = 'basic'`)
    ).toBe(1)
    expect(
      demoCount(`select count(*) from public.sections s join public.workspace_members m on m.id = s.class_teacher_id
                    join auth.users u on u.id = m.user_id
                    where s.workspace_id = $DEMO and u.email = 'teacher.demo@example.com'`)
    ).toBe(1)
    // Written by the triggers, in the functions' transactions.
    expect(
      demoCount(
        "select count(*) from public.audit_events where workspace_id = $DEMO"
      )
    ).toBeGreaterThan(100)

    const demoId = sql(
      `select id from public.workspaces where name = '${DEMO_NAME}'`
    )
    const demoAfterFirst = fingerprint(demoId)

    seed()

    expect(fingerprint(demoId)).toBe(demoAfterFirst)
    expect(fingerprint(before)).toBe(othersBefore)
  }, 180_000)

  it("refuses when the demo name matches more than one workspace", () => {
    const others = SEED_SCHOOLS
    const othersBefore = fingerprint(others)
    // A second school with the demo's name, owned by someone else (seed.sql's owner).
    sql(`insert into public.workspaces (type, name, slug, owner_id, created_by)
         values ('school', '${DEMO_NAME}', 'demo-impostor-${randomUUID().slice(0, 8)}',
                 '5eed0000-0000-4000-a000-000000000001', '5eed0000-0000-4000-a000-000000000001')`)

    expect(() => seed()).toThrow()
    expect(fingerprint(others)).toBe(othersBefore)
  }, 120_000)
})
