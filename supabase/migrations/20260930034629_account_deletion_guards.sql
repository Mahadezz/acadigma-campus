-- =====================================================================
-- F-ID-01 Part 7 (D-113) · second review round (independent Opus review
-- of PR #119), in a new file: the earlier two were already pushed.
--
--  1. Two-owner race at purge time. The purge checked "am I the only
--     active owner" and then removed the membership; a co-owner leaving
--     or being purged concurrently could pass the same check. The purge
--     now locks every active owner row of each school it owns (FOR
--     UPDATE) before the check, so the two serialise and the second sees
--     one owner and is cancelled (SOLE_OWNER_BLOCKED).
--  2. A closing account joins nothing. An access token outlives
--     sign-out and even the auth user's deletion by up to 1 hour, so a
--     purged account (profiles.deleted_at set) or one whose deletion is
--     past its date could still call create_school_workspace or accept an
--     invitation. One trigger refuses (ACCOUNT_CLOSED) at the rows every
--     such path writes — a new workspace's owner, a new or re-activated
--     membership or guardian link — so no function can forget it.
-- =====================================================================

create or replace function app.account_is_closing(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p
                  where p.id = p_user and p.deleted_at is not null)
      or exists (select 1 from public.account_deletion_requests r
                  where r.user_id = p_user and r.status = 'pending'
                    and r.scheduled_purge_at <= now())
$$;

revoke all on function app.account_is_closing(uuid) from public, anon, authenticated, service_role;

-- TG_ARGV[0] names the column holding the person (owner_id / user_id).
create or replace function app.tg_refuse_closing_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
begin
  -- An UPDATE matters only when it (re)activates the membership or link.
  if tg_op = 'UPDATE'
     and not (new.status = 'active' and old.status is distinct from 'active') then
    return new;
  end if;
  if v_user is not null and app.account_is_closing(v_user) then
    raise exception 'ACCOUNT_CLOSED' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app.tg_refuse_closing_account() from public, anon, authenticated, service_role;

drop trigger if exists refuse_closing_account on public.workspaces;
create trigger refuse_closing_account
  before insert on public.workspaces
  for each row execute function app.tg_refuse_closing_account('owner_id');

drop trigger if exists refuse_closing_account on public.workspace_members;
create trigger refuse_closing_account
  before insert or update of status on public.workspace_members
  for each row execute function app.tg_refuse_closing_account('user_id');

drop trigger if exists refuse_closing_account on public.guardian_users;
create trigger refuse_closing_account
  before insert or update of status on public.guardian_users
  for each row execute function app.tg_refuse_closing_account('user_id');

-- ---------------------------------------------------------------------
-- 1. The purge, body identical to 20260930034628 plus the owner-row lock.
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

  -- Serialise with a co-owner leaving or being purged at the same time:
  -- lock every active owner row of every school this person owns.
  perform 1
     from public.workspace_members o
    where o.role = 'owner' and o.status = 'active'
      and o.workspace_id in (select m.workspace_id from public.workspace_members m
                              where m.user_id = v_uid and m.role = 'owner'
                                and m.status = 'active')
    order by o.id
      for update;

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
