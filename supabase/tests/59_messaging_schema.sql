-- =====================================================================
-- pgTAP · F-OP-05 Part 1 — messaging schema, RLS, automatic channels and
-- the post-permission trigger (20260929041934_messaging_schema.sql, D-311)
--
--   A. A school gets #general and #staff, each section its channel;
--      personal workspaces get none.
--   B. Derived membership: owner/admin see every automatic channel, a
--      class teacher general + their section, a teacher with no section
--      only general (AC-3), staff general + staff, a parent and a pending
--      member nothing.
--   C. Isolation: another school's owner sees none of School A's channels
--      or messages (AC-1); a parent sees no message.
--   D. Posting: NOT_A_MEMBER for a non-member, a parent, a stranger and a
--      forged sender; RLS refuses a forged workspace_id; one row per
--      client_nonce (AC-7); 4000-character and blank bodies refused; a
--      member of two schools cannot file a message under the other one.
--   E. Assigning a teacher to a section subject puts them in the section
--      channel in the same transaction (the Part 1 demo, AC-12).
--   F. A removed member loses every channel and message at once (AC-5).
--   G. MUTED names when the mute ends; a peer cannot read someone's mute;
--      an archived section's channel is ARCHIVED_CHANNEL.
--   H. Custom channels and DMs follow channel_members rows; an owner
--      cannot read a DM (or its member rows) between two other members
--      (AC-4); left_at ends membership; demotion to parent ends a DM.
--   I. Escalation: no client update/delete of messages, no client write
--      to channels or channel_members; anon holds nothing; only
--      app.my_channel_ids is client-callable.
--   J. Read-only refuses a post and keeps reads.
-- =====================================================================
begin;
select plan(53);

create schema if not exists tests;
grant usage on schema tests to authenticated;

create or replace function tests.mkuser(p_id uuid, p_email text, p_name text)
returns uuid language plpgsql as $fn$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
    lower(p_email), '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_name), now(), now());
  return p_id;
end;
$fn$;

create or replace function tests.login(p_id uuid)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated',
      'email', (select u.email from auth.users u where u.id = p_id))::text, true);
  perform set_config('role', 'authenticated', true);
end;
$fn$;

create or replace function tests.logout()
returns void language plpgsql as $fn$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$fn$;

-- Channel ids, captured as postgres so a logged-in caller's RLS never
-- hides the id a test needs.
create temp table ch (key text primary key, id uuid);
grant select on ch to authenticated;
create or replace function tests.ch(p_key text) returns uuid language sql as $fn$
  select id from ch where key = p_key
$fn$;

-- The keys of every channel the caller can see, sorted.
create or replace function tests.my_keys() returns text[] language sql as $fn$
  select coalesce(array_agg(key order by key), '{}') from public.channels
$fn$;

-- Users: a1 owner A, a2 teacher A (class teacher of 6-A), a3 teacher A2
-- (no section yet), a4 staff A, a5 parent A, a6 owner B, a7 admin A,
-- a8 pending A
select tests.mkuser('59000000-0000-4000-a000-000000000001', 'msg-owner-a@test.local',    'Owner A');
select tests.mkuser('59000000-0000-4000-a000-000000000002', 'msg-teacher-a@test.local',  'Teacher A');
select tests.mkuser('59000000-0000-4000-a000-000000000003', 'msg-teacher-a2@test.local', 'Teacher A2');
select tests.mkuser('59000000-0000-4000-a000-000000000004', 'msg-staff-a@test.local',    'Staff A');
select tests.mkuser('59000000-0000-4000-a000-000000000005', 'msg-parent-a@test.local',   'Parent A');
select tests.mkuser('59000000-0000-4000-a000-000000000006', 'msg-owner-b@test.local',    'Owner B');
select tests.mkuser('59000000-0000-4000-a000-000000000007', 'msg-admin-a@test.local',    'Admin A');
select tests.mkuser('59000000-0000-4000-a000-000000000008', 'msg-pending-a@test.local',  'Pending A');

insert into public.workspaces (id, type, name, slug, owner_id, created_by, status)
values
  ('59000000-0000-4000-b000-000000000001', 'school', 'Msg School A', 'msg-school-a-59',
   '59000000-0000-4000-a000-000000000001', '59000000-0000-4000-a000-000000000001', 'active'),
  ('59000000-0000-4000-b000-000000000002', 'school', 'Msg School B', 'msg-school-b-59',
   '59000000-0000-4000-a000-000000000006', '59000000-0000-4000-a000-000000000006', 'active');

insert into public.workspace_members (id, workspace_id, user_id, role, status, joined_at)
values
  ('59000000-0000-4000-d000-000000000002', '59000000-0000-4000-b000-000000000001', '59000000-0000-4000-a000-000000000002', 'teacher', 'active', now()),
  ('59000000-0000-4000-d000-000000000003', '59000000-0000-4000-b000-000000000001', '59000000-0000-4000-a000-000000000003', 'teacher', 'active', now()),
  ('59000000-0000-4000-d000-000000000004', '59000000-0000-4000-b000-000000000001', '59000000-0000-4000-a000-000000000004', 'staff',   'active', now()),
  ('59000000-0000-4000-d000-000000000005', '59000000-0000-4000-b000-000000000001', '59000000-0000-4000-a000-000000000005', 'parent',  'active', now()),
  ('59000000-0000-4000-d000-000000000007', '59000000-0000-4000-b000-000000000001', '59000000-0000-4000-a000-000000000007', 'admin',   'active', now()),
  ('59000000-0000-4000-d000-000000000008', '59000000-0000-4000-b000-000000000001', '59000000-0000-4000-a000-000000000008', 'teacher', 'pending', null);

insert into public.academic_years (id, workspace_id, name, starts_on, ends_on)
values
  ('59000000-0000-4000-c000-000000000001', '59000000-0000-4000-b000-000000000001', '2026', '2026-01-01', '2026-12-31'),
  ('59000000-0000-4000-c000-000000000002', '59000000-0000-4000-b000-000000000002', '2026', '2026-01-01', '2026-12-31');

insert into public.grade_levels (id, workspace_id, name, name_bn, level_number)
values
  ('59000000-0000-4000-c000-000000000011', '59000000-0000-4000-b000-000000000001', 'Class 6', 'ষষ্ঠ শ্রেণি', 6),
  ('59000000-0000-4000-c000-000000000012', '59000000-0000-4000-b000-000000000002', 'Class 6', 'ষষ্ঠ শ্রেণি', 6);

insert into public.sections (id, workspace_id, academic_year_id, grade_level_id, name, class_teacher_id, archived_at)
values
  ('59000000-0000-4000-c000-000000000021', '59000000-0000-4000-b000-000000000001',
   '59000000-0000-4000-c000-000000000001', '59000000-0000-4000-c000-000000000011', 'A',
   '59000000-0000-4000-d000-000000000002', null),
  ('59000000-0000-4000-c000-000000000022', '59000000-0000-4000-b000-000000000001',
   '59000000-0000-4000-c000-000000000001', '59000000-0000-4000-c000-000000000011', 'Old', null, now()),
  ('59000000-0000-4000-c000-000000000023', '59000000-0000-4000-b000-000000000002',
   '59000000-0000-4000-c000-000000000002', '59000000-0000-4000-c000-000000000012', 'A', null, null);

insert into public.subjects (id, workspace_id, name)
values ('59000000-0000-4000-c000-000000000031', '59000000-0000-4000-b000-000000000001', 'Mathematics 59');

insert into ch
select case when c.workspace_id = '59000000-0000-4000-b000-000000000002' then 'b:' else '' end
       || replace(c.key, 'section:59000000-0000-4000-c000-0000000000', 'section:'), c.id
  from public.channels c
 where c.workspace_id in ('59000000-0000-4000-b000-000000000001', '59000000-0000-4000-b000-000000000002');

-- ---------------------------------------------------------------------
-- A. Automatic channels
-- ---------------------------------------------------------------------
select is(
  (select array_agg(key order by key) from ch),
  array['b:general', 'b:section:23', 'b:staff', 'general', 'section:21', 'section:22', 'staff'],
  'each school gets general + staff and each section (archived too) its own channel');
select is(
  (select count(*)::int from public.channels c
     join public.workspaces w on w.id = c.workspace_id
    where w.type = 'personal'),
  0, 'personal workspaces get no channels');

-- Seed one message per channel that matters, as postgres (the trigger
-- still checks the sender is a member).
insert into public.messages (workspace_id, channel_id, sender_id, body, client_nonce)
values
  ('59000000-0000-4000-b000-000000000001', tests.ch('general'), '59000000-0000-4000-a000-000000000001', 'Thursday is a holiday', gen_random_uuid()),
  ('59000000-0000-4000-b000-000000000001', tests.ch('staff'),   '59000000-0000-4000-a000-000000000004', 'Payroll is on Monday',  gen_random_uuid()),
  ('59000000-0000-4000-b000-000000000002', tests.ch('b:general'), '59000000-0000-4000-a000-000000000006', 'School B only',      gen_random_uuid());

-- ---------------------------------------------------------------------
-- B. Derived membership
-- ---------------------------------------------------------------------
select tests.login('59000000-0000-4000-a000-000000000001');
select is(tests.my_keys(),
  array['general', 'section:59000000-0000-4000-c000-000000000021',
        'section:59000000-0000-4000-c000-000000000022', 'staff'],
  'the owner is in every automatic channel of their school, and none of School B');
select tests.logout();

select tests.login('59000000-0000-4000-a000-000000000007');
select is(cardinality(tests.my_keys()), 4, 'an admin is in every automatic channel');
select tests.logout();

select tests.login('59000000-0000-4000-a000-000000000002');
select is(tests.my_keys(),
  array['general', 'section:59000000-0000-4000-c000-000000000021'],
  'a class teacher is in general and their own section''s channel');
select tests.logout();

select tests.login('59000000-0000-4000-a000-000000000003');
select is(tests.my_keys(), array['general'],
  'AC-3: a teacher with no section is in general only — not staff');
select tests.logout();

select tests.login('59000000-0000-4000-a000-000000000004');
select is(tests.my_keys(), array['general', 'staff'], 'staff are in general and staff');
select tests.logout();

select tests.login('59000000-0000-4000-a000-000000000005');
select is(tests.my_keys(), '{}'::text[], 'a parent is in no channel');
select is((select count(*)::int from public.messages), 0, 'a parent reads no message');
select tests.logout();

select tests.login('59000000-0000-4000-a000-000000000008');
select is(tests.my_keys(), '{}'::text[], 'a pending member is in no channel');
select throws_ok(
  $$insert into public.messages (workspace_id, channel_id, sender_id, body, client_nonce)
    values ('59000000-0000-4000-b000-000000000001', tests.ch('general'),
            '59000000-0000-4000-a000-000000000008', 'am I in?', gen_random_uuid())$$,
  '42501', 'NOT_A_MEMBER', 'a pending member cannot post');
select tests.logout();

-- ---------------------------------------------------------------------
-- C. Isolation
-- ---------------------------------------------------------------------
select tests.login('59000000-0000-4000-a000-000000000006');
select is(
  (select count(*)::int from public.channels where workspace_id = '59000000-0000-4000-b000-000000000001'),
  0, 'isolation: School B''s owner sees none of School A''s channels');
select is(
  (select count(*)::int from public.messages where workspace_id = '59000000-0000-4000-b000-000000000001'),
  0, 'AC-1: School B''s owner reads zero School A messages');
select tests.logout();

select tests.login('59000000-0000-4000-a000-000000000002');
select is((select array_agg(body order by body) from public.messages), array['Thursday is a holiday'],
  'a teacher reads general but not the staff channel');
select tests.logout();

-- ---------------------------------------------------------------------
-- D. Posting
-- ---------------------------------------------------------------------
select tests.login('59000000-0000-4000-a000-000000000002');
select lives_ok(
  $$insert into public.messages (workspace_id, channel_id, sender_id, body, client_nonce)
    values ('59000000-0000-4000-b000-000000000001', tests.ch('general'),
            '59000000-0000-4000-a000-000000000002', 'Period 3 swap?', '59000000-0000-4000-e000-000000000001')$$,
  'a member posts in their channel');
select throws_ok(
  $$insert into public.messages (workspace_id, channel_id, sender_id, body, client_nonce)
    values ('59000000-0000-4000-b000-000000000001', tests.ch('general'),
            '59000000-0000-4000-a000-000000000002', 'Period 3 swap?', '59000000-0000-4000-e000-000000000001')$$,
  '23505', 'duplicate key value violates unique constraint "messages_sender_nonce_key"',
  'AC-7: the same client_nonce twice is one row');
select throws_ok(
  $$insert into public.messages (workspace_id, channel_id, sender_id, body, client_nonce)
    values ('59000000-0000-4000-b000-000000000001', tests.ch('staff'),
            '59000000-0000-4000-a000-000000000002', 'let me in', gen_random_uuid())$$,
  '42501', 'NOT_A_MEMBER', 'a teacher cannot post in the staff channel');
select throws_ok(
  $$insert into public.messages (workspace_id, channel_id, sender_id, body, client_nonce)
    values ('59000000-0000-4000-b000-000000000001', tests.ch('general'),
            '59000000-0000-4000-a000-000000000001', 'I am the owner', gen_random_uuid())$$,
  '42501', 'NOT_A_MEMBER', 'a forged sender_id is refused');
select throws_ok(
  $$insert into public.messages (workspace_id, channel_id, sender_id, body, client_nonce)
    values ('59000000-0000-4000-b000-000000000002', tests.ch('general'),
            '59000000-0000-4000-a000-000000000002', 'wrong school', gen_random_uuid())$$,
  '42501', 'new row violates row-level security policy for table "messages"',
  'a forged workspace_id is refused by RLS');
select throws_ok(
  $$insert into public.messages (workspace_id, channel_id, sender_id, body, client_nonce)
    values ('59000000-0000-4000-b000-000000000001', tests.ch('general'),
            '59000000-0000-4000-a000-000000000002', repeat('x', 4001), gen_random_uuid())$$,
  '23514', 'new row for relation "messages" violates check constraint "messages_body_check"',
  'a body over 4000 characters is refused');
select throws_ok(
  $$insert into public.messages (workspace_id, channel_id, sender_id, body, client_nonce)
    values ('59000000-0000-4000-b000-000000000001', tests.ch('general'),
            '59000000-0000-4000-a000-000000000002', '   ', gen_random_uuid())$$,
  '23514', 'new row for relation "messages" violates check constraint "messages_body_check"',
  'a blank body is refused');
select tests.logout();

select tests.login('59000000-0000-4000-a000-000000000005');
select throws_ok(
  $$insert into public.messages (workspace_id, channel_id, sender_id, body, client_nonce)
    values ('59000000-0000-4000-b000-000000000001', tests.ch('general'),
            '59000000-0000-4000-a000-000000000005', 'hello', gen_random_uuid())$$,
  '42501', 'NOT_A_MEMBER', 'AC-2: a parent cannot post');
select tests.logout();

select tests.login('59000000-0000-4000-a000-000000000006');
select throws_ok(
  $$insert into public.messages (workspace_id, channel_id, sender_id, body, client_nonce)
    values ('59000000-0000-4000-b000-000000000001', tests.ch('general'),
            '59000000-0000-4000-a000-000000000006', 'hello from B', gen_random_uuid())$$,
  '42501', 'NOT_A_MEMBER', 'another school''s owner cannot post in School A');
select throws_ok(
  $$insert into public.messages (workspace_id, channel_id, sender_id, body, client_nonce)
    values ('59000000-0000-4000-b000-000000000001', gen_random_uuid(),
            '59000000-0000-4000-a000-000000000006', 'probe', gen_random_uuid())$$,
  '42501', 'NOT_A_MEMBER', 'a channel that does not exist gets the same refusal (no probing)');
select tests.logout();

-- Staff A also works at School B.
insert into public.workspace_members (id, workspace_id, user_id, role, status, joined_at)
values ('59000000-0000-4000-d000-000000000009', '59000000-0000-4000-b000-000000000002',
        '59000000-0000-4000-a000-000000000004', 'staff', 'active', now());
select tests.login('59000000-0000-4000-a000-000000000004');
select throws_ok(
  $$insert into public.messages (workspace_id, channel_id, sender_id, body, client_nonce)
    values ('59000000-0000-4000-b000-000000000002', tests.ch('general'),
            '59000000-0000-4000-a000-000000000004', 'which school?', gen_random_uuid())$$,
  '23503', 'insert or update on table "messages" violates foreign key constraint "messages_channel_fkey"',
  'a member of two schools cannot file a School A message under School B');
select tests.logout();

-- ---------------------------------------------------------------------
-- E. The Part 1 demo: assignment is membership, same transaction
-- ---------------------------------------------------------------------
select tests.login('59000000-0000-4000-a000-000000000001');
select public.set_section_subjects('59000000-0000-4000-b000-000000000001', '59000000-0000-4000-c000-000000000021',
  jsonb_build_array(jsonb_build_object('subject_id', '59000000-0000-4000-c000-000000000031',
                                       'teacher_id', '59000000-0000-4000-d000-000000000003')));
select tests.logout();

select tests.login('59000000-0000-4000-a000-000000000003');
select is(tests.my_keys(),
  array['general', 'section:59000000-0000-4000-c000-000000000021'],
  'AC-12: the new Mathematics teacher of 6-A is in its channel in the same transaction');
select lives_ok(
  $$insert into public.messages (workspace_id, channel_id, sender_id, body, client_nonce)
    values ('59000000-0000-4000-b000-000000000001', tests.ch('section:21'),
            '59000000-0000-4000-a000-000000000003', 'Maths test on Sunday', gen_random_uuid())$$,
  'and can post there');
select tests.logout();

-- ---------------------------------------------------------------------
-- F. Removal (AC-5)
-- ---------------------------------------------------------------------
update public.workspace_members set status = 'removed', removed_at = now()
 where id = '59000000-0000-4000-d000-000000000002';

select tests.login('59000000-0000-4000-a000-000000000002');
select is(tests.my_keys(), '{}'::text[], 'AC-5: a removed member is in no channel');
select is((select count(*)::int from public.messages), 0, 'AC-5: and reads no message');
select throws_ok(
  $$insert into public.messages (workspace_id, channel_id, sender_id, body, client_nonce)
    values ('59000000-0000-4000-b000-000000000001', tests.ch('general'),
            '59000000-0000-4000-a000-000000000002', 'still here?', gen_random_uuid())$$,
  '42501', 'NOT_A_MEMBER', 'AC-5: and cannot post');
select tests.logout();

-- ---------------------------------------------------------------------
-- G. Mute and archive
-- ---------------------------------------------------------------------
insert into public.channel_members (workspace_id, channel_id, member_id, muted_until)
values ('59000000-0000-4000-b000-000000000001', tests.ch('general'),
        '59000000-0000-4000-d000-000000000004', '2099-01-01 08:30:00+00');

select tests.login('59000000-0000-4000-a000-000000000004');
select throws_ok(
  $$insert into public.messages (workspace_id, channel_id, sender_id, body, client_nonce)
    values ('59000000-0000-4000-b000-000000000001', tests.ch('general'),
            '59000000-0000-4000-a000-000000000004', 'muted?', gen_random_uuid())$$,
  '42501', 'MUTED', 'AC-11: a muted member cannot post');
select is(
  (select count(*)::int from public.channel_members where channel_id = tests.ch('general')),
  1, 'a member reads their own mute');
select tests.logout();

select tests.login('59000000-0000-4000-a000-000000000001');
select is(
  (select count(*)::int from public.channel_members where member_id = '59000000-0000-4000-d000-000000000004'),
  0, 'even the owner does not read another member''s mute row');
select tests.logout();

update public.channel_members set muted_until = now() - interval '1 minute'
 where channel_id = tests.ch('general') and member_id = '59000000-0000-4000-d000-000000000004';

select tests.login('59000000-0000-4000-a000-000000000004');
select lives_ok(
  $$insert into public.messages (workspace_id, channel_id, sender_id, body, client_nonce)
    values ('59000000-0000-4000-b000-000000000001', tests.ch('general'),
            '59000000-0000-4000-a000-000000000004', 'back again', gen_random_uuid())$$,
  'a mute that has ended no longer blocks');
select tests.logout();

select tests.login('59000000-0000-4000-a000-000000000001');
select throws_ok(
  $$insert into public.messages (workspace_id, channel_id, sender_id, body, client_nonce)
    values ('59000000-0000-4000-b000-000000000001', tests.ch('section:22'),
            '59000000-0000-4000-a000-000000000001', 'anyone?', gen_random_uuid())$$,
  '42501', 'ARCHIVED_CHANNEL', 'an archived section''s channel takes no new message');
select tests.logout();

-- ---------------------------------------------------------------------
-- H. Custom channels and DMs follow channel_members rows
-- ---------------------------------------------------------------------
insert into public.channels (id, workspace_id, kind, key, name)
values
  ('59000000-0000-4000-f000-000000000001', '59000000-0000-4000-b000-000000000001', 'custom', 'maths-dept', 'Maths department'),
  ('59000000-0000-4000-f000-000000000002', '59000000-0000-4000-b000-000000000001', 'dm',
   'dm:59000000-0000-4000-d000-000000000003:59000000-0000-4000-d000-000000000004', null);
insert into public.channel_members (workspace_id, channel_id, member_id)
values
  ('59000000-0000-4000-b000-000000000001', '59000000-0000-4000-f000-000000000001', '59000000-0000-4000-d000-000000000003'),
  ('59000000-0000-4000-b000-000000000001', '59000000-0000-4000-f000-000000000002', '59000000-0000-4000-d000-000000000003'),
  ('59000000-0000-4000-b000-000000000001', '59000000-0000-4000-f000-000000000002', '59000000-0000-4000-d000-000000000004');
insert into public.messages (workspace_id, channel_id, sender_id, body, client_nonce)
values ('59000000-0000-4000-b000-000000000001', '59000000-0000-4000-f000-000000000002',
        '59000000-0000-4000-a000-000000000003', 'Can you print my sheets?', gen_random_uuid());

select tests.login('59000000-0000-4000-a000-000000000003');
select ok('maths-dept' = any (tests.my_keys()), 'a custom channel''s member sees it');
select tests.logout();

select tests.login('59000000-0000-4000-a000-000000000004');
select ok(not ('maths-dept' = any (tests.my_keys())), 'a non-member does not see a custom channel');
select is(
  (select count(*)::int from public.messages where channel_id = '59000000-0000-4000-f000-000000000002'),
  1, 'the other DM participant reads the DM');
select tests.logout();

select tests.login('59000000-0000-4000-a000-000000000001');
select is(
  (select count(*)::int from public.channels where kind = 'dm'),
  0, 'AC-4: the owner does not see a DM between two other members');
select is(
  (select count(*)::int from public.messages where channel_id = '59000000-0000-4000-f000-000000000002'),
  0, 'AC-4: and reads none of its messages');
select is(
  (select count(*)::int from public.channel_members where channel_id = '59000000-0000-4000-f000-000000000002'),
  0, 'AC-4: or its member rows');
select tests.logout();

update public.channel_members set left_at = now()
 where channel_id = '59000000-0000-4000-f000-000000000001' and member_id = '59000000-0000-4000-d000-000000000003';

select tests.login('59000000-0000-4000-a000-000000000003');
select ok(not ('maths-dept' = any (tests.my_keys())), 'left_at ends membership of a custom channel');
select tests.logout();

update public.workspace_members set role = 'parent' where id = '59000000-0000-4000-d000-000000000003';
select tests.login('59000000-0000-4000-a000-000000000003');
select is(tests.my_keys(), '{}'::text[], 'demoted to parent, a member loses even a DM they still have a row in');

-- ---------------------------------------------------------------------
-- I. Escalation and grants
-- ---------------------------------------------------------------------
select throws_ok(
  $$update public.messages set body = 'rewritten' where sender_id = '59000000-0000-4000-a000-000000000003'$$,
  '42501', 'permission denied for table messages', 'no client edits a message in Part 1');
select throws_ok(
  $$delete from public.messages where sender_id = '59000000-0000-4000-a000-000000000003'$$,
  '42501', 'permission denied for table messages', 'no client deletes a message in Part 1');
select throws_ok(
  $$insert into public.channels (workspace_id, kind, key, name)
    values ('59000000-0000-4000-b000-000000000001', 'custom', 'secret', 'Secret')$$,
  '42501', 'permission denied for table channels', 'no client creates a channel in Part 1');
select throws_ok(
  $$insert into public.channel_members (workspace_id, channel_id, member_id)
    values ('59000000-0000-4000-b000-000000000001', tests.ch('staff'), '59000000-0000-4000-d000-000000000003')$$,
  '42501', 'permission denied for table channel_members', 'a teacher cannot add themselves to the staff channel');
select tests.logout();

select tests.login('59000000-0000-4000-a000-000000000004');
select throws_ok(
  $$update public.channel_members set muted_until = null
     where member_id = '59000000-0000-4000-d000-000000000004'$$,
  '42501', 'permission denied for table channel_members', 'a member cannot lift their own mute');
select tests.logout();

select ok(
  not has_table_privilege('anon', 'public.channels', 'select')
  and not has_table_privilege('anon', 'public.channel_members', 'select')
  and not has_table_privilege('anon', 'public.messages', 'select')
  and not has_table_privilege('anon', 'public.messages', 'insert'),
  'anon holds no privilege on the messaging tables');
select ok(
  has_function_privilege('authenticated', 'app.my_channel_ids()', 'execute')
  and not has_function_privilege('anon', 'app.my_channel_ids()', 'execute')
  and not has_function_privilege('authenticated', 'app.channel_ids_for(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'app.tg_messages_can_post()', 'execute'),
  'only the caller-scoped app.my_channel_ids is client-callable');
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename in ('channels', 'channel_members', 'messages')
      and qual ilike '%is_platform_admin%'),
  0, 'no platform-admin read branch on chats');

-- ---------------------------------------------------------------------
-- J. Read-only
-- ---------------------------------------------------------------------
update public.workspaces set access_mode = 'read_only' where id = '59000000-0000-4000-b000-000000000001';

select tests.login('59000000-0000-4000-a000-000000000004');
select throws_ok(
  $$insert into public.messages (workspace_id, channel_id, sender_id, body, client_nonce)
    values ('59000000-0000-4000-b000-000000000001', tests.ch('general'),
            '59000000-0000-4000-a000-000000000004', 'read-only?', gen_random_uuid())$$,
  '42501', 'PLAN_READ_ONLY', 'a read-only school takes no new message');
select ok((select count(*)::int from public.messages) > 0, 'a read-only school''s messages are still readable');
select tests.logout();

select * from finish();
rollback;
