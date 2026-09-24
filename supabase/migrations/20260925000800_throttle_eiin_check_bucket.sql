-- =====================================================================
-- PR #34 follow-up (security review, medium) / D-67 — a throttle bucket
-- for `checkEiinAvailability`.
--
-- `public.check_eiin_available` (20260925000700_school_eiin_availability.sql,
-- D-66) is a boolean-only, authenticated-only probe with no rate limit of
-- its own: one signed-in account could call it up to the platform's
-- request-rate ceiling and enumerate which of the ~10^6 possible EIINs
-- already belong to a school. This migration adds an `eiinCheck` bucket to
-- `public.throttle_record_failure`'s server-side threshold table
-- (20260917020000_identity_auth.sql §3) — the same function every other
-- auth-adjacent rate limit already goes through (D-50 shape: a named
-- bucket, never a caller-supplied limit, per security review N2).
--
-- `create or replace function` — this does not touch `auth_throttle`'s
-- schema or any other bucket's threshold, only adds one more row to the
-- `values (...)` table the function already holds inline.
-- =====================================================================

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
begin
  if coalesce(btrim(p_key), '') = '' then
    raise exception 'a throttle key is required' using errcode = '22023';
  end if;

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
    ('eiinCheck',               30,  900,   900)   -- PR #34 follow-up / D-67: "30 per (user, 15 min) -> 15 min block"
  ) as l(bucket, max_attempts, window_seconds, block_seconds)
  where l.bucket = p_bucket;

  if v_max_attempts is null then
    raise exception 'unrecognised throttle bucket: %', p_bucket using errcode = '22023';
  end if;

  insert into public.auth_throttle (key, window_started_at, attempts)
  values (p_key, now(), 1)
  on conflict (key) do update
    set attempts = case
          -- window expired (and not currently blocked): start a fresh window
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
     where key = p_key
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
  'F-ID-01 §7 / PR #34 follow-up (D-67): server-side rate limit bump+check. '
  'Thresholds are constants in this function body, keyed by p_bucket -- NEVER '
  'caller-supplied (security review N2). Bucket names match '
  'apps/web/lib/throttle.ts''s THROTTLE_LIMITS keys exactly, including '
  '"eiinCheck" added here.';

-- Grants are unchanged: public.throttle_record_failure(text, text) already
-- has EXECUTE for anon, authenticated and service_role from
-- 20260917020000_identity_auth.sql §6 -- eiinCheck needs only authenticated
-- (checkEiinAvailability already requires a signed-in user), which that
-- existing grant already covers.
