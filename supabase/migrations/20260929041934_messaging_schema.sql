-- =====================================================================
-- F-OP-05 Part 1 — messaging schema, RLS and the post-permission trigger
-- (D-311).
--
-- Base44's Message table had no tenant column and no RLS: every message in
-- the product was readable by every user of every school, and a parent
-- could post in #admin. Here every row carries workspace_id, every foreign
-- key into another tenant table is composite with workspace_id, and a
-- message is visible only to the members of its channel.
--
-- Channel membership for the automatic channels is DERIVED, not stored
-- (D-311 item 1): app.channel_ids_for() computes it from
-- workspace_members, sections.class_teacher_id and
-- section_subjects.teacher_id on every read. A teacher assigned to a
-- section is in its channel in the same transaction, and a removed or
-- demoted member is out of it on the next statement, with no recompute
-- trigger to fall behind. channel_members rows are membership only for
-- custom channels and DMs; for every kind they carry per-person state
-- (mute now, last-read later).
--
-- Part 1 opens only select on channels/channel_members and select/insert
-- on messages to clients. Every other write path (custom channels, DMs,
-- edit, delete, mute, read state) arrives with the Part that ships it and
-- its own pgTAP (D-311 item 4).
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'channel_kind') then
    create type public.channel_kind as enum ('general', 'staff', 'section', 'custom', 'dm');
  end if;
  if not exists (select 1 from pg_type where typname = 'channel_member_role') then
    create type public.channel_member_role as enum ('member', 'moderator');
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- channels
-- ---------------------------------------------------------------------
create table if not exists public.channels (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind         public.channel_kind not null,
  -- 'general' | 'staff' | 'section:<section id>' | a custom slug | 'dm:<a>:<b>'
  key          text not null check (length(key) between 1 and 120),
  -- Custom channels only. The UI names general/staff and a section channel
  -- (from its section) itself, so a renamed section never goes stale here.
  name         text check (name is null or length(btrim(name)) between 1 and 80),
  section_id   uuid,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles (id) on delete set null,
  constraint channels_workspace_key_key unique (workspace_id, key),
  constraint channels_id_workspace_key unique (id, workspace_id),
  -- Sections are archive-only for clients (no delete policy); only a
  -- privileged delete can remove one, and its channel goes with it.
  constraint channels_section_fkey
    foreign key (section_id, workspace_id) references public.sections (id, workspace_id)
    on delete cascade,
  constraint channels_section_kind check ((kind = 'section') = (section_id is not null)),
  constraint channels_custom_name check ((kind = 'custom') = (name is not null)),
  constraint channels_fixed_key check (kind not in ('general', 'staff') or key = kind::text)
);

comment on table public.channels is
  'F-OP-05 §3.1 / DATA-MODEL.md §6 (D-311). general/staff per school and one '
  'per section are created by triggers; membership of those three kinds is '
  'derived by app.channel_ids_for(), custom and dm use channel_members rows.';

create index if not exists channels_created_by_idx
  on public.channels (created_by) where created_by is not null;
-- justification: FK column. workspace_id is the prefix of the unique key;
-- section_id is covered by the unique 'section:<id>' key per workspace and
-- is only ever joined from the channel side.

-- ---------------------------------------------------------------------
-- channel_members
-- ---------------------------------------------------------------------
create table if not exists public.channel_members (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  channel_id   uuid not null,
  member_id    uuid not null,
  role         public.channel_member_role not null default 'member',
  muted_until  timestamptz,
  last_read_at timestamptz,
  left_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint channel_members_channel_member_key unique (channel_id, member_id),
  constraint channel_members_channel_fkey
    foreign key (channel_id, workspace_id) references public.channels (id, workspace_id)
    on delete cascade,
  constraint channel_members_member_fkey
    foreign key (member_id, workspace_id) references public.workspace_members (id, workspace_id)
);

comment on table public.channel_members is
  'F-OP-05 §3.2 (D-311). member_id is workspace_members.id, like '
  'sections.class_teacher_id. A row is membership for custom/dm channels '
  '(left_at null) and per-person state (muted_until, last_read_at) for all.';

create index if not exists channel_members_member_idx on public.channel_members (member_id);
-- justification: FK column; "my channels" for a member.

-- ---------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  channel_id   uuid not null,
  -- Null only after the sender's account is deleted; every insert names
  -- the caller (RLS + app.tg_messages_can_post).
  sender_id    uuid references public.profiles (id) on delete set null,
  body         text not null check (length(btrim(body)) between 1 and 4000),
  client_nonce uuid not null,
  created_at   timestamptz not null default now(),
  constraint messages_channel_fkey
    foreign key (channel_id, workspace_id) references public.channels (id, workspace_id)
    on delete cascade,
  -- AC-7: a double tap or a retry with the same nonce is one row.
  constraint messages_sender_nonce_key unique (channel_id, sender_id, client_nonce)
);

comment on table public.messages is
  'F-OP-05 §3.4 (D-311). Part 1 columns only; threads, mentions, edits, '
  'tombstones and attachments are added by the Parts that ship them.';

create index if not exists messages_channel_created_idx
  on public.messages (channel_id, created_at desc);
-- justification: the only read pattern (a channel, newest first); covers
-- the channel FK.
create index if not exists messages_sender_idx
  on public.messages (sender_id) where sender_id is not null;
-- justification: FK column (on delete set null).

-- ---------------------------------------------------------------------
-- Membership
-- ---------------------------------------------------------------------
create or replace function app.channel_ids_for(p_user_id uuid)
returns uuid[]
language sql
stable
security definer   -- reads sections/section_subjects/channel_members the caller's RLS hides
set search_path = ''
as $$
  select coalesce(array_agg(c.id), '{}')
    from public.workspace_members m
    join public.channels c on c.workspace_id = m.workspace_id
   where m.user_id = p_user_id
     and m.status = 'active'
     and m.role <> 'parent'   -- parents have no chat in v1 (F-OP-05 §2 note 1)
     and case c.kind
           when 'general' then m.role in ('owner', 'admin', 'teacher', 'staff')
           when 'staff'   then m.role in ('owner', 'admin', 'staff')
           when 'section' then
             m.role in ('owner', 'admin')
             or exists (select 1 from public.sections s
                         where s.id = c.section_id and s.class_teacher_id = m.id)
             or exists (select 1 from public.section_subjects ss
                         where ss.section_id = c.section_id and ss.teacher_id = m.id)
           else exists (select 1 from public.channel_members cm
                         where cm.channel_id = c.id and cm.member_id = m.id
                           and cm.left_at is null)
         end
$$;

comment on function app.channel_ids_for(uuid) is
  'F-OP-05 §5.1 (D-311): every channel the user is a member of, across '
  'their active school memberships. Not client-callable (takes any user id); '
  'clients use app.my_channel_ids().';

revoke all on function app.channel_ids_for(uuid) from public, anon, authenticated;

create or replace function app.my_channel_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select app.channel_ids_for(auth.uid())
$$;

comment on function app.my_channel_ids() is
  'F-OP-05 (D-311): policy helper, caller-scoped. Policies call it as '
  '(select app.my_channel_ids()) so it runs once per statement.';

revoke all on function app.my_channel_ids() from public, anon;
grant execute on function app.my_channel_ids() to authenticated;

-- ---------------------------------------------------------------------
-- Post permission (F-OP-05 §5.2) — the database half; domain/permissions
-- is the other half when sendMessage lands (Part 2).
-- ---------------------------------------------------------------------
create or replace function app.tg_messages_can_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_muted_until timestamptz;
begin
  -- Same refusal for a forged sender, a stranger and a missing channel, so
  -- the error never says whether a channel exists or who is in it.
  if (not app.is_privileged_context() and new.sender_id is distinct from auth.uid())
     or not (new.channel_id = any (app.channel_ids_for(new.sender_id))) then
    raise exception 'NOT_A_MEMBER' using errcode = '42501';
  end if;

  if exists (
    select 1
      from public.channels c
      left join public.sections s on s.id = c.section_id
     where c.id = new.channel_id
       and (c.archived_at is not null or s.archived_at is not null)) then
    raise exception 'ARCHIVED_CHANNEL' using errcode = '42501';
  end if;

  select cm.muted_until into v_muted_until
    from public.channel_members cm
    join public.workspace_members m on m.id = cm.member_id
   where cm.channel_id = new.channel_id and m.user_id = new.sender_id;
  if v_muted_until > now() then
    raise exception 'MUTED'
      using errcode = '42501', detail = to_char(v_muted_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;

  return new;
end;
$$;

revoke all on function app.tg_messages_can_post() from public, anon, authenticated;

create trigger messages_can_post
  before insert on public.messages
  for each row execute function app.tg_messages_can_post();

-- ---------------------------------------------------------------------
-- Automatic channels: general + staff per school, one per section.
-- ---------------------------------------------------------------------
create or replace function app.tg_workspaces_create_channels()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.channels (workspace_id, kind, key)
  values (new.id, 'general', 'general'), (new.id, 'staff', 'staff')
  on conflict (workspace_id, key) do nothing;
  return new;
end;
$$;

revoke all on function app.tg_workspaces_create_channels() from public, anon, authenticated;

create trigger workspaces_create_channels
  after insert on public.workspaces
  for each row when (new.type = 'school')
  execute function app.tg_workspaces_create_channels();

create or replace function app.tg_sections_create_channel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.channels (workspace_id, kind, key, section_id)
  values (new.workspace_id, 'section', 'section:' || new.id, new.id)
  on conflict (workspace_id, key) do nothing;
  return new;
end;
$$;

revoke all on function app.tg_sections_create_channel() from public, anon, authenticated;

create trigger sections_create_channel
  after insert on public.sections
  for each row execute function app.tg_sections_create_channel();

-- Backfill every existing school and section (archived sections too: their
-- channel is read-only via ARCHIVED_CHANNEL, not missing).
insert into public.channels (workspace_id, kind, key)
select w.id, k.kind, k.kind::text
  from public.workspaces w
 cross join (values ('general'::public.channel_kind), ('staff'::public.channel_kind)) as k (kind)
 where w.type = 'school'
on conflict (workspace_id, key) do nothing;

insert into public.channels (workspace_id, kind, key, section_id)
select s.workspace_id, 'section', 'section:' || s.id, s.id
  from public.sections s
on conflict (workspace_id, key) do nothing;

-- ---------------------------------------------------------------------
-- Standard triggers. No generic audit: Part 1 has no client write to
-- channels/channel_members, and a message is its own record (audit rows
-- would copy children's details into audit_events). Moderation acts are
-- audited when Part 8 ships them.
-- ---------------------------------------------------------------------
select app.attach_freeze_workspace('public.channels');
select app.attach_freeze_workspace('public.channel_members');
select app.attach_freeze_workspace('public.messages');
select app.attach_updated_at('public.channels');
select app.attach_updated_at('public.channel_members');
select app.attach_require_writable('public.channels');
select app.attach_require_writable('public.channel_members');
select app.attach_require_writable('public.messages');

-- ---------------------------------------------------------------------
-- RLS: membership AND role (parents and non-members match nothing in
-- app.channel_ids_for). No platform-admin read: admins moderate reported
-- messages (Part 8), they do not read chats (AC-4).
-- ---------------------------------------------------------------------
alter table public.channels        enable row level security;
alter table public.channel_members enable row level security;
alter table public.messages        enable row level security;

drop policy if exists channels_select on public.channels;
create policy channels_select on public.channels
  for select to authenticated
  using (id = any ((select app.my_channel_ids())));

drop policy if exists channel_members_select on public.channel_members;
create policy channel_members_select on public.channel_members
  for select to authenticated
  using (channel_id = any ((select app.my_channel_ids())));

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (channel_id = any ((select app.my_channel_ids())));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and channel_id = any ((select app.my_channel_ids()))
    and app.has_role(workspace_id, array['owner', 'admin', 'teacher', 'staff'])
  );

revoke all on public.channels, public.channel_members, public.messages from anon, authenticated;
grant select on public.channels, public.channel_members to authenticated;
grant select, insert on public.messages to authenticated;
