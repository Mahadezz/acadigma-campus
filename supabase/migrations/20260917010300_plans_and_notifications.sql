-- =====================================================================
-- 0004 · plans, pricing, subscriptions, notifications, email log
-- ---------------------------------------------------------------------
-- PRODUCT-DECISIONS 1.11 (notification taxonomy), 1.12 (plan entitlements),
-- 1.20 + 5.1 (plan matrix, placeholder prices), 5.2 (14-day Pro trial),
-- 5.5 (all billing tables carry workspace_id). D-27 (SMS is metered).
-- Money is bigint paisa + currency char(3) (ARCHITECTURE §4).
--
-- Shape note: limits, modules and prices are SEPARATE tables, not columns
-- on `plans`.
--   · `plan_limits`  — a limit is a key/value the domain layer looks up;
--     adding one (say `max_sections`) must not be a schema migration.
--   · `plan_modules` — entitlement is a set, and a set belongs in rows.
--   · `plan_prices`  — pricing is feature tier x student band, so a plan has
--     many prices, each with a range. Columns would force one plan row per
--     band and duplicate every limit and module alongside it.
--
-- The pricing model is still being decided: base-by-band versus a pure band
-- ladder with per-student overage. The schema expresses BOTH, so the debate
-- round changes seed values rather than the schema.
-- `overage_per_student_paisa = 0` is a pure ladder.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type public.subscription_status as enum
    ('trialing', 'active', 'past_due', 'cancelled', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.billing_interval as enum ('monthly', 'yearly');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.email_status as enum
    ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed');
exception when duplicate_object then null; end $$;

-- =====================================================================
-- 2. plans — the catalogue, editable from /platform
-- =====================================================================
create table if not exists public.plans (
  id                      uuid primary key default gen_random_uuid(),
  code                    text not null check (code ~ '^[a-z][a-z0-9_]{1,30}$'),
  name                    text not null,
  tagline                 text,
  description             text,
  sort_order              smallint not null default 0,
  is_public               boolean not null default true,
  is_contact_sales        boolean not null default false,
  currency                char(3) not null default 'BDT',
  setup_fee_paisa         bigint  not null default 0 check (setup_fee_paisa >= 0),
  included_sms_per_month  integer not null default 0 check (included_sms_per_month >= 0),
  trial_days              smallint not null default 0 check (trial_days between 0 and 90),
  features                jsonb   not null default '{}'::jsonb,
  status                  text    not null default 'active' check (status in ('active', 'archived')),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.plans is
  'Plan matrix (PRODUCT-DECISIONS 5.1). NOT tenant-scoped — a global '
  'catalogue. Prices live in plan_prices, quotas in plan_limits, '
  'entitlements in plan_modules. Everything seeded here is a PLACEHOLDER '
  'the owner is expected to edit from /platform before launch.';
comment on column public.plans.setup_fee_paisa is
  'One-time onboarding fee charged with the first invoice. 0 for self-serve '
  'plans; used for Enterprise migration and data import.';
comment on column public.plans.included_sms_per_month is
  'SMS is metered pass-through (D-27). This is the monthly allowance; usage '
  'beyond it bills at platform_settings.sms_unit_price_paisa and is tracked '
  'in usage_counters under key `sms_sent`.';

create unique index if not exists plans_code_key on public.plans (code);
-- justification: `code` is the stable identifier used by the seed, the trial
-- bootstrap and packages/domain; the UUID id is never hard-coded anywhere.

create index if not exists plans_public_idx
  on public.plans (sort_order) where status = 'active' and is_public;
-- justification: the /pricing page reads exactly this slice, in this order.

do $$ begin
  alter table public.workspaces
    add constraint workspaces_plan_id_fkey
    foreign key (plan_id) references public.plans (id) on delete restrict;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2.1 plan_limits — one row per quota
-- ---------------------------------------------------------------------
create table if not exists public.plan_limits (
  plan_id   uuid not null references public.plans (id) on delete cascade,
  key       text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  value_int integer check (value_int is null or value_int >= 0),
  primary key (plan_id, key)
);

comment on table public.plan_limits is
  'Quotas as key/value: max_teachers, max_students, storage_gb, '
  'ai_credits_per_day, max_sections. A NULL value_int means UNLIMITED — '
  'which is why the column is nullable instead of defaulted. Adding a new '
  'quota is a row, not a migration.';
-- PK only: a plan's limits are always read as a whole set.

-- ---------------------------------------------------------------------
-- 2.2 plan_modules — the entitlement set
-- ---------------------------------------------------------------------
create table if not exists public.plan_modules (
  plan_id    uuid not null references public.plans (id) on delete cascade,
  module     text not null check (module ~ '^[a-z][a-z0-9_]{1,40}$'),
  is_enabled boolean not null default true,
  primary key (plan_id, module)
);

comment on table public.plan_modules is
  'What a plan unlocks. Nav = module enabled by the plan AND not in '
  'workspaces.hidden_modules AND role-allowed (PRODUCT-DECISIONS 1.12).';

-- ---------------------------------------------------------------------
-- 2.3 plan_prices — feature tier x student band, with optional overage
-- ---------------------------------------------------------------------
create table if not exists public.plan_prices (
  id                        uuid primary key default gen_random_uuid(),
  plan_id                   uuid not null references public.plans (id) on delete cascade,
  student_min               integer not null default 0 check (student_min >= 0),
  student_max               integer check (student_max is null or student_max >= student_min),
  monthly_paisa             bigint  not null check (monthly_paisa >= 0),
  yearly_paisa              bigint  not null check (yearly_paisa  >= 0),
  overage_per_student_paisa bigint  not null default 0 check (overage_per_student_paisa >= 0),
  currency                  char(3) not null default 'BDT',
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint plan_prices_band_no_overlap
    exclude using gist (
      plan_id with =,
      int4range(student_min, coalesce(student_max, 2147483647), '[]') with &&
    )
);

comment on table public.plan_prices is
  'A school pays for its feature tier AND its size. Bands are inclusive at '
  'both ends; student_max NULL means "and above". The exclusion constraint '
  'makes overlapping bands impossible, so band lookup is unambiguous by '
  'construction — there is no "first match wins" rule left to get wrong.';
comment on column public.plan_prices.overage_per_student_paisa is
  'Charged per student above student_min, on top of monthly_paisa. 0 turns '
  'the model into a pure band ladder, so both pricing proposals are '
  'expressible without a schema change.';

create index if not exists plan_prices_lookup_idx
  on public.plan_prices (plan_id, student_min);
-- justification: the lookup is "this plan, the band containing N students",
-- which scans forward from student_min. The GiST exclusion index enforces
-- the invariant but cannot serve that ordering as cheaply.

-- ---------------------------------------------------------------------
-- 2.4 The placeholder catalogue (PRODUCT-DECISIONS 5.1)
--     `do nothing` on conflict: a re-run must never overwrite what the
--     owner has since edited from /platform.
-- ---------------------------------------------------------------------
insert into public.plans
  (code, name, tagline, sort_order, is_public, is_contact_sales, currency,
   trial_days, included_sms_per_month)
values
  ('personal_free', 'Personal',   'Your own teaching workspace', 5,  false, false, 'BDT',  0,    0),
  ('free',          'Free',       'Get a school online',         10, true,  false, 'BDT',  0,    0),
  ('starter',       'Starter',    'For a growing school',        20, true,  false, 'BDT',  0,  200),
  ('pro',           'Pro',        'The full operations suite',   30, true,  false, 'BDT', 14, 1000),
  ('enterprise',    'Enterprise', 'Contact us',                  40, true,  true,  'BDT',  0, 5000)
on conflict (code) do nothing;

-- limits ---------------------------------------------------------------
insert into public.plan_limits (plan_id, key, value_int)
select p.id, l.key, l.value_int
from public.plans p
join (values
  -- a personal workspace is entitled, but not to a school's shape
  ('personal_free', 'max_teachers',         1),
  ('personal_free', 'max_students',        60),
  ('personal_free', 'storage_gb',           1),
  ('personal_free', 'ai_credits_per_day',  10),

  ('free',          'max_teachers',         5),
  ('free',          'max_students',       150),
  ('free',          'storage_gb',           1),
  ('free',          'ai_credits_per_day',  20),

  ('starter',       'max_teachers',        20),
  ('starter',       'max_students',       600),
  ('starter',       'storage_gb',          10),
  ('starter',       'ai_credits_per_day', 100),

  ('pro',           'max_teachers',        75),
  ('pro',           'max_students',      2500),
  ('pro',           'storage_gb',          50),
  ('pro',           'ai_credits_per_day', 400),

  -- NULL = unlimited
  ('enterprise',    'max_teachers',      null),
  ('enterprise',    'max_students',      null),
  ('enterprise',    'storage_gb',         250),
  ('enterprise',    'ai_credits_per_day',1500)
) as l(code, key, value_int) on l.code = p.code
on conflict (plan_id, key) do nothing;

-- modules --------------------------------------------------------------
insert into public.plan_modules (plan_id, module)
select p.id, m.module
from public.plans p
join (values
  ('personal_free', 'lessons'), ('personal_free', 'resources'), ('personal_free', 'attendance'),

  ('free', 'academics'), ('free', 'attendance'), ('free', 'lessons'), ('free', 'messaging'),

  ('starter', 'academics'), ('starter', 'attendance'), ('starter', 'lessons'),
  ('starter', 'messaging'), ('starter', 'resources'), ('starter', 'reports'), ('starter', 'print'),

  ('pro', 'academics'), ('pro', 'attendance'), ('pro', 'lessons'), ('pro', 'messaging'),
  ('pro', 'resources'), ('pro', 'reports'), ('pro', 'print'),
  ('pro', 'hiring'), ('pro', 'cover'), ('pro', 'analytics'),
  ('pro', 'marketplace_school_funded'), ('pro', 'custom_labels'),

  ('enterprise', 'academics'), ('enterprise', 'attendance'), ('enterprise', 'lessons'),
  ('enterprise', 'messaging'), ('enterprise', 'resources'), ('enterprise', 'reports'),
  ('enterprise', 'print'), ('enterprise', 'hiring'), ('enterprise', 'cover'),
  ('enterprise', 'analytics'), ('enterprise', 'marketplace_school_funded'),
  ('enterprise', 'custom_labels'), ('enterprise', 'priority_support')
) as m(code, module) on m.code = p.code
on conflict (plan_id, module) do nothing;

-- prices ---------------------------------------------------------------
-- The owner-approved anchors — Starter Tk 2,999 and Pro Tk 7,999 — are the
-- 0-300 student band. Bands step up from there. Yearly = 10x monthly.
-- Overage is seeded at 0 (pure ladder) pending the pricing debate round.
-- Every number here is a PLACEHOLDER; /platform is the editor.
insert into public.plan_prices
  (plan_id, student_min, student_max, monthly_paisa, yearly_paisa, overage_per_student_paisa)
select p.id, b.student_min, b.student_max, b.monthly_paisa, b.yearly_paisa, b.overage
from public.plans p
join (values
  ('personal_free', 0,    null,       0::bigint,        0::bigint, 0::bigint),
  ('free',          0,    150,        0::bigint,        0::bigint, 0::bigint),

  ('starter',       0,    300,   299900::bigint,  2999000::bigint, 0::bigint),
  ('starter',       301,  600,   449900::bigint,  4499000::bigint, 0::bigint),

  ('pro',           0,    300,   799900::bigint,  7999000::bigint, 0::bigint),
  ('pro',           301,  800,  1199900::bigint, 11999000::bigint, 0::bigint),
  ('pro',           801, 1500,  1699900::bigint, 16999000::bigint, 0::bigint),
  ('pro',          1501, 2500,  2299900::bigint, 22999000::bigint, 0::bigint),

  ('enterprise',    0,   null,        0::bigint,        0::bigint, 0::bigint)
) as b(code, student_min, student_max, monthly_paisa, yearly_paisa, overage) on b.code = p.code
where not exists (select 1 from public.plan_prices pp where pp.plan_id = p.id);

-- =====================================================================
-- 3. subscriptions
-- =====================================================================
create table if not exists public.subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  workspace_id              uuid not null references public.workspaces (id) on delete cascade,
  plan_id                   uuid not null references public.plans (id) on delete restrict,
  plan_price_id             uuid references public.plan_prices (id) on delete restrict,
  status                    public.subscription_status not null default 'trialing',
  billing_interval          public.billing_interval not null default 'monthly',
  currency                  char(3) not null default 'BDT',
  amount_paisa              bigint  not null default 0 check (amount_paisa >= 0),
  student_band_snapshot     int4range,
  student_count_snapshot    integer check (student_count_snapshot is null or student_count_snapshot >= 0),
  current_period_start      date,
  current_period_end        date,
  trial_ends_at             timestamptz,
  cancel_at                 timestamptz,
  cancelled_at              timestamptz,
  grace_until               timestamptz,
  provider                  text not null default 'sslcommerz',
  provider_customer_ref     text,
  provider_subscription_ref text,
  auto_renew                boolean not null default true,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                uuid references public.profiles (id) on delete set null,
  constraint subscriptions_period_ordered
    check (current_period_end is null or current_period_start is null
           or current_period_end >= current_period_start)
);

comment on table public.subscriptions is
  'Billing state. workspaces.plan_id remains the single source of "what am I '
  'entitled to"; this holds status, period, price and provider refs '
  '(PRODUCT-DECISIONS 1.20). Only school workspaces get a row (5.5).';
comment on column public.subscriptions.student_band_snapshot is
  'The plan_prices band this subscription was priced into, frozen at signup '
  'or renewal. A school that grows past its band is re-priced at the NEXT '
  'renewal, with notice — never silently mid-period. Without this snapshot, '
  'editing plan_prices from /platform would retroactively change live bills.';
comment on column public.subscriptions.grace_until is
  'At trial or period expiry the workspace falls back to Free and goes '
  'read-only over the Free limits — data is never deleted (5.2).';

create unique index if not exists subscriptions_one_live_per_workspace
  on public.subscriptions (workspace_id)
  where status in ('trialing', 'active', 'past_due');
-- justification: one live subscription per workspace; cancelled and expired
-- rows remain as history.

create index if not exists subscriptions_workspace_idx
  on public.subscriptions (workspace_id, created_at desc);
-- justification: RLS policy column + the billing screen's history list.

create index if not exists subscriptions_renewal_idx
  on public.subscriptions (current_period_end)
  where status in ('trialing', 'active', 'past_due');
-- justification: the nightly renewal/expiry job scans live rows by date.

create index if not exists subscriptions_plan_idx on public.subscriptions (plan_id);
-- justification: FK column; "how many schools on Pro" on /platform.

create unique index if not exists subscriptions_provider_ref_key
  on public.subscriptions (provider, provider_subscription_ref)
  where provider_subscription_ref is not null;
-- justification: IPN handlers resolve a subscription from the provider ref
-- and must never match two rows.

-- ---------------------------------------------------------------------
-- 3.1 subscription_events — the billing state-machine trail
-- ---------------------------------------------------------------------
create table if not exists public.subscription_events (
  id               bigint generated always as identity primary key,
  subscription_id  uuid not null references public.subscriptions (id) on delete cascade,
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  type             text not null,
  from_status      public.subscription_status,
  to_status        public.subscription_status,
  amount_paisa     bigint,
  data             jsonb not null default '{}'::jsonb,
  inbound_event_id bigint,
  actor_id         uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now()
);

comment on table public.subscription_events is
  'Every transition: trial_started, checkout_completed, renewed, '
  'payment_failed, downgraded, read_only_applied, cancelled, reactivated. '
  'Reconstructs why a school is on the plan it is on without reading the '
  'provider dashboard. inbound_event_id points at the app.inbound_events row '
  'that caused it — deliberately no FK, because app.inbound_events lives '
  'outside the exposed schema and this table lives inside it.';

create index if not exists subscription_events_subscription_idx
  on public.subscription_events (subscription_id, created_at desc);
-- justification: the only read pattern — one subscription's timeline.

create index if not exists subscription_events_workspace_idx
  on public.subscription_events (workspace_id, created_at desc);
-- justification: RLS policy column + the /platform account view.

-- ---------------------------------------------------------------------
-- 3.2 usage_counters — measured usage, compared against plan_limits
-- ---------------------------------------------------------------------
create table if not exists public.usage_counters (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  key          text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  period       text not null default 'all',
  value        bigint not null default 0 check (value >= 0),
  limit_hit_at timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, key, period)
);

comment on table public.usage_counters is
  'What a workspace is actually using: teacher_count, student_count, '
  'storage_bytes, ai_credits_today, sms_sent. `period` is ''all'' for '
  'standing counters and YYYY-MM-DD / YYYY-MM for windowed ones. Maintained '
  'by triggers and jobs, never by the client. Exists so a limit check is one '
  'indexed lookup instead of a COUNT over students and a SUM over files on '
  'every single request.';

create index if not exists usage_counters_limit_hit_idx
  on public.usage_counters (limit_hit_at) where limit_hit_at is not null;
-- justification: the "you are over your plan" nudge job scans only breaches.

-- ---------------------------------------------------------------------
-- 3.3 Bootstrap: personal -> personal_free (NO subscription row);
--     school -> 14 days of Pro, no card (PRODUCT-DECISIONS 5.2)
-- ---------------------------------------------------------------------
create or replace function app.tg_workspace_billing_bootstrap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan  public.plans;
  v_price public.plan_prices;
  v_sub   uuid;
begin
  if new.type <> 'school' then
    -- A personal workspace is entitled through workspaces.plan_id alone.
    -- It gets NO subscriptions row: there is nothing to bill, and an empty
    -- "subscription" would show up in every billing report and MRR figure.
    select * into v_plan from public.plans p where p.code = 'personal_free';
    if found then
      update public.workspaces set plan_id = v_plan.id where id = new.id;
    end if;
    return new;
  end if;

  select * into v_plan from public.plans p where p.code = 'pro';
  if not found then
    return new;
  end if;

  select * into v_price
    from public.plan_prices pp
   where pp.plan_id = v_plan.id
     and pp.student_min <= 0
     and (pp.student_max is null or pp.student_max >= 0)
   limit 1;

  update public.workspaces
     set plan_id = v_plan.id,
         trial_ends_at = now() + make_interval(days => v_plan.trial_days)
   where id = new.id;

  insert into public.subscriptions
    (workspace_id, plan_id, plan_price_id, status, billing_interval, currency,
     amount_paisa, student_band_snapshot, student_count_snapshot,
     trial_ends_at, current_period_start, current_period_end, created_by)
  values
    (new.id, v_plan.id, v_price.id, 'trialing', 'monthly', v_plan.currency,
     0,
     int4range(coalesce(v_price.student_min, 0),
               coalesce(v_price.student_max, 2147483647), '[]'),
     0,
     now() + make_interval(days => v_plan.trial_days),
     (now() at time zone 'Asia/Dhaka')::date,
     ((now() at time zone 'Asia/Dhaka') + make_interval(days => v_plan.trial_days))::date,
     new.owner_id)
  returning id into v_sub;

  insert into public.subscription_events
    (subscription_id, workspace_id, type, to_status, actor_id)
  values (v_sub, new.id, 'trial_started', 'trialing', new.owner_id);

  return new;
end;
$$;

drop trigger if exists workspace_billing_bootstrap on public.workspaces;
create trigger workspace_billing_bootstrap
  after insert on public.workspaces
  for each row execute function app.tg_workspace_billing_bootstrap();

-- ---------------------------------------------------------------------
-- 3.4 Read-only mode (WF-07)
--     A billing state, not a security boundary: server actions check
--     workspaces.access_mode before any write and return PLAN_READ_ONLY.
--     RLS deliberately does NOT enforce it — an over-quota school must
--     still be able to read, export and pay, and encoding a billing state
--     into every policy would be both slow and the wrong place to get it
--     wrong.
-- ---------------------------------------------------------------------
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
  'Applied by the trial-expiry and dunning jobs; cleared in the SAME '
  'transaction as a successful upgrade payment, so a school is never left '
  'paid-but-locked.';

-- =====================================================================
-- 4. notifications
-- =====================================================================
create table if not exists public.notifications (
  id           bigint generated always as identity primary key,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete set null,
  event_type   text not null check (event_type ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  category     text generated always as (split_part(event_type, '.', 1)) stored,
  title        text not null,
  body         text,
  action_url   text not null,
  data         jsonb not null default '{}'::jsonb,
  priority     smallint not null default 100,
  read_at      timestamptz,
  archived_at  timestamptz,
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);

comment on table public.notifications is
  'Event-typed notifications (PRODUCT-DECISIONS 1.11): attendance.low, '
  'exam.reminder, print.ready, marketplace.sale, invite.received, ... '
  '`category` is DERIVED from event_type, never stored independently. '
  'Every notification carries an action_url — a NOT NULL constraint, not a '
  'convention.';
comment on column public.notifications.workspace_id is
  'NULLABLE. Account-level and platform-level events — a payout paid, KYC '
  'approved, a new device signed in — belong to a person, not a tenant, and '
  'inventing a workspace for them would be a lie in every report.';

create index if not exists notifications_inbox_idx
  on public.notifications (recipient_id, created_at desc)
  where archived_at is null;
-- justification: the notification sheet, newest-first, per recipient —
-- recipient_id is also the RLS policy column, so one index serves both.

create index if not exists notifications_unread_idx
  on public.notifications (recipient_id)
  where read_at is null and archived_at is null;
-- justification: the unread badge is a COUNT on every page load; unread rows
-- are a small minority, so this stays tiny and index-only.

create index if not exists notifications_workspace_idx
  on public.notifications (workspace_id, created_at desc) where workspace_id is not null;
-- justification: per-school delivery reporting on /platform.

create index if not exists notifications_expiry_idx
  on public.notifications (expires_at) where expires_at is not null;
-- justification: the cleanup job scans only rows that can expire.

create or replace function app.notify(
  p_recipient_id uuid,
  p_event_type   text,
  p_title        text,
  p_action_url   text,
  p_body         text default null,
  p_workspace_id uuid default null,
  p_data         jsonb default '{}'::jsonb,
  p_expires_at   timestamptz default null)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.notifications
    (workspace_id, recipient_id, actor_id, event_type, title, body, action_url, data, expires_at)
  values
    (p_workspace_id, p_recipient_id, auth.uid(), p_event_type, p_title, p_body,
     p_action_url, coalesce(p_data, '{}'::jsonb), p_expires_at)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function app.tg_notifications_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.is_privileged_context() then
    return new;
  end if;
  if new.workspace_id is distinct from old.workspace_id
     or new.recipient_id is distinct from old.recipient_id
     or new.event_type   is distinct from old.event_type
     or new.title        is distinct from old.title
     or new.body         is distinct from old.body
     or new.action_url   is distinct from old.action_url
     or new.data         is distinct from old.data then
    raise exception 'only read_at and archived_at may be updated on a notification'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_guard on public.notifications;
create trigger notifications_guard
  before update on public.notifications
  for each row execute function app.tg_notifications_guard();

-- Realtime (ARCHITECTURE §5). Guarded: the publication does not exist in the
-- plain Postgres used for CI.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications')
    then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
end
$$;

-- =====================================================================
-- 5. email_log
-- =====================================================================
create table if not exists public.email_log (
  id                  bigint generated always as identity primary key,
  workspace_id        uuid,     -- FK-free: history outlives the workspace
  to_email            text not null check (to_email = lower(to_email)),
  from_email          text not null check (from_email = lower(from_email)),
  reply_to            text,
  subject             text not null,
  template            text not null,
  provider            text not null default 'resend',
  provider_message_id text,
  status              public.email_status not null default 'queued',
  error               text,
  related_table       text,
  related_row_id      uuid,
  correlation_id      uuid,
  sent_at             timestamptz,
  delivered_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.email_log is
  'Every transactional send (ARCHITECTURE §5). Bodies are NOT stored — only '
  'the template name and the routing metadata. Retained 1 year.';

create unique index if not exists email_log_provider_message_key
  on public.email_log (provider, provider_message_id)
  where provider_message_id is not null;
-- justification: the Resend webhook resolves a row by message id, and
-- redelivery must not create duplicates.

create index if not exists email_log_workspace_idx
  on public.email_log (workspace_id, created_at desc) where workspace_id is not null;
-- justification: RLS policy column + "did the invitation actually send?".

create index if not exists email_log_recipient_idx
  on public.email_log (to_email, created_at desc);
-- justification: support answering "I never got the email".

create index if not exists email_log_retry_idx
  on public.email_log (created_at) where status in ('queued', 'failed');
-- justification: the retry sweeper scans only unfinished sends.

-- =====================================================================
-- 6. RLS
-- =====================================================================
alter table public.plans               enable row level security;
alter table public.plan_limits         enable row level security;
alter table public.plan_modules        enable row level security;
alter table public.plan_prices         enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.subscription_events enable row level security;
alter table public.usage_counters      enable row level security;
alter table public.notifications       enable row level security;
alter table public.email_log           enable row level security;

-- ---- catalogue: world-readable when public, platform-writable ---------
drop policy if exists plans_select_public on public.plans;
create policy plans_select_public on public.plans
  for select to anon, authenticated
  using (status = 'active' and is_public);
-- /pricing is a public marketing page; this policy calls no helper, so anon
-- never needs USAGE on the app schema.

drop policy if exists plans_select_platform on public.plans;
create policy plans_select_platform on public.plans
  for select to authenticated using ((select app.is_platform_admin()));

drop policy if exists plans_write_platform on public.plans;
create policy plans_write_platform on public.plans
  for all to authenticated
  using ((select app.is_platform_admin()))
  with check ((select app.is_platform_admin()));

drop policy if exists plan_limits_select on public.plan_limits;
create policy plan_limits_select on public.plan_limits
  for select to anon, authenticated using (true);

drop policy if exists plan_limits_write_platform on public.plan_limits;
create policy plan_limits_write_platform on public.plan_limits
  for all to authenticated
  using ((select app.is_platform_admin()))
  with check ((select app.is_platform_admin()));

drop policy if exists plan_modules_select on public.plan_modules;
create policy plan_modules_select on public.plan_modules
  for select to anon, authenticated using (true);

drop policy if exists plan_modules_write_platform on public.plan_modules;
create policy plan_modules_write_platform on public.plan_modules
  for all to authenticated
  using ((select app.is_platform_admin()))
  with check ((select app.is_platform_admin()));

drop policy if exists plan_prices_select on public.plan_prices;
create policy plan_prices_select on public.plan_prices
  for select to anon, authenticated using (true);
-- Prices are published information — the /pricing calculator reads them
-- directly. Nothing sensitive lives here.

drop policy if exists plan_prices_write_platform on public.plan_prices;
create policy plan_prices_write_platform on public.plan_prices
  for all to authenticated
  using ((select app.is_platform_admin()))
  with check ((select app.is_platform_admin()));

-- ---- subscriptions ---------------------------------------------------
drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (
    app.has_role(workspace_id, array['owner', 'admin'])
    or (select app.is_platform_admin())
  );

drop policy if exists subscriptions_write_platform on public.subscriptions;
create policy subscriptions_write_platform on public.subscriptions
  for all to authenticated
  using ((select app.is_platform_admin()))
  with check ((select app.is_platform_admin()));
-- Tenants have NO insert/update policy, on purpose. Plan changes, cancels
-- and renewals are written by the checkout flow and the IPN handler after a
-- validated provider event — never straight from the browser. This is the
-- fix for "SchoolSubscription has no RLS — plan/status client-writable".

drop policy if exists subscription_events_select on public.subscription_events;
create policy subscription_events_select on public.subscription_events
  for select to authenticated
  using (
    app.has_role(workspace_id, array['owner', 'admin'])
    or (select app.is_platform_admin())
  );
-- No write policy: rows come from the billing flow and the IPN handler.

-- ---- usage_counters --------------------------------------------------
drop policy if exists usage_counters_select on public.usage_counters;
create policy usage_counters_select on public.usage_counters
  for select to authenticated
  using (
    app.member_role(workspace_id) is not null
    or (select app.is_platform_admin())
  );
-- Readable by every member: the storage and AI-credit meters are shown to
-- teachers, not only admins. No write policy — triggers and jobs maintain it.

-- ---- notifications ---------------------------------------------------
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated using (recipient_id = (select auth.uid()));

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete to authenticated using (recipient_id = (select auth.uid()));
-- No INSERT policy: rows come from app.notify() only.

-- ---- email_log -------------------------------------------------------
drop policy if exists email_log_select on public.email_log;
create policy email_log_select on public.email_log
  for select to authenticated
  using (
    (workspace_id is not null and app.has_role(workspace_id, array['owner', 'admin']))
    or (select app.is_platform_admin())
  );
-- No write policies: the email adapter writes with the service role.

-- =====================================================================
-- 7. Triggers
-- =====================================================================
select app.attach_updated_at('public.plans');
select app.attach_updated_at('public.plan_prices');
select app.attach_updated_at('public.subscriptions');
select app.attach_updated_at('public.email_log');
select app.attach_freeze_workspace('public.subscriptions');

select app.attach_audit('public.plans');
select app.attach_audit('public.plan_prices');
select app.attach_audit('public.plan_limits');
select app.attach_audit('public.plan_modules');
select app.attach_audit('public.subscriptions',
                        array['provider_customer_ref', 'provider_subscription_ref']);

-- =====================================================================
-- 8. Grants
-- =====================================================================
revoke all on public.plans, public.plan_limits, public.plan_modules,
              public.plan_prices, public.subscriptions,
              public.subscription_events, public.usage_counters,
              public.notifications, public.email_log
  from anon, authenticated;

grant select on public.plans, public.plan_limits, public.plan_modules, public.plan_prices
  to anon, authenticated;
grant insert, update, delete on public.plans, public.plan_limits,
                                public.plan_modules, public.plan_prices
  to authenticated;                                   -- RLS: platform staff only

grant select on public.subscriptions to authenticated;
grant insert, update, delete on public.subscriptions to authenticated;  -- RLS: platform only
grant select on public.subscription_events to authenticated;
grant select on public.usage_counters to authenticated;
grant select, update, delete on public.notifications to authenticated;
grant select on public.email_log to authenticated;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app'
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end
$$;
