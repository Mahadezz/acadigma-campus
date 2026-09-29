-- =====================================================================
-- F-OP-07 Part 6 (D-211) follow-up · app.tg_workspaces_guard keeps its
-- original refusal text for plan / trial / status / access mode (pinned by
-- 16_billing_bootstrap_guard.sql since D-59); the two danger-zone columns
-- get their own message. Body otherwise identical to
-- 20260929172327_danger_zone.sql §2.
-- =====================================================================
create or replace function app.tg_workspaces_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.is_privileged_context() then
    return new;                                   -- server-owned path
  end if;

  if new.type is distinct from old.type then
    raise exception 'workspace type is immutable' using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'ownership is transferred through app.transfer_ownership(), not by update'
      using errcode = '42501';
  end if;

  if new.invite_code is distinct from old.invite_code then
    raise exception 'the invite code is rotated through app.rotate_invite_code()'
      using errcode = '42501';
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'created_by is immutable — it records who the workspace was made for'
      using errcode = '42501';
  end if;

  if app.is_platform_admin() then
    return new;
  end if;

  -- D-211: a danger-zone function, after its own owner + name checks.
  if coalesce(current_setting('app.workspace_lifecycle', true), '') = new.id::text
     and to_jsonb(new) - array['status', 'archived_at', 'deletion_scheduled_at', 'updated_at']
       = to_jsonb(old) - array['status', 'archived_at', 'deletion_scheduled_at', 'updated_at'] then
    return new;
  end if;

  if new.plan_id is distinct from old.plan_id
     or new.trial_ends_at is distinct from old.trial_ends_at
     or new.status is distinct from old.status
     or new.access_mode is distinct from old.access_mode then
    raise exception 'plan, trial, workspace status and access mode are set by billing and platform staff'
      using errcode = '42501';
  end if;

  if new.archived_at is distinct from old.archived_at
     or new.deletion_scheduled_at is distinct from old.deletion_scheduled_at then
    raise exception 'archiving and deletion go through the owner''s danger-zone functions'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
