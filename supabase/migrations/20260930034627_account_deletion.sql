-- =====================================================================
-- F-ID-01 Part 7 (D-113) · Account deletion with a 30-day grace
-- ---------------------------------------------------------------------
-- A person may delete their own account. Nothing is destroyed for 30
-- days; during that time they can sign in and cancel with one tap. On
-- day 30 a daily pg_cron job purges the ACCOUNT, never the schools' data:
--
--   removed     the personal workspace and everything in it; their
--               preferences, onboarding progress, devices, notifications
--               and guardian↔account links; email_log rows sent to them;
--               the auth.users row (identities, sessions, refresh tokens
--               and MFA factors go with it).
--   anonymised  the profiles row stays as a tombstone ('Deleted user',
--               every contact/identity column nulled, deleted_at set), so
--               every school row that names them (marks entered, register
--               taken, invitations sent, owner_id of a school they built)
--               still points at a valid row; their school memberships
--               read 'removed' with the membership phone nulled.
--   kept        every school record (students, guardians, marks,
--               attendance, staff records, files): the school is the
--               controller of those (COMPLIANCE-PDPA §6.0); audit_events,
--               consent_records, legal_acceptances, data_requests and
--               file_access_log (evidence, §6.4) — audit_events is never
--               touched, including the rows the purge itself writes.
--
-- Guards, all in the database:
--   * request/cancel act only on auth.uid(); no function takes a user id.
--   * The table has no client INSERT/UPDATE/DELETE grant at all.
--   * scheduled_purge_at >= requested_at + 30 days is a CHECK, and the
--     purge re-checks "pending and due" under a row lock.
--   * Blocked while the caller is the only active owner of any school
--     (owner, 2026-09-29: "blocked while sole owner of any school"); the
--     purge re-checks it and cancels rather than orphan a school.
--   * The purge functions are granted to nobody; pg_cron runs as the owner.
--
-- profiles.id no longer references auth.users (D-113): the tombstone must
-- outlive its auth user, and every school FK to profiles (44 SET NULL,
-- 3 RESTRICT, workspace_members CASCADE) must not fire.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. profiles: the tombstone marker, guarded like suspended_at.
-- ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_id_fkey;

alter table public.profiles add column if not exists deleted_at timestamptz;

comment on column public.profiles.deleted_at is
  'F-ID-01 Part 7 (D-113): set by app.purge_account when the account was '
  'purged. The row is then an anonymised tombstone with no auth.users row.';

-- Body identical to 20260926182848_security_audit_p1.sql plus deleted_at.
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

  if new.email is distinct from old.email or new.phone is distinct from old.phone then
    raise exception 'email and phone come from sign-in and cannot be changed here'
      using errcode = '42501';
  end if;

  if new.deleted_at is distinct from old.deleted_at then
    raise exception 'an account is deleted only by the purge job' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. account_deletion_requests
-- ---------------------------------------------------------------------
do $$ begin
  create type public.account_deletion_status as enum ('pending', 'cancelled', 'completed');
exception when duplicate_object then null; end $$;

create table if not exists public.account_deletion_requests (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete restrict,
  status              public.account_deletion_status not null default 'pending',
  requested_at        timestamptz not null default now(),
  scheduled_purge_at  timestamptz not null,
  cancelled_at        timestamptz,
  cancelled_by        uuid references public.profiles (id) on delete set null,
  completed_at        timestamptz,
  attempts            integer not null default 0,
  last_error          text,
  -- The grace period is a database fact, not an app setting.
  constraint account_deletion_requests_grace
    check (scheduled_purge_at >= requested_at + interval '30 days'),
  constraint account_deletion_requests_cancelled_has_time
    check (status <> 'cancelled' or cancelled_at is not null),
  constraint account_deletion_requests_completed_has_time
    check (status <> 'completed' or completed_at is not null)
);

comment on table public.account_deletion_requests is
  'F-ID-01 §4.9 (D-113): a person''s own request to delete their account. '
  'Written only by public.request_account_deletion / cancel_account_deletion '
  '(the caller''s own row) and app.purge_account (the daily job).';

-- One live request per person; the purge scans only live, due rows.
create unique index if not exists account_deletion_requests_one_pending
  on public.account_deletion_requests (user_id) where status = 'pending';
create index if not exists account_deletion_requests_due_idx
  on public.account_deletion_requests (scheduled_purge_at) where status = 'pending';
-- FK column; also "requests in the last 24 h" for the 3-a-day limit.
create index if not exists account_deletion_requests_user_idx
  on public.account_deletion_requests (user_id, requested_at desc);
create index if not exists account_deletion_requests_cancelled_by_idx
  on public.account_deletion_requests (cancelled_by) where cancelled_by is not null;

alter table public.account_deletion_requests enable row level security;

drop policy if exists account_deletion_requests_select on public.account_deletion_requests;
create policy account_deletion_requests_select on public.account_deletion_requests
  for select to authenticated
  using (user_id = (select auth.uid()) or (select app.is_platform_admin()));

revoke all on public.account_deletion_requests from public, anon, authenticated;
grant select on public.account_deletion_requests to authenticated;

-- ---------------------------------------------------------------------
-- 3. Who blocks a deletion: schools where p_user is the only active owner.
-- ---------------------------------------------------------------------
create or replace function app.account_deletion_blockers(p_user uuid)
returns table (workspace_id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.name
    from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id
   where m.user_id = p_user
     and m.role = 'owner'
     and m.status = 'active'
     and w.type = 'school'
     and app.count_active_owners(w.id) = 1
   order by w.name
$$;

revoke all on function app.account_deletion_blockers(uuid) from public, anon, authenticated;

create or replace function public.account_deletion_blockers()
returns table (workspace_id uuid, name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  return query select b.workspace_id, b.name from app.account_deletion_blockers(auth.uid()) b;
end;
$$;

revoke all on function public.account_deletion_blockers() from public, anon;
grant execute on function public.account_deletion_blockers() to authenticated;

-- ---------------------------------------------------------------------
-- 4. Request and cancel — the caller's own account only.
-- ---------------------------------------------------------------------
create or replace function public.request_account_deletion()
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_id   uuid;
  v_when timestamptz;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  -- Idempotent: a second request returns the date already set.
  select r.scheduled_purge_at into v_when
    from public.account_deletion_requests r
   where r.user_id = v_uid and r.status = 'pending';
  if found then
    return v_when;
  end if;

  if exists (select 1 from app.account_deletion_blockers(v_uid)) then
    raise exception 'SOLE_OWNER_BLOCKED' using errcode = 'P0001';
  end if;

  -- F-ID-01 §7: 3 requests a day (request/cancel cycles).
  if (select count(*) from public.account_deletion_requests r
       where r.user_id = v_uid and r.requested_at > now() - interval '24 hours') >= 3 then
    raise exception 'RATE_LIMITED' using errcode = '54000';
  end if;

  insert into public.account_deletion_requests (user_id, scheduled_purge_at)
  values (v_uid, now() + interval '30 days')
  returning id, scheduled_purge_at into v_id, v_when;

  perform set_config('app.workspace_id', '', true);   -- an account-level event
  perform app.log_audit_event('account.deletion_requested', null,
    'public.account_deletion_requests', v_id, null,
    jsonb_build_object('scheduled_purge_at', v_when),
    p_subject_user_id => v_uid);

  return v_when;
end;
$$;

revoke all on function public.request_account_deletion() from public, anon;
grant execute on function public.request_account_deletion() to authenticated;

create or replace function public.cancel_account_deletion()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  update public.account_deletion_requests r
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid
   where r.user_id = v_uid and r.status = 'pending'
  returning r.id into v_id;

  if v_id is null then
    return false;                       -- nothing pending: already kept
  end if;

  perform set_config('app.workspace_id', '', true);
  perform app.log_audit_event('account.deletion_cancelled', null,
    'public.account_deletion_requests', v_id, null, null,
    p_subject_user_id => v_uid);
  return true;
end;
$$;

revoke all on function public.cancel_account_deletion() from public, anon;
grant execute on function public.cancel_account_deletion() to authenticated;

-- ---------------------------------------------------------------------
-- 5. The purge — one account, one transaction. Granted to nobody.
-- ---------------------------------------------------------------------
create or replace function app.purge_account(p_request_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_req         public.account_deletion_requests;
  v_uid         uuid;
  v_email       text;
  v_personal    uuid[];
  v_correlation uuid := gen_random_uuid();
begin
  if not app.is_privileged_context() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_req from public.account_deletion_requests r
   where r.id = p_request_id for update;
  if not found or v_req.status <> 'pending' or v_req.scheduled_purge_at > now() then
    raise exception 'NOT_DUE' using errcode = '55000';
  end if;
  v_uid := v_req.user_id;

  perform set_config('app.workspace_id', '', true);

  -- They became a school's only owner during the grace: cancel, never
  -- leave a school without an owner.
  if exists (select 1 from app.account_deletion_blockers(v_uid)) then
    update public.account_deletion_requests
       set status = 'cancelled', cancelled_at = now(),
           attempts = attempts + 1, last_error = 'SOLE_OWNER_BLOCKED'
     where id = p_request_id;
    perform app.log_audit_event('account.deletion_cancelled', null,
      'public.account_deletion_requests', p_request_id, null,
      jsonb_build_object('reason', 'SOLE_OWNER_BLOCKED'),
      p_actor_kind => 'system', p_subject_user_id => v_uid);
    return 'blocked';
  end if;

  select coalesce(array_agg(w.id), '{}') into v_personal
    from public.workspaces w where w.type = 'personal' and w.owner_id = v_uid;

  -- Storage objects can only be removed through the Storage API; refuse
  -- rather than orphan them (no upload path exists yet — D-113).
  if exists (select 1 from public.files f where f.workspace_id = any (v_personal)) then
    raise exception 'FILES_PRESENT' using errcode = '55000';
  end if;

  select p.email into v_email from public.profiles p where p.id = v_uid;

  perform set_config('app.correlation_id', v_correlation::text, true);

  -- Removed.
  delete from public.workspaces where id = any (v_personal);
  delete from public.user_preferences where user_id = v_uid;
  delete from public.onboarding_progress where user_id = v_uid;
  delete from public.device_registrations where user_id = v_uid;
  delete from public.notifications where recipient_id = v_uid;
  delete from public.guardian_users where user_id = v_uid;
  if v_email is not null then
    delete from public.email_log where to_email = v_email;
  end if;

  -- Anonymised.
  update public.workspace_members
     set status = 'removed', removed_at = coalesce(removed_at, now()), phone = null
   where user_id = v_uid and (status <> 'removed' or phone is not null);

  update public.profiles
     set full_name = 'Deleted user', display_name = null, email = null, phone = null,
         avatar_url = null, bio = null, date_of_birth = null,
         last_active_workspace_id = null, deleted_at = now()
   where id = v_uid;

  delete from auth.users where id = v_uid;

  -- audit_events is left exactly as it is: every row the triggers just
  -- wrote (and every earlier row naming this actor) is the evidence trail,
  -- carved out of erasure (F-ID-01 §4.9, COMPLIANCE-PDPA §6.4) and only
  -- ever removed by the 7-year retention job.
  perform set_config('app.correlation_id', '', true);

  update public.account_deletion_requests
     set status = 'completed', completed_at = now(), attempts = attempts + 1, last_error = null
   where id = p_request_id;

  perform app.log_audit_event('account.deletion_purged', null,
    'public.account_deletion_requests', p_request_id, null, null,
    p_actor_kind => 'system', p_subject_user_id => v_uid);

  return 'purged';
end;
$$;

revoke all on function app.purge_account(uuid) from public, anon, authenticated, service_role;

-- Every due request, each in its own subtransaction: one failure is
-- recorded on its row and retried tomorrow; the others still run.
create or replace function app.run_account_purges()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id   uuid;
  v_done integer := 0;
begin
  if not app.is_privileged_context() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  for v_id in
    select r.id from public.account_deletion_requests r
     where r.status = 'pending' and r.scheduled_purge_at <= now()
     order by r.scheduled_purge_at
     limit 200
  loop
    begin
      if app.purge_account(v_id) = 'purged' then
        v_done := v_done + 1;
      end if;
    exception when others then
      update public.account_deletion_requests
         set attempts = attempts + 1, last_error = left(sqlstate || ': ' || sqlerrm, 200)
       where id = v_id;
      -- ponytail: a WARNING in the Postgres log is the alert until the
      -- platform console exists (F-ID-01 §4.9 "platform-console alert").
      raise warning 'account purge % failed (%): %', v_id, sqlstate, sqlerrm;
    end;
  end loop;

  return v_done;
end;
$$;

revoke all on function app.run_account_purges() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. Daily 02:30 Asia/Dhaka (20:30 UTC), F-ID-01 §5.
-- ---------------------------------------------------------------------
do $$
begin
  perform cron.schedule(
    'account-purge',
    '30 20 * * *',
    $cron$select app.run_account_purges()$cron$);
exception
  when invalid_schema_name or undefined_table or undefined_function or insufficient_privilege then
    raise notice 'pg_cron not available in this environment; schedule '
                 '''account-purge'' manually on the hosted project';
end
$$;
