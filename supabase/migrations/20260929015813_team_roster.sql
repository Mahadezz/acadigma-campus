-- =====================================================================
-- F-ID-03 Part 5 (D-110) · Team & Access roster read
-- ---------------------------------------------------------------------
-- The roster needs each member's name, but `profiles_select` only shows a
-- person to colleagues who share an ACTIVE membership with them, so a
-- pending joiner (and a removed member) is nameless to the owner who must
-- approve them. Rather than widen `profiles` (every column, every caller),
-- one definer function returns the roster's explicit columns to an owner
-- or admin of that school only.
--
-- Approve and reject need nothing new: they are plain UPDATEs of
-- workspace_members.status under workspace_members_update_admin, and
-- app.tg_workspace_members_guard already refuses self-edits, an admin
-- touching an owner and the last owner leaving, and stamps joined_at /
-- removed_at / removed_by itself.
-- =====================================================================

create or replace function public.list_workspace_members(
  p_workspace_id uuid,
  p_status       public.member_status,
  p_q            text    default null,
  p_after        uuid    default null,
  p_limit        integer default 25)
returns table (
  id             uuid,
  full_name      text,
  email          text,
  role           public.member_role,
  status         public.member_status,
  via_invitation boolean,
  created_at     timestamptz,
  joined_at      timestamptz,
  removed_at     timestamptz)
language plpgsql
stable
security definer   -- reads profiles of pending/removed members (see header)
set search_path = ''
as $$
declare
  v_q             text := nullif(lower(btrim(p_q)), '');
  v_after_created timestamptz;
begin
  if not app.has_role(p_workspace_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_after is not null then
    select m.created_at into v_after_created
      from public.workspace_members m
     where m.id = p_after and m.workspace_id = p_workspace_id;
    if not found then
      raise exception 'CURSOR_INVALID' using errcode = '22023';
    end if;
  end if;

  -- Parents are not staff: their access is managed per child (D-108).
  return query
  select m.id, p.full_name, p.email, m.role, m.status,
         m.invitation_id is not null,
         m.created_at, m.joined_at, m.removed_at
    from public.workspace_members m
    join public.profiles p on p.id = m.user_id
   where m.workspace_id = p_workspace_id
     and m.status = p_status
     and m.role <> 'parent'
     and (v_q is null
          or position(v_q in lower(p.full_name)) > 0
          or position(v_q in lower(coalesce(p.email, ''))) > 0)
     and (p_after is null or (m.created_at, m.id) < (v_after_created, p_after))
   order by m.created_at desc, m.id desc
   limit least(greatest(coalesce(p_limit, 25), 1), 51);
end;
$$;

comment on function public.list_workspace_members(uuid, public.member_status, text, uuid, integer) is
  'F-ID-03 Part 5 (D-110): one page of a school''s staff roster for its owner '
  'or admin — pending, active or removed; parents excluded. Search matches '
  'name or email (case-insensitive substring); keyset paging newest first, '
  'p_after = the last row''s id; at most 51 rows (a page of 50 plus one to '
  'detect more). Raises FORBIDDEN (42501), CURSOR_INVALID (22023).';

revoke all on function public.list_workspace_members(uuid, public.member_status, text, uuid, integer)
  from public, anon;
grant execute on function public.list_workspace_members(uuid, public.member_status, text, uuid, integer)
  to authenticated;
