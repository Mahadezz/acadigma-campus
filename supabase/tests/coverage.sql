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
-- column has row level security enabled — because it can be proven directly
-- against the live catalog in this same session, with no filesystem access
-- to the repository the Postgres service container does not have. The
-- companion half of this gate — "is that table named in at least one
-- `supabase/tests/*.sql` file" — genuinely needs the checked-out repo on
-- disk, which only the GitHub Actions RUNNER has (the `db` job's Postgres is
-- a separate service container psql connects to over TCP; `pg_read_file`
-- inside it, even as the superuser `PGUSER=postgres` this job connects as,
-- cannot see files that were never copied into that container). That half is
-- `scripts/check-coverage-test-files.mjs`, run in the `contracts` job, which
-- statically derives the same "table has workspace_id" fact from
-- `supabase/migrations/*.sql` the way `check-audit-catalog-parity.mjs`
-- already does, and checks `supabase/tests/*.sql` for a mention. See D-56 for
-- why the split is here rather than one script doing both over a `psql`
-- connection with `--set` variables.
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
