-- =====================================================================
-- F-ID-01 §9 AC6 (D-76): a bucket blocks when its attempts REACH the limit,
-- not one attempt past it.
--
-- AC6: "five consecutive wrong passwords for one email within 15 minutes,
-- when a sixth is attempted, the response is RATE_LIMITED ... and no
-- credential check is performed." The app checks throttle_status BEFORE the
-- credential check and records a failure AFTER it. With `attempts > max`,
-- the 5th failure left the key unblocked, so the 6th attempt still reached
-- GoTrue (a sixth password guess) and only the 7th was refused -- found by
-- rate-limit.spec.ts, the first time it ever ran (e2e-live, D-76): six
-- "Invalid login credentials" per run, never "Too many attempts".
--
-- `>=` makes every status-then-record bucket (loginByEmail, loginByIp,
-- register, resendVerification, passwordReset*, changePassword, eiinCheck)
-- allow exactly its named limit. createSchool records BEFORE it acts, so it
-- now refuses the 30th attempt in a window instead of the 31st -- one
-- tighter, immaterial next to its real cap of 3 schools a day (D-100).
--
-- Body otherwise identical to 20260925300303_throttle_per_user_keys.sql.
-- create or replace keeps the existing grants (D-54).
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
  v_key            text;
begin
  -- A `user:<bucket>` key may only be used with that bucket: otherwise a
  -- caller could bump their own changePassword row with loginByEmail's
  -- shorter window and cut their own block (review of PR #45).
  if p_key like 'user:%' and split_part(p_key, ':', 2) <> p_bucket then
    raise exception 'throttle key does not match bucket' using errcode = '22023';
  end if;

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

  -- An expired block, or an expired window with no block, starts a fresh
  -- window: count from 1 and clear the old block. Before this, a block that
  -- had run out re-blocked on the very next failure (review of PR #45).
  insert into public.auth_throttle (key, window_started_at, attempts)
  values (v_key, now(), 1)
  on conflict (key) do update
    set attempts = case
          when (auth_throttle.blocked_until is not null and auth_throttle.blocked_until <= now())
            or (auth_throttle.blocked_until is null
                and auth_throttle.window_started_at < now() - make_interval(secs => v_window_seconds))
            then 1
          else auth_throttle.attempts + 1
        end,
        window_started_at = case
          when (auth_throttle.blocked_until is not null and auth_throttle.blocked_until <= now())
            or (auth_throttle.blocked_until is null
                and auth_throttle.window_started_at < now() - make_interval(secs => v_window_seconds))
            then now()
          else auth_throttle.window_started_at
        end,
        blocked_until = case
          when auth_throttle.blocked_until is not null and auth_throttle.blocked_until <= now()
            then null
          else auth_throttle.blocked_until
        end
  returning * into v_row;

  -- Block once the attempts reach the limit (AC6). Never shorten a block
  -- that is already running: keep the later end.
  if v_row.attempts >= v_max_attempts then
    update public.auth_throttle
       set blocked_until = greatest(
             coalesce(blocked_until, now()),
             now() + make_interval(secs => v_block_seconds))
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
  'F-ID-01 §7 / D-67 / D-100 / D-101 / D-76: server-side rate limit bump+check; '
  'blocks when attempts reach the bucket limit. '
  'Thresholds are constants in this function body, keyed by p_bucket -- NEVER '
  'caller-supplied (security review N2). Per-user buckets derive their key '
  'from auth.uid() (app.throttle_key); p_key is ignored for them.';
