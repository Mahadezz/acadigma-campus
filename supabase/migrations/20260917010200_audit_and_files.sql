-- =====================================================================
-- 0003 · audit, files, and the server-only machinery
-- audit_events · files · file_access_log ·
-- app.document_counters · app.idempotency_keys · app.jobs · app.inbound_events
-- consent_records · legal_acceptances · data_requests · personal_data_map
-- ---------------------------------------------------------------------
-- PRODUCT-DECISIONS 6.5 (private files), 6.8 (append-only audit),
-- ARCHITECTURE §4 (audit, files, sequential ids) and §5 (idempotency,
-- jobs, webhooks).
--
-- The `app.*` tables are server-only: they hold no user-facing rows
-- and must never be reachable through PostgREST, so they live outside the
-- exposed schema. RLS is still enabled on them as defence in depth.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type public.file_visibility as enum ('private', 'workspace', 'public');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.file_access_action as enum ('upload', 'signed_url', 'download', 'preview', 'delete');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.background_job_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.idempotency_status as enum ('in_progress', 'succeeded', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.inbound_event_status as enum ('received', 'processed', 'failed', 'ignored');
exception when duplicate_object then null; end $$;

-- =====================================================================
-- 2. audit_events — append-only, written only by app.tg_audit()
-- =====================================================================
create table if not exists public.audit_events (
  id             bigint generated always as identity primary key,
  workspace_id   uuid,          -- intentionally NOT a foreign key, see below
  actor_id       uuid,          -- intentionally NOT a foreign key, see below
  action         text not null,
  table_name     text not null,
  row_id         uuid,
  before         jsonb,
  after          jsonb,
  correlation_id uuid,
  ip             inet,
  user_agent     text,
  created_at     timestamptz not null default now()
);

comment on table public.audit_events is
  'Append-only change log filled by the generic trigger app.tg_audit() in '
  'the same transaction as the mutation. No client may INSERT, and UPDATE '
  'and DELETE are refused for every role (PRODUCT-DECISIONS 6.8). '
  'workspace_id may be NULL for platform-level events.';
comment on column public.audit_events.workspace_id is
  'Deliberately NOT a foreign key. History must outlive what it describes, '
  'and any referential action (CASCADE or SET NULL) would be an UPDATE or '
  'DELETE against an append-only table — which the guard trigger refuses. '
  'Same reasoning for actor_id.';

create index if not exists audit_events_workspace_time_idx
  on public.audit_events (workspace_id, created_at desc);
-- justification: the audit viewer pages one workspace newest-first; this is
-- also the RLS policy column, so the policy and the query use one index.

create index if not exists audit_events_row_idx
  on public.audit_events (table_name, row_id, created_at desc);
-- justification: "who changed this child's medical record, and when" — the
-- question the Base44 audit trail could not answer.

create index if not exists audit_events_actor_idx
  on public.audit_events (actor_id, created_at desc) where actor_id is not null;
-- justification: incident response ("everything this account touched").

create index if not exists audit_events_correlation_idx
  on public.audit_events (correlation_id) where correlation_id is not null;
-- justification: joins a request's log line (pino) to its DB effects.

-- Append-only: refuse the verbs at the table level for every role...
revoke insert, update, delete, truncate on public.audit_events from anon, authenticated, service_role;
-- ...and again in a trigger, because the table owner and any role with
-- BYPASSRLS would otherwise slip past a mere GRANT.
select app.attach_append_only('public.audit_events');

-- ---------------------------------------------------------------------
-- app.log_audit_event — the ONLY non-trigger writer.
--
-- The generic trigger covers row changes. Plenty of auditable things are
-- not row changes: a login, an invitation redeemed, a signed URL issued for
-- an ID document, platform staff opening a support grant. Those go through
-- here. No application role — not `authenticated`, not `service_role` —
-- holds INSERT on audit_events, so this function and app.tg_audit() are the
-- complete set of writers, and both run inside the caller's transaction.
--
-- workspace_id is NULLABLE: account-level and platform-level events have no
-- workspace, and forcing one would mean inventing a tenant for them.
-- ---------------------------------------------------------------------
create or replace function app.log_audit_event(
  p_action         text,
  p_workspace_id   uuid    default null,
  p_table_name     text    default null,
  p_row_id         uuid    default null,
  p_before         jsonb   default null,
  p_after          jsonb   default null,
  p_ip             inet    default null,
  p_user_agent     text    default null,
  p_correlation_id uuid    default null)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if coalesce(btrim(p_action), '') = '' then
    raise exception 'an audit action is required' using errcode = '22023';
  end if;

  insert into public.audit_events (
    workspace_id, actor_id, action, table_name, row_id,
    before, after, ip, user_agent, correlation_id)
  values (
    coalesce(p_workspace_id, app.current_workspace_id()),
    auth.uid(),
    p_action,
    coalesce(p_table_name, '-'),
    p_row_id,
    p_before, p_after, p_ip, p_user_agent,
    coalesce(p_correlation_id, app.current_correlation_id()))
  returning id into v_id;

  return v_id;
end;
$$;

comment on function app.log_audit_event(text, uuid, text, uuid, jsonb, jsonb, inet, text, uuid) is
  'Records an auditable event that is not a row change (login, invitation '
  'redeemed, signed URL issued, support grant). Together with app.tg_audit() '
  'this is the complete set of writers to audit_events.';

-- =====================================================================
-- 3. files — one row per stored object (PRODUCT-DECISIONS 6.5)
-- =====================================================================
create table if not exists public.files (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  owner_id          uuid references public.profiles (id) on delete set null,
  bucket            text not null default 'private' check (bucket in ('private', 'public')),
  path              text not null,
  original_name     text not null,
  mime_type         text not null,
  size_bytes        bigint not null check (size_bytes >= 0),
  checksum_sha256   bytea,
  visibility        public.file_visibility not null default 'private',
  kind              text,
  is_sensitive      boolean not null default false,
  virus_scan_status text not null default 'pending'
                      check (virus_scan_status in ('pending', 'clean', 'infected', 'skipped')),
  linked_table      text,
  linked_row_id     uuid,
  download_count    integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references public.profiles (id) on delete set null,
  deleted_at        timestamptz,
  constraint files_public_bucket_is_public_visibility
    check (bucket = 'private' or visibility = 'public'),
  constraint files_sensitive_is_private
    check (not is_sensitive or visibility = 'private')
);

comment on table public.files is
  'Every stored object. Default bucket is `private`; the `public` bucket is '
  'only for marketing assets and avatars. Downloads are served by '
  '/api/files/[id] as 5-minute signed URLs after a policy check, and logged '
  'to file_access_log (PRODUCT-DECISIONS 6.5, 4.7).';
comment on column public.files.is_sensitive is
  'NID scans, health records, CVs, purchased products. Forced to '
  'visibility = private and redacted from audit payloads.';
comment on column public.files.deleted_at is
  'SOFT DELETE. The storage object is removed by a background job after the '
  'row is tombstoned, so a mis-click is recoverable.';

create unique index if not exists files_bucket_path_key on public.files (bucket, path);
-- justification: one row per storage object; also the lookup used when
-- reconciling storage against the table.

create index if not exists files_workspace_live_idx
  on public.files (workspace_id, created_at desc) include (size_bytes)
  where deleted_at is null;
-- justification: (a) the workspace file list, (b) the storage-quota meter —
-- sum(size_bytes) per workspace runs index-only off the INCLUDE column
-- (PRODUCT-DECISIONS 3.11). workspace_id is also the RLS policy column.

create index if not exists files_owner_idx
  on public.files (owner_id, created_at desc) where deleted_at is null;
-- justification: "my files", and the second branch of the SELECT policy.

create index if not exists files_link_idx
  on public.files (linked_table, linked_row_id) where deleted_at is null;
-- justification: "attachments of this lesson plan / student / listing".

create index if not exists files_gc_idx
  on public.files (deleted_at) where deleted_at is not null;
-- justification: the storage garbage-collection job scans tombstones only.

-- =====================================================================
-- 4. file_access_log — append-only download trail
-- =====================================================================
create table if not exists public.file_access_log (
  id             bigint generated always as identity primary key,
  file_id        uuid not null,   -- FK-free: see audit_events.workspace_id
  workspace_id   uuid not null,   -- FK-free: see audit_events.workspace_id
  user_id        uuid,            -- FK-free: see audit_events.workspace_id
  action         public.file_access_action not null,
  ip             inet,
  user_agent     text,
  correlation_id uuid,
  created_at     timestamptz not null default now()
);

comment on table public.file_access_log is
  'Every signed-URL issue and download. Append-only. Retained 1 year '
  '(ARCHITECTURE §10).';

create index if not exists file_access_log_file_idx
  on public.file_access_log (file_id, created_at desc);
-- justification: "who downloaded this product / this NID scan".

create index if not exists file_access_log_workspace_idx
  on public.file_access_log (workspace_id, created_at desc);
-- justification: RLS policy column + the per-school access report.

create index if not exists file_access_log_user_idx
  on public.file_access_log (user_id, created_at desc) where user_id is not null;
-- justification: abuse detection (bulk downloads by one account).

select app.attach_append_only('public.file_access_log');
revoke insert, update, delete, truncate on public.file_access_log from anon, authenticated, service_role;

-- Server-side writer: the only supported way to add a row.
create or replace function app.log_file_access(
  p_file_id        uuid,
  p_action         public.file_access_action,
  p_ip             inet default null,
  p_user_agent     text default null,
  p_correlation_id uuid default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ws uuid;
begin
  select f.workspace_id into v_ws from public.files f where f.id = p_file_id;
  if v_ws is null then
    raise exception 'file % not found', p_file_id using errcode = '22023';
  end if;

  insert into public.file_access_log
    (file_id, workspace_id, user_id, action, ip, user_agent, correlation_id)
  values
    (p_file_id, v_ws, auth.uid(), p_action, p_ip, p_user_agent,
     coalesce(p_correlation_id, app.current_correlation_id()));

  if p_action = 'download' then
    update public.files set download_count = download_count + 1 where id = p_file_id;
  end if;
end;
$$;

-- =====================================================================
-- 5. app.document_counters — the ONE counter mechanism
--
-- Replaces what would otherwise have been three near-identical tables
-- (id_counters, invoice_counters, fee_counters). Student ids, staff ids,
-- resource codes, order numbers, invoice numbers and fee money-receipt
-- numbers all come from here, through app.next_id(). Three counter tables
-- is how two of them end up with different locking and one starts issuing
-- duplicate receipt numbers on a busy fee-collection morning.
-- =====================================================================
create table if not exists app.document_counters (
  workspace_id uuid references public.workspaces (id) on delete cascade,
  kind         text not null check (kind ~ '^[a-z][a-z0-9_]{1,40}$'),
  year         integer not null default 0 check (year = 0 or year between 2000 and 2999),
  prefix       text not null,
  pad_width    smallint not null default 4 check (pad_width between 1 and 12),
  last_no      integer not null default 0 check (last_no >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table app.document_counters is
  'Gapless per-workspace document numbering. Mutated only by app.next_id(), '
  'under an advisory lock plus a row lock. year = 0 means the kind does not '
  'restart annually. workspace_id is NULL for platform-level sequences '
  '(payout batches, platform invoices).';
comment on column app.document_counters.workspace_id is
  'NULLABLE, which is why the natural key is a unique INDEX rather than a '
  'primary key: Postgres primary-key columns cannot be nullable, and the '
  'index below expresses the same constraint with NULL treated as one '
  'distinct value rather than as "never equal to anything".';

create unique index if not exists document_counters_key
  on app.document_counters
     (coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, year);
-- justification: the natural key and the only access path. The COALESCE is
-- what makes two platform-level counters of the same kind collide, which a
-- plain unique index over a nullable column would not.

alter table app.document_counters enable row level security;
-- no policies: reachable only through app.next_id() (security definer).

-- =====================================================================
-- 6. app.idempotency_keys — ARCHITECTURE §5
-- =====================================================================
create table if not exists app.idempotency_keys (
  scope        text not null,
  key          text not null,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  user_id      uuid references public.profiles (id) on delete set null,
  request_hash bytea not null,
  status       app.idempotency_status not null default 'in_progress',
  response     jsonb,
  error        text,
  locked_at    timestamptz not null default now(),
  completed_at timestamptz,
  expires_at   timestamptz not null default now() + interval '24 hours',
  primary key (scope, key)
);

comment on table app.idempotency_keys is
  'Dedupes retryable mutations: attendance save, payment creation, '
  'invitation send, AI credit debit. request_hash catches a reused key '
  'carrying a different body.';

create index if not exists idempotency_keys_expiry_idx on app.idempotency_keys (expires_at);
-- justification: the only non-PK access path — the hourly sweeper.

alter table app.idempotency_keys enable row level security;

-- =====================================================================
-- 7. app.jobs — application job queue drained by the Vercel cron route
-- =====================================================================
create table if not exists app.jobs (
  id              bigint generated always as identity primary key,
  workspace_id    uuid references public.workspaces (id) on delete cascade,
  type            text not null,
  payload         jsonb not null default '{}'::jsonb,
  run_at          timestamptz not null default now(),
  status          app.background_job_status not null default 'queued',
  priority        smallint not null default 100,
  attempts        smallint not null default 0,
  max_attempts    smallint not null default 5,
  last_error      text,
  locked_at       timestamptz,
  locked_by       text,
  idempotency_key text,
  correlation_id  uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz
);

comment on table app.jobs is
  'Application-level jobs: emails, PDF renders, risk scoring, payouts. '
  'Drained every minute with FOR UPDATE SKIP LOCKED. Pure-SQL schedules '
  '(daily credit reset, hold release, trial expiry) use pg_cron instead.';

create index if not exists jobs_ready_idx
  on app.jobs (priority, run_at) where status = 'queued';
-- justification: the drain query is exactly
--   where status='queued' and run_at<=now() order by priority, run_at
--   limit N for update skip locked
-- The partial index keeps finished jobs out of the hot path entirely.

create index if not exists jobs_stuck_idx
  on app.jobs (locked_at) where status = 'running';
-- justification: the reaper releases jobs whose worker died.

create unique index if not exists jobs_idempotency_key
  on app.jobs (type, idempotency_key) where idempotency_key is not null;
-- justification: "enqueue once" for webhook-driven and cron-driven work.

create index if not exists jobs_workspace_idx
  on app.jobs (workspace_id, type, created_at desc) where workspace_id is not null;
-- justification: per-school job history on the platform console.

alter table app.jobs enable row level security;
select app.attach_updated_at('app.jobs');

-- =====================================================================
-- 8. app.inbound_events — webhook landing zone (ARCHITECTURE §5)
-- =====================================================================
create table if not exists app.inbound_events (
  id                  bigint generated always as identity primary key,
  provider            text not null,
  event_id            text not null,
  workspace_id        uuid,
  merchant_account_id uuid,
  event_type          text,
  signature_verified  boolean not null default false,
  payload             jsonb not null,
  headers             jsonb,
  status              app.inbound_event_status not null default 'received',
  attempts            smallint not null default 0,
  error               text,
  processed_at        timestamptz,
  created_at          timestamptz not null default now()
);

comment on table app.inbound_events is
  'Every SSLCommerz IPN / Resend event is written here FIRST, then '
  'processed. Entitlements are granted only from a row whose '
  'signature_verified is true and whose status reached `processed`.';

create unique index if not exists inbound_events_provider_event_key
  on app.inbound_events (provider, event_id);
-- justification: the idempotency guarantee for webhook redelivery.

create index if not exists inbound_events_pending_idx
  on app.inbound_events (created_at) where status = 'received';
-- justification: the processor scans only unprocessed events.

create index if not exists inbound_events_workspace_idx
  on app.inbound_events (workspace_id, created_at desc) where workspace_id is not null;
-- justification: fee collection gives each school its own merchant account,
-- so "show me this school's gateway callbacks" becomes a real support
-- question. Both columns are NULLABLE: platform-level events (subscription
-- payments to our own merchant account, Resend delivery events) have
-- neither a tenant nor a merchant account, and inventing one would be a lie.

comment on column app.inbound_events.merchant_account_id is
  'Which workspace_merchant_accounts row the callback arrived against. NULL '
  'for platform-level events. Recorded before processing, so a callback '
  'signed by the wrong school''s credentials is detectable rather than '
  'merely rejected.';

alter table app.inbound_events enable row level security;

-- =====================================================================
-- 9. RLS for the public tables in this migration
-- =====================================================================
alter table public.audit_events    enable row level security;
alter table public.files           enable row level security;
alter table public.file_access_log enable row level security;

-- ---- audit_events ---------------------------------------------------
-- Readable by workspace OWNERS and platform staff only
-- (PRODUCT-DECISIONS 6.8). Admins are deliberately excluded: the log has to
-- be able to record what an admin did without that admin curating it.
drop policy if exists audit_events_select on public.audit_events;
create policy audit_events_select on public.audit_events
  for select to authenticated
  using (
    (workspace_id is not null and app.has_role(workspace_id, array['owner']))
    or (select app.is_platform_admin())
  );
-- No INSERT/UPDATE/DELETE policy at all. app.tg_audit() is SECURITY DEFINER
-- and owned by the table owner, so it writes without needing one.

-- ---- files ----------------------------------------------------------
drop policy if exists files_select_public on public.files;
create policy files_select_public on public.files
  for select to anon, authenticated
  using (visibility = 'public' and deleted_at is null);

drop policy if exists files_select_member on public.files;
create policy files_select_member on public.files
  for select to authenticated
  using (
    deleted_at is null
    and (
      (visibility = 'workspace' and app.member_role(workspace_id) is not null)
      or owner_id = (select auth.uid())
      or app.has_role(workspace_id, array['owner', 'admin'])
      or (select app.is_platform_admin())
    )
  );

drop policy if exists files_insert on public.files;
create policy files_insert on public.files
  for insert to authenticated
  with check (
    app.has_role(workspace_id, array['owner', 'admin', 'teacher', 'staff'])
    and owner_id   = (select auth.uid())
    and created_by = (select auth.uid())
    and deleted_at is null
  );

drop policy if exists files_update on public.files;
create policy files_update on public.files
  for update to authenticated
  using (owner_id = (select auth.uid()) or app.has_role(workspace_id, array['owner', 'admin']))
  with check (owner_id = (select auth.uid()) or app.has_role(workspace_id, array['owner', 'admin']));
-- Deletion is `update files set deleted_at = now()`. There is no DELETE
-- policy: rows are tombstoned so the storage GC job can still find them.

-- ---- file_access_log ------------------------------------------------
drop policy if exists file_access_log_select on public.file_access_log;
create policy file_access_log_select on public.file_access_log
  for select to authenticated
  using (
    app.has_role(workspace_id, array['owner', 'admin'])
    or (select app.is_platform_admin())
  );
-- No write policies: rows come from app.log_file_access() only.

-- =====================================================================
-- 10. Tenant freeze + audit triggers
-- =====================================================================
select app.attach_updated_at('public.files');
select app.attach_freeze_workspace('public.files');

-- Audit every identity + file table now that audit_events exists.
-- The second argument redacts columns that must never land in a log.
select app.attach_audit('public.workspaces');
select app.attach_audit('public.school_profiles');
select app.attach_audit('public.workspace_members');
select app.attach_audit('public.workspace_invitations', array['token_hash', 'token_prefix']);
select app.attach_audit('public.custom_labels');
select app.attach_audit('public.files', array['checksum_sha256']);
select app.attach_audit('public.profiles', array['phone', 'email']);

-- =====================================================================
-- 11. Grants
-- =====================================================================
revoke all on public.audit_events, public.files, public.file_access_log
  from anon, authenticated;

grant select on public.audit_events              to authenticated;
grant select on public.files                     to anon, authenticated;
grant insert, update on public.files             to authenticated;
grant select on public.file_access_log           to authenticated;

-- `app` tables are never granted to anon or authenticated. The service role
-- and SECURITY DEFINER functions reach them; nothing else does.
revoke all on app.document_counters, app.idempotency_keys, app.jobs, app.inbound_events
  from anon, authenticated;


-- =====================================================================
-- 9A. Compliance (COMPLIANCE-PDPA.md §9)
--
-- Consent, legal acceptance, data-subject requests, the declared erasure
-- map, and retention. Three of the four tables are append-only for the
-- same reason audit_events is: they are the evidence that a thing was
-- done, and evidence you can edit is not evidence.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 9A.1 consent_records — proof that a person agreed, and to what text
-- ---------------------------------------------------------------------
create table if not exists public.consent_records (
  id                 bigint generated always as identity primary key,
  workspace_id       uuid,          -- FK-free: evidence outlives the tenant
  subject_type       text not null check (subject_type in ('student', 'candidate', 'seller', 'guardian')),
  subject_id         uuid,
  consenting_user_id uuid,
  guardian_id        uuid,
  purpose            text not null check (purpose ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  text_version       text not null,
  text_sha256        bytea not null,
  channel            text not null check (channel in ('web', 'email', 'sms', 'paper', 'in_person')),
  masked_address     text,
  ip_hash            bytea,
  locale             text not null default 'en',
  invitation_id      uuid,
  evidence_file_id   uuid,
  created_at         timestamptz not null default now(),
  constraint consent_records_has_a_person
    check (consenting_user_id is not null or guardian_id is not null or channel in ('paper', 'in_person'))
);

comment on table public.consent_records is
  'Append-only record that a specific person agreed to a specific text. '
  'text_sha256 pins WHICH version of the notice they saw, so a later '
  'rewrite of the privacy text cannot retroactively change what was agreed '
  '- the hash is the whole point of the row. masked_address stores the '
  'contact the consent was sent to in masked form (ra****@gmail.com), never '
  'in full: proving delivery does not require re-storing the address here. '
  'ip_hash is a salted hash, not an IP.';
comment on column public.consent_records.purpose is
  'Dotted purpose key: student.enrolment_data, candidate.document_share, '
  'seller.payout_kyc, guardian.portal_access.';

create index if not exists consent_records_subject_idx
  on public.consent_records (subject_type, subject_id, created_at desc);
-- justification: the DSAR question is always "what has this person consented
-- to", answered per subject newest-first.

create index if not exists consent_records_workspace_idx
  on public.consent_records (workspace_id, created_at desc) where workspace_id is not null;
-- justification: RLS policy column + a school's own consent register.

create index if not exists consent_records_user_idx
  on public.consent_records (consenting_user_id, created_at desc)
  where consenting_user_id is not null;
-- justification: the second SELECT policy branch - my own consents.

create index if not exists consent_records_text_version_idx
  on public.consent_records (purpose, text_version);
-- justification: "who is still on v1 of the notice and needs re-consent",
-- which is the question a text change creates.

select app.attach_append_only('public.consent_records');
revoke insert, update, delete, truncate on public.consent_records
  from anon, authenticated, service_role;

-- The only writer besides app.redeem_invitation().
create or replace function app.record_consent(
  p_subject_type       text,
  p_purpose            text,
  p_text_version       text,
  p_text_sha256        bytea,
  p_channel            text,
  p_subject_id         uuid default null,
  p_workspace_id       uuid default null,
  p_consenting_user_id uuid default null,
  p_guardian_id        uuid default null,
  p_masked_address     text default null,
  p_ip_hash            bytea default null,
  p_locale             text default 'en',
  p_invitation_id      uuid default null,
  p_evidence_file_id   uuid default null)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.consent_records (
    workspace_id, subject_type, subject_id, consenting_user_id, guardian_id,
    purpose, text_version, text_sha256, channel, masked_address, ip_hash,
    locale, invitation_id, evidence_file_id)
  values (
    coalesce(p_workspace_id, app.current_workspace_id()),
    p_subject_type, p_subject_id,
    coalesce(p_consenting_user_id, auth.uid()), p_guardian_id,
    p_purpose, p_text_version, p_text_sha256, p_channel, p_masked_address,
    p_ip_hash, p_locale, p_invitation_id, p_evidence_file_id)
  returning id into v_id;

  perform app.log_audit_event('consent.recorded', p_workspace_id,
    'public.consent_records', null, null,
    jsonb_build_object('purpose', p_purpose, 'text_version', p_text_version,
                       'subject_type', p_subject_type));
  return v_id;
end;
$$;

comment on function app.record_consent is
  'Records consent gathered on paper or in person. The web path goes through '
  'app.redeem_invitation(), which writes the same row in the same '
  'transaction as the membership it creates - so a membership can never '
  'exist without the consent that justified it.';

-- ---------------------------------------------------------------------
-- 9A.2 legal_acceptances — DPA, terms, privacy notice
-- ---------------------------------------------------------------------
create table if not exists public.legal_acceptances (
  id           bigint generated always as identity primary key,
  workspace_id uuid,          -- NULL for a personal acceptance (terms, privacy)
  user_id      uuid not null,
  document     text not null check (document in ('dpa', 'terms', 'privacy', 'seller_agreement')),
  version      text not null,
  text_sha256  bytea not null,
  ip_hash      bytea,
  user_agent   text,
  locale       text not null default 'en',
  accepted_at  timestamptz not null default now()
);

comment on table public.legal_acceptances is
  'Append-only. workspace_id is NOT NULL only for documents accepted on '
  'behalf of a school (the DPA); terms and privacy are accepted by a person. '
  'The pair (document, version) plus text_sha256 is what makes "which terms '
  'did they actually agree to" answerable a year later.';

create unique index if not exists legal_acceptances_once_per_version
  on public.legal_acceptances
     (coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid),
      user_id, document, version);
-- justification: accepting the same version twice is a UI bug, not two
-- facts. COALESCE because workspace_id is nullable and NULL would otherwise
-- never collide with itself.

create index if not exists legal_acceptances_workspace_idx
  on public.legal_acceptances (workspace_id, document, version)
  where workspace_id is not null;
-- justification: "has this school signed the current DPA" - asked on every
-- enterprise onboarding and in the compliance report.

create index if not exists legal_acceptances_user_idx
  on public.legal_acceptances (user_id, accepted_at desc);
-- justification: RLS policy column + the account's own legal history.

select app.attach_append_only('public.legal_acceptances');
revoke insert, update, delete, truncate on public.legal_acceptances
  from anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 9A.3 data_requests — export, erasure, correction
--      NOT append-only: a request legitimately moves through states.
-- ---------------------------------------------------------------------
create table if not exists public.data_requests (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid references public.workspaces (id) on delete set null,
  requester_user_id  uuid not null references public.profiles (id) on delete restrict,
  subject_type       text not null check (subject_type in ('self', 'student', 'candidate', 'seller', 'guardian')),
  subject_id         uuid,
  kind               text not null check (kind in ('export', 'erasure', 'correction')),
  status             text not null default 'received'
                       check (status in ('received', 'verifying', 'in_progress',
                                         'completed', 'refused', 'on_hold')),
  legal_hold_reason  text,
  refusal_reason     text,
  detail             text,
  file_id            uuid references public.files (id) on delete set null,
  due_on             date not null default ((now() at time zone 'Asia/Dhaka')::date + 30),
  completed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint data_requests_refusal_has_reason
    check (status <> 'refused' or refusal_reason is not null),
  constraint data_requests_hold_has_reason
    check (status <> 'on_hold' or legal_hold_reason is not null)
);

comment on table public.data_requests is
  'Data-subject requests and their clock. due_on defaults to 30 days, which '
  'is the commitment in the privacy notice, so an overdue request is a query '
  'rather than a memory. An erasure that cannot be honoured - a fee ledger '
  'under a statutory retention period, say - is `on_hold` WITH a reason, '
  'never silently dropped; the check constraint makes "refused because" and '
  '"held because" impossible to leave blank.';

create index if not exists data_requests_workspace_idx
  on public.data_requests (workspace_id, status, due_on);
-- justification: RLS policy column + the school's queue, oldest deadline
-- first, which is the only order that matters here.

create index if not exists data_requests_requester_idx
  on public.data_requests (requester_user_id, created_at desc);
-- justification: "my requests", the second SELECT policy branch.

create index if not exists data_requests_due_idx
  on public.data_requests (due_on)
  where status in ('received', 'verifying', 'in_progress');
-- justification: the overdue-request alarm scans only live requests.

create index if not exists data_requests_subject_idx
  on public.data_requests (subject_type, subject_id) where subject_id is not null;
-- justification: "is there an open request about this person" - checked
-- before any bulk delete, so we never erase something under active dispute.

-- ---------------------------------------------------------------------
-- 9A.4 personal_data_map — the declared erasure map, so CI can check it
-- ---------------------------------------------------------------------
create table if not exists public.personal_data_map (
  table_name      text not null,
  column_name     text not null,
  category        text not null check (category in
                    ('identity', 'contact', 'health', 'financial',
                     'biometric', 'behavioral', 'credential', 'location')),
  erasure_method  text not null check (erasure_method in
                    ('delete_row', 'null_out', 'redact', 'anonymize', 'retain_legal_basis')),
  legal_basis     text,
  retention_note  text,
  updated_at      timestamptz not null default now(),
  primary key (table_name, column_name),
  constraint personal_data_map_retention_has_basis
    check (erasure_method <> 'retain_legal_basis' or legal_basis is not null)
);

comment on table public.personal_data_map is
  'The declared inventory of personal data and what erasure does to each '
  'column. It exists as a TABLE rather than a document so CI can assert '
  'coverage: a test walks information_schema, and any column on a table '
  'flagged as personal-data-bearing that is missing here fails the build. '
  'A privacy inventory that lives in a wiki page is out of date the week '
  'after it is written; this one cannot be, because adding a column without '
  'classifying it breaks the pipeline.';

create index if not exists personal_data_map_category_idx
  on public.personal_data_map (category);
-- justification: "show me every health column" - the question an audit asks.

-- ---------------------------------------------------------------------
-- 9A.5 Retention
-- ---------------------------------------------------------------------
alter table public.files
  add column if not exists purge_after timestamptz;

comment on column public.files.purge_after is
  'When this object must be gone. Set on upload for documents with a fixed '
  'window: NID and birth-certificate scans 90 days after admission '
  'completes, KYC documents 2 years after the last payout. NULL means the '
  'file lives as long as its owner row does. Deleting a scan we no longer '
  'need is not housekeeping - an ID scan we still hold is a breach we have '
  'not had yet.';

create index if not exists files_purge_idx
  on public.files (purge_after) where purge_after is not null and deleted_at is null;
-- justification: the retention job scans only files that have a deadline.

-- audit_events: 7-year rolling retention. The table still grants
-- UPDATE/DELETE to nobody; the purge runs inside this SECURITY DEFINER
-- function, which is the only caller that sets app.retention_purge.
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
  if p_keep_years < 1 then
    raise exception 'retention window must be at least one year' using errcode = '22023';
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
  'Rolling 7-year retention. The only path that can delete from an '
  'append-only table: it needs BOTH a privileged context and the '
  'app.retention_purge flag, and a client statement can never have the '
  'first. Scheduled monthly with pg_cron.';

-- ---------------------------------------------------------------------
-- 9A.6 RLS
-- ---------------------------------------------------------------------
alter table public.consent_records    enable row level security;
alter table public.legal_acceptances  enable row level security;
alter table public.data_requests      enable row level security;
alter table public.personal_data_map  enable row level security;

drop policy if exists consent_records_select on public.consent_records;
create policy consent_records_select on public.consent_records
  for select to authenticated
  using (
    consenting_user_id = (select auth.uid())
    or (workspace_id is not null and app.has_role(workspace_id, array['owner', 'admin']))
    or (select app.is_platform_admin())
  );
-- Platform staff DO get a read branch here, unlike the fee module: as the
-- processor we have to be able to produce consent evidence to a regulator,
-- and a consent record contains no sensitive content - only that someone
-- agreed to a named, hashed text.

drop policy if exists legal_acceptances_select on public.legal_acceptances;
create policy legal_acceptances_select on public.legal_acceptances
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (workspace_id is not null and app.has_role(workspace_id, array['owner', 'admin']))
    or (select app.is_platform_admin())
  );

drop policy if exists data_requests_select on public.data_requests;
create policy data_requests_select on public.data_requests
  for select to authenticated
  using (
    requester_user_id = (select auth.uid())
    or (workspace_id is not null and app.has_role(workspace_id, array['owner', 'admin']))
    or (select app.is_platform_admin())
  );

drop policy if exists data_requests_insert on public.data_requests;
create policy data_requests_insert on public.data_requests
  for insert to authenticated
  with check (requester_user_id = (select auth.uid()) and status = 'received');
-- Anyone may ask. Nobody may file a request in someone else's name, and
-- nobody may file one that starts anywhere but `received`.

drop policy if exists data_requests_update on public.data_requests;
create policy data_requests_update on public.data_requests
  for update to authenticated
  using (
    (workspace_id is not null and app.has_role(workspace_id, array['owner', 'admin']))
    or (select app.is_platform_admin()))
  with check (
    (workspace_id is not null and app.has_role(workspace_id, array['owner', 'admin']))
    or (select app.is_platform_admin()));
-- The requester cannot advance their own request to `completed`.

drop policy if exists personal_data_map_select on public.personal_data_map;
create policy personal_data_map_select on public.personal_data_map
  for select to authenticated using (true);
-- It is a schema catalogue. It contains no personal data - only the names
-- of columns that do - and the CI coverage test has to be able to read it.

drop policy if exists personal_data_map_write on public.personal_data_map;
create policy personal_data_map_write on public.personal_data_map
  for all to authenticated
  using ((select app.is_platform_admin()))
  with check ((select app.is_platform_admin()));

-- ---------------------------------------------------------------------
-- 9A.7 Triggers and grants
-- ---------------------------------------------------------------------
select app.attach_updated_at('public.data_requests');
select app.attach_updated_at('public.personal_data_map');
select app.attach_audit('public.data_requests');

revoke all on public.consent_records, public.legal_acceptances,
              public.data_requests, public.personal_data_map
  from anon, authenticated;

grant select on public.consent_records   to authenticated;
grant select on public.legal_acceptances to authenticated;
grant select, insert, update on public.data_requests to authenticated;
grant select on public.personal_data_map to authenticated;
grant insert, update, delete on public.personal_data_map to authenticated;  -- RLS: platform only

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
