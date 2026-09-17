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
