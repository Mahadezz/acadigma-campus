-- =====================================================================
-- F-OP-03 Part 5 (bulk report cards, demo cut) — D-207.
--
-- 1. Adds 'report_card_bulk' to report_kind (additive, forward-only, same
--    pattern as 20260925300313_report_card_kind.sql). No shape change to
--    report_runs/report_run_items: the bulk run still moves
--    queued -> rendering -> ready|failed under withServiceRole, and now
--    writes one report_run_items row per attempted student (subject_type
--    'student') so a per-student render failure is recorded without
--    failing the whole run. The insert policy needs no change — owner/
--    admin/teacher may already insert any kind (300313's report_runs_insert
--    policy), and staff's insert stays restricted to 'report_card' only
--    (spec §2: bulk is not a staff action).
--
-- 2. Security LOW from the #63 review (defence in depth): report_runs_select
--    and report_run_items_select let staff read only 'report_card' runs.
--    Today staff can only ever INSERT a report_card run (300313's insert
--    policy), so this was already true in practice via requested_by = self;
--    this tightens the SELECT policy itself to say so directly, so the read
--    guarantee does not depend only on the insert-time restriction holding.
-- =====================================================================
alter type public.report_kind add value if not exists 'report_card_bulk';

drop policy report_runs_select on public.report_runs;
create policy report_runs_select on public.report_runs
  for select to authenticated
  using (
    app.has_role(workspace_id, array['owner', 'admin', 'teacher', 'staff'])
    and (
      requested_by = (select app.current_user_id())
      or app.has_role(workspace_id, array['owner', 'admin'])
    )
    and (
      kind::text = 'report_card'
      or app.has_role(workspace_id, array['owner', 'admin', 'teacher'])
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
        and (
          r.kind::text = 'report_card'
          or app.has_role(workspace_id, array['owner', 'admin', 'teacher'])
        )
    )
  );
