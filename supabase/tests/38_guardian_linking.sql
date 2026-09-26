-- =====================================================================
-- pgTAP · F-AC-02 Part 4 (demo cut) — guardian linking
-- (20260926025038_guardian_linking.sql, D-108)
--
--   A. invite_guardian: owner/admin only, own school's guardian only; the
--      raw token is never stored; a new link replaces the old one.
--   B. accept_guardian_invitation: signed-in only; creates one parent
--      membership and one active link to the invitation's own student;
--      once only (a double tap by the same person is fine, anyone else is
--      refused); an expired or replaced link is refused.
--   C. An invitation cannot name another student or another school's
--      guardian (the composite FK), even when written directly.
--   D. A parent of two children: one membership, two links; the parent
--      reads exactly those students.
--   E. Someone already in the school in another role is refused.
--   F. Revoke: owner/admin only; a revoked link hides the child and the
--      published result at once.
--   G. Rate limit (60 guardian invitations an hour per school) and a
--      read-only school.
-- =====================================================================
begin;
select plan(44);

create schema if not exists tests;

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
  perform set_config('app.correlation_id', '', true);
end;
$fn$;

create temp table toks (label text primary key, token text);
grant all on toks to authenticated;

create or replace function tests.tok(p_label text) returns text language sql as $fn$
  select token from toks where label = p_label
$fn$;

create or replace function tests.gid(p_code text) returns uuid language sql as $fn$
  select g.id from public.guardians g join public.students st on st.id = g.student_id
   where st.student_code = p_code and st.workspace_id in
     ('38000000-0000-4000-b000-000000000001', '38000000-0000-4000-b000-000000000002')
$fn$;

create or replace function tests.sid(p_code text) returns uuid language sql as $fn$
  select st.id from public.students st
   where st.student_code = p_code and st.workspace_id in
     ('38000000-0000-4000-b000-000000000001', '38000000-0000-4000-b000-000000000002')
$fn$;

create or replace function tests.invite(p_label text, p_code text) returns void language sql as $fn$
  insert into toks values (p_label,
    public.invite_guardian('38000000-0000-4000-b000-000000000001', tests.gid(p_code)) ->> 'token')
  on conflict (label) do update set token = excluded.token
$fn$;

-- ---------------------------------------------------------------------
-- Fixture (as postgres). School A: owner, admin, teacher; students S1-S4.
-- School B: owner, student SB. P (parent-to-be) and Q have no membership.
-- ---------------------------------------------------------------------
select tests.mkuser('38000000-0000-4000-a000-000000000001', 'gl-owner-a@test.local', 'Owner A');
select tests.mkuser('38000000-0000-4000-a000-000000000002', 'gl-teacher-a@test.local', 'Teacher A');
select tests.mkuser('38000000-0000-4000-a000-000000000003', 'gl-parent-p@test.local', 'Parent P');
select tests.mkuser('38000000-0000-4000-a000-000000000004', 'gl-stranger-q@test.local', 'Stranger Q');
select tests.mkuser('38000000-0000-4000-a000-000000000005', 'gl-owner-b@test.local', 'Owner B');
select tests.mkuser('38000000-0000-4000-a000-000000000006', 'gl-admin-a@test.local', 'Admin A');

insert into public.workspaces (id, type, name, slug, owner_id, created_by, status)
values
  ('38000000-0000-4000-b000-000000000001', 'school', 'Link School A', 'link-school-a-38',
   '38000000-0000-4000-a000-000000000001', '38000000-0000-4000-a000-000000000001', 'active'),
  ('38000000-0000-4000-b000-000000000002', 'school', 'Link School B', 'link-school-b-38',
   '38000000-0000-4000-a000-000000000005', '38000000-0000-4000-a000-000000000005', 'active');

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
values
  ('38000000-0000-4000-b000-000000000001', '38000000-0000-4000-a000-000000000002', 'teacher', 'active', now()),
  ('38000000-0000-4000-b000-000000000001', '38000000-0000-4000-a000-000000000006', 'admin',   'active', now());

insert into public.academic_years (id, workspace_id, name, starts_on, ends_on)
values
  ('38000000-0000-4000-c000-000000000001', '38000000-0000-4000-b000-000000000001', '2026', '2026-01-01', '2026-12-31'),
  ('38000000-0000-4000-c000-000000000002', '38000000-0000-4000-b000-000000000002', '2026', '2026-01-01', '2026-12-31');
insert into public.grade_levels (id, workspace_id, name, name_bn, level_number)
values
  ('38000000-0000-4000-c000-000000000011', '38000000-0000-4000-b000-000000000001', 'Class 6', 'ষষ্ঠ', 6),
  ('38000000-0000-4000-c000-000000000012', '38000000-0000-4000-b000-000000000002', 'Class 6', 'ষষ্ঠ', 6);
insert into public.sections (id, workspace_id, academic_year_id, grade_level_id, name)
values
  ('38000000-0000-4000-c000-000000000021', '38000000-0000-4000-b000-000000000001',
   '38000000-0000-4000-c000-000000000001', '38000000-0000-4000-c000-000000000011', 'A'),
  ('38000000-0000-4000-c000-000000000022', '38000000-0000-4000-b000-000000000002',
   '38000000-0000-4000-c000-000000000002', '38000000-0000-4000-c000-000000000012', 'A');

insert into public.students (workspace_id, student_code, first_name, last_name, gender)
values
  ('38000000-0000-4000-b000-000000000001', 'L1', 'Link', 'One', 'female'),
  ('38000000-0000-4000-b000-000000000001', 'L2', 'Link', 'Two', 'male'),
  ('38000000-0000-4000-b000-000000000001', 'L3', 'Link', 'Three', 'male'),
  ('38000000-0000-4000-b000-000000000001', 'L4', 'Link', 'Four', 'female'),
  ('38000000-0000-4000-b000-000000000002', 'LB', 'Link', 'Bee', 'female');
insert into public.enrollments (workspace_id, student_id, academic_year_id, section_id, roll_number)
select st.workspace_id, st.id,
       case when st.student_code = 'LB' then '38000000-0000-4000-c000-000000000002'
            else '38000000-0000-4000-c000-000000000001' end::uuid,
       case when st.student_code = 'LB' then '38000000-0000-4000-c000-000000000022'
            else '38000000-0000-4000-c000-000000000021' end::uuid,
       row_number() over (partition by st.workspace_id order by st.student_code)
  from public.students st
 where st.workspace_id in ('38000000-0000-4000-b000-000000000001', '38000000-0000-4000-b000-000000000002');
insert into public.guardians (workspace_id, student_id, relation, full_name, phone, is_primary)
select st.workspace_id, st.id, 'father', 'Guardian ' || st.student_code,
       '+88017000038' || lpad(row_number() over (order by st.student_code)::text, 2, '0'), true
  from public.students st
 where st.workspace_id in ('38000000-0000-4000-b000-000000000001', '38000000-0000-4000-b000-000000000002');

-- L1 has a published result (triggers off: the fixture, not the publish flow).
set local session_replication_role = replica;
insert into public.exams (id, workspace_id, academic_year_id, name, exam_type, status)
values ('38000000-0000-4000-d000-000000000001', '38000000-0000-4000-b000-000000000001',
        '38000000-0000-4000-c000-000000000001', 'Half-Yearly', 'term_final', 'published');
insert into public.exam_sections (workspace_id, exam_id, section_id)
values ('38000000-0000-4000-b000-000000000001', '38000000-0000-4000-d000-000000000001',
        '38000000-0000-4000-c000-000000000021');
insert into public.results (workspace_id, exam_id, section_id, student_id, enrollment_id,
                            total_obtained, total_full, result_status, failed_subjects,
                            published, published_at, frozen_payload)
select e.workspace_id, '38000000-0000-4000-d000-000000000001', e.section_id, e.student_id, e.id,
       170, 200, 'pass', 0, true, now(), '{}'::jsonb
  from public.enrollments e where e.student_id = tests.sid('L1');
set local session_replication_role = origin;

-- =====================================================================
-- A. invite_guardian
-- =====================================================================
select tests.login('38000000-0000-4000-a000-000000000002');
select throws_ok($$select tests.invite('x', 'L1')$$, '42501', 'FORBIDDEN', 'a teacher cannot invite a guardian');
select tests.logout();
select tests.login('38000000-0000-4000-a000-000000000005');
select throws_ok($$select tests.invite('x', 'L1')$$, '42501', 'FORBIDDEN', 'another school''s owner cannot invite');
select tests.logout();
select tests.login('38000000-0000-4000-a000-000000000001');
select throws_ok($$select tests.invite('x', 'LB')$$, '22023', 'GUARDIAN_NOT_FOUND',
  'an owner cannot invite another school''s guardian');
select lives_ok($$select tests.invite('p1', 'L1')$$, 'the owner invites L1''s guardian');
select tests.logout();
select tests.login('38000000-0000-4000-a000-000000000006');
select lives_ok($$select tests.invite('p3', 'L3')$$, 'an admin invites L3''s guardian');
select tests.logout();

select is((select count(*)::int from public.workspace_invitations i
            where i.token_hash = app.hash_token(tests.tok('p1')) and i.role = 'parent'
              and i.student_id = tests.sid('L1') and i.status = 'pending'
              and i.expires_at between now() + interval '29 days' and now() + interval '31 days'),
          1, 'the invitation stores the hash, role parent, the child, 30 days');
select is((select count(*)::int from public.workspace_invitations i
            where i.token_prefix || '' = tests.tok('p1') or i.phone = tests.tok('p1')),
          0, 'the raw token is not stored');

-- =====================================================================
-- B. Preview and accept
-- =====================================================================
select set_config('role', 'anon', true);
select throws_ok($$select public.guardian_invitation_preview('x')$$, '42501', null,
  'anonymous callers cannot preview (no grant)');
select throws_ok($$select public.accept_guardian_invitation('x')$$, '42501', null,
  'anonymous callers cannot accept (no grant)');
select tests.logout();

select tests.login('38000000-0000-4000-a000-000000000003');
select is(public.guardian_invitation_preview(tests.tok('p1')) ->> 'student_name', 'Link One',
  'the signed-in holder sees which child the link is for');
select throws_ok($$select public.guardian_invitation_preview('not-a-token')$$, '22023', 'INVITATION_NOT_FOUND',
  'a wrong token is not found');
select is((select count(*)::int from public.students), 0, 'before accepting, P reads no student');
select is(public.accept_guardian_invitation(tests.tok('p1')) ->> 'student_id', tests.sid('L1')::text,
  'P accepts the link for L1');
select tests.logout();

select is((select count(*)::int from public.workspace_members m
            where m.user_id = '38000000-0000-4000-a000-000000000003'
              and m.workspace_id = '38000000-0000-4000-b000-000000000001'
              and m.role = 'parent' and m.status = 'active'),
          1, 'accepting made P an active parent of the school');
select is((select count(*)::int from public.guardian_users gu
            where gu.user_id = '38000000-0000-4000-a000-000000000003' and gu.status = 'active'
              and gu.student_id = tests.sid('L1') and gu.guardian_id = tests.gid('L1')),
          1, 'one active link, to L1''s guardian and L1');
select is((select status::text from public.workspace_invitations
            where token_hash = app.hash_token(tests.tok('p1'))), 'accepted', 'the invitation is accepted');

select tests.login('38000000-0000-4000-a000-000000000003');
select results_eq($$select student_code from public.students order by 1$$, array['L1'],
  'P reads L1 and no other student');
select is((select count(*)::int from public.results), 1, 'P reads L1''s published result');
select lives_ok($$select public.accept_guardian_invitation(tests.tok('p1'))$$,
  'a second tap by the same person is not an error');
select is(public.guardian_invitation_preview(tests.tok('p1')) ->> 'status', 'accepted',
  'the preview of a used link says accepted, without names');
select tests.logout();

select tests.login('38000000-0000-4000-a000-000000000004');
select throws_ok($$select public.accept_guardian_invitation(tests.tok('p1'))$$, '22023', 'INVITATION_ACCEPTED',
  'a used link cannot be accepted by anyone else');
select tests.logout();

-- =====================================================================
-- C. An invitation cannot name another child or another school
-- =====================================================================
select throws_ok($$
  insert into public.workspace_invitations (workspace_id, channel, phone, role, token_hash, token_prefix,
                                            invited_by, guardian_id, student_id)
  values ('38000000-0000-4000-b000-000000000001', 'phone', '+8801700000000', 'parent',
          app.hash_token('forged-1'), 'forged-1', '38000000-0000-4000-a000-000000000001',
          tests.gid('L2'), tests.sid('L4'))$$,
  '23503', null, 'an invitation cannot pair L2''s guardian with L4');
select throws_ok($$
  insert into public.workspace_invitations (workspace_id, channel, phone, role, token_hash, token_prefix,
                                            invited_by, guardian_id, student_id)
  values ('38000000-0000-4000-b000-000000000001', 'phone', '+8801700000000', 'parent',
          app.hash_token('forged-2'), 'forged-2', '38000000-0000-4000-a000-000000000001',
          tests.gid('LB'), tests.sid('LB'))$$,
  '23503', null, 'an invitation in school A cannot name school B''s guardian');
select throws_ok($$
  insert into public.workspace_invitations (workspace_id, channel, phone, role, token_hash, token_prefix,
                                            invited_by)
  values ('38000000-0000-4000-b000-000000000001', 'phone', '+8801700000000', 'parent',
          app.hash_token('forged-3'), 'forged-3', '38000000-0000-4000-a000-000000000001')$$,
  '23514', null, 'a parent invitation without a guardian is refused');

-- =====================================================================
-- Expired and replaced links
-- =====================================================================
select tests.login('38000000-0000-4000-a000-000000000001');
select tests.invite('p2', 'L2');
select tests.logout();
update public.workspace_invitations set expires_at = now() - interval '1 minute'
 where token_hash = app.hash_token(tests.tok('p2'));
select tests.login('38000000-0000-4000-a000-000000000003');
select throws_ok($$select public.accept_guardian_invitation(tests.tok('p2'))$$, '22023', 'INVITATION_EXPIRED',
  'an expired link is refused');
select is(public.guardian_invitation_preview(tests.tok('p2')) ->> 'status', 'expired',
  'the preview says expired');
select tests.logout();

select tests.login('38000000-0000-4000-a000-000000000001');
insert into toks values ('p3-old', tests.tok('p3'));
select tests.invite('p3', 'L3');
select tests.logout();
select tests.login('38000000-0000-4000-a000-000000000003');
select throws_ok($$select public.accept_guardian_invitation(tests.tok('p3-old'))$$, '22023', 'INVITATION_REVOKED',
  'a new link replaces the old one');

-- =====================================================================
-- D. A second child at the same school
-- =====================================================================
select lives_ok($$select public.accept_guardian_invitation(tests.tok('p3'))$$, 'P accepts the new link for L3');
select results_eq($$select student_code from public.students order by 1$$, array['L1', 'L3'],
  'P now reads exactly L1 and L3');
select tests.logout();
select is((select count(*)::int from public.workspace_members m
            where m.user_id = '38000000-0000-4000-a000-000000000003'
              and m.workspace_id = '38000000-0000-4000-b000-000000000001'),
          1, 'still one membership in the school for two children');
select is((select count(*)::int from public.guardian_users gu
            where gu.user_id = '38000000-0000-4000-a000-000000000003' and gu.status = 'active'),
          2, 'two active links');

select tests.login('38000000-0000-4000-a000-000000000001');
select throws_ok($$select tests.invite('again', 'L1')$$, '22023', 'GUARDIAN_ALREADY_LINKED',
  'a linked guardian is not invited again');

-- =====================================================================
-- E. Someone already in the school in another role
-- =====================================================================
select tests.invite('p4', 'L4');
select tests.logout();
select tests.login('38000000-0000-4000-a000-000000000002');
select throws_ok($$select public.accept_guardian_invitation(tests.tok('p4'))$$, '22023', 'MEMBERSHIP_CONFLICT',
  'a teacher of the school is not silently turned into a parent');
select tests.logout();
select is((select role::text from public.workspace_members
            where user_id = '38000000-0000-4000-a000-000000000002'
              and workspace_id = '38000000-0000-4000-b000-000000000001'), 'teacher',
  'the teacher is still a teacher');

-- =====================================================================
-- F. Revoke
-- =====================================================================
create or replace function tests.link(p_code text) returns uuid language sql as $fn$
  select gu.id from public.guardian_users gu
   where gu.user_id = '38000000-0000-4000-a000-000000000003' and gu.student_id = tests.sid(p_code)
$fn$;
create temp table links as select tests.link('L1') as l1;
grant all on links to authenticated;

select tests.login('38000000-0000-4000-a000-000000000002');
select throws_ok($$select public.revoke_guardian_link('38000000-0000-4000-b000-000000000001', (select l1 from links))$$,
  '42501', 'FORBIDDEN', 'a teacher cannot revoke a link');
select tests.logout();
select tests.login('38000000-0000-4000-a000-000000000005');
select throws_ok($$select public.revoke_guardian_link('38000000-0000-4000-b000-000000000002', (select l1 from links))$$,
  '22023', 'LINK_NOT_FOUND', 'another school''s owner cannot revoke it');
select tests.logout();
select tests.login('38000000-0000-4000-a000-000000000001');
select lives_ok($$select public.revoke_guardian_link('38000000-0000-4000-b000-000000000001', (select l1 from links))$$,
  'the owner revokes P''s link to L1');
select tests.logout();

select tests.login('38000000-0000-4000-a000-000000000003');
select results_eq($$select student_code from public.students order by 1$$, array['L3'],
  'after the revoke P no longer reads L1');
select is((select count(*)::int from public.results), 0, 'and no longer reads L1''s published result');
select is((select count(*)::int from public.guardian_users where status = 'revoked'), 1,
  'P can see their own link was revoked');
select tests.logout();

-- =====================================================================
-- G. Rate limit and read-only
-- =====================================================================
insert into public.workspace_invitations (workspace_id, channel, phone, role, token_hash, token_prefix,
                                          invited_by, guardian_id, student_id, status)
select '38000000-0000-4000-b000-000000000001', 'phone', '+8801700000000', 'parent',
       app.hash_token('bulk-' || n), 'bulk-' || n, '38000000-0000-4000-a000-000000000001',
       tests.gid('L2'), tests.sid('L2'), 'revoked'
  from generate_series(1, 60) n;
select tests.login('38000000-0000-4000-a000-000000000001');
select throws_ok($$select tests.invite('p2b', 'L2')$$, '54000', 'RATE_LIMITED',
  'the 61st guardian invitation in an hour is refused');
select tests.logout();
delete from public.workspace_invitations where token_prefix like 'bulk-%';

select tests.login('38000000-0000-4000-a000-000000000001');
select tests.invite('p2c', 'L2');
select tests.logout();
update public.workspaces set access_mode = 'read_only' where id = '38000000-0000-4000-b000-000000000001';
select tests.login('38000000-0000-4000-a000-000000000004');
select throws_ok($$select public.accept_guardian_invitation(tests.tok('p2c'))$$, '42501', 'PLAN_READ_ONLY',
  'a read-only school cannot gain a parent');
select tests.logout();
select tests.login('38000000-0000-4000-a000-000000000001');
select throws_ok($$select tests.invite('p2d', 'L2')$$, '42501', 'PLAN_READ_ONLY',
  'a read-only school cannot invite');
select tests.logout();

select is((select count(*)::int from public.guardian_users gu
            where gu.user_id = '38000000-0000-4000-a000-000000000004'), 0,
  'the stranger holds no link');

select * from finish();
rollback;
