-- =====================================================================
-- F-ID-01 Part 7 (D-113) · review fixes on 20260929181340_account_deletion
-- (a new file: that one was already pushed).
--
--  1. Re-authentication at the security boundary: request_account_deletion
--     now requires a password sign-in in the caller's JWT from the last
--     5 minutes (`amr`), so a stolen session token alone — calling the RPC
--     straight over PostgREST — cannot schedule a deletion.
--  2. Deleting an auth user by ANY path (the purge, the dashboard, the admin
--     API) tombstones the profile, through one trigger on auth.users; the
--     purge relies on it. A tombstone accepts no client update.
--  3. The profile's name, bio, birth date and avatar are free-text in its
--     audit rows (name kept, value nulled), so neither the purge nor any
--     earlier edit copies them into audit_events from now on.
--  4. The purge revokes pending invitations to the deleted address (the next
--     person to register it must not inherit them) and stores only the
--     SQLSTATE in last_error (the requester can read that row).
--  5. cancelled_by dropped: the only canceller is the requester (ponytail).
--  6. Two concurrent requests return the one pending date instead of a raw
--     unique violation.
-- =====================================================================

alter table public.account_deletion_requests drop column if exists cancelled_by;

-- ---------------------------------------------------------------------
-- 2. The tombstone, in one place.
-- ---------------------------------------------------------------------
create or replace function app.tg_auth_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set full_name = 'Deleted user', display_name = null, email = null, phone = null,
         avatar_url = null, bio = null, date_of_birth = null,
         last_active_workspace_id = null, deleted_at = coalesce(deleted_at, now())
   where id = old.id;
  return old;
end;
$$;

revoke all on function app.tg_auth_user_deleted() from public, anon, authenticated, service_role;

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function app.tg_auth_user_deleted();

-- Body identical to 20260929181340 plus the tombstone freeze.
create or replace function app.tg_profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.is_privileged_context() or app.is_platform_admin() then
    return new;
  end if;

  if old.deleted_at is not null then
    raise exception 'a deleted account cannot be changed' using errcode = '42501';
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
-- 3. Profile audit: identity text is free-text (value nulled, name kept).
-- ---------------------------------------------------------------------
select app.attach_audit('public.profiles', array['phone', 'email'],
  array['full_name', 'display_name', 'bio', 'date_of_birth', 'avatar_url']);

-- ---------------------------------------------------------------------
-- 1. Request: a fresh password sign-in is required.
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

  -- Supabase puts {"method":"password","timestamp":<epoch>} in `amr` when
  -- the session came from a password sign-in; the server action signs in
  -- again with the typed password immediately before calling this.
  if not exists (
    select 1
      from jsonb_array_elements(
             case when jsonb_typeof(auth.jwt() -> 'amr') = 'array'
                  then auth.jwt() -> 'amr' else '[]'::jsonb end) e
     where e ->> 'method' = 'password'
       and (e ->> 'timestamp') ~ '^[0-9]+$'
       and (e ->> 'timestamp')::bigint >= extract(epoch from now())::bigint - 300
  ) then
    raise exception 'REAUTH_REQUIRED' using errcode = '42501';
  end if;

  select r.scheduled_purge_at into v_when
    from public.account_deletion_requests r
   where r.user_id = v_uid and r.status = 'pending';
  if found then
    return v_when;
  end if;

  if exists (select 1 from app.account_deletion_blockers(v_uid)) then
    raise exception 'SOLE_OWNER_BLOCKED' using errcode = 'P0001';
  end if;

  if (select count(*) from public.account_deletion_requests r
       where r.user_id = v_uid and r.requested_at > now() - interval '24 hours') >= 3 then
    raise exception 'RATE_LIMITED' using errcode = '54000';
  end if;

  -- A concurrent twin request lands on the one-pending index: return its date.
  insert into public.account_deletion_requests (user_id, scheduled_purge_at)
  values (v_uid, now() + interval '30 days')
  on conflict (user_id) where status = 'pending' do nothing
  returning id, scheduled_purge_at into v_id, v_when;
  if v_id is null then
    select r.scheduled_purge_at into v_when
      from public.account_deletion_requests r
     where r.user_id = v_uid and r.status = 'pending';
    return v_when;
  end if;

  perform set_config('app.workspace_id', '', true);
  perform app.log_audit_event('account.deletion_requested', null,
    'public.account_deletion_requests', v_id, null,
    jsonb_build_object('scheduled_purge_at', v_when),
    p_subject_user_id => v_uid);

  return v_when;
end;
$$;

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
     set status = 'cancelled', cancelled_at = now()
   where r.user_id = v_uid and r.status = 'pending'
  returning r.id into v_id;

  if v_id is null then
    return false;
  end if;

  perform set_config('app.workspace_id', '', true);
  perform app.log_audit_event('account.deletion_cancelled', null,
    'public.account_deletion_requests', v_id, null, null,
    p_subject_user_id => v_uid);
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. The purge: invitations revoked; the tombstone comes from the trigger.
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

  if exists (select 1 from public.files f where f.workspace_id = any (v_personal)) then
    raise exception 'FILES_PRESENT' using errcode = '55000';
  end if;

  select p.email into v_email from public.profiles p where p.id = v_uid;

  perform set_config('app.correlation_id', gen_random_uuid()::text, true);

  -- Removed.
  delete from public.workspaces where id = any (v_personal);
  delete from public.user_preferences where user_id = v_uid;
  delete from public.onboarding_progress where user_id = v_uid;
  delete from public.device_registrations where user_id = v_uid;
  delete from public.notifications where recipient_id = v_uid;
  delete from public.guardian_users where user_id = v_uid;
  if v_email is not null then
    delete from public.email_log where to_email = v_email;
    -- Whoever registers this address next must not inherit these.
    update public.workspace_invitations
       set status = 'revoked', revoked_at = now()
     where email = v_email and status = 'pending';
  end if;

  -- Anonymised (the profile by app.tg_auth_user_deleted, below).
  update public.workspace_members
     set status = 'removed', removed_at = coalesce(removed_at, now()), phone = null
   where user_id = v_uid and (status <> 'removed' or phone is not null);

  delete from auth.users where id = v_uid;

  -- audit_events is left exactly as it is (D-113 §2).
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
      -- Only the SQLSTATE on the row the requester can read; the message
      -- goes to the Postgres log for whoever investigates.
      update public.account_deletion_requests
         set attempts = attempts + 1, last_error = sqlstate
       where id = v_id;
      raise warning 'account purge % failed (%): %', v_id, sqlstate, sqlerrm;
    end;
  end loop;

  return v_done;
end;
$$;

revoke all on function app.run_account_purges() from public, anon, authenticated, service_role;
