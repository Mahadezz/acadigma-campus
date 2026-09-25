-- =====================================================================
-- D-101 — throttle keys for per-user buckets are derived from auth.uid()
-- inside the functions, never taken from the caller.
--
-- public.throttle_status / throttle_record_failure / throttle_reset are
-- callable by anon and authenticated with ANY key (sign-in runs before a
-- session exists, so they must be). For the IP/email buckets that is safe:
-- the app sends a salted hash nobody else can compute
-- (apps/web/lib/request-context.ts). But create_school_workspace (D-100)
-- keys its bucket on the plain user id, so anyone who knew a user's id could
-- fill that user's bucket and lock them out of school creation for 15
-- minutes. The fix covers every per-user bucket at once:
--
--   * a key starting with `user:` is rewritten to `user:<bucket>:<auth.uid()>`
--     — a caller can only ever read, bump or clear their OWN row, and anon
--     cannot use the namespace at all;
--   * throttle_reset refuses `user:` keys from clients: a per-user limit
--     expires, it is never cleared by the person it limits;
--   * throttle_record_failure ignores p_key for the per-user buckets
--     (changePassword, eiinCheck, createSchool) and derives it the same way.
--
-- Client-keyed buckets (register, loginByEmail, loginByIp, passwordReset*,
-- resendVerification) are unchanged, as is the D-65 smoke test
-- (anon throttle_status with a plain key).
-- =====================================================================

create or replace function app.throttle_key(p_key text)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  if coalesce(btrim(p_key), '') = '' then
    raise exception 'a throttle key is required' using errcode = '22023';
  end if;
  if p_key not like 'user:%' then
    return p_key;
  end if;
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  return 'user:' || split_part(p_key, ':', 2) || ':' || auth.uid()::text;
end;
$$;

comment on function app.throttle_key(text) is
  'D-101: the effective auth_throttle key. `user:<bucket>` becomes '
  '`user:<bucket>:<auth.uid()>`, so a caller only ever touches their own '
  'per-user row; any other key is returned unchanged.';

revoke all on function app.throttle_key(text) from public, anon, authenticated;

create or replace function public.throttle_status(p_key text)
returns table (blocked boolean, retry_after_seconds integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text := app.throttle_key(p_key);
begin
  return query
  select
    (t.blocked_until is not null and t.blocked_until > now()),
    greatest(0, ceil(extract(epoch from (t.blocked_until - now())))::int)
  from public.auth_throttle t
  where t.key = v_key
  union all
  select false, 0
  where not exists (select 1 from public.auth_throttle t where t.key = v_key)
  limit 1;
end;
$$;

-- A per-user limit is never cleared by its own subject: with a fixed public
-- key (`user:createSchool`) any signed-in user could otherwise reset their
-- own createSchool/eiinCheck/changePassword bucket and undo the limit.
-- Per-user rows expire with their window; only server-side paths
-- (service_role, postgres) may clear one.
create or replace function public.throttle_reset(p_key text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_key like 'user:%' and not app.is_privileged_context() then
    raise exception 'per-user throttle limits are not reset by the caller'
      using errcode = '42501';
  end if;
  delete from public.auth_throttle where key = app.throttle_key(p_key);
end;
$$;

create or replace function public.throttle_record_failure(
  p_bucket text,
  p_key    text)
returns table (blocked boolean, retry_after_seconds integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row            public.auth_throttle;
  v_max_attempts   integer;
  v_window_seconds integer;
  v_block_seconds  integer;
  v_key            text;
begin
  -- Per-user buckets never trust the caller's key: it is derived here from
  -- auth.uid(), so nobody can fill another user's bucket (D-101).
  v_key := app.throttle_key(
    case when p_bucket in ('changePassword', 'eiinCheck', 'createSchool')
         then 'user:' || p_bucket
         else p_key
    end);

  select l.max_attempts, l.window_seconds, l.block_seconds
    into v_max_attempts, v_window_seconds, v_block_seconds
  from (values
    -- bucket,                 max_attempts, window_seconds, block_seconds
    ('register',                5,  3600,  3600), -- "Registrations per IP: 5/h"
    ('loginByEmail',            5,   900,   900),  -- "5 per (email, 15 min) -> 15 min block"
    ('loginByIp',               30,  900,  3600),  -- "30 per (IP, 15 min) -> 60 min block"
    ('passwordResetRequest',    5,  3600,  3600),
    ('passwordResetSubmit',     10, 3600,  3600),  -- "resetPassword ... 10/h per IP"
    ('resendVerification',      5,  3600,  3600),
    ('changePassword',          10, 3600,  3600),
    ('eiinCheck',               30,  900,   900),  -- D-67: "30 per (user, 15 min) -> 15 min block"
    ('createSchool',            30,  900,   900)   -- D-100: create_school_workspace attempts per user
  ) as l(bucket, max_attempts, window_seconds, block_seconds)
  where l.bucket = p_bucket;

  if v_max_attempts is null then
    raise exception 'unrecognised throttle bucket: %', p_bucket using errcode = '22023';
  end if;

  insert into public.auth_throttle (key, window_started_at, attempts)
  values (v_key, now(), 1)
  on conflict (key) do update
    set attempts = case
          when auth_throttle.blocked_until is null
               and auth_throttle.window_started_at < now() - make_interval(secs => v_window_seconds)
            then 1
          else auth_throttle.attempts + 1
        end,
        window_started_at = case
          when auth_throttle.blocked_until is null
               and auth_throttle.window_started_at < now() - make_interval(secs => v_window_seconds)
            then now()
          else auth_throttle.window_started_at
        end
  returning * into v_row;

  if v_row.attempts > v_max_attempts then
    update public.auth_throttle
       set blocked_until = now() + make_interval(secs => v_block_seconds)
     where key = v_key
     returning * into v_row;
  end if;

  return query select
    (v_row.blocked_until is not null and v_row.blocked_until > now()),
    greatest(
      0,
      ceil(extract(epoch from (coalesce(v_row.blocked_until, now()) - now())))::integer
    );
end;
$$;

comment on function public.throttle_record_failure(text, text) is
  'F-ID-01 §7 / D-67 / D-100 / D-101: server-side rate limit bump+check. '
  'Thresholds are constants in this function body, keyed by p_bucket -- NEVER '
  'caller-supplied (security review N2). Per-user buckets derive their key '
  'from auth.uid() (app.throttle_key); p_key is ignored for them.';
