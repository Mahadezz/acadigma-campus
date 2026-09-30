-- =====================================================================
-- F-ID-01 Part 6 — sessions and devices (D-116)
--
--   A "device" is a live Supabase Auth session (auth.sessions). Three
--   functions, each acting on auth.uid() only:
--     public.my_sessions()            the caller's live sessions
--     public.revoke_my_session(uuid)  sign out one other session
--     public.note_sign_in()           raise auth.new_device_signin once
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
-- 3. New-device notification (F-ID-01 §5 "New-device notification"):
--    this session is new to the person and another one is live. Once per
--    session: a repeat call finds the earlier row and does nothing.
-- ---------------------------------------------------------------------
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

  if exists (
    select 1 from public.notifications n
     where n.recipient_id = v_uid
       and n.event_type = 'auth.new_device_signin'
       and n.data ->> 'session_id' = v_session) then
    return false;
  end if;

  perform app.notify(v_uid, 'auth.new_device_signin',
    'New sign-in to your account', '/account/security',
    'If this was not you, sign that device out and change your password.',
    null, jsonb_build_object('session_id', v_session));
  return true;
end;
$$;

comment on function public.note_sign_in() is
  'F-ID-01 Part 6 (D-116): called after a password sign-in; raises '
  'auth.new_device_signin when another session of the caller is live, once '
  'per session.';

revoke all on function public.note_sign_in() from public, anon;
grant execute on function public.note_sign_in() to authenticated;
