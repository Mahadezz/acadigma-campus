-- =====================================================================
-- 0005 · F-ID-01 Parts 1-4 — auth rate limiting + auth audit events
-- ---------------------------------------------------------------------
-- profiles, workspaces, handle_new_user() and withServiceRole already
-- shipped in 0002 (20260917010100_identity.sql). This migration adds only
-- what Parts 1-4 need on top of that: a throttle ledger for login,
-- registration and password-reset attempts (F-ID-01 §5 "Business rules
-- and calculations" and §7 rate limits), and a narrow RPC surface for
-- logging the account-level audit events F-ID-01 names.
--
-- Schema placement note: `supabase/config.toml` exposes only `public` (and
-- `graphql_public`) through PostgREST — `app` is deliberately NOT exposed
-- ("those functions are for policies, not for clients"). Every function
-- below that `apps/web` calls via `supabase.rpc(...)` therefore lives in
-- `public`, not `app`, even though it is SECURITY DEFINER exactly like the
-- `app.*` helpers. `public.log_auth_event` is a thin, allowlisted wrapper
-- around the existing `app.log_audit_event` (0003) for that reason.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. auth_throttle
-- ---------------------------------------------------------------------
create table if not exists public.auth_throttle (
  key               text primary key,
  window_started_at timestamptz not null default now(),
  attempts          integer     not null default 0,
  blocked_until     timestamptz
);

comment on table public.auth_throttle is
  'Sliding-window attempt counter for login/registration/reset actions '
  '(F-ID-01 §5). Keys look like login-email:sha256(email), register:sha256(ip), '
  'never a raw address. No RLS policy and no grants: only reachable through '
  'the SECURITY DEFINER functions below.';

create index if not exists auth_throttle_blocked_idx
  on public.auth_throttle (blocked_until) where blocked_until is not null;
-- justification: the nightly pg_cron sweep (F-ID-01 §3) cleans expired
-- blocks without a seq scan.

revoke all on public.auth_throttle from anon, authenticated, service_role;
-- No table grant at all, on purpose: even service_role reaches this data
-- only through the functions below, which is what keeps the key format
-- (a hash, never a raw email) from becoming a second place to get wrong.

-- ---------------------------------------------------------------------
-- 2. public.throttle_status — read-only, never bumps the counter.
--    Callers check this BEFORE doing the expensive/sensitive work (a
--    password comparison, an email send) so acceptance criterion 6
--    ("the sixth attempt performs no credential check") holds.
-- ---------------------------------------------------------------------
create or replace function public.throttle_status(p_key text)
returns table (blocked boolean, retry_after_seconds integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (t.blocked_until is not null and t.blocked_until > now()) as blocked,
    greatest(0, ceil(extract(epoch from (t.blocked_until - now())))::int) as retry_after_seconds
  from public.auth_throttle t
  where t.key = p_key
  union all
  select false, 0
  where not exists (select 1 from public.auth_throttle t where t.key = p_key)
  limit 1;
$$;

comment on function public.throttle_status(text) is
  'Read-only: is this key currently blocked, and for how many more seconds. '
  'Never call this to decide "may I try" without also calling '
  'throttle_record_failure on an actual failure, or the window never advances.';

-- ---------------------------------------------------------------------
-- 3. public.throttle_record_failure — bumps the window, blocks once the
--    caller-supplied threshold is exceeded. The thresholds live in
--    apps/web/lib/throttle.ts (F-ID-01 §5), not here, so one table serves
--    every throttle key with a different limit per action.
-- ---------------------------------------------------------------------
create or replace function public.throttle_record_failure(
  p_key             text,
  p_max_attempts    integer,
  p_window_seconds  integer,
  p_block_seconds   integer)
returns table (blocked boolean, retry_after_seconds integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.auth_throttle;
begin
  if coalesce(btrim(p_key), '') = '' then
    raise exception 'a throttle key is required' using errcode = '22023';
  end if;
  if p_max_attempts < 1 or p_window_seconds < 1 or p_block_seconds < 1 then
    raise exception 'throttle thresholds must be positive' using errcode = '22023';
  end if;

  insert into public.auth_throttle (key, window_started_at, attempts)
  values (p_key, now(), 1)
  on conflict (key) do update
    set attempts = case
          -- window expired (and not currently blocked): start a fresh window
          when auth_throttle.blocked_until is null
               and auth_throttle.window_started_at < now() - make_interval(secs => p_window_seconds)
            then 1
          else auth_throttle.attempts + 1
        end,
        window_started_at = case
          when auth_throttle.blocked_until is null
               and auth_throttle.window_started_at < now() - make_interval(secs => p_window_seconds)
            then now()
          else auth_throttle.window_started_at
        end
  returning * into v_row;

  if v_row.attempts > p_max_attempts then
    update public.auth_throttle
       set blocked_until = now() + make_interval(secs => p_block_seconds)
     where key = p_key
     returning * into v_row;
  end if;

  return query select
    (v_row.blocked_until is not null and v_row.blocked_until > now()),
    greatest(0, ceil(extract(epoch from (v_row.blocked_until - now())))::int);
end;
$$;

comment on function public.throttle_record_failure(text, integer, integer, integer) is
  'Call on every FAILED attempt only. A password match or a valid code must '
  'never reach here — success calls throttle_reset instead, per F-ID-01 §4.2.';

-- ---------------------------------------------------------------------
-- 4. public.throttle_reset — called on a successful attempt.
-- ---------------------------------------------------------------------
create or replace function public.throttle_reset(p_key text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.auth_throttle where key = p_key;
$$;

comment on function public.throttle_reset(text) is
  'Clears a key after a successful attempt, so a legitimate sign-in is '
  'never penalised by attempts made before it.';

-- ---------------------------------------------------------------------
-- 5. public.log_auth_event — the ONE PostgREST-reachable door onto
--    app.log_audit_event (0003) for this feature. `p_action` is checked
--    against an explicit allowlist so this cannot become a generic
--    "write anything to audit_events" RPC for anon/authenticated —
--    audit_events keeps its "exactly two writers" property (0003 §7.1);
--    this is a narrow, allowlisted extension of writer #2, not a third one.
-- ---------------------------------------------------------------------
create or replace function public.log_auth_event(
  p_action     text,
  p_row_id     uuid    default null,
  p_after      jsonb   default null,
  p_ip         inet    default null,
  p_user_agent text    default null)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if p_action <> all (array[
    'account.registered',
    'account.email_verified',
    'account.login',
    'account.logout',
    'account.password_reset',
    'account.password_changed',
    'session.revoked_all'
  ]) then
    raise exception 'unrecognised auth audit action: %', p_action using errcode = '22023';
  end if;

  v_id := app.log_audit_event(
    p_action, null, 'auth.users', p_row_id, null, p_after, p_ip, p_user_agent, null);
  return v_id;
end;
$$;

comment on function public.log_auth_event(text, uuid, jsonb, inet, text) is
  'F-ID-01 §4 audit events, reachable from apps/web (app.log_audit_event is '
  'not — see the schema-placement note at the top of this file). The action '
  'allowlist is the whole security property: anon/authenticated get exactly '
  'these seven actions and nothing else written to audit_events through it.';

-- ---------------------------------------------------------------------
-- 6. Grants — anon needs the throttle + registration/login events too:
--    registration, sign-in and password reset all run before a session
--    exists. The functions themselves accept only an opaque key or an
--    allowlisted action and never return PII, which is what makes that safe.
-- ---------------------------------------------------------------------
revoke all on function public.throttle_status(text) from public;
revoke all on function public.throttle_record_failure(text, integer, integer, integer) from public;
revoke all on function public.throttle_reset(text) from public;
revoke all on function public.log_auth_event(text, uuid, jsonb, inet, text) from public;

grant execute on function public.throttle_status(text) to anon, authenticated, service_role;
grant execute on function public.throttle_record_failure(text, integer, integer, integer) to anon, authenticated, service_role;
grant execute on function public.throttle_reset(text) to anon, authenticated, service_role;
grant execute on function public.log_auth_event(text, uuid, jsonb, inet, text) to anon, authenticated, service_role;
