-- =====================================================================
-- 0002 · identity & tenancy
-- profiles · workspaces · school_profiles · workspace_members ·
-- workspace_invitations · custom_labels · user_preferences ·
-- device_registrations
-- ---------------------------------------------------------------------
-- PRODUCT-DECISIONS §1 is binding here. In particular:
--   1.2  exactly one personal workspace per user, created at registration
--   1.5  roles are owner|admin|teacher|staff|parent; no superadmin
--   1.6  the tenant key is `workspace_id`, everywhere, no exceptions
--   1.7  workspaces and school_profiles are separate tables
--   1.14 membership rows are never deleted; status drives access
--   1.21 profiles.is_platform_admin grants /platform only
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type public.workspace_type as enum ('school', 'personal');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.workspace_status as enum ('active', 'suspended', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.access_mode as enum ('normal', 'read_only');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.member_role as enum ('owner', 'admin', 'teacher', 'staff', 'parent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.member_status as enum ('pending', 'active', 'removed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invitation_channel as enum ('email', 'phone');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invitation_status as enum ('pending', 'accepted', 'declined', 'expired', 'revoked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ai_billing_model as enum ('shared_pool', 'individual_allocation');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.device_platform as enum ('web', 'android', 'windows', 'ios');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. profiles — 1:1 with auth.users
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                       uuid primary key references auth.users (id) on delete cascade,
  full_name                text        not null default '',
  display_name             text,
  email                    text        check (email is null or email = lower(email)),
  phone                    text,
  avatar_url               text,
  bio                      text,
  date_of_birth            date        check (date_of_birth is null
                                              or date_of_birth between '1900-01-01' and '2100-01-01'),
  locale                   text        not null default 'en' check (locale in ('en', 'bn')),
  is_platform_admin        boolean     not null default false,
  onboarding_completed_at  timestamptz,
  suspended_at             timestamptz,
  last_seen_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.profiles is
  'Public identity for an auth.users row. NOT tenant-scoped: a person exists '
  'independently of any workspace.';
comment on column public.profiles.date_of_birth is
  'Collected only where a legal threshold depends on it: seller onboarding '
  'and external job applications both require 18+. Read through '
  'app.is_adult(), never compared inline, so the rule lives in one place. '
  'Not collected during ordinary teacher signup.';
comment on column public.profiles.is_platform_admin is
  'Platform staff (PRODUCT-DECISIONS 1.21). Grants /platform only, never '
  'workspace membership. Only another platform admin can set it.';

create unique index if not exists profiles_email_key
  on public.profiles (email) where email is not null;
-- justification: invitations and "invite an existing teacher" resolve a
-- person by email; also guarantees one profile per address.

create index if not exists profiles_platform_admin_idx
  on public.profiles (id) where is_platform_admin;
-- justification: app.is_platform_admin() is called by nearly every platform
-- policy; a tiny partial index keeps that lookup index-only.

-- ---------------------------------------------------------------------
-- 3. workspaces — the tenant
-- ---------------------------------------------------------------------
create table if not exists public.workspaces (
  id                      uuid primary key default gen_random_uuid(),
  type                    public.workspace_type   not null,
  name                    text                    not null check (length(btrim(name)) between 1 and 160),
  slug                    text                    not null check (slug = lower(slug) and slug ~ '^[a-z0-9][a-z0-9-]{1,78}$'),
  owner_id                uuid                    not null references public.profiles (id) on delete restrict,
  status                  public.workspace_status not null default 'active',
  access_mode             public.access_mode      not null default 'normal',
  access_mode_reason      text,
  access_mode_set_at      timestamptz,
  plan_id                 uuid,                   -- FK added in 0004 (plans)
  trial_ends_at           timestamptz,
  invite_code             text,                   -- school workspaces only
  invite_code_rotated_at  timestamptz,
  logo_url                text,
  hidden_modules          text[]                  not null default '{}',
  settings                jsonb                   not null default '{}'::jsonb,
  created_at              timestamptz             not null default now(),
  updated_at              timestamptz             not null default now(),
  created_by              uuid references public.profiles (id) on delete set null,
  constraint workspaces_invite_code_school_only
    check (invite_code is null or type = 'school')
);

comment on table public.workspaces is
  'One tenant. type=school -> /app shell + school_profiles; type=personal -> '
  '/personal shell (PRODUCT-DECISIONS 1.1, 1.7).';
comment on column public.workspaces.access_mode is
  'Read-only mode is WORKSPACE-level, not member-level (WF-07). Server '
  'actions check it before any write and return PLAN_READ_ONLY. RLS does '
  'NOT enforce it: it is a billing state, not a security boundary, and an '
  'over-quota school must still be able to read, export and pay. Set by the '
  'trial-expiry and dunning jobs; cleared in the same transaction as a '
  'successful upgrade payment.';
comment on column public.workspaces.hidden_modules is
  'Modules the owner has hidden even though the plan enables them '
  '(PRODUCT-DECISIONS 1.12). Nav = enabled AND visible AND role-allowed.';

create unique index if not exists workspaces_slug_key on public.workspaces (slug);
create unique index if not exists workspaces_invite_code_key
  on public.workspaces (invite_code) where invite_code is not null;
-- justification: join-by-code looks a workspace up by code on every attempt;
-- unique prevents two schools sharing a code.

create index if not exists workspaces_owner_idx on public.workspaces (owner_id);
-- justification: FK column; "workspaces I own" and ownership-transfer checks.

create index if not exists workspaces_plan_idx on public.workspaces (plan_id) where plan_id is not null;
-- justification: FK column (added in 0004); /platform "who is on which plan".

create index if not exists workspaces_trial_idx
  on public.workspaces (trial_ends_at) where trial_ends_at is not null and status = 'active';
-- justification: the nightly trial-expiry job scans only live trials.

-- profiles -> workspaces back-reference (circular FK, so added after both
-- tables exist). UX hint ONLY: never an input to an authorization decision.
alter table public.profiles
  add column if not exists last_active_workspace_id uuid
    references public.workspaces (id) on delete set null;

comment on column public.profiles.last_active_workspace_id is
  'Remembers which workspace to open after login. NEVER used by RLS or by '
  'any policy — that was the Base44 root cause (client-writable tenant key).';

-- ---------------------------------------------------------------------
-- 4. school_profiles — 1:1 with workspaces where type = 'school'
-- ---------------------------------------------------------------------
create table if not exists public.school_profiles (
  workspace_id               uuid primary key references public.workspaces (id) on delete cascade,
  legal_name                 text,
  eiin                       text,
  board                      text        not null default 'BD National',
  school_type                text,
  medium                     text        not null default 'Bangla',
  address_line1              text,
  address_line2              text,
  city                       text        not null default 'Dhaka',
  district                   text,
  postal_code                text,
  country                    char(2)     not null default 'BD',
  contact_email              text        check (contact_email is null or contact_email = lower(contact_email)),
  contact_phone              text,
  website                    text,
  motto                      text,
  timezone                   text        not null default 'Asia/Dhaka',
  working_days               smallint[]  not null default '{6,7,1,2,3,4}'::smallint[],
  date_format                text        not null default 'DD/MM/YYYY',
  currency                   char(3)     not null default 'BDT',
  bin_number                 text,
  vat_number                 text,
  ai_billing_model           public.ai_billing_model not null default 'shared_pool',

  -- ---- policy blobs (F-OP-02 §11 Q5) --------------------------------
  -- These five are jsonb, NOT typed columns. The schema of record is the
  -- Zod schema in packages/contracts; one resolve() function merges a
  -- school's overrides onto the defaults, so the app has exactly one place
  -- that knows what "unset" means. Typed columns would put that knowledge
  -- in three places (column default, Zod default, UI fallback) and drift.
  attendance_policy          jsonb not null default '{}'::jsonb,
  academic_settings          jsonb not null default '{}'::jsonb,
  cover_policy               jsonb not null default '{}'::jsonb,
  messaging_policy           jsonb not null default '{}'::jsonb,
  branding                   jsonb not null default '{}'::jsonb,

  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint school_profiles_working_days_valid
    check (
      array_length(working_days, 1) between 1 and 7
      and working_days <@ '{1,2,3,4,5,6,7}'::smallint[]
    ),
  constraint school_profiles_policies_are_objects
    check (
      jsonb_typeof(attendance_policy) = 'object'
      and jsonb_typeof(academic_settings) = 'object'
      and jsonb_typeof(cover_policy)      = 'object'
      and jsonb_typeof(messaging_policy)  = 'object'
      and jsonb_typeof(branding)          = 'object'
    )
);

comment on table public.school_profiles is
  'School-only settings, split out of workspaces so personal workspaces do '
  'not carry ~20 irrelevant columns (PRODUCT-DECISIONS 1.7).';
comment on column public.school_profiles.working_days is
  'ISO-8601 day numbers (1=Mon .. 7=Sun). Bangladesh default Sat-Thu = '
  '{6,7,1,2,3,4} (PRODUCT-DECISIONS 2.5).';
comment on column public.school_profiles.timezone is
  'Every "today" in SQL and UI is computed in this zone (ARCHITECTURE §4).';
comment on column public.school_profiles.attendance_policy is
  'Zod: SchoolAttendancePolicy. Keys: cutoff ("09:15"), late_counts_present '
  '(true), half_day_counts_present (true), min_attendance_bp (7500), '
  'block_exam_on_shortfall (false). {} means "all defaults".';
comment on column public.school_profiles.academic_settings is
  'Zod: SchoolAcademicSettings. Keys: grade_scale_code ("BD_GPA5"), '
  'pass_mark_percent (33), fail_any_subject_zero_gpa (true), '
  'rank_by ("gpa_then_total"), exam_weights ({}) (PRODUCT-DECISIONS 2.4).';
comment on column public.school_profiles.cover_policy is
  'Zod: SchoolCoverPolicy. Keys: grace_minutes (30), enable_missed_punch '
  '(false), credit_cover_at_own_rate (true), unpaid_absence_deduction '
  '(false) (PRODUCT-DECISIONS 6.3).';
comment on column public.school_profiles.messaging_policy is
  'Zod: SchoolMessagingPolicy. Keys: parents_can_reply (true), '
  'announcement_roles (["owner","admin"]), quiet_hours ({}).';
comment on column public.school_profiles.branding is
  'Zod: SchoolBranding. Keys: logo_file_id, header_line_1/2, accent, '
  'report_footer. Drives the report/PDF header — never a hardcoded name.';

-- No extra index: workspace_id is the primary key, which is also the tenant
-- key and the only access path.

-- ---------------------------------------------------------------------
-- 5. custom_labels — display titles mapped onto a base role
--    (PRODUCT-DECISIONS 1.4: a label, not a role)
-- ---------------------------------------------------------------------
create table if not exists public.custom_labels (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  base_role    public.member_role not null,
  name         text not null check (length(btrim(name)) between 1 and 60),
  color        text not null default '#3B82F6' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order   smallint not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles (id) on delete set null,
  constraint custom_labels_base_role_not_parent check (base_role <> 'parent')
);

comment on table public.custom_labels is
  'Principal / Vice-Principal / Coordinator are labels over a base role. '
  'Permissions come only from the base role (PRODUCT-DECISIONS 1.4).';

create unique index if not exists custom_labels_workspace_name_key
  on public.custom_labels (workspace_id, lower(name));
-- justification: tenant key + natural key; prevents two "Principal" labels
-- and serves every per-workspace label listing.

-- ---------------------------------------------------------------------
-- 6. workspace_invitations
--    Both invitation paths live here (PRODUCT-DECISIONS 1.3); the
--    invite-code path creates a `pending` membership instead.
-- ---------------------------------------------------------------------
create table if not exists public.workspace_invitations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  channel       public.invitation_channel not null default 'email',
  email         text check (email is null or email = lower(email)),
  phone         text,
  role          public.member_role not null default 'teacher',
  label_id      uuid references public.custom_labels (id) on delete set null,
  token_hash    bytea not null,
  token_prefix  text  not null,
  status        public.invitation_status not null default 'pending',
  message       text check (message is null or length(message) <= 500),
  invited_by    uuid not null references public.profiles (id) on delete restrict,
  accepted_by   uuid references public.profiles (id) on delete set null,
  accepted_at   timestamptz,
  declined_at   timestamptz,
  revoked_at    timestamptz,
  revoked_by    uuid references public.profiles (id) on delete set null,
  expires_at    timestamptz not null default now() + interval '14 days',
  resent_count  smallint not null default 0,
  last_sent_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint workspace_invitations_target_present
    check (email is not null or phone is not null),
  constraint workspace_invitations_channel_matches_target
    check ((channel = 'email' and email is not null)
        or (channel = 'phone' and phone is not null))
);

comment on table public.workspace_invitations is
  'Admin-initiated invitations by email or phone. The raw token is never '
  'stored: token_hash is SHA-256, token_prefix only exists so a redeem can '
  'find the row in one index probe.';

create unique index if not exists workspace_invitations_token_hash_key
  on public.workspace_invitations (token_hash);
-- justification: the redeem path's only lookup; unique prevents collisions.

create index if not exists workspace_invitations_prefix_idx
  on public.workspace_invitations (token_prefix);
-- justification: support/debug lookup without ever handling the raw token.

create unique index if not exists workspace_invitations_pending_email_key
  on public.workspace_invitations (workspace_id, email)
  where status = 'pending' and email is not null;
-- justification: one live invitation per address per workspace; makes
-- "resend" an UPDATE rather than a duplicate row.

create index if not exists workspace_invitations_workspace_status_idx
  on public.workspace_invitations (workspace_id, status, created_at desc);
-- justification: the admin inbox lists pending invitations per workspace;
-- workspace_id is also the RLS policy column.

create index if not exists workspace_invitations_email_pending_idx
  on public.workspace_invitations (email) where status = 'pending';
-- justification: "invitations addressed to me" on the invitee's side, which
-- is the second SELECT policy branch.

create index if not exists workspace_invitations_expiry_idx
  on public.workspace_invitations (expires_at) where status = 'pending';
-- justification: the expiry sweeper scans only live invitations.

-- ---------------------------------------------------------------------
-- 7. workspace_members — the ONLY source of membership
-- ---------------------------------------------------------------------
create table if not exists public.workspace_members (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  role           public.member_role   not null default 'teacher',
  status         public.member_status not null default 'pending',
  label_id       uuid references public.custom_labels (id) on delete set null,
  employee_code  text,
  department     text,
  subjects       text[] not null default '{}',
  phone          text,
  invitation_id  uuid references public.workspace_invitations (id) on delete set null,
  invited_by     uuid references public.profiles (id) on delete set null,
  joined_at      timestamptz,
  removed_at     timestamptz,
  removed_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references public.profiles (id) on delete set null
);

comment on table public.workspace_members is
  'The only source of membership (ARCHITECTURE §3). Rows are NEVER deleted: '
  'status pending -> active -> removed, with removed_at/removed_by '
  '(PRODUCT-DECISIONS 1.14). RLS everywhere checks status = active.';

create unique index if not exists workspace_members_workspace_user_key
  on public.workspace_members (workspace_id, user_id);
-- justification: one membership per person per workspace AND the exact index
-- app.member_role()/app.has_role() probe on every single policy evaluation.

create index if not exists workspace_members_user_active_idx
  on public.workspace_members (user_id, workspace_id) where status = 'active';
-- justification: "my workspaces" on login and app.shares_active_workspace();
-- partial keeps removed/pending rows out of the hot index.

create index if not exists workspace_members_workspace_role_idx
  on public.workspace_members (workspace_id, role) where status = 'active';
-- justification: role rosters (teacher pickers, "notify all admins"), and
-- the last-owner check in the membership guard trigger.

create index if not exists workspace_members_workspace_status_idx
  on public.workspace_members (workspace_id, status, created_at desc);
-- justification: the Team & Access screen's pending-approvals tab.

create unique index if not exists workspace_members_employee_code_key
  on public.workspace_members (workspace_id, employee_code)
  where employee_code is not null;
-- justification: TCH-2026-0031 must be unique inside a school.

create index if not exists workspace_members_label_idx
  on public.workspace_members (label_id) where label_id is not null;
-- justification: FK column; makes deleting a label cheap.

-- ---------------------------------------------------------------------
-- 7.1 workspace_member_capabilities — named grants beside the role
--     Roles stay five (PRODUCT-DECISIONS 1.5). Some duties are narrower
--     than a role: `fees.cashier` lets one named person take cash at the
--     front desk without making them an admin. Capabilities are ADDITIVE
--     and always require an active membership.
-- ---------------------------------------------------------------------
create table if not exists public.workspace_member_capabilities (
  workspace_id uuid not null,
  user_id      uuid not null,
  capability   text not null check (capability ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  granted_by   uuid references public.profiles (id) on delete set null,
  granted_at   timestamptz not null default now(),
  revoked_by   uuid references public.profiles (id) on delete set null,
  revoked_at   timestamptz,
  note         text,
  primary key (workspace_id, user_id, capability),
  constraint workspace_member_capabilities_member_fkey
    foreign key (workspace_id, user_id)
    references public.workspace_members (workspace_id, user_id) on delete cascade
);

comment on table public.workspace_member_capabilities is
  'Fine-grained, additive grants that sit beside the role rather than '
  'inside it. First use: fees.cashier. Read through app.has_capability(), '
  'which also requires the membership to be active — so removing someone '
  'revokes every capability they held, in the same instant.';

create index if not exists workspace_member_capabilities_live_idx
  on public.workspace_member_capabilities (workspace_id, capability)
  where revoked_at is null;
-- justification: "who can take cash at this school" is the question the
-- admin screen asks, and it is also the policy column for the fee module.

create index if not exists workspace_member_capabilities_user_idx
  on public.workspace_member_capabilities (user_id) where revoked_at is null;
-- justification: "what am I allowed to do here", read once per session.

-- ---------------------------------------------------------------------
-- 8. user_preferences — user-scoped, not tenant-scoped
-- ---------------------------------------------------------------------
create table if not exists public.user_preferences (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  theme_mode    text not null default 'system' check (theme_mode in ('light', 'dark', 'system')),
  palette       text not null default 'midnight',
  density       text not null default 'comfortable' check (density in ('comfortable', 'compact')),
  language      text not null default 'en' check (language in ('en', 'bn')),
  timezone      text,
  email_digest  text not null default 'daily' check (email_digest in ('off', 'instant', 'daily', 'weekly')),
  push_enabled  boolean not null default true,
  channels      jsonb not null default
                  '{"attendance": true, "exams": true, "messages": true, "print": true, '
                  ' "billing": true, "marketplace": true, "hiring": true, "system": true}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.user_preferences is
  'Theme, palette, density, language and notification channels, synced '
  'across devices (PRODUCT-DECISIONS 1.10). localStorage is a cache only. '
  'Deliberately has no workspace_id: preferences follow the person.';

-- ---------------------------------------------------------------------
-- 9. device_registrations — push + deep links for the native wrappers
-- ---------------------------------------------------------------------
create table if not exists public.device_registrations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  platform     public.device_platform not null,
  device_id    text not null,
  device_name  text,
  push_token   text,
  app_version  text,
  os_version   text,
  last_seen_at timestamptz not null default now(),
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.device_registrations is
  'One row per device/install (ARCHITECTURE §7). Also the "signed-in '
  'devices" list in security settings. User-scoped, not tenant-scoped.';

create unique index if not exists device_registrations_user_device_key
  on public.device_registrations (user_id, device_id);
-- justification: a re-install upserts rather than duplicating.

create unique index if not exists device_registrations_push_token_key
  on public.device_registrations (platform, push_token)
  where push_token is not null and revoked_at is null;
-- justification: an FCM token must map to exactly one live registration,
-- otherwise a handed-down phone receives another user's notifications.

create index if not exists device_registrations_user_live_idx
  on public.device_registrations (user_id) where revoked_at is null;
-- justification: the push fan-out reads live devices for a recipient.

-- =====================================================================
-- 10. Bootstrap, guards and RPCs
-- =====================================================================

-- 10.1 A new auth user gets: a profile, preferences, and exactly one
--      personal workspace (PRODUCT-DECISIONS 1.2).
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_slug text;
  v_ws   uuid;
begin
  v_name := coalesce(
              nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
              nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
              'Teacher');

  insert into public.profiles (id, full_name, email, phone)
  values (new.id, v_name, lower(nullif(new.email, '')), nullif(new.phone, ''))
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  v_slug := left(app.slugify(v_name), 40) || '-' || substr(replace(new.id::text, '-', ''), 1, 8);

  insert into public.workspaces (type, name, slug, owner_id, status, created_by)
  values ('personal', v_name, v_slug, new.id, 'active', new.id)
  returning id into v_ws;

  update public.profiles set last_active_workspace_id = v_ws where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- 10.2 Every workspace gets its owner membership (and, for schools, a
--      school_profiles row and an invite code) in the same transaction.
create or replace function app.tg_workspace_bootstrap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_members
    (workspace_id, user_id, role, status, joined_at, created_by)
  values
    (new.id, new.owner_id, 'owner', 'active', now(), new.owner_id)
  on conflict (workspace_id, user_id) do update
    set role = 'owner', status = 'active', joined_at = coalesce(workspace_members.joined_at, now());

  if new.type = 'school' then
    insert into public.school_profiles (workspace_id)
    values (new.id)
    on conflict (workspace_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists workspace_bootstrap on public.workspaces;
create trigger workspace_bootstrap
  after insert on public.workspaces
  for each row execute function app.tg_workspace_bootstrap();

-- 10.3 School workspaces get a rotating invite code on insert.
create or replace function app.tg_workspace_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type = 'school' and new.invite_code is null then
    new.invite_code := app.gen_invite_code();
    new.invite_code_rotated_at := now();
  end if;
  if new.type = 'personal' then
    new.invite_code := null;
  end if;
  return new;
end;
$$;

drop trigger if exists workspace_defaults on public.workspaces;
create trigger workspace_defaults
  before insert on public.workspaces
  for each row execute function app.tg_workspace_defaults();

-- 10.4 workspaces guard: type, owner, plan and invite code are immutable
--      through plain client DML.
--      SECURITY INVOKER on purpose — see app.is_privileged_context().
create or replace function app.tg_workspaces_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.is_privileged_context() then
    return new;                                   -- server-owned path
  end if;

  if new.type is distinct from old.type then
    raise exception 'workspace type is immutable' using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'ownership is transferred through app.transfer_ownership(), not by update'
      using errcode = '42501';
  end if;

  if new.invite_code is distinct from old.invite_code then
    raise exception 'the invite code is rotated through app.rotate_invite_code()'
      using errcode = '42501';
  end if;

  if app.is_platform_admin() then
    return new;
  end if;

  if new.plan_id is distinct from old.plan_id
     or new.trial_ends_at is distinct from old.trial_ends_at
     or new.status is distinct from old.status
     or new.access_mode is distinct from old.access_mode then
    raise exception 'plan, trial, workspace status and access mode are set by billing and platform staff'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists workspaces_guard on public.workspaces;
create trigger workspaces_guard
  before update on public.workspaces
  for each row execute function app.tg_workspaces_guard();

-- 10.5 profiles guard: nobody promotes themselves to platform staff.
create or replace function app.tg_profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.is_privileged_context() or app.is_platform_admin() then
    return new;
  end if;

  if new.is_platform_admin is distinct from old.is_platform_admin then
    raise exception 'is_platform_admin can only be changed by platform staff'
      using errcode = '42501';
  end if;

  if new.suspended_at is distinct from old.suspended_at then
    raise exception 'account suspension is a platform action' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function app.tg_profiles_guard();

-- 10.6 workspace_members guard — the privilege-escalation boundary.
--      Directly answers Base44 security review finding 2.
create or replace function app.tg_workspace_members_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_actor_role  text;
  v_other_owner int;
begin
  if tg_op = 'UPDATE' then
    if new.workspace_id is distinct from old.workspace_id
       or new.user_id is distinct from old.user_id then
      raise exception 'workspace_id and user_id are immutable on a membership'
        using errcode = '42501';
    end if;

    -- lifecycle stamps, applied server-side so the client cannot forge them
    if new.status = 'removed' and old.status is distinct from 'removed' then
      new.removed_at := now();
      new.removed_by := v_uid;
    elsif new.status = 'active' and old.status is distinct from 'active' then
      new.joined_at  := coalesce(new.joined_at, now());
      new.removed_at := null;
      new.removed_by := null;
    end if;
  end if;

  -- ---- authorization: skipped for server-owned paths and platform staff --
  if not (app.is_privileged_context() or app.is_platform_admin()) then

    v_actor_role := app.member_role(new.workspace_id);

    if tg_op = 'UPDATE' and (new.role is distinct from old.role
                             or new.status is distinct from old.status) then

      if new.user_id = v_uid then
        raise exception 'members cannot change their own role or status'
          using errcode = '42501';
      end if;

      if v_actor_role is null or v_actor_role not in ('owner', 'admin') then
        raise exception 'only owners and admins can change a membership role or status'
          using errcode = '42501';
      end if;

      if (new.role = 'owner' or old.role = 'owner') and v_actor_role <> 'owner' then
        raise exception 'only an owner can grant or remove ownership'
          using errcode = '42501';
      end if;
    end if;

    if tg_op = 'INSERT'
       and new.role = 'owner'
       and new.user_id is distinct from v_uid
       and v_actor_role is distinct from 'owner' then
      raise exception 'only an owner can add another owner' using errcode = '42501';
    end if;
  end if;

  -- ---- invariant: enforced for EVERY caller, including the server -------
  -- A workspace must always have at least one active owner
  -- (PRODUCT-DECISIONS 1.5: "last owner cannot leave/downgrade").
  if tg_op = 'UPDATE'
     and old.role = 'owner' and old.status = 'active'
     and (new.role <> 'owner' or new.status <> 'active') then
    v_other_owner := app.count_active_owners(new.workspace_id, old.id);
    if v_other_owner = 0 then
      raise exception 'a workspace must always have at least one active owner'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists workspace_members_guard on public.workspace_members;
create trigger workspace_members_guard
  before insert or update on public.workspace_members
  for each row execute function app.tg_workspace_members_guard();

-- 10.7 Membership rows are never hard-deleted (PRODUCT-DECISIONS 1.14).
create or replace function app.tg_workspace_members_no_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.is_privileged_context() then
    return old;     -- cascades from auth.users / workspaces must still work
  end if;
  raise exception 'membership rows are never deleted; set status = ''removed'' instead'
    using errcode = '42501';
end;
$$;

drop trigger if exists workspace_members_no_delete on public.workspace_members;
create trigger workspace_members_no_delete
  before delete on public.workspace_members
  for each row execute function app.tg_workspace_members_no_delete();

-- 10.8 Ownership transfer (the only way owner_id moves).
create or replace function app.transfer_ownership(p_workspace_id uuid, p_to_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if app.member_role(p_workspace_id) is distinct from 'owner' and not app.is_platform_admin() then
    raise exception 'only an owner can transfer ownership' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.workspace_members m
     where m.workspace_id = p_workspace_id
       and m.user_id = p_to_user_id
       and m.status = 'active') then
    raise exception 'the new owner must already be an active member' using errcode = '22023';
  end if;

  update public.workspace_members
     set role = 'owner'
   where workspace_id = p_workspace_id and user_id = p_to_user_id;

  update public.workspaces
     set owner_id = p_to_user_id
   where id = p_workspace_id;

  insert into public.audit_events (workspace_id, actor_id, action, table_name, row_id, after)
  values (p_workspace_id, v_uid, 'workspace.ownership_transferred', 'public.workspaces',
          p_workspace_id, jsonb_build_object('to_user_id', p_to_user_id));
end;
$$;

-- 10.9 Invitation creation — returns the RAW token exactly once.
create or replace function app.create_invitation(
  p_workspace_id uuid,
  p_role         public.member_role,
  p_email        text default null,
  p_phone        text default null,
  p_label_id     uuid default null,
  p_message      text default null)
returns table (invitation_id uuid, token text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_token text;
  v_id    uuid;
  v_email text := lower(nullif(btrim(p_email), ''));
  v_phone text := nullif(btrim(p_phone), '');
begin
  if not app.has_role(p_workspace_id, array['owner', 'admin']) then
    raise exception 'only owners and admins can invite' using errcode = '42501';
  end if;
  if p_role = 'owner' and app.member_role(p_workspace_id) <> 'owner' then
    raise exception 'only an owner can invite another owner' using errcode = '42501';
  end if;
  if v_email is null and v_phone is null then
    raise exception 'an email or a phone number is required' using errcode = '22023';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.workspace_invitations
    (workspace_id, channel, email, phone, role, label_id, token_hash, token_prefix,
     message, invited_by, last_sent_at)
  values
    (p_workspace_id,
     case when v_email is not null then 'email'::public.invitation_channel
          else 'phone'::public.invitation_channel end,
     v_email, v_phone, p_role, p_label_id,
     app.hash_token(v_token), left(v_token, 8),
     nullif(btrim(p_message), ''), v_uid, now())
  on conflict (workspace_id, email) where status = 'pending' and email is not null
  do update set
     role         = excluded.role,
     label_id     = excluded.label_id,
     token_hash   = excluded.token_hash,
     token_prefix = excluded.token_prefix,
     message      = excluded.message,
     expires_at   = now() + interval '14 days',
     resent_count = workspace_invitations.resent_count + 1,
     last_sent_at = now(),
     updated_at   = now()
  returning id into v_id;

  return query select v_id, v_token;
end;
$$;

-- 10.10 Invitation acceptance — the ONLY path that creates an active
--       membership from an invitation. Verifies the email/phone binding,
--       which the Base44 redeem never did.
create or replace function app.accept_invitation(p_token text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_inv   public.workspace_invitations;
  v_email text;
  v_phone text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select lower(p.email), p.phone into v_email, v_phone
    from public.profiles p where p.id = v_uid;

  select * into v_inv
    from public.workspace_invitations i
   where i.token_hash = app.hash_token(p_token)
     for update;

  if not found then
    raise exception 'invitation not found' using errcode = '22023';
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'invitation is already %', v_inv.status using errcode = '22023';
  end if;

  if v_inv.expires_at <= now() then
    update public.workspace_invitations set status = 'expired' where id = v_inv.id;
    raise exception 'invitation has expired' using errcode = '22023';
  end if;

  if v_inv.email is not null and lower(v_inv.email) is distinct from v_email then
    raise exception 'this invitation is bound to a different email address'
      using errcode = '42501';
  end if;

  if v_inv.email is null
     and app.normalize_phone(v_inv.phone) is distinct from app.normalize_phone(v_phone) then
    raise exception 'this invitation is bound to a different phone number'
      using errcode = '42501';
  end if;

  insert into public.workspace_members
    (workspace_id, user_id, role, status, label_id, invitation_id, invited_by, joined_at, created_by)
  values
    (v_inv.workspace_id, v_uid, v_inv.role, 'active', v_inv.label_id, v_inv.id,
     v_inv.invited_by, now(), v_uid)
  on conflict (workspace_id, user_id) do update
    set status        = 'active',
        role          = case when workspace_members.role = 'owner' then 'owner'::public.member_role
                             else excluded.role end,
        label_id      = coalesce(excluded.label_id, workspace_members.label_id),
        invitation_id = excluded.invitation_id,
        joined_at     = coalesce(workspace_members.joined_at, now()),
        removed_at    = null,
        removed_by    = null;

  update public.workspace_invitations
     set status = 'accepted', accepted_by = v_uid, accepted_at = now()
   where id = v_inv.id;

  return v_inv.workspace_id;
end;
$$;

create or replace function app.decline_invitation(p_token text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_inv public.workspace_invitations;
begin
  select * into v_inv from public.workspace_invitations i
   where i.token_hash = app.hash_token(p_token) and i.status = 'pending'
     for update;
  if not found then
    raise exception 'invitation not found' using errcode = '22023';
  end if;
  update public.workspace_invitations
     set status = 'declined', declined_at = now()
   where id = v_inv.id;
end;
$$;

-- 10.11 Join by invite code — always lands as `pending` and can never
--       choose its own role (PRODUCT-DECISIONS 1.3b).
--       Rate limiting lives in the route handler.
create or replace function app.join_workspace_by_code(p_code text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ws  uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select w.id into v_ws
    from public.workspaces w
   where w.type = 'school'
     and w.status = 'active'
     and w.invite_code = upper(btrim(p_code));

  if not found then
    raise exception 'invalid invite code' using errcode = '22023';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role, status, created_by)
  values (v_ws, v_uid, 'teacher', 'pending', v_uid)
  on conflict (workspace_id, user_id) do nothing;

  return v_ws;
end;
$$;

-- 10.12 Invite-code rotation.
create or replace function app.rotate_invite_code(p_workspace_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not app.has_role(p_workspace_id, array['owner', 'admin']) then
    raise exception 'only owners and admins can rotate the invite code' using errcode = '42501';
  end if;
  v_code := app.gen_invite_code();
  update public.workspaces
     set invite_code = v_code, invite_code_rotated_at = now()
   where id = p_workspace_id and type = 'school';
  return v_code;
end;
$$;

-- =====================================================================
-- 11. updated_at + audit triggers
-- =====================================================================
select app.attach_updated_at('public.profiles');
select app.attach_updated_at('public.workspaces');
select app.attach_updated_at('public.school_profiles');
select app.attach_updated_at('public.custom_labels');
select app.attach_updated_at('public.workspace_invitations');
select app.attach_updated_at('public.workspace_members');
select app.attach_updated_at('public.user_preferences');
select app.attach_updated_at('public.device_registrations');
select app.attach_freeze_workspace('public.workspace_member_capabilities');

select app.attach_freeze_workspace('public.custom_labels');
select app.attach_freeze_workspace('public.workspace_invitations');
-- workspace_members has its own stricter guard; school_profiles is keyed by
-- workspace_id as its primary key and therefore cannot move.

-- =====================================================================
-- 12. RLS
-- =====================================================================
alter table public.profiles              enable row level security;
alter table public.workspaces            enable row level security;
alter table public.school_profiles       enable row level security;
alter table public.custom_labels         enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.workspace_members     enable row level security;
alter table public.workspace_member_capabilities enable row level security;
alter table public.user_preferences      enable row level security;
alter table public.device_registrations  enable row level security;

-- ---- profiles -------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select app.is_platform_admin())
    or app.shares_active_workspace(id)
  );

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
-- is_platform_admin / suspended_at are additionally blocked by
-- app.tg_profiles_guard, because a WITH CHECK cannot see OLD.

drop policy if exists profiles_update_platform on public.profiles;
create policy profiles_update_platform on public.profiles
  for update to authenticated
  using ((select app.is_platform_admin()))
  with check ((select app.is_platform_admin()));

-- no DELETE policy: profiles die with their auth.users row.

-- ---- workspaces -----------------------------------------------------
drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces
  for select to authenticated
  using (
    app.member_role(id) is not null
    or (select app.is_platform_admin())
  );

drop policy if exists workspaces_insert on public.workspaces;
create policy workspaces_insert on public.workspaces
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and created_by = (select auth.uid()));

drop policy if exists workspaces_update on public.workspaces;
create policy workspaces_update on public.workspaces
  for update to authenticated
  using (app.has_role(id, array['owner', 'admin']))
  with check (app.has_role(id, array['owner', 'admin']));

drop policy if exists workspaces_update_platform on public.workspaces;
create policy workspaces_update_platform on public.workspaces
  for update to authenticated
  using ((select app.is_platform_admin()))
  with check ((select app.is_platform_admin()));

drop policy if exists workspaces_delete_platform on public.workspaces;
create policy workspaces_delete_platform on public.workspaces
  for delete to authenticated
  using ((select app.is_platform_admin()));
-- tenants archive (status), they never delete.

-- ---- school_profiles ------------------------------------------------
drop policy if exists school_profiles_select on public.school_profiles;
create policy school_profiles_select on public.school_profiles
  for select to authenticated
  using (
    app.member_role(workspace_id) is not null
    or (select app.is_platform_admin())
  );

drop policy if exists school_profiles_insert on public.school_profiles;
create policy school_profiles_insert on public.school_profiles
  for insert to authenticated
  with check (app.has_role(workspace_id, array['owner', 'admin']));

drop policy if exists school_profiles_update on public.school_profiles;
create policy school_profiles_update on public.school_profiles
  for update to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin']))
  with check (app.has_role(workspace_id, array['owner', 'admin']));

-- no DELETE policy: cascades from workspaces.

-- ---- custom_labels --------------------------------------------------
drop policy if exists custom_labels_select on public.custom_labels;
create policy custom_labels_select on public.custom_labels
  for select to authenticated
  using (
    app.member_role(workspace_id) is not null
    or (select app.is_platform_admin())
  );

drop policy if exists custom_labels_insert on public.custom_labels;
create policy custom_labels_insert on public.custom_labels
  for insert to authenticated
  with check (
    app.has_role(workspace_id, array['owner', 'admin'])
    and created_by = (select auth.uid())
  );

drop policy if exists custom_labels_update on public.custom_labels;
create policy custom_labels_update on public.custom_labels
  for update to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin']))
  with check (app.has_role(workspace_id, array['owner', 'admin']));

drop policy if exists custom_labels_delete on public.custom_labels;
create policy custom_labels_delete on public.custom_labels
  for delete to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin']));

-- ---- workspace_invitations ------------------------------------------
drop policy if exists workspace_invitations_select on public.workspace_invitations;
create policy workspace_invitations_select on public.workspace_invitations
  for select to authenticated
  using (
    app.has_role(workspace_id, array['owner', 'admin'])
    or email = (select app.current_email())
    or (select app.is_platform_admin())
  );
-- NOTE: a row exposes token_prefix but never the raw token, and token_hash
-- is redacted from audit. The invitee branch is how /invite shows "you have
-- been invited to X" before acceptance.

drop policy if exists workspace_invitations_insert on public.workspace_invitations;
create policy workspace_invitations_insert on public.workspace_invitations
  for insert to authenticated
  with check (
    app.has_role(workspace_id, array['owner', 'admin'])
    and invited_by = (select auth.uid())
    and status = 'pending'
  );

drop policy if exists workspace_invitations_update on public.workspace_invitations;
create policy workspace_invitations_update on public.workspace_invitations
  for update to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin']))
  with check (app.has_role(workspace_id, array['owner', 'admin']));
-- Accept/decline never go through this policy: they run inside
-- app.accept_invitation() / app.decline_invitation(), which verify the
-- token AND the email/phone binding first.

drop policy if exists workspace_invitations_delete on public.workspace_invitations;
create policy workspace_invitations_delete on public.workspace_invitations
  for delete to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin']));

-- ---- workspace_members ----------------------------------------------
drop policy if exists workspace_members_select on public.workspace_members;
create policy workspace_members_select on public.workspace_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or app.has_role(workspace_id, array['owner', 'admin', 'teacher', 'staff'])
    or (select app.is_platform_admin())
  );
-- `parent` is deliberately absent: a parent may read their own membership
-- row and nothing else (PRODUCT-DECISIONS 1.13).

drop policy if exists workspace_members_insert on public.workspace_members;
create policy workspace_members_insert on public.workspace_members
  for insert to authenticated
  with check (app.has_role(workspace_id, array['owner', 'admin']));
-- Self-service joins do NOT go through RLS: app.join_workspace_by_code()
-- and app.accept_invitation() are the only self-service paths, and both
-- force the role and status. This closes Base44 finding 2
-- (`WorkspaceMember.create` was `{}`).

drop policy if exists workspace_members_update_admin on public.workspace_members;
create policy workspace_members_update_admin on public.workspace_members
  for update to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin']))
  with check (app.has_role(workspace_id, array['owner', 'admin']));

drop policy if exists workspace_members_update_self on public.workspace_members;
create policy workspace_members_update_self on public.workspace_members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- Lets a member maintain their own phone/department/subjects.
-- app.tg_workspace_members_guard() rejects any self-change of role or
-- status, so this policy cannot be used to escalate.

-- no DELETE policy, and a BEFORE DELETE trigger raises anyway.

-- ---- workspace_member_capabilities ----------------------------------
drop policy if exists workspace_member_capabilities_select on public.workspace_member_capabilities;
create policy workspace_member_capabilities_select on public.workspace_member_capabilities
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or app.has_role(workspace_id, array['owner', 'admin'])
    or (select app.is_platform_admin())
  );

drop policy if exists workspace_member_capabilities_write on public.workspace_member_capabilities;
create policy workspace_member_capabilities_write on public.workspace_member_capabilities
  for all to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin']))
  with check (app.has_role(workspace_id, array['owner', 'admin']));
-- A capability can never be self-granted: the predicate is the caller's
-- role in the workspace, and a teacher has no owner/admin role to satisfy it.

-- ---- user_preferences -----------------------------------------------
drop policy if exists user_preferences_select on public.user_preferences;
create policy user_preferences_select on public.user_preferences
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists user_preferences_insert on public.user_preferences;
create policy user_preferences_insert on public.user_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists user_preferences_update on public.user_preferences;
create policy user_preferences_update on public.user_preferences
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists user_preferences_delete on public.user_preferences;
create policy user_preferences_delete on public.user_preferences
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---- device_registrations -------------------------------------------
drop policy if exists device_registrations_select on public.device_registrations;
create policy device_registrations_select on public.device_registrations
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists device_registrations_insert on public.device_registrations;
create policy device_registrations_insert on public.device_registrations
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists device_registrations_update on public.device_registrations;
create policy device_registrations_update on public.device_registrations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists device_registrations_delete on public.device_registrations;
create policy device_registrations_delete on public.device_registrations
  for delete to authenticated using (user_id = (select auth.uid()));

-- =====================================================================
-- 13. Grants
--     anon gets nothing here. authenticated gets exactly the verbs its
--     policies allow; RLS then decides the rows.
-- =====================================================================
revoke all on public.profiles, public.workspaces, public.school_profiles,
              public.custom_labels, public.workspace_invitations,
              public.workspace_members, public.workspace_member_capabilities,
              public.user_preferences, public.device_registrations
  from anon, authenticated;

grant select, insert, update, delete on public.workspace_member_capabilities to authenticated;

grant select, insert, update on public.profiles              to authenticated;
grant select, insert, update, delete on public.workspaces    to authenticated;
grant select, insert, update on public.school_profiles       to authenticated;
grant select, insert, update, delete on public.custom_labels to authenticated;
grant select, insert, update, delete on public.workspace_invitations to authenticated;
grant select, insert, update on public.workspace_members     to authenticated;
grant select, insert, update, delete on public.user_preferences to authenticated;
grant select, insert, update, delete on public.device_registrations to authenticated;

-- Function grants for everything added in this migration.
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
