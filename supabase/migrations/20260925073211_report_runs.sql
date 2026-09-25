-- =====================================================================
-- F-OP-03 Parts 1-2 — the report run pipeline (D-204, D-205)
--
-- Ships: report_kind / report_status / report_locale enums, report_runs,
-- report_run_items, RLS (isolation + a teacher-vs-teacher escalation case,
-- pgTAP 40_report_runs.sql), tenant freeze, audit and the D-300
-- require-writable guard.
--
-- `report_kind` has exactly one value, 'sample' — this Part's own pipeline
-- proof (spec §8 Part 2 demo: "enqueue a stub report"). Every real kind
-- (report_card, mark_sheet, ...) depends on exam/marks data that does not
-- exist yet (F-AC-0x); later Parts add their own values with
-- `alter type public.report_kind add value ...` (additive, forward-only,
-- no shape change to either table below).
--
-- `report_run_items` ships now (spec §8 Part 2 lists it) but is not written
-- to by any code in this PR — it exists for Part 5's bulk chunking so that
-- Part does not also need a schema migration. RLS/pgTAP still cover it
-- (coverage.sql requires RLS on every workspace_id table; the escalation
-- case is deferred alongside the rest of bulk rendering, noted in the spec's
-- §11 open questions addendum in this PR).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type public.report_kind as enum ('sample');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_status as enum
    ('queued', 'rendering', 'ready', 'failed', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_locale as enum ('bn', 'en');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. report_runs (§3.1)
-- ---------------------------------------------------------------------
create table if not exists public.report_runs (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  kind             public.report_kind not null,
  params           jsonb not null default '{}'::jsonb,
  status           public.report_status not null default 'queued',
  file_id          uuid references public.files (id) on delete set null,
  page_count       int,
  item_count       int,
  locale           public.report_locale not null,
  requested_by     uuid references public.profiles (id) on delete set null,
  requested_at     timestamptz not null default now(),
  started_at       timestamptz,
  completed_at     timestamptz,
  duration_ms      int,
  error_code       text,
  error_detail     text,
  idempotency_key  text not null,
  expires_at       timestamptz not null default (now() + interval '30 days'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint report_runs_params_is_object check (jsonb_typeof(params) = 'object')
);

comment on table public.report_runs is
  'F-OP-03 §3.1: a render is a job, not a click. One row per requested '
  'document (single or the eventual bulk merge); report_run_items (Part 5) '
  'carries the per-student breakdown for bulk runs.';
comment on column public.report_runs.idempotency_key is
  'sha256(workspace | kind | canonical(params) | locale | data_version), '
  'computed in the repository layer (§5.8). An identical request against an '
  'unexpired queued/rendering/ready run returns that run instead of '
  'rendering again — enforced by report_runs_idempotency_key_key below.';
comment on column public.report_runs.status is
  'queued -> rendering -> ready|failed; ready|failed -> expired by the '
  '30-day cron (not built in this Part — see spec §11 addendum).';

-- One live run per (workspace, idempotency_key): a second identical request
-- while a queued/rendering/ready run already exists is a read, not a write
-- (§5.8, §9 AC19). A failed or expired run does not block a fresh attempt.
create unique index if not exists report_runs_idempotency_key_key
  on public.report_runs (workspace_id, idempotency_key)
  where status in ('queued', 'rendering', 'ready');
create index if not exists report_runs_workspace_kind_requested_idx
  on public.report_runs (workspace_id, kind, requested_at desc);
create index if not exists report_runs_status_idx
  on public.report_runs (status);
create index if not exists report_runs_file_id_idx
  on public.report_runs (file_id) where file_id is not null;

alter table public.report_runs enable row level security;

-- SELECT — §3.1: owner/admin/teacher of the workspace, and only their own
-- request unless they are owner/admin (a teacher never sees another
-- teacher's run list this way).
create policy report_runs_select on public.report_runs
  for select to authenticated
  using (
    app.has_role(workspace_id, array['owner', 'admin', 'teacher'])
    and (
      requested_by = (select app.current_user_id())
      or app.has_role(workspace_id, array['owner', 'admin'])
    )
  );

-- INSERT — via the server action only in practice (no UI writes this table
-- directly), but RLS still requires the caller to be a role allowed to
-- request a render and to be requesting as themself.
create policy report_runs_insert on public.report_runs
  for insert to authenticated
  with check (
    app.has_role(workspace_id, array['owner', 'admin', 'teacher'])
    and requested_by = (select app.current_user_id())
  );

-- No UPDATE/DELETE policy for `authenticated`: status/file/error transitions
-- are written by the render pipeline under `withServiceRole`, which bypasses
-- RLS (ARCHITECTURE §3 rule 6) — a client can never move its own run to
-- 'ready' with someone else's file_id.
revoke all on public.report_runs from anon, authenticated;
grant select, insert on public.report_runs to authenticated;

select app.attach_updated_at('public.report_runs');
select app.attach_freeze_workspace('public.report_runs');
select app.attach_audit('public.report_runs');
select app.attach_require_writable('public.report_runs');

-- ---------------------------------------------------------------------
-- 3. report_run_items (§3.1, bulk breakdown — Part 5)
-- ---------------------------------------------------------------------
create table if not exists public.report_run_items (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  report_run_id    uuid not null references public.report_runs (id) on delete cascade,
  subject_type     text not null check (subject_type in ('student', 'staff', 'section')),
  subject_id       uuid not null,
  file_id          uuid references public.files (id) on delete set null,
  page_from        int,
  page_to          int,
  status           public.report_status not null default 'queued',
  error_detail     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.report_run_items is
  'F-OP-03 §3.1: per-student/staff/section page ranges for a bulk run '
  '(Part 5). Not written to by any code in this PR (Parts 1-2 only render '
  'single, non-bulk runs) — the schema ships now so Part 5 needs no '
  'migration of its own.';

create index if not exists report_run_items_run_idx
  on public.report_run_items (report_run_id);
create index if not exists report_run_items_workspace_idx
  on public.report_run_items (workspace_id);

alter table public.report_run_items enable row level security;

-- Same shape as report_runs: read through the parent run's owner, scoped by
-- workspace + role. `report_run_items` has no `requested_by` of its own, so
-- self-scoping joins back to the parent run.
create policy report_run_items_select on public.report_run_items
  for select to authenticated
  using (
    app.has_role(workspace_id, array['owner', 'admin', 'teacher'])
    and exists (
      select 1 from public.report_runs r
      where r.id = report_run_id
        and (
          r.requested_by = (select app.current_user_id())
          or app.has_role(workspace_id, array['owner', 'admin'])
        )
    )
  );

revoke all on public.report_run_items from anon, authenticated;
grant select on public.report_run_items to authenticated;

select app.attach_updated_at('public.report_run_items');
select app.attach_freeze_workspace('public.report_run_items');
select app.attach_audit('public.report_run_items');
select app.attach_require_writable('public.report_run_items');
