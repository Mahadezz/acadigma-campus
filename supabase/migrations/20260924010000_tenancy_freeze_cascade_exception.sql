-- =====================================================================
-- 0007 · F-ID-03 review follow-up — the tenant-freeze trigger vs. an
--        ON DELETE SET NULL cascade
-- ---------------------------------------------------------------------
-- 20260917020300_tenancy_hardening.sql attached app.tg_freeze_workspace to
-- public.data_requests (closing a real re-parenting gap: its UPDATE policy
-- is the same degenerate role-predicate-only shape D-36 warns about). That
-- collided with a fact already true of the table since
-- 20260917010200_audit_and_files.sql:
--
--   workspace_id uuid references public.workspaces (id) on delete set null
--
-- A DSAR/erasure record legitimately survives the school it names being hard
-- deleted (compliance evidence outlives the tenant), so this column is
-- SET NULL on delete, not CASCADE. Postgres implements ON DELETE SET NULL as
-- an internal UPDATE against the referencing row, fired from an AFTER DELETE
-- trigger it attaches to the REFERENCED table (workspaces) — which means the
-- referencing row's own BEFORE UPDATE triggers, including
-- app.tg_freeze_workspace, run too. So `DELETE FROM public.workspaces` for
-- any workspace with a data_requests row raised "workspace_id is immutable"
-- and aborted a routine platform deletion at the database level.
--
-- Fix: teach app.tg_freeze_workspace to recognise the ONE shape that internal
-- cascade produces and allow only that. `pg_trigger_depth()` is the signature
-- to use — a direct client `UPDATE ... SET workspace_id = ...` runs the
-- trigger at depth 1 (this call IS the outermost trigger invocation); the FK
-- action's own AFTER DELETE trigger on workspaces is already depth 1 by the
-- time it issues its internal UPDATE via SPI, so app.tg_freeze_workspace
-- observes depth 2 there. Depth alone is not the whole guard, though —
-- requiring the EXACT non-null -> null transition on top of it means even a
-- hypothetical future nested-trigger caller cannot smuggle an arbitrary
-- re-parent through this door; it can only ever produce the one transition
-- the cascade itself produces. Every other UPDATE shape, at any depth, on
-- every frozen table (data_requests included), still raises exactly as
-- before.
--
-- Proven in supabase/tests/10_tenancy_cascade.sql: deleting a workspace with
-- a data_requests row succeeds and nulls the column (as postgres, the only
-- role that can issue the DELETE); a direct client UPDATE of
-- data_requests.workspace_id to a DIFFERENT workspace still raises; and the
-- 09_tenancy.sql catalogue-driven "every client-UPDATE-able workspace_id
-- table carries the freeze trigger" invariant stays green (this migration
-- changes the trigger FUNCTION's body, not which tables carry it).
--
-- DECISION-LOG D-52 records this as the behavioural decision it is: the
-- freeze trigger is no longer an unconditional "workspace_id never changes",
-- it is "workspace_id never changes EXCEPT the one FK-cascade-driven
-- non-null -> null transition, and only on data_requests".
-- =====================================================================

create or replace function app.tg_freeze_workspace()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    if pg_trigger_depth() > 1
       and tg_table_schema = 'public'
       and tg_table_name = 'data_requests'
       and old.workspace_id is not null
       and new.workspace_id is null
    then
      -- The public.data_requests.workspace_id ON DELETE SET NULL cascade,
      -- and nothing else: a direct client statement is never nested inside
      -- another trigger, so it always runs at depth 1 and never reaches here.
      return new;
    end if;

    raise exception 'workspace_id is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function app.tg_freeze_workspace() is
  'BEFORE UPDATE: workspace_id is immutable on every table this is attached '
  'to, with one narrow exception (20260924010000, D-52): the ON DELETE SET '
  'NULL cascade from public.workspaces onto public.data_requests.workspace_id '
  '-- detected by pg_trigger_depth() > 1 (a direct client UPDATE always runs '
  'at depth 1; the FK action''s own AFTER DELETE trigger on workspaces is '
  'already one level deep by the time it issues the internal UPDATE this '
  'function then sees) combined with the exact non-null -> null transition '
  'the cascade produces. Every other re-parent attempt, on every frozen '
  'table including data_requests itself, still raises 42501.';
