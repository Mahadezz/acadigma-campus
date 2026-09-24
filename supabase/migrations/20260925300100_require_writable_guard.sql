-- =====================================================================
-- F-CM-06 — read-only mode enforced at the database too (D-300)
-- ---------------------------------------------------------------------
-- `workspaces.access_mode = 'read_only'` (set by the trial-expiry tick, D-62)
-- was checked only by server actions (`requireWritable`, D-29). A direct
-- PostgREST write from a member's own session skipped it entirely. This adds
-- one shared BEFORE trigger that refuses INSERT/UPDATE/DELETE on a tenant
-- table while the row's workspace is read_only.
--
--   - Reads are untouched: a write-only trigger, no RLS predicate, so none of
--     DATA-MODEL §5's reasons for keeping billing out of RLS apply.
--   - Privileged callers pass (service role, the billing tick, migrations,
--     the seed — `app.is_privileged_context()`), and so do platform staff
--     (`app.is_platform_admin()`), so `app.set_access_mode(..., 'normal')`
--     can always lift the mode.
--   - Tables deliberately NOT guarded (billing, the individual's own legal
--     records, system logs, notification inboxes) are listed with reasons in
--     supabase/tests/50_require_writable.sql, which also fails CI for any
--     `workspace_id` table that is neither guarded nor on that list.
--
-- A new tenant table adds ONE line:
--   create trigger require_writable before insert or update or delete on public.<t>
--     for each row execute function app.tg_require_writable();
-- =====================================================================

create or replace function app.tg_require_writable()
returns trigger
language plpgsql
security definer   -- sees the workspace row even when the caller's RLS cannot
set search_path = ''
as $$
declare
  v_row    jsonb := to_jsonb(case when tg_op = 'INSERT' then new else old end);
  v_ws     uuid  := (v_row ->> coalesce(tg_argv[0], 'workspace_id'))::uuid;
  v_reason text;
begin
  if app.is_privileged_context() or app.is_platform_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select w.access_mode_reason into v_reason
    from public.workspaces w
   where w.id = v_ws and w.access_mode = 'read_only';

  if found then
    raise exception 'PLAN_READ_ONLY'
      using errcode = '42501',
            detail  = coalesce(v_reason, 'This workspace is read-only.');
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

comment on function app.tg_require_writable() is
  'D-300: refuses INSERT/UPDATE/DELETE on a tenant row while its workspace is '
  'access_mode = read_only (PLAN_READ_ONLY, 42501). TG_ARGV[0] names the '
  'workspace column (default workspace_id; public.workspaces passes id). '
  'Privileged callers and platform staff pass, so the billing tick and '
  'app.set_access_mode can always lift the mode.';

revoke all on function app.tg_require_writable() from public, anon, authenticated;

create trigger require_writable before insert or update or delete on public.workspaces
  for each row execute function app.tg_require_writable('id');
create trigger require_writable before insert or update or delete on public.school_profiles
  for each row execute function app.tg_require_writable();
create trigger require_writable before insert or update or delete on public.custom_labels
  for each row execute function app.tg_require_writable();
create trigger require_writable before insert or update or delete on public.workspace_invitations
  for each row execute function app.tg_require_writable();
create trigger require_writable before insert or update or delete on public.workspace_members
  for each row execute function app.tg_require_writable();
create trigger require_writable before insert or update or delete on public.workspace_member_capabilities
  for each row execute function app.tg_require_writable();
create trigger require_writable before insert or update or delete on public.files
  for each row execute function app.tg_require_writable();
