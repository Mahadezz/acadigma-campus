-- =====================================================================
-- F-ID-01 Part 6 — sessions and devices (D-116)
--
--   A "device" is a live Supabase Auth session (auth.sessions). Four
--   functions, each acting on auth.uid() only:
--     public.my_sessions()            the caller's live sessions
--     public.revoke_my_session(uuid)  sign out one other session
--     public.note_sign_in()           raise auth.new_device_signin once
--     public.revoke_all_my_sessions() sign out everywhere
--   No new table: Supabase already stores the session, and deleting its
--   row is Supabase's documented way to sign it out (refresh tokens go
--   with it; the Auth server then answers session_not_found).
--   The IP column is never read.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The caller's live sessions.
-- ---------------------------------------------------------------------
create or replace function public.my_sessions()
returns table (
  id             uuid,
  created_at     timestamptz,
  last_active_at timestamptz,
  user_agent     text,
  is_current     boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id,
         s.created_at,
         coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at),
         s.user_agent,
         s.id::text = (auth.jwt() ->> 'session_id')
    from auth.sessions s
   where s.user_id = auth.uid()
     and (s.not_after is null or s.not_after > now())
   order by (s.id::text = (auth.jwt() ->> 'session_id')) desc,
            coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at) desc
   limit 50;
$$;

comment on function public.my_sessions() is
  'F-ID-01 Part 6 (D-116): the caller''s own live Supabase sessions, the '
  'current one first. Never returns the IP. Capped at 50 rows.';

revoke all on function public.my_sessions() from public, anon;
grant execute on function public.my_sessions() to authenticated;

-- ---------------------------------------------------------------------
-- 2. Sign out one other session. Idempotent and not an oracle: a session
--    that is gone, belongs to someone else, or is the current one
--    returns false and changes nothing.
-- ---------------------------------------------------------------------
create or replace function public.revoke_my_session(p_session_id uuid)
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

  delete from auth.sessions s
   where s.id = p_session_id
     and s.user_id = v_uid
     and s.id::text is distinct from (auth.jwt() ->> 'session_id')
  returning s.id into v_id;

  if v_id is null then
    return false;
  end if;

  perform set_config('app.workspace_id', '', true);   -- an account-level event
  perform app.log_audit_event('session.revoked', null,
    'auth.sessions', v_id, null, null,
    p_subject_user_id => v_uid);
  return true;
end;
$$;

comment on function public.revoke_my_session(uuid) is
  'F-ID-01 Part 6 (D-116): deletes one of the caller''s own sessions other '
  'than the current one and audits session.revoked in the same '
  'transaction. False when nothing matched.';

revoke all on function public.revoke_my_session(uuid) from public, anon;
grant execute on function public.revoke_my_session(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Sign out everywhere: every session of the caller, the current one
--    included, deleted and audited in one transaction, so the audit row
--    exists only when the sessions are really gone. Returns how many.
-- ---------------------------------------------------------------------
create or replace function public.revoke_all_my_sessions()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_n   integer;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  delete from auth.sessions s where s.user_id = v_uid;
  get diagnostics v_n = row_count;

  if v_n > 0 then
    perform set_config('app.workspace_id', '', true);
    perform app.log_audit_event('session.revoked_all', null,
      null, v_uid, null, jsonb_build_object('n', v_n),
      p_subject_user_id => v_uid);
  end if;
  return v_n;
end;
$$;

comment on function public.revoke_all_my_sessions() is
  'F-ID-01 Part 6 (D-116): deletes every session of the caller (this one '
  'included) and audits session.revoked_all with the count, in one '
  'transaction.';

revoke all on function public.revoke_all_my_sessions() from public, anon;
grant execute on function public.revoke_all_my_sessions() to authenticated;

-- ---------------------------------------------------------------------
-- 4. New-device notification (F-ID-01 §5 "New-device notification"):
--    this session is new to the person and another one is live. Once per
--    session, enforced by a unique index, so two concurrent calls cannot
--    both insert.
-- ---------------------------------------------------------------------
create unique index if not exists notifications_new_device_once
  on public.notifications (recipient_id, (data ->> 'session_id'))
  where event_type = 'auth.new_device_signin';
-- justification: "once per session" (D-116 §6) as a constraint, not a
-- check-then-insert race.

create or replace function public.note_sign_in()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_session text := auth.jwt() ->> 'session_id';
  v_id      bigint;
begin
  if v_uid is null or v_session is null then
    return false;
  end if;

  if not exists (
    select 1 from auth.sessions s
     where s.user_id = v_uid
       and s.id::text <> v_session
       and (s.not_after is null or s.not_after > now())) then
    return false;
  end if;

  -- Same row app.notify() writes, with ON CONFLICT for the once-only rule.
  insert into public.notifications
    (recipient_id, actor_id, event_type, title, body, action_url, data)
  values
    (v_uid, v_uid, 'auth.new_device_signin', 'New sign-in to your account',
     'If this was not you, sign that device out and change your password.',
     '/account/security', jsonb_build_object('session_id', v_session))
  on conflict (recipient_id, (data ->> 'session_id'))
    where event_type = 'auth.new_device_signin'
    do nothing
  returning id into v_id;

  return v_id is not null;
end;
$$;

comment on function public.note_sign_in() is
  'F-ID-01 Part 6 (D-116): called after a password sign-in; raises '
  'auth.new_device_signin when another session of the caller is live, once '
  'per session (unique index notifications_new_device_once).';

revoke all on function public.note_sign_in() from public, anon;
grant execute on function public.note_sign_in() to authenticated;
