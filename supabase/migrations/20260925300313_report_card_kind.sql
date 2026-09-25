-- =====================================================================
-- F-OP-03 Part 3 (single report card) — adds the 'report_card' value to
-- report_kind (D-206), additive and forward-only per the run pipeline's
-- own comment in 20260925300310_report_runs.sql ("later Parts add their
-- own values with `alter type public.report_kind add value ...`").
--
-- No shape change to report_runs/report_run_items: the same columns and
-- service-role-only status transitions cover this kind; the RLS policies
-- are recreated below only to admit staff (D-206). Marks/exam data (F-AC-06 marks entry) is not on main
-- yet, so this Part's render source is a fixture (see
-- apps/web/app/(school)/app/reports/report-card-data.ts) behind a single
-- seam function — nothing here depends on that.
-- =====================================================================
alter type public.report_kind add value if not exists 'report_card';

-- ---------------------------------------------------------------------
-- D-206 (lead decision 2026-09-26): staff render report cards too — the
-- office prints them. Staff may insert only a report_card run (compared
-- as text: the new enum value cannot be referenced as a literal in the
-- transaction that adds it) and read only their own runs, like a teacher.
-- ---------------------------------------------------------------------
drop policy report_runs_select on public.report_runs;
create policy report_runs_select on public.report_runs
  for select to authenticated
  using (
    app.has_role(workspace_id, array['owner', 'admin', 'teacher', 'staff'])
    and (
      requested_by = (select app.current_user_id())
      or app.has_role(workspace_id, array['owner', 'admin'])
    )
  );

drop policy report_runs_insert on public.report_runs;
create policy report_runs_insert on public.report_runs
  for insert to authenticated
  with check (
    requested_by = (select app.current_user_id())
    and (
      app.has_role(workspace_id, array['owner', 'admin', 'teacher'])
      or (
        app.has_role(workspace_id, array['staff'])
        and kind::text = 'report_card'
      )
    )
  );

drop policy report_run_items_select on public.report_run_items;
create policy report_run_items_select on public.report_run_items
  for select to authenticated
  using (
    app.has_role(workspace_id, array['owner', 'admin', 'teacher', 'staff'])
    and exists (
      select 1 from public.report_runs r
      where r.id = report_run_id
        and (
          r.requested_by = (select app.current_user_id())
          or app.has_role(workspace_id, array['owner', 'admin'])
        )
    )
  );
