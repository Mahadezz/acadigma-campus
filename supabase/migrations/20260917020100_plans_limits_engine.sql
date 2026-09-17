-- =====================================================================
-- 0005 · plans/limits engine — F-CM-06 Parts 1-3
-- ---------------------------------------------------------------------
-- Builds on 20260917010300_plans_and_notifications.sql WITHOUT editing it
-- (migrations are forward-only, HANDBOOK §1 rule 5). This migration does
-- NOT rename or reseed `plan_limits` — a separate agent rewrote 0004's
-- seed rows directly (still on `chore/foundation`, ahead of this branch)
-- to the debate-synthesis plan matrix: `ai_credits_per_day` is already
-- `ai_actions_per_month`, teacher caps are NULL (unlimited) on the new
-- matrix, and the Free tier is gone (a school starts on a 30-day Pro
-- trial with `trial_ai_actions_lifetime = 100` instead; `personal_free`
-- is unchanged). This migration ADDS only what the seed does not supply:
--
--   1. `platform_settings.ai_topup_*` (D-39: placeholder Tk 1,200 / 500
--      actions, ceiling 3x the monthly allowance) in a table this
--      migration creates defensively (`create table if not exists`)
--      because it is referenced by DATA-MODEL.md §7 but not yet created
--      by any migration; later migrations add their own columns the same
--      way, so creation order between parallel builders cannot collide.
--   2. D-31: the `fees` module (F-CM-08, student fee collection) is
--      Starter and above. It was never seeded in 0004.
--   3. Two lookup functions the limits engine needs
--      (`app.workspace_plan`, `app.within_limit`), and a permission check
--      added to `app.set_access_mode` — the version in 0004 had none,
--      which let any authenticated caller flip any workspace's access
--      mode. `create or replace` on a later migration is the forward-only
--      way to fix a function without editing the migration that defined
--      it.
--
-- All PLACEHOLDER prices/allowances are marked as such; the debate
-- synthesis sets final numbers (Refs: D-18, D-39).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. platform_settings — single-row global config (DATA-MODEL.md §7)
-- ---------------------------------------------------------------------
create table if not exists public.platform_settings (
  -- Singleton pattern: a boolean PK that can only ever be `true` keeps the
  -- table to exactly one row without a separate uniqueness trick.
  id boolean primary key default true check (id)
);

comment on table public.platform_settings is
  'Single-row global config, editable only by platform staff (D-16). '
  'Columns are added by whichever migration needs them first, each with '
  '`add column if not exists`, so two feature areas creating this table '
  'in parallel branches never lose each other''s columns.';

alter table public.platform_settings
  add column if not exists ai_topup_price_paisa bigint not null default 120000
    check (ai_topup_price_paisa >= 0),
  add column if not exists ai_topup_actions integer not null default 500
    check (ai_topup_actions > 0),
  add column if not exists ai_topup_monthly_ceiling_multiplier smallint not null default 3
    check (ai_topup_monthly_ceiling_multiplier > 0),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references public.profiles (id) on delete set null;

comment on column public.platform_settings.ai_topup_price_paisa is
  'D-39 — placeholder Tk 1,200 for a top-up pack, priced above the '
  '~Tk 1.45/action cost. Owner-editable from /platform.';
comment on column public.platform_settings.ai_topup_actions is
  'D-39 — placeholder 500 AI actions per top-up pack.';
comment on column public.platform_settings.ai_topup_monthly_ceiling_multiplier is
  'D-39 — a workspace may never buy more top-ups in a month than this '
  'multiple of its plan''s ai_actions_per_month allowance, so a runaway '
  'purchase loop cannot happen even with a stolen card.';

insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

drop policy if exists platform_settings_select on public.platform_settings;
create policy platform_settings_select on public.platform_settings
  for select to anon, authenticated using (true);
-- The top-up price has to render on a public/authenticated billing screen
-- before an upgrade; nothing sensitive lives in this row.

drop policy if exists platform_settings_write_platform on public.platform_settings;
create policy platform_settings_write_platform on public.platform_settings
  for all to authenticated
  using ((select app.is_platform_admin()))
  with check ((select app.is_platform_admin()));

revoke all on public.platform_settings from anon, authenticated;
grant select on public.platform_settings to anon, authenticated;
grant insert, update, delete on public.platform_settings to authenticated; -- RLS: platform only

select app.attach_updated_at('public.platform_settings');
select app.attach_audit('public.platform_settings');

-- ---------------------------------------------------------------------
-- 2. plan_limits — documentation only; the seed rewrite (chore/foundation)
--    already supplies `ai_actions_per_month` rows (D-39). Nothing to
--    rename or insert here.
-- ---------------------------------------------------------------------
comment on table public.plan_limits is
  'Quotas as key/value: max_teachers (NULL on every plan in the current '
  'matrix — unlimited), max_students, storage_gb, ai_actions_per_month, '
  'max_sections. A NULL value_int means UNLIMITED — which is why the '
  'column is nullable instead of defaulted. Adding a new quota is a row, '
  'not a migration. ai_actions_per_month (D-39, supersedes the old '
  'ai_credits_per_day) is a pooled, hard-capped MONTHLY allowance read '
  'against usage_counters (workspace_id, ''ai_actions_per_month'', '
  '''YYYY-MM'') — placeholder figures, owner-editable in /platform.';

-- ---------------------------------------------------------------------
-- 3. plan_modules — `fees` is Starter and above (D-31)
-- ---------------------------------------------------------------------
insert into public.plan_modules (plan_id, module)
select p.id, 'fees'
from public.plans p
where p.code in ('starter', 'pro', 'enterprise')
on conflict (plan_id, module) do nothing;

-- Free and personal_free deliberately get no `fees` row: F-CM-06 §3.3 —
-- the nav item still renders (locked, with an upgrade prompt), which is a
-- UI concern; the entitlement half is simply absent here.

-- ---------------------------------------------------------------------
-- 4. app.workspace_plan — the plan row a workspace is entitled to
-- ---------------------------------------------------------------------
create or replace function app.workspace_plan(p_workspace_id uuid)
returns public.plans
language sql
stable
security definer
set search_path = ''
as $$
  select p.*
  from public.workspaces w
  join public.plans p on p.id = w.plan_id
  where w.id = p_workspace_id
$$;

comment on function app.workspace_plan(uuid) is
  'The plan a workspace is entitled to, via workspaces.plan_id — the fast '
  'denormalised path (PRODUCT-DECISIONS 1.20), not a join through '
  'subscriptions. Definer because plan_limits/plan_modules lookups run for '
  'every member, not only owner/admin.';

-- ---------------------------------------------------------------------
-- 5. app.within_limit — the read-side check the limits engine calls
-- ---------------------------------------------------------------------
create or replace function app.within_limit(
  p_workspace_id uuid,
  p_key          text,
  p_delta        integer default 1,
  p_period       text default 'all')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- No limit row for this key on this plan, or an explicit NULL, both
    -- mean unlimited (plan_limits' own convention) — adding a limit later
    -- is a row, not a migration, so an ungated key must default open.
    when l.value_int is null then true
    else coalesce(u.value, 0) + p_delta <= l.value_int
  end
  from public.workspaces w
  left join public.plan_limits l
    on l.plan_id = w.plan_id and l.key = p_key
  left join public.usage_counters u
    on u.workspace_id = w.id and u.key = p_key and u.period = p_period
  where w.id = p_workspace_id
$$;

comment on function app.within_limit(uuid, text, integer, text) is
  'Server-side mirror of packages/domain assertWithinLimit — a belt for '
  'the server-computed-only rule (HANDBOOK §1). p_delta is the amount the '
  'write would ADD (default 1); pass a negative delta for a decrease is '
  'never needed since deletes always reduce a counter within its own '
  'limit. `-1` in plan_limits.value_int is not used in this schema (NULL '
  'is the unlimited sentinel, per plan_limits); callers pass p_period '
  '''all'' for standing counters and ''YYYY-MM'' for ai_actions_per_month.';

do $$
begin
  revoke all on function app.workspace_plan(uuid) from public;
  grant execute on function app.workspace_plan(uuid) to authenticated, service_role;
  revoke all on function app.within_limit(uuid, text, integer, text) from public;
  grant execute on function app.within_limit(uuid, text, integer, text) to authenticated, service_role;
end
$$;

-- ---------------------------------------------------------------------
-- 6. app.set_access_mode — add the permission check 0004 left out
-- ---------------------------------------------------------------------
-- The 0004 definition had no caller check at all: granted to `authenticated`
-- (the blanket app.* grant loop at the end of that migration) with nothing
-- inside the function body stopping any signed-in user from flipping any
-- workspace's access_mode. `create or replace` on the same signature is
-- the forward-only fix (HANDBOOK §1 rule 5 — no edits to applied
-- migrations, but a later migration MAY redefine a function).
create or replace function app.set_access_mode(
  p_workspace_id uuid,
  p_mode         public.access_mode,
  p_reason       text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (app.is_privileged_context() or app.is_platform_admin()) then
    raise exception 'only platform staff or a privileged (service-role) caller may change access_mode'
      using errcode = '42501';
  end if;

  update public.workspaces
     set access_mode        = p_mode,
         access_mode_reason = case when p_mode = 'read_only' then p_reason else null end,
         access_mode_set_at = case when p_mode = 'read_only' then now() else null end
   where id = p_workspace_id;

  perform app.log_audit_event(
    'workspace.access_mode_' || p_mode::text,
    p_workspace_id, 'public.workspaces', p_workspace_id,
    null, jsonb_build_object('reason', p_reason));
end;
$$;

comment on function app.set_access_mode(uuid, public.access_mode, text) is
  'Applied by the trial-expiry and dunning jobs (service role) or by '
  'platform staff overrides; cleared in the SAME transaction as a '
  'successful upgrade payment, so a school is never left paid-but-locked. '
  'Callers outside those two are refused (42501) — this migration adds '
  'that check; 0004''s definition had none.';
