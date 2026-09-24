-- =====================================================================
-- RLS coverage gate (M0 wrap-up, D-56)
--
-- Plain SQL, not pgTAP: `.github/workflows/ci.yml`'s `db` job runs this with
-- `psql -v ON_ERROR_STOP=1 --file supabase/tests/coverage.sql` (separately
-- from the `pg_prove` step over `supabase/tests/*.sql`), warning instead of
-- failing while this file does not exist. `ON_ERROR_STOP=1` is what turns a
-- raised exception into a nonzero psql exit code.
--
-- Checks exactly one thing here — every `public` table with a `workspace_id`
-- column has row level security enabled — because it needs the live catalog
-- after this PR's migrations have applied, which only exists inside the `db`
-- job's Postgres. The companion half of this gate — "is that table named in
-- at least one `supabase/tests/*.sql` file" — is pure static analysis on the
-- checked-out repo, so it runs as its own step in `CI / contracts` instead
-- (`scripts/check-coverage-test-files.mjs`, deriving "table has workspace_id"
-- from `supabase/migrations/*.sql` the way `check-audit-catalog-parity.mjs`
-- already does). The split is a job-boundary choice, not a hard technical
-- requirement: `psql` itself is an ordinary client process on the GitHub
-- Actions RUNNER (which already has the full checkout) and could read these
-- files directly — only `pg_read_file()`, a SERVER-SIDE Postgres function
-- that runs inside the `db` job's separate Postgres SERVICE CONTAINER, has
-- no path back to them, even as the superuser `PGUSER=postgres` connects as.
-- Keeping the file-presence check as plain Node means it needs no database
-- connection at all and can run before migrations even apply. See D-56.
-- =====================================================================
do $$
declare
  v_violations text[];
begin
  select coalesce(array_agg(format('public.%I', t.table_name) order by t.table_name),
                   array[]::text[])
    into v_violations
    from information_schema.tables t
    join information_schema.columns c
      on c.table_schema = t.table_schema
     and c.table_name   = t.table_name
     and c.column_name  = 'workspace_id'
    left join pg_tables pt
      on pt.schemaname = t.table_schema
     and pt.tablename  = t.table_name
   where t.table_schema = 'public'
     and t.table_type    = 'BASE TABLE'
     and coalesce(pt.rowsecurity, false) is not true;

  if array_length(v_violations, 1) > 0 then
    raise exception
      'RLS coverage: % table(s) with a workspace_id column do not have row level security enabled: %',
      array_length(v_violations, 1), array_to_string(v_violations, ', ');
  end if;

  raise notice 'RLS coverage OK: every workspace_id table has row level security enabled.';
end
$$;
