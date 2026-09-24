-- =====================================================================
-- 0005 (chunk 0.4, F-ID-09 Parts 1-3) · audit substrate
-- ---------------------------------------------------------------------
-- Builds on `audit_events` / `app.tg_audit()` / `app.log_audit_event()`
-- shipped in 0003 (20260917010200_audit_and_files.sql). This migration is
-- ADDITIVE ONLY — it never edits an already-applied migration
-- (CLAUDE.md "Do not: edit an already-applied migration").
--
-- Adds: actor_kind / subject_user_id / changed_fields / severity /
-- request_ip_hash / user_agent_family columns; the action catalogue
-- (`app.audit_action_catalog`) with its ~65 seeded actions (the spec's "~35"
-- rows each expand to several dotted actions, e.g. "account.registered .
-- account.email_verified" is two rows); a universal secret deny-list
-- (independent of the per-table redact list) plus a free-text-nulling list;
-- the read-time redaction view `public.audit_events_view`; the
-- `app.correlation_id` pre-request contract; and the audit trigger attached
-- to every remaining tenant table.
--
-- DECISION-LOG D-51 records the two non-obvious calls this migration makes:
-- (1) the generic trigger keeps emitting `<table>.<op>` actions (unchanged
--     from 0003) rather than the spec's hand-named business actions
--     (`member.role_changed` etc.) — those are seeded as a SEPARATE,
--     forward-looking catalogue entries for explicit `log_audit_event()`
--     calls business logic makes going forward, and the generic entries
--     satisfy the catalogue-parity requirement for what the trigger
--     actually writes today.
-- (2) correlation id propagation uses a PostgREST `db-pre-request` hook
--     (the standard Supabase mechanism for per-request GUCs), guarded like
--     the 0001 pg_cron block so it degrades gracefully anywhere the
--     `authenticator` role cannot be altered (CI's disposable Postgres).
-- =====================================================================

set check_function_bodies = off;

-- =====================================================================
-- 1. Enums
-- =====================================================================
do $$ begin
  create type public.audit_actor_kind as enum ('user', 'platform_staff', 'system', 'webhook');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.audit_severity as enum ('info', 'notable', 'critical');
exception when duplicate_object then null; end $$;

-- =====================================================================
-- 2. audit_events — new columns (additive; 0003's columns are untouched)
-- =====================================================================
alter table public.audit_events
  add column if not exists actor_kind        public.audit_actor_kind not null default 'user',
  add column if not exists subject_user_id    uuid,
  add column if not exists changed_fields     text[],
  add column if not exists severity           public.audit_severity not null default 'info',
  add column if not exists request_ip_hash    text,
  add column if not exists user_agent_family  text;

comment on column public.audit_events.actor_kind is
  'Who/what performed the action. Defaulted to ''user'' by the generic '
  'trigger; explicit app.log_audit_event() callers (webhooks, cron, '
  'platform staff) pass the correct value.';
comment on column public.audit_events.subject_user_id is
  'Set when the event is ABOUT a person who is not necessarily the actor '
  '(a role change, a removal). Read policy branch: a subject may always see '
  'that something happened to them, even if they cannot read the trail.';
comment on column public.audit_events.changed_fields is
  'Computed BEFORE redaction from the raw before/after key set, so a '
  'redacted or nulled field''s NAME still appears here even though its '
  'value does not (F-ID-09 §5.3) — except columns on the secret deny-list, '
  'which are omitted entirely.';
comment on column public.audit_events.severity is
  'Never supplied by the caller (F-ID-09 §5.2). Looked up from '
  'app.audit_action_catalog by `action`; defaults to info if the action has '
  'no catalogue row yet, rather than blocking the write.';
comment on column public.audit_events.request_ip_hash is
  'sha256(ip || daily salt), never the raw address (F-ID-09 §5.3). The '
  'legacy `ip` column is deprecated by this migration: readers must use '
  'this column, and app.log_audit_event() no longer persists the raw `ip` '
  'it is handed — see app.hash_request_ip().';
comment on column public.audit_events.user_agent_family is
  '"Chrome on Android", never the full UA string (F-ID-09 §5.3). The '
  'legacy `user_agent` column is deprecated the same way as `ip`.';
comment on column public.audit_events.ip is
  'DEPRECATED by this migration — superseded by request_ip_hash, which '
  'stores a salted hash instead of the raw address. Column kept (not '
  'dropped) because this table is append-only and forward-only migrations '
  'never rewrite history; new rows leave it null.';
comment on column public.audit_events.user_agent is
  'DEPRECATED by this migration — superseded by user_agent_family. Column '
  'kept for the same append-only reason as `ip`.';

-- ---------------------------------------------------------------------
-- Indexes named in F-ID-09 §3 not already present after 0003.
-- ---------------------------------------------------------------------
create index if not exists audit_events_workspace_action_time_idx
  on public.audit_events (workspace_id, action, created_at desc);
-- justification: the category/action filter in the viewer, composed with the
-- workspace scope — one index serves both instead of two partial scans.

create index if not exists audit_events_subject_idx
  on public.audit_events (subject_user_id, created_at desc)
  where subject_user_id is not null;
-- justification: "events about me" — a teacher's own removal, a role change
-- done to them — the `audit.read.self` policy branch below.

create index if not exists audit_events_created_brin_idx
  on public.audit_events using brin (created_at);
-- justification: the export path (Part 4) streams a date range across the
-- whole table; a BRIN on a monotonic, insert-ordered column is a few KB
-- regardless of table size and prunes almost as well as a partition would.

-- =====================================================================
-- 3. app.hash_request_ip — sha256(ip || daily salt), never the raw address
-- =====================================================================
create or replace function app.hash_request_ip(p_ip inet)
returns text
language sql
stable                                  -- NOT immutable: the body reads now()
set search_path = ''
as $$
  select case when p_ip is null then null else
    encode(sha256(convert_to(host(p_ip) || '|' || to_char(now(), 'YYYYMMDD'), 'UTF8')), 'hex')
  end
$$;

comment on function app.hash_request_ip(inet) is
  'F-ID-09 §5.3: raw IPs are never stored. The daily salt lets same-day '
  'incident response correlate repeated hits from one address without '
  'making the hash a permanent fingerprint of it. STABLE, not IMMUTABLE — '
  'the daily salt is now(), so labelling it immutable would let the planner '
  'fold a value computed on the wrong day into a plan or an index.';

-- =====================================================================
-- 3.1 The three universal column classes (F-ID-09 §5.3), kept as functions
--     so the trigger, the pgTAP tests and the TypeScript mirror
--     (packages/domain/src/audit/redact.ts) all name one source of truth.
--
--     They are applied to the WHOLE before/after payload, never only to the
--     columns that changed: an UPDATE that touches one ordinary column still
--     carries every other column's value in `before`/`after`, so scanning
--     `changed_fields` alone would write an untouched push token or NID
--     straight into the trail.
-- =====================================================================

-- Dropped entirely — name and value (F-ID-09 §5.3 "Secrets", and the PDPA
-- §4.1 rule that we never store a full NID / birth-certificate number).
create or replace function app.audit_secret_pattern()
returns text language sql immutable set search_path = '' as $$
  select '(token|secret|password|passwd|api_key|private_key|account_number'
      || '|(^|_)nid(_|$)|national_id|birth_certificate|passport_no|passport_number)'
$$;

-- Value nulled, NAME kept in changed_fields — the §5.3 "health and medical
-- fields on student records" row, plus religion (COMPLIANCE-PDPA §4.1 marks
-- both S = sensitive under the Act).
create or replace function app.audit_sensitive_pattern()
returns text language sql immutable set search_path = '' as $$
  select '((^|_)(religion|blood_group|disability)(_|$)|allerg|medical|health|diagnos|medication)'
$$;

-- Masked, not dropped — §5.3 "Personal contact data (email, phone): masked at
-- write time". Anchored to the END of the name so `email_digest` (a
-- preference, not an address) is left alone while `contact_email` is masked.
create or replace function app.audit_contact_pattern()
returns text language sql immutable set search_path = '' as $$
  select '(^|_)(email|phone|mobile|msisdn)$'
$$;

create or replace function app.mask_email(p_value text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_value is null then null
    when position('@' in p_value) = 0 then '***'
    when position('@' in p_value) <= 2 then '***' || substr(p_value, position('@' in p_value))
    else left(p_value, 1) || '***' || substr(p_value, position('@' in p_value))
  end
$$;

create or replace function app.mask_phone(p_value text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_value is null then null
    when length(p_value) < 9 then repeat('*', length(p_value))
    else left(p_value, 5) || '*****' || right(p_value, 3)
  end
$$;

comment on function app.audit_secret_pattern() is
  'Column-name regex whose matches are dropped from every audited payload '
  '(name AND value), whatever a table passed as its explicit p_redact list. '
  'Mirrored by SECRET_COLUMN_PATTERN in packages/domain/src/audit/redact.ts.';
comment on function app.audit_sensitive_pattern() is
  'Column-name regex whose matches are NULLED but whose names survive in '
  'changed_fields (F-ID-09 §5.3 health/religion row).';
comment on function app.audit_contact_pattern() is
  'Column-name regex whose matches are masked at write time (§5.3 contact '
  'row, acceptance criterion 10) rather than dropped: an owner still needs '
  'to see WHICH address an invitation went to, not the address itself.';

-- =====================================================================
-- 4. app.audit_action_catalog — F-ID-09 §5.1
-- =====================================================================
create table if not exists public.audit_action_catalog (
  action       text primary key check (action ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  domain       text generated always as (split_part(action, '.', 1)) stored,
  severity     public.audit_severity not null,
  sentence_en  text not null,
  sentence_bn  text not null,
  is_generic   boolean not null default false,
  created_at   timestamptz not null default now()
);

comment on table public.audit_action_catalog is
  'The complete, stable set of audit actions (F-ID-09 §5.1). Mirrored in '
  'packages/domain/src/audit/catalog.ts; scripts/check-audit-catalog-parity.mjs '
  'fails CI when the two diverge. app.log_audit_event() raises when a '
  'caller uses an action absent here (acceptance criterion 17) — the '
  'mechanism that stops the Base44 prototype''s garbage-action problem '
  '(a UUID where the action name belonged) from recurring. `is_generic` '
  'marks the auto-seeded `<table>.insert|update|delete` rows the trigger '
  'itself writes, as opposed to the named business actions feature code '
  'calls app.log_audit_event() with.';

create index if not exists audit_action_catalog_domain_idx
  on public.audit_action_catalog (domain);

alter table public.audit_action_catalog enable row level security;

drop policy if exists audit_action_catalog_select on public.audit_action_catalog;
create policy audit_action_catalog_select on public.audit_action_catalog
  for select to authenticated using (true);
-- Reference data, not sensitive: it is the list of action NAMES, sentence
-- templates and severities, not any tenant's rows. The viewer's filter UI
-- reads it directly.

revoke all on public.audit_action_catalog from anon, authenticated;
grant select on public.audit_action_catalog to authenticated;
-- No write policy: seeded by migration only, exactly like personal_data_map.

-- ---------------------------------------------------------------------
-- 4.1 Curated business actions (F-ID-09 §5.1), plus the two pre-existing
--     call sites from 0003 (consent.recorded, retention.audit_events_purged)
--     and 0004 (notification.sent, if present) that predate this catalogue.
-- ---------------------------------------------------------------------
insert into public.audit_action_catalog (action, severity, sentence_en, sentence_bn, is_generic) values
  ('account.registered',                 'info',     '{actor} created an account',
    '{actor} একটি অ্যাকাউন্ট তৈরি করেছেন', false),
  ('account.email_verified',             'info',     '{actor} verified their email',
    '{actor} তাদের ইমেইল যাচাই করেছেন', false),
  ('account.login',                      'info',     '{actor} signed in',
    '{actor} সাইন ইন করেছেন', false),
  ('account.logout',                     'info',     '{actor} signed out',
    '{actor} সাইন আউট করেছেন', false),
  ('account.password_reset',             'notable',  '{actor} reset their password',
    '{actor} তাদের পাসওয়ার্ড রিসেট করেছেন', false),
  ('account.password_changed',           'notable',  '{actor} changed their password',
    '{actor} তাদের পাসওয়ার্ড পরিবর্তন করেছেন', false),
  ('account.deletion_requested',         'critical', '{actor} scheduled their account for deletion',
    '{actor} তাদের অ্যাকাউন্ট মুছে ফেলার জন্য নির্ধারণ করেছেন', false),
  ('account.deletion_cancelled',         'critical', '{actor} cancelled their scheduled account deletion',
    '{actor} তাদের অ্যাকাউন্ট মুছে ফেলার সময়সূচি বাতিল করেছেন', false),
  ('account.deletion_purged',            'critical', '{actor}''s account was permanently deleted',
    '{actor}-এর অ্যাকাউন্ট স্থায়ীভাবে মুছে ফেলা হয়েছে', false),
  ('session.revoked',                    'notable',  '{actor} signed out a device',
    '{actor} একটি ডিভাইস থেকে সাইন আউট করেছেন', false),
  ('session.revoked_all',                'notable',  '{actor} signed out {n} devices',
    '{actor} {n}টি ডিভাইস থেকে সাইন আউট করেছেন', false),
  ('profile.updated',                    'info',     '{actor} updated their profile ({fields})',
    '{actor} তাদের প্রোফাইল হালনাগাদ করেছেন ({fields})', false),
  ('preferences.updated',                'info',     '{actor} updated their preferences ({fields})',
    '{actor} তাদের পছন্দসমূহ হালনাগাদ করেছেন ({fields})', false),
  ('workspace.created',                  'notable',  '{actor} created {workspace}',
    '{actor} {workspace} তৈরি করেছেন', false),
  ('workspace.updated',                  'notable',  '{actor} updated {workspace} ({fields})',
    '{actor} {workspace} হালনাগাদ করেছেন ({fields})', false),
  ('workspace.archived',                 'notable',  '{actor} archived {workspace}',
    '{actor} {workspace} আর্কাইভ করেছেন', false),
  -- Written by app.set_access_mode() (F-CM-06 plans/limits engine), one row per access_mode value.
  ('workspace.access_mode_read_only',   'critical', '{actor} put {workspace} into read-only mode',
    '{actor} {workspace} শুধু-পড়া মোডে রেখেছেন', false),
  ('workspace.access_mode_normal',      'notable',  '{actor} restored {workspace} to normal access',
    '{actor} {workspace} স্বাভাবিক অ্যাক্সেসে ফিরিয়ে এনেছেন', false),
  ('school_profile.created',             'notable',  '{actor} set up school settings',
    '{actor} স্কুলের সেটিংস তৈরি করেছেন', false),
  ('school_profile.updated',             'notable',  '{actor} changed school settings ({fields})',
    '{actor} স্কুলের সেটিংস পরিবর্তন করেছেন ({fields})', false),
  ('workspace.ownership_transferred',    'critical', '{actor} transferred ownership to {subject}',
    '{actor} মালিকানা {subject}-কে হস্তান্তর করেছেন', false),
  ('workspace.module_visibility_changed','notable',  '{actor} hid the {module} module',
    '{actor} {module} মডিউলটি লুকিয়েছেন', false),
  ('member.invited',                     'info',     '{actor} invited {masked_recipient} as {role}',
    '{actor} {masked_recipient}-কে {role} হিসেবে আমন্ত্রণ জানিয়েছেন', false),
  ('member.invitation_resent',           'info',     '{actor} resent the invitation to {masked_recipient}',
    '{actor} {masked_recipient}-কে আমন্ত্রণ পুনরায় পাঠিয়েছেন', false),
  ('member.invitation_revoked',          'notable',  '{actor} revoked the invitation to {masked_recipient}',
    '{actor} {masked_recipient}-এর আমন্ত্রণ বাতিল করেছেন', false),
  ('member.invitation_accepted',         'notable',  '{subject} accepted the invitation to join {workspace}',
    '{subject} {workspace}-এ যোগদানের আমন্ত্রণ গ্রহণ করেছেন', false),
  ('member.join_requested',              'notable',  '{subject} requested to join {workspace}',
    '{subject} {workspace}-এ যোগদানের অনুরোধ করেছেন', false),
  ('member.approved',                    'notable',  '{actor} approved {subject}''s request to join',
    '{actor} {subject}-এর যোগদানের অনুরোধ অনুমোদন করেছেন', false),
  ('member.rejected',                    'notable',  '{actor} rejected {subject}''s request to join',
    '{actor} {subject}-এর যোগদানের অনুরোধ প্রত্যাখ্যান করেছেন', false),
  ('member.role_changed',                'critical', '{actor} changed {subject}''s role from {before} to {after}',
    '{actor} {subject}-এর ভূমিকা {before} থেকে {after}-এ পরিবর্তন করেছেন', false),
  ('member.staff_fields_updated',        'info',     '{actor} updated {subject}''s staff details ({fields})',
    '{actor} {subject}-এর কর্মচারীর তথ্য হালনাগাদ করেছেন ({fields})', false),
  ('member.label_assigned',              'info',     '{actor} assigned a label to {subject}',
    '{actor} {subject}-কে একটি লেবেল বরাদ্দ করেছেন', false),
  ('member.removed',                     'critical', '{actor} removed {subject} from {workspace}',
    '{actor} {subject}-কে {workspace} থেকে সরিয়ে দিয়েছেন', false),
  ('member.left',                        'critical', '{subject} left {workspace}',
    '{subject} {workspace} ছেড়ে গেছেন', false),
  ('join_code.created',                  'notable',  '{actor} created a join code',
    '{actor} একটি যোগদান কোড তৈরি করেছেন', false),
  ('join_code.rotated',                  'notable',  '{actor} rotated the join code',
    '{actor} যোগদান কোড পরিবর্তন করেছেন', false),
  ('join_code.disabled',                 'notable',  '{actor} disabled the join code',
    '{actor} যোগদান কোড নিষ্ক্রিয় করেছেন', false),
  ('label.created',                      'info',     '{actor} created the label {name}',
    '{actor} {name} লেবেল তৈরি করেছেন', false),
  ('label.updated',                      'info',     '{actor} updated the label {name}',
    '{actor} {name} লেবেল হালনাগাদ করেছেন', false),
  ('label.deleted',                      'info',     '{actor} deleted the label {name}',
    '{actor} {name} লেবেল মুছে ফেলেছেন', false),
  ('guardian.invited',                   'notable',  '{actor} invited a guardian for {student}',
    '{actor} {student}-এর জন্য একজন অভিভাবককে আমন্ত্রণ জানিয়েছেন', false),
  ('guardian.linked',                    'notable',  '{actor} linked {subject} to {student}',
    '{actor} {subject}-কে {student}-এর সাথে যুক্ত করেছেন', false),
  ('document_request.created',           'critical', '{actor} requested a document from {subject}',
    '{actor} {subject}-এর কাছ থেকে একটি নথি অনুরোধ করেছেন', false),
  ('document_request.approved',          'critical', '{subject} approved a document request from {workspace}',
    '{subject} {workspace}-এর নথি অনুরোধ অনুমোদন করেছেন', false),
  ('document_request.declined',          'critical', '{subject} declined a document request from {workspace}',
    '{subject} {workspace}-এর নথি অনুরোধ প্রত্যাখ্যান করেছেন', false),
  ('document_request.revoked',           'critical', '{actor} revoked a document request',
    '{actor} একটি নথি অনুরোধ প্রত্যাহার করেছেন', false),
  ('document_request.expired',           'critical', 'A document request from {workspace} expired',
    '{workspace}-এর নথি অনুরোধের মেয়াদ শেষ হয়ে গেছে', false),
  ('file.uploaded',                      'info',     '{actor} uploaded {name}',
    '{actor} {name} আপলোড করেছেন', false),
  ('file.deleted',                       'info',     '{actor} deleted {name}',
    '{actor} {name} মুছে ফেলেছেন', false),
  ('file.downloaded',                    'notable',  '{actor} downloaded {name}',
    '{actor} {name} ডাউনলোড করেছেন', false),
  ('personal_attendance.saved',          'info',     '{actor} saved attendance for {date} ({n} students)',
    '{actor} {date}-এর উপস্থিতি সংরক্ষণ করেছেন ({n} জন শিক্ষার্থী)', false),
  ('diary_entry.saved',                  'info',     '{actor} saved a diary entry',
    '{actor} একটি ডায়েরি এন্ট্রি সংরক্ষণ করেছেন', false),
  ('teacher_profile.updated',            'notable',  '{actor} updated their teacher profile ({fields})',
    '{actor} তাদের শিক্ষক প্রোফাইল হালনাগাদ করেছেন ({fields})', false),
  ('teacher_profile.open_to_work_changed','notable', '{actor} turned Open to work {after}',
    '{actor} "কাজের জন্য উন্মুক্ত" {after} করেছেন', false),
  ('tenancy.context_rejected',           'critical', 'A request tried to use workspace {id} without membership',
    'একটি অনুরোধ সদস্যপদ ছাড়াই {id} ওয়ার্কস্পেস ব্যবহারের চেষ্টা করেছে', false),
  ('platform.console_opened',            'info',     '{actor} (Acadigma) opened the platform console',
    '{actor} (Acadigma) প্ল্যাটফর্ম কনসোল খুলেছেন', false),
  ('platform.workspace_viewed',          'info',     '{actor} (Acadigma) viewed this workspace',
    '{actor} (Acadigma) এই ওয়ার্কস্পেসটি দেখেছেন', false),
  ('platform.person_looked_up',          'info',     '{actor} (Acadigma) looked up a person',
    '{actor} (Acadigma) একজন ব্যক্তির তথ্য খুঁজেছেন', false),
  ('platform.support_read',              'critical', '{actor} (Acadigma) read {table} under a support grant',
    '{actor} (Acadigma) একটি সহায়তা অনুমোদনের আওতায় {table} পড়েছেন', false),
  ('platform.workspace_suspended',       'critical', '{actor} (Acadigma) suspended this workspace — {reason}',
    '{actor} (Acadigma) এই ওয়ার্কস্পেসটি স্থগিত করেছেন — {reason}', false),
  ('platform.workspace_reinstated',      'critical', '{actor} (Acadigma) reinstated this workspace',
    '{actor} (Acadigma) এই ওয়ার্কস্পেসটি পুনর্বহাল করেছেন', false),
  ('platform.feature_flag_changed',      'notable',  '{actor} (Acadigma) changed the flag {key} to {after} — {reason}',
    '{actor} (Acadigma) {key} ফ্ল্যাগটি {after}-এ পরিবর্তন করেছেন — {reason}', false),
  ('platform.plan_updated',              'notable',  '{actor} (Acadigma) updated the plan {key}',
    '{actor} (Acadigma) {key} প্ল্যানটি হালনাগাদ করেছেন', false),
  ('platform.settings_changed',          'notable',  '{actor} (Acadigma) changed platform settings ({fields})',
    '{actor} (Acadigma) প্ল্যাটফর্ম সেটিংস পরিবর্তন করেছেন ({fields})', false),
  ('platform.broadcast_sent',            'info',     '{actor} (Acadigma) sent a broadcast',
    '{actor} (Acadigma) একটি বার্তা পাঠিয়েছেন', false),
  ('platform.audit_viewed',              'info',     '{actor} (Acadigma) viewed the audit trail',
    '{actor} (Acadigma) অডিট ট্রেইল দেখেছেন', false),
  ('audit.exported',                     'notable',  '{actor} exported {n} audit events',
    '{actor} {n}টি অডিট ইভেন্ট রপ্তানি করেছেন', false),
  -- pre-existing call sites (0003) that predate this catalogue.
  ('consent.recorded',                   'notable',  '{actor} recorded consent for {subject}',
    '{actor} {subject}-এর সম্মতি রেকর্ড করেছেন', false),
  ('retention.audit_events_purged',      'info',     'The system purged {n} audit events past retention',
    'সিস্টেমটি ধরে রাখার মেয়াদ পার হওয়া {n}টি অডিট ইভেন্ট মুছে ফেলেছে', false)
on conflict (action) do update
  set severity    = excluded.severity,
      sentence_en = excluded.sentence_en,
      sentence_bn = excluded.sentence_bn,
      is_generic  = excluded.is_generic;

-- ---------------------------------------------------------------------
-- 4.2 Generic `<table>.<op>` rows — what app.tg_audit() actually writes for
--     every table it is attached to today (see §7 below for the full list).
--     Kept in lock-step with that list so app.log_audit_event() callers and
--     the parity script both see the complete, real set of actions in use.
-- ---------------------------------------------------------------------
do $$
declare
  v_table text;
  v_tables text[] := array[
    'workspaces', 'school_profiles', 'workspace_members', 'workspace_invitations',
    'custom_labels', 'files', 'profiles', 'data_requests',
    'plans', 'plan_prices', 'plan_limits', 'plan_modules', 'subscriptions',
    'workspace_member_capabilities', 'user_preferences', 'device_registrations'
  ];
begin
  foreach v_table in array v_tables loop
    insert into public.audit_action_catalog (action, severity, sentence_en, sentence_bn, is_generic)
    values
      (v_table || '.insert', 'info',
        '{actor} created a ' || replace(v_table, '_', ' ') || ' record',
        '{actor} একটি ' || replace(v_table, '_', ' ') || ' রেকর্ড তৈরি করেছেন', true),
      (v_table || '.update', 'notable',
        '{actor} updated a ' || replace(v_table, '_', ' ') || ' record ({fields})',
        '{actor} একটি ' || replace(v_table, '_', ' ') || ' রেকর্ড হালনাগাদ করেছেন ({fields})', true),
      (v_table || '.delete', 'critical',
        '{actor} deleted a ' || replace(v_table, '_', ' ') || ' record',
        '{actor} একটি ' || replace(v_table, '_', ' ') || ' রেকর্ড মুছে ফেলেছেন', true)
    on conflict (action) do update
      set severity    = excluded.severity,
          sentence_en = excluded.sentence_en,
          sentence_bn = excluded.sentence_bn,
          is_generic  = excluded.is_generic;
  end loop;
end
$$;

-- =====================================================================
-- 5. app.tg_audit() — replaced body. Same trigger, same attachment
--    contract (TG_ARGV[0] = drop list, unchanged); TG_ARGV[1] is NEW:
--    a free-text list whose values are nulled but whose NAMES survive in
--    changed_fields (F-ID-09 §5.3). No table uses it yet (diary/notes ship
--    with the academics migration) — the mechanism is proven by pgTAP
--    against a scratch table.
-- =====================================================================
create or replace function app.tg_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before         jsonb;
  v_after          jsonb;
  v_ws             uuid;
  v_row_id         uuid;
  v_col            text;
  v_action         text;
  v_actor_kind     public.audit_actor_kind;
  v_severity       public.audit_severity;
  v_changed_fields text[];
  v_all_keys       text[];
  v_secret_keys    text[];
  v_sensitive_keys text[];
  v_contact_keys   text[];
  v_masked         text;
begin
  if tg_op = 'DELETE' then
    v_before := to_jsonb(old);
    v_after  := null;
  elsif tg_op = 'UPDATE' then
    v_before := to_jsonb(old);
    v_after  := to_jsonb(new);
    if v_before = v_after then
      return new;                       -- no-op update: nothing to record
    end if;
  else
    v_before := null;
    v_after  := to_jsonb(new);
  end if;

  -- changed_fields is computed from the RAW payload, before any redaction,
  -- so a nulled free-text field's NAME still survives even though its value
  -- does not. Secret-deny-listed columns are removed from this list below,
  -- alongside their values.
  select array_agg(k) into v_all_keys
  from (
    select jsonb_object_keys(coalesce(v_before, '{}'::jsonb)) as k
    union
    select jsonb_object_keys(coalesce(v_after, '{}'::jsonb))
  ) all_keys;

  select array_agg(k) into v_changed_fields
  from unnest(coalesce(v_all_keys, '{}'::text[])) as k
  where v_before -> k is distinct from v_after -> k;

  -- Universal deny-list (F-ID-09 §5.3 / acceptance criterion 9): independent
  -- of whatever a table remembers to pass as its explicit redact list.
  -- Applied over v_all_keys, NOT v_changed_fields — on an UPDATE, before/after
  -- still carry every UNCHANGED column, so a payload scanned by changed-key
  -- only would write an untouched push_token or NID into the trail verbatim.
  select array_agg(k) into v_secret_keys
  from unnest(coalesce(v_all_keys, '{}'::text[])) as k
  where k ~* app.audit_secret_pattern();

  if v_secret_keys is not null then
    foreach v_col in array v_secret_keys loop
      v_before := v_before - v_col;
      v_after  := v_after  - v_col;
      v_changed_fields := array_remove(v_changed_fields, v_col);
    end loop;
  end if;

  -- Health / religion: value nulled, NAME kept (§5.3) — an owner may know
  -- that a medical field changed and who changed it, never what it says.
  select array_agg(k) into v_sensitive_keys
  from unnest(coalesce(v_all_keys, '{}'::text[])) as k
  where k ~* app.audit_sensitive_pattern();

  if v_sensitive_keys is not null then
    foreach v_col in array v_sensitive_keys loop
      if v_before ? v_col then v_before := jsonb_set(v_before, array[v_col], 'null'::jsonb); end if;
      if v_after  ? v_col then v_after  := jsonb_set(v_after,  array[v_col], 'null'::jsonb); end if;
    end loop;
  end if;

  -- Contact data: masked at write time (§5.3, acceptance criterion 10) so an
  -- invitation's recipient reads `r***@gmail.com` in the trail and nowhere
  -- does a full address or mobile number survive a row change.
  select array_agg(k) into v_contact_keys
  from unnest(coalesce(v_all_keys, '{}'::text[])) as k
  where k ~* app.audit_contact_pattern();

  if v_contact_keys is not null then
    foreach v_col in array v_contact_keys loop
      if jsonb_typeof(v_before -> v_col) = 'string' then
        v_masked := case when v_col ~* 'email$' then app.mask_email(v_before ->> v_col)
                         else app.mask_phone(v_before ->> v_col) end;
        v_before := jsonb_set(v_before, array[v_col], to_jsonb(v_masked));
      end if;
      if jsonb_typeof(v_after -> v_col) = 'string' then
        v_masked := case when v_col ~* 'email$' then app.mask_email(v_after ->> v_col)
                         else app.mask_phone(v_after ->> v_col) end;
        v_after := jsonb_set(v_after, array[v_col], to_jsonb(v_masked));
      end if;
    end loop;
  end if;

  -- Per-table explicit drop list (TG_ARGV[0]): token hashes, checksums,
  -- provider references. Column name AND value both disappear.
  if tg_nargs > 0 and coalesce(tg_argv[0], '') <> '' then
    foreach v_col in array string_to_array(tg_argv[0], ',') loop
      v_before := v_before - v_col;
      v_after  := v_after  - v_col;
      v_changed_fields := array_remove(v_changed_fields, v_col);
    end loop;
  end if;

  -- Per-table free-text list (TG_ARGV[1], NEW): value nulled, name kept in
  -- changed_fields (diary bodies, notes, message text — F-ID-09 §5.3).
  if tg_nargs > 1 and coalesce(tg_argv[1], '') <> '' then
    foreach v_col in array string_to_array(tg_argv[1], ',') loop
      if v_before ? v_col then v_before := jsonb_set(v_before, array[v_col], 'null'::jsonb); end if;
      if v_after  ? v_col then v_after  := jsonb_set(v_after,  array[v_col], 'null'::jsonb); end if;
    end loop;
  end if;

  -- `workspaces` audits itself: its own id is the tenant key.
  v_ws := coalesce(
            (v_after  ->> 'workspace_id')::uuid,
            (v_before ->> 'workspace_id')::uuid,
            case when tg_table_name = 'workspaces'
                 then coalesce((v_after ->> 'id')::uuid, (v_before ->> 'id')::uuid)
            end,
            app.current_workspace_id());

  v_row_id := coalesce((v_after ->> 'id')::uuid, (v_before ->> 'id')::uuid);

  v_action     := lower(tg_table_name) || '.' || lower(tg_op);
  v_actor_kind := case when auth.uid() is not null then 'user' else 'system' end;

  select severity into v_severity
    from public.audit_action_catalog
   where action = v_action;
  -- A missing catalogue row never blocks a tenant write — it defaults to
  -- 'info' and the catalogue-parity CI check (acceptance criterion 17)
  -- catches the gap for the next migration to fill, exactly like a table
  -- added but not yet in `v_tables` above.
  v_severity := coalesce(v_severity, 'info');

  insert into public.audit_events (
    workspace_id, actor_id, actor_kind, action, table_name, row_id,
    before, after, changed_fields, severity, correlation_id)
  values (
    v_ws,
    auth.uid(),
    v_actor_kind,
    v_action,
    tg_table_schema || '.' || tg_table_name,
    v_row_id,
    v_before, v_after, v_changed_fields, v_severity,
    app.current_correlation_id());

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

comment on function app.tg_audit() is
  'F-ID-09 Part 1: the generic row-change writer, extended with severity '
  '(from app.audit_action_catalog), actor_kind, changed_fields (computed '
  'pre-redaction) and three universal column classes applied to the WHOLE '
  'payload on top of the per-table TG_ARGV[0] list: '
  'app.audit_secret_pattern() drops name and value, '
  'app.audit_sensitive_pattern() (health, religion) nulls the value, and '
  'app.audit_contact_pattern() masks it. TG_ARGV[1] nulls per-table '
  'free-text columns while keeping their '
  'names in changed_fields. subject_user_id is intentionally left null here '
  '— which column means "the person this event is about" is table-specific '
  'and is set by explicit app.log_audit_event() calls instead.';

-- =====================================================================
-- 6. app.attach_audit — extended with a THIRD argument (free-text list).
--    Signature change: drop + recreate rather than CREATE OR REPLACE,
--    which cannot add a parameter to an existing function.
-- =====================================================================
drop function if exists app.attach_audit(regclass, text[]);

create function app.attach_audit(
  p_table    regclass,
  p_redact   text[] default '{}',
  p_freetext text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left('audit_' || replace(replace(p_table::text, '.', '_'), '"', ''), 63);
begin
  execute format('drop trigger if exists %I on %s', v_name, p_table);
  execute format(
    'create trigger %I after insert or update or delete on %s '
    'for each row execute function app.tg_audit(%L, %L)',
    v_name, p_table,
    array_to_string(coalesce(p_redact, '{}'), ','),
    array_to_string(coalesce(p_freetext, '{}'), ','));
end;
$$;

comment on function app.attach_audit(regclass, text[], text[]) is
  'One call per table attaches app.tg_audit() with an identical contract '
  'everywhere. p_redact columns are dropped entirely; p_freetext columns '
  'are nulled but their names remain in changed_fields (F-ID-09 §5.3).';

-- Migration-time DDL tool, granted to nobody — see §13 for why handing this
-- to `authenticated` would let any signed-in user re-attach (or effectively
-- disable) the audit trigger on any table in the database.
revoke all on function app.attach_audit(regclass, text[], text[])
  from public, anon, authenticated, service_role;

-- =====================================================================
-- 7. Attach the trigger to every tenant table — idempotent re-assertion of
--    0003/0004's tables plus the three not yet covered.
-- =====================================================================
select app.attach_audit('public.workspaces');
select app.attach_audit('public.school_profiles');
select app.attach_audit('public.workspace_members');
select app.attach_audit('public.workspace_invitations', array['token_hash', 'token_prefix']);
select app.attach_audit('public.custom_labels');
select app.attach_audit('public.files', array['checksum_sha256']);
select app.attach_audit('public.profiles', array['phone', 'email']);
select app.attach_audit('public.data_requests');
select app.attach_audit('public.plans');
select app.attach_audit('public.plan_prices');
select app.attach_audit('public.plan_limits');
select app.attach_audit('public.plan_modules');
select app.attach_audit('public.subscriptions',
                        array['provider_customer_ref', 'provider_subscription_ref']);

-- Not yet covered before this migration:
select app.attach_audit('public.workspace_member_capabilities');
select app.attach_audit('public.user_preferences');
select app.attach_audit('public.device_registrations');

comment on trigger audit_public_workspace_member_capabilities on public.workspace_member_capabilities is
  'F-ID-09 Part 1: fine-grained grants (fees.cashier and friends) are '
  'exactly the kind of change an owner needs a precise trail for.';

-- =====================================================================
-- 8. app.log_audit_event — replaced with the new columns and the
--    catalogue-enforcement contract (F-ID-09 §7, acceptance criterion 17).
--    Signature change (new trailing params): drop + recreate.
-- =====================================================================
drop function if exists app.log_audit_event(text, uuid, text, uuid, jsonb, jsonb, inet, text, uuid);

create function app.log_audit_event(
  p_action             text,
  p_workspace_id       uuid    default null,
  p_table_name         text    default null,
  p_row_id             uuid    default null,
  p_before             jsonb   default null,
  p_after              jsonb   default null,
  p_ip                 inet    default null,
  p_user_agent         text    default null,
  p_correlation_id     uuid    default null,
  p_actor_kind         public.audit_actor_kind default 'user',
  p_subject_user_id    uuid    default null,
  p_changed_fields     text[]  default null,
  p_user_agent_family  text    default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id       bigint;
  v_severity public.audit_severity;
begin
  if coalesce(btrim(p_action), '') = '' then
    raise exception 'an audit action is required' using errcode = '22023';
  end if;

  select severity into v_severity
    from public.audit_action_catalog
   where action = p_action;

  if v_severity is null then
    -- Acceptance criterion 17: a call site using an action absent from the
    -- catalogue must fail loudly, not write a garbage row (the Base44
    -- failure mode this whole feature exists to close off).
    raise exception 'unrecognised audit action: % — add it to public.audit_action_catalog first', p_action
      using errcode = '22023';
  end if;

  insert into public.audit_events (
    workspace_id, actor_id, actor_kind, action, table_name, row_id,
    before, after, changed_fields, severity,
    ip, user_agent, request_ip_hash, user_agent_family, correlation_id, subject_user_id)
  values (
    coalesce(p_workspace_id, app.current_workspace_id()),
    auth.uid(),
    p_actor_kind,
    p_action,
    coalesce(p_table_name, '-'),
    p_row_id,
    p_before, p_after, p_changed_fields, v_severity,
    null,                              -- `ip` deprecated: never write the raw address (§5.3)
    null,                              -- `user_agent` deprecated: never write the raw string
    app.hash_request_ip(p_ip),
    coalesce(p_user_agent_family, p_user_agent),
    coalesce(p_correlation_id, app.current_correlation_id()),
    p_subject_user_id)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function app.log_audit_event(text, uuid, text, uuid, jsonb, jsonb, inet, text, uuid, public.audit_actor_kind, uuid, text[], text) is
  'Records an auditable event that is not a row change (login, invitation '
  'redeemed, signed URL issued, support grant). Raises when `p_action` has '
  'no app.audit_action_catalog row — the enforcement half of acceptance '
  'criterion 17. Together with app.tg_audit() this is the complete set of '
  'writers to audit_events.';

revoke all on function app.log_audit_event(text, uuid, text, uuid, jsonb, jsonb, inet, text, uuid, public.audit_actor_kind, uuid, text[], text) from public;
grant execute on function app.log_audit_event(text, uuid, text, uuid, jsonb, jsonb, inet, text, uuid, public.audit_actor_kind, uuid, text[], text) to authenticated, service_role;

-- =====================================================================
-- 9. app.set_correlation_id / app.pre_request — the correlation-id
--    threading contract (F-ID-09 §5.2, OBSERVABILITY §1.4).
--
--    supabase-js talks to PostgREST, and PostgREST runs one transaction PER
--    REQUEST — a `set_config(..., true)` made by one RPC call is invisible
--    to the next `.from(...)` call, because they are different
--    transactions. The mechanism that actually threads a header into every
--    statement of THAT SAME request is PostgREST's `db-pre-request` hook:
--    a function it calls first, in the request's own transaction, before
--    RLS is evaluated. That is what makes `app.current_correlation_id()`
--    (already read by app.tg_audit() since 0003) resolve to something.
--
--    `alter role authenticator set pgrst.db_pre_request` requires altering
--    a role CI's disposable Postgres does not have, so it is guarded
--    exactly like the pg_cron block in 0001 — it silently no-ops there, and
--    pgTAP tests set `request.headers` / call app.pre_request() directly to
--    exercise the function itself.
-- =====================================================================
create or replace function app.pre_request()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers     jsonb;
  v_correlation text;
begin
  -- The hook runs before EVERY statement of every request, so it must never
  -- be the thing that fails one. A missing setting is normal (a direct `pg`
  -- connection); a non-JSON value should not turn into a 500 either, so the
  -- cast is caught rather than assumed safe.
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    return;
  end;

  if v_headers is null or jsonb_typeof(v_headers) <> 'object' then
    return;
  end if;

  v_correlation := v_headers ->> 'x-correlation-id';
  if v_correlation is not null
     and v_correlation ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    perform set_config('app.correlation_id', v_correlation, true);
  end if;
end;
$$;

comment on function app.pre_request() is
  'PostgREST db-pre-request hook: copies the x-correlation-id request '
  'header into the app.correlation_id transaction setting BEFORE RLS runs, '
  'so app.tg_audit() and app.log_audit_event() see it for every statement '
  'in the request, not just an RPC that explicitly sets it.';

revoke all on function app.pre_request() from public;
grant execute on function app.pre_request() to authenticated, anon, service_role;

do $$
begin
  execute 'alter role authenticator set pgrst.db_pre_request = ''app.pre_request''';
exception
  when insufficient_privilege or undefined_object then
    raise notice 'cannot alter role authenticator in this environment; '
                 'db-pre-request must be wired via the hosted project''s '
                 'connection pooler config instead';
end
$$;

-- Explicit, callable fallback for service-role / job / webhook paths that
-- issue several statements through ONE function call rather than through
-- PostgREST per-request headers (the pre-request hook does not apply to a
-- direct `pg` connection or to app.log_audit_event()'s own callers, who
-- already pass p_correlation_id explicitly).
create or replace function app.set_correlation_id(p_correlation_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select set_config('app.correlation_id', p_correlation_id::text, true)
$$;

comment on function app.set_correlation_id(uuid) is
  'Explicit fallback for app.pre_request(): sets app.correlation_id for the '
  'REST of the current transaction. For SQL callers in ONE session or '
  'transaction (jobs on a direct pg connection, other SQL functions); a '
  'separate PostgREST RPC is its own transaction, so calling this over the '
  'API cannot carry the id to a later request.';

revoke all on function app.set_correlation_id(uuid) from public;
grant execute on function app.set_correlation_id(uuid) to authenticated, service_role;

-- =====================================================================
-- 10. public.audit_events_view — the read-time redaction view (F-ID-09 §3)
--     `security_invoker` re-checks audit_events_select for the querying
--     role, so this is not a privilege-widening view.
-- =====================================================================
create or replace view public.audit_events_view
with (security_invoker = true)
as
select
  id, workspace_id, actor_id, actor_kind, action, table_name, row_id,
  subject_user_id, before, after, changed_fields, correlation_id,
  request_ip_hash, user_agent_family, severity, created_at
from public.audit_events;
-- Deliberately excludes the deprecated `ip` and `user_agent` columns: every
-- client reads this view, never the base table, so a raw address or a full
-- UA string can never reach a DTO even if a future column is added carelessly.

comment on view public.audit_events_view is
  'Every reader — the audit viewer, exports, the correlation view — reads '
  'THIS, never public.audit_events directly. It applies §5.3 at read time '
  'by omitting the raw ip/user_agent columns; row visibility still comes '
  'from audit_events_select via security_invoker.';

revoke all on public.audit_events_view from anon, authenticated;
grant select on public.audit_events_view to authenticated;

-- The view is the ONLY read surface for the deprecated columns (F-ID-09 §3).
-- 0003 granted table-wide `select` on the base table, which left the raw
-- `ip` / `user_agent` of every pre-0005 row reachable with a one-word change
-- to a `.from()` call — the view's omission of them was a convention, not a
-- boundary. A COLUMN-level grant makes it a boundary while keeping the
-- `security_invoker` view working, which needs the INVOKER to hold select on
-- the columns it reads (a blanket revoke would break the view itself).
revoke select on public.audit_events from anon, authenticated;
grant select (
  id, workspace_id, actor_id, actor_kind, action, table_name, row_id,
  subject_user_id, before, after, changed_fields, correlation_id,
  request_ip_hash, user_agent_family, severity, created_at
) on public.audit_events to authenticated;

-- =====================================================================
-- 11. RLS — widen audit_events_select to the subject-of-the-event branch
--     (F-ID-09 §2/§3: "a teacher can always see that they were removed and
--     by whom"). Owners and platform staff already covered by 0003.
-- =====================================================================
drop policy if exists audit_events_select on public.audit_events;
create policy audit_events_select on public.audit_events
  for select to authenticated
  using (
    (workspace_id is not null and app.has_role(workspace_id, array['owner']))
    or (workspace_id is null and actor_id = (select auth.uid()))
    or subject_user_id = (select auth.uid())
    or (select app.is_platform_admin())
  );

-- =====================================================================
-- 12. Retention — pg_cron scheduling for the 7-year rolling purge whose
--     SECURITY DEFINER job body (app.purge_expired_audit_events) already
--     shipped in 0003. Only the SCHEDULE is new here; guarded like the
--     0001 pg_cron extension block so a Postgres without pg_cron (CI, any
--     self-hosted target) never fails the migration.
-- =====================================================================
-- 0003 shipped the body with a floor of ONE year and 0003's own grants sweep
-- handed `execute` to `authenticated`. Together those let any signed-in user
-- run `select app.purge_expired_audit_events(1)` and, because the function is
-- SECURITY DEFINER, satisfy BOTH halves of app.tg_append_only()'s exception —
-- deleting six years of every tenant's trail. Replace the body with the
-- 7-year floor F-ID-09 §5.2 and DATA-MODEL §7.1 actually specify; §13 below
-- withdraws the grant.
create or replace function app.purge_expired_audit_events(p_keep_years integer default 7)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if p_keep_years < 7 then
    raise exception 'the audit retention window is 7 years and may not be shortened at the call site'
      using errcode = '22023';
  end if;

  -- app.is_privileged_context() reads `current_user`, which SECURITY DEFINER
  -- has already rewritten to this function's owner by the time the body runs —
  -- so it can never say "no" from in here. The `role` GUC is what PostgREST
  -- actually sets per request (`set local role authenticated`) and a definer
  -- context does NOT reset it, so it still names the caller.
  if coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon') then
    raise exception 'the retention purge runs only in a privileged context'
      using errcode = '42501';
  end if;

  perform set_config('app.retention_purge', 'on', true);

  delete from public.audit_events
   where created_at < now() - make_interval(years => p_keep_years);
  get diagnostics v_deleted = row_count;

  perform set_config('app.retention_purge', 'off', true);

  perform app.log_audit_event(
    'retention.audit_events_purged', null, 'public.audit_events', null, null,
    jsonb_build_object('deleted', v_deleted, 'keep_years', p_keep_years));

  return v_deleted;
end;
$$;

comment on function app.purge_expired_audit_events(integer) is
  'Rolling 7-year retention, the ONLY path that may DELETE from an '
  'append-only table. Three independent conditions: a 7-year floor that the '
  'caller cannot argue down, app.is_privileged_context() evaluated BEFORE '
  'the definer context could mask it, and the app.retention_purge flag that '
  'only this function sets. Scheduled monthly with pg_cron; not executable '
  'by `authenticated` (§13).';

do $$
begin
  perform cron.schedule(
    'audit-events-purge',
    '0 3 1 * *',                       -- 03:00 UTC on the 1st of every month
    $cron$select app.purge_expired_audit_events()$cron$);
exception
  -- invalid_schema_name: the `cron` schema does not exist at all (pg_cron was
  -- never installed — CI's plain postgres:17 container, most self-hosted
  -- targets). undefined_function: schema exists, extension does not.
  -- insufficient_privilege: installed but this role cannot use it.
  when invalid_schema_name or undefined_table or undefined_function or insufficient_privilege then
    raise notice 'pg_cron not available in this environment; schedule '
                 '''audit-events-purge'' manually on the hosted project';
end
$$;

-- =====================================================================
-- 13. Function grants sweep — same pattern as 0001/0003/0004, with the
--     exclusion list those sweeps were missing.
--
--     `authenticated` holds `usage` on schema `app` (0001 §5), so a blanket
--     "grant execute on every app function to authenticated" hands a signed-in
--     user every SECURITY DEFINER helper in the schema. Three of them are DDL
--     or retention tools, and all three break this feature's own guarantees:
--
--       app.purge_expired_audit_events  — deletes from an append-only table
--       app.attach_audit                — `drop trigger` then recreate, so a
--                                         caller can re-attach the audit
--                                         trigger to any table with a redact
--                                         list that hides what they are about
--                                         to do (or attach it to
--                                         `audit_events` itself and recurse)
--       app.attach_append_only /
--       app.attach_updated_at /
--       app.attach_freeze_workspace     — same shape, same reach
--
--     These are migration-time tools. Nothing in apps/ or packages/ calls
--     them at runtime, so they are granted to nobody: a migration runs as the
--     owner and pg_cron runs as the scheduling superuser.
-- =====================================================================
do $$
declare
  f record;
  v_privileged text[] := array[
    'purge_expired_audit_events',
    'attach_audit',
    'attach_append_only',
    'attach_updated_at',
    'attach_freeze_workspace'
  ];
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app'
  loop
    execute format('revoke all on function %s from public', f.sig);
    if f.proname = any (v_privileged) then
      execute format('revoke all on function %s from anon, authenticated, service_role', f.sig);
    else
      execute format('grant execute on function %s to authenticated, service_role', f.sig);
    end if;
  end loop;
end
$$;

reset check_function_bodies;
