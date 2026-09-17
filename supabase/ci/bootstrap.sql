-- Makes a plain Postgres 17 container look enough like a Supabase project for the
-- migrations and the pgTAP suite to run against it (DECISION-LOG D-20).
--
-- Supabase creates these roles, schemas and extensions before any migration runs, so
-- a migration is entitled to assume they exist. Everything here is `if not exists`:
-- the file is re-runnable and creates nothing the real project does not already have.

create extension if not exists pgtap;
create extension if not exists pgcrypto;

-- Supabase keeps extensions in their own schema and on the search path.
create schema if not exists extensions;

-- GoTrue owns `auth`. Migrations reference auth.uid() and auth.users, so the schema
-- has to exist here; the real definitions live in the managed auth service.
create schema if not exists auth;

-- Minimal shape of the table GoTrue manages. Columns cover what the pgTAP
-- fixtures (`tests.mkuser`) insert and what app.handle_new_user() reads.
create table if not exists auth.users (
  instance_id          uuid,
  id                   uuid primary key default gen_random_uuid(),
  aud                  text,
  role                 text,
  email                text,
  encrypted_password   text,
  email_confirmed_at   timestamptz,
  phone                text,
  raw_app_meta_data    jsonb default '{}',
  raw_user_meta_data   jsonb default '{}',
  created_at           timestamptz default now(),
  updated_at           timestamptz
);

-- Mirrors the real GoTrue/PostgREST definitions: read the GUCs PostgREST sets
-- from the JWT on every request. The pgTAP fixtures' `tests.login()` sets
-- `request.jwt.claims` the same way, so RLS behaves exactly as it does live.
create or replace function auth.uid() returns uuid
  language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;

create or replace function auth.jwt() returns jsonb
  language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

create or replace function auth.role() returns text
  language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
$$;

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  -- bypassrls is what makes service_role a real bypass in the escalation tests.
  -- Without it, a test asserting service_role sees everything passes for the wrong
  -- reason.
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticator') then
    create role authenticator noinherit login password 'postgres';
  end if;
end
$$;

grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;

-- Supabase grants USAGE on `auth` (but not on its tables) to these roles so
-- `auth.uid()`/`auth.jwt()`/`auth.role()` are callable from RLS policies.
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
