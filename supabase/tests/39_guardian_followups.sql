-- =====================================================================
-- pgTAP · D-108 follow-ups (20260926180341_guardian_followups.sql, D-109)
--
--   A. A teacher who is also a parent at their own school: accepting a link
--      adds the link and nothing else; through the family path they see
--      only their own child's published result; their staff powers are
--      unchanged; revoking the link, or removing the membership, cuts the
--      family access (and a revoke leaves the staff membership alone); a
--      removed teacher cannot come back through a guardian link. A teacher
--      who is NOT linked sees nothing through the family path.
--   B. Class-teacher invites (F-ID-04 OQ-6): the class teacher of the
--      student's current section invites and revokes for that student,
--      audited, under the 60/h school limit; another section's student,
--      another teacher and staff are refused.
--   C. Escalation: a class teacher never removes staff, never a parent who
--      still has another link, never acts outside their own section; the
--      members guard's D-109 removal cannot be forged by a direct update.
-- =====================================================================
begin;
select plan(52);

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

create or replace function tests.sid(p_code text) returns uuid language sql security definer as $fn$
  select st.id from public.students st
   where st.student_code = p_code and st.workspace_id = '39000000-0000-4000-b000-000000000001'
$fn$;

create or replace function tests.gid(p_code text) returns uuid language sql security definer as $fn$
  select g.id from public.guardians g where g.student_id = tests.sid(p_code)
$fn$;

create or replace function tests.invite(p_label text, p_code text) returns void language sql as $fn$
  insert into toks values (p_label,
    public.invite_guardian('39000000-0000-4000-b000-000000000001', tests.gid(p_code)) ->> 'token')
  on conflict (label) do update set token = excluded.token
$fn$;

create or replace function tests.link(p_user uuid, p_code text) returns uuid language sql security definer as $fn$
  select gu.id from public.guardian_users gu
   where gu.user_id = p_user and gu.student_id = tests.sid(p_code)
$fn$;

-- The family path, as the caller: the student codes of their family results.
create or replace function tests.family() returns text[] language sql as $fn$
  select coalesce(array_agg(st.student_code order by st.student_code), '{}')
    from public.family_results('39000000-0000-4000-b000-000000000001') f
    join public.students st on st.id = f.student_id
$fn$;

-- ---------------------------------------------------------------------
-- Fixture (as postgres). One school: owner O; teachers T1 (class teacher of
-- section A), T2 (class teacher of section B), T3 (no section); staff S.
-- Students A1, A2 in A; B1, B2 in B; every one has a guardian and a
-- published result.
-- ---------------------------------------------------------------------
select tests.mkuser('39000000-0000-4000-a000-000000000001', 'gf-owner@test.local', 'Owner O');
select tests.mkuser('39000000-0000-4000-a000-000000000002', 'gf-t1@test.local', 'Teacher One');
select tests.mkuser('39000000-0000-4000-a000-000000000003', 'gf-t2@test.local', 'Teacher Two');
select tests.mkuser('39000000-0000-4000-a000-000000000004', 'gf-t3@test.local', 'Teacher Three');
select tests.mkuser('39000000-0000-4000-a000-000000000005', 'gf-staff@test.local', 'Staff S');
select tests.mkuser('39000000-0000-4000-a000-000000000006', 'gf-parent@test.local', 'Parent P');

insert into public.workspaces (id, type, name, slug, owner_id, created_by, status)
values ('39000000-0000-4000-b000-000000000001', 'school', 'Follow-up School', 'follow-up-school-39',
        '39000000-0000-4000-a000-000000000001', '39000000-0000-4000-a000-000000000001', 'active');

insert into public.workspace_members (id, workspace_id, user_id, role, status, joined_at)
values
  ('39000000-0000-4000-e000-000000000002', '39000000-0000-4000-b000-000000000001',
   '39000000-0000-4000-a000-000000000002', 'teacher', 'active', now()),
  ('39000000-0000-4000-e000-000000000003', '39000000-0000-4000-b000-000000000001',
   '39000000-0000-4000-a000-000000000003', 'teacher', 'active', now()),
  ('39000000-0000-4000-e000-000000000004', '39000000-0000-4000-b000-000000000001',
   '39000000-0000-4000-a000-000000000004', 'teacher', 'active', now()),
  ('39000000-0000-4000-e000-000000000005', '39000000-0000-4000-b000-000000000001',
   '39000000-0000-4000-a000-000000000005', 'staff', 'active', now());

insert into public.academic_years (id, workspace_id, name, starts_on, ends_on, is_current)
values ('39000000-0000-4000-c000-000000000001', '39000000-0000-4000-b000-000000000001',
        '2026', '2026-01-01', '2026-12-31', true);
insert into public.grade_levels (id, workspace_id, name, name_bn, level_number)
values ('39000000-0000-4000-c000-000000000011', '39000000-0000-4000-b000-000000000001', 'Class 7', 'সপ্তম', 7);
insert into public.sections (id, workspace_id, academic_year_id, grade_level_id, name, class_teacher_id)
values
  ('39000000-0000-4000-c000-000000000021', '39000000-0000-4000-b000-000000000001',
   '39000000-0000-4000-c000-000000000001', '39000000-0000-4000-c000-000000000011', 'A',
   '39000000-0000-4000-e000-000000000002'),
  ('39000000-0000-4000-c000-000000000022', '39000000-0000-4000-b000-000000000001',
   '39000000-0000-4000-c000-000000000001', '39000000-0000-4000-c000-000000000011', 'B',
   '39000000-0000-4000-e000-000000000003');

insert into public.students (workspace_id, student_code, first_name, last_name, gender)
values
  ('39000000-0000-4000-b000-000000000001', 'A1', 'Ayan', 'One', 'male'),
  ('39000000-0000-4000-b000-000000000001', 'A2', 'Ayesha', 'Two', 'female'),
  ('39000000-0000-4000-b000-000000000001', 'B1', 'Bilal', 'One', 'male'),
  ('39000000-0000-4000-b000-000000000001', 'B2', 'Bushra', 'Two', 'female');
insert into public.enrollments (workspace_id, student_id, academic_year_id, section_id, roll_number)
select st.workspace_id, st.id, '39000000-0000-4000-c000-000000000001',
       case when st.student_code like 'A%' then '39000000-0000-4000-c000-000000000021'
            else '39000000-0000-4000-c000-000000000022' end::uuid,
       right(st.student_code, 1)::int
  from public.students st where st.workspace_id = '39000000-0000-4000-b000-000000000001';
insert into public.guardians (workspace_id, student_id, relation, full_name, phone, is_primary)
select st.workspace_id, st.id, 'mother', 'Guardian ' || st.student_code,
       '+88017000039' || lpad(row_number() over (order by st.student_code)::text, 2, '0'), true
  from public.students st where st.workspace_id = '39000000-0000-4000-b000-000000000001';

set local session_replication_role = replica;
insert into public.exams (id, workspace_id, academic_year_id, name, exam_type, status)
values ('39000000-0000-4000-d000-000000000001', '39000000-0000-4000-b000-000000000001',
        '39000000-0000-4000-c000-000000000001', 'Annual', 'term_final', 'published');
insert into public.exam_sections (workspace_id, exam_id, section_id)
values
  ('39000000-0000-4000-b000-000000000001', '39000000-0000-4000-d000-000000000001',
   '39000000-0000-4000-c000-000000000021'),
  ('39000000-0000-4000-b000-000000000001', '39000000-0000-4000-d000-000000000001',
   '39000000-0000-4000-c000-000000000022');
insert into public.results (workspace_id, exam_id, section_id, student_id, enrollment_id,
                            total_obtained, total_full, result_status, failed_subjects,
                            published, published_at, frozen_payload)
select e.workspace_id, '39000000-0000-4000-d000-000000000001', e.section_id, e.student_id, e.id,
       150, 200, 'pass', 0, true, now(), '{}'::jsonb
  from public.enrollments e where e.workspace_id = '39000000-0000-4000-b000-000000000001';
set local session_replication_role = origin;

-- =====================================================================
-- A. T2 (class teacher of B) is A1's parent
-- =====================================================================
select tests.login('39000000-0000-4000-a000-000000000003');
select is(tests.family(), '{}'::text[], 'before any link T2 sees nothing through the family path');
select results_eq($$select st.student_code from public.results r join public.students st on st.id = r.student_id order by 1$$,
  array['B1', 'B2'], 'as class teacher of B, T2 reads B''s results only');
insert into toks values ('t2-students', (select count(*)::text from public.students));
select tests.logout();

select tests.login('39000000-0000-4000-a000-000000000001');
select tests.invite('t2', 'A1');
select tests.logout();

select tests.login('39000000-0000-4000-a000-000000000003');
select lives_ok($$select public.accept_guardian_invitation(tests.tok('t2'))$$,
  'a teacher accepts a link to their own child');
select is(tests.family(), array['A1'], 'T2 sees only their own child''s result through the family path');
select results_eq($$select st.student_code from public.results r join public.students st on st.id = r.student_id order by 1$$,
  array['A1', 'B1', 'B2'], 'T2 reads B''s results as a teacher and A1''s as a parent, nothing else');
select is((select count(*)::int from public.students), tests.tok('t2-students')::int,
  'T2 reads the same students as before');
select ok(app.can_read_student_private('39000000-0000-4000-b000-000000000001', tests.sid('B1')),
  'T2 still reads B1''s private block as class teacher');
select ok(not app.can_read_student_private('39000000-0000-4000-b000-000000000001', tests.sid('A1')),
  'being A1''s parent gives T2 no class-teacher reach over A1');
select tests.logout();

select is((select count(*)::int from public.workspace_members
            where user_id = '39000000-0000-4000-a000-000000000003'
              and workspace_id = '39000000-0000-4000-b000-000000000001'), 1, 'T2 still has one membership');
select is((select role::text || '/' || status::text from public.workspace_members
            where user_id = '39000000-0000-4000-a000-000000000003'
              and workspace_id = '39000000-0000-4000-b000-000000000001'), 'teacher/active',
  'T2 is still an active teacher');

-- T3, a teacher with no link, sees nothing through the family path.
select tests.login('39000000-0000-4000-a000-000000000004');
select is(tests.family(), '{}'::text[], 'an unlinked teacher sees nothing through the family path');
select is((select count(*)::int from public.results), 0, 'and reads no result');
select tests.logout();

-- The owner revokes T2's link: family access ends, the staff membership stays.
create temp table l as select tests.link('39000000-0000-4000-a000-000000000003', 'A1') as id;
grant all on l to authenticated;
select tests.login('39000000-0000-4000-a000-000000000001');
select lives_ok($$select public.revoke_guardian_link('39000000-0000-4000-b000-000000000001', (select id from l))$$,
  'the owner revokes T2''s link');
select tests.logout();
select is((select role::text || '/' || status::text from public.workspace_members
            where user_id = '39000000-0000-4000-a000-000000000003'
              and workspace_id = '39000000-0000-4000-b000-000000000001'), 'teacher/active',
  'revoking a teacher''s last link leaves their membership alone');
select tests.login('39000000-0000-4000-a000-000000000003');
select is(tests.family(), '{}'::text[], 'after the revoke T2 sees nothing through the family path');
select results_eq($$select st.student_code from public.results r join public.students st on st.id = r.student_id order by 1$$,
  array['B1', 'B2'], 'and reads B''s results only again');
select tests.logout();

-- Linked again, then removed from the school: the removal revokes the link.
select tests.login('39000000-0000-4000-a000-000000000001');
select tests.invite('t2b', 'A1');
select tests.logout();
select tests.login('39000000-0000-4000-a000-000000000003');
select lives_ok($$select public.accept_guardian_invitation(tests.tok('t2b'))$$, 'T2 accepts a new link');
select is(tests.family(), array['A1'], 'and sees A1 again');
select tests.logout();
select tests.login('39000000-0000-4000-a000-000000000001');
select lives_ok($$update public.workspace_members set status = 'removed'
                   where user_id = '39000000-0000-4000-a000-000000000003'
                     and workspace_id = '39000000-0000-4000-b000-000000000001'$$,
  'the owner removes T2 from the school');
select tests.logout();
select is((select count(*)::int from public.guardian_users
            where user_id = '39000000-0000-4000-a000-000000000003' and status = 'active'),
  0, 'removing T2''s membership revoked their link');
select tests.login('39000000-0000-4000-a000-000000000003');
select is(tests.family(), '{}'::text[], 'a removed teacher sees nothing through the family path');
select is((select count(*)::int from public.results), 0, 'and reads no result');
select tests.logout();

-- A removed teacher cannot come back through a guardian link.
select tests.login('39000000-0000-4000-a000-000000000001');
select tests.invite('t2c', 'A1');
select tests.logout();
select tests.login('39000000-0000-4000-a000-000000000003');
select throws_ok($$select public.accept_guardian_invitation(tests.tok('t2c'))$$, '22023', 'MEMBERSHIP_CONFLICT',
  'a removed teacher is refused, not reactivated');
select tests.logout();
select is((select role::text || '/' || status::text from public.workspace_members
            where user_id = '39000000-0000-4000-a000-000000000003'
              and workspace_id = '39000000-0000-4000-b000-000000000001'), 'teacher/removed',
  'T2 stays a removed teacher');

-- =====================================================================
-- B. Class-teacher invites
-- =====================================================================
select tests.login('39000000-0000-4000-a000-000000000002');
select lives_ok($$select tests.invite('ct', 'A2')$$, 'the class teacher of A invites A2''s guardian');
select throws_ok($$select tests.invite('x', 'B2')$$, '42501', 'FORBIDDEN',
  'the class teacher of A cannot invite for a student of B');
select tests.logout();
select is((select count(*)::int from public.audit_events
            where action = 'workspace_invitations.insert'
              and actor_id = '39000000-0000-4000-a000-000000000002'
              and workspace_id = '39000000-0000-4000-b000-000000000001'),
  1, 'the class teacher''s invitation is audited with them as the actor');

select tests.login('39000000-0000-4000-a000-000000000004');
select throws_ok($$select tests.invite('x', 'A2')$$, '42501', 'FORBIDDEN', 'another teacher cannot invite');
select tests.logout();
select tests.login('39000000-0000-4000-a000-000000000005');
select throws_ok($$select tests.invite('x', 'A2')$$, '42501', 'FORBIDDEN', 'staff cannot invite');
select tests.logout();

-- P accepts the class teacher's link; the class teacher sees and revokes it.
select tests.login('39000000-0000-4000-a000-000000000006');
select lives_ok($$select public.accept_guardian_invitation(tests.tok('ct'))$$, 'P accepts the class teacher''s link');
select is(tests.family(), array['A2'], 'P sees A2 through the family path');
select tests.logout();
create temp table lp as select tests.link('39000000-0000-4000-a000-000000000006', 'A2') as id;
grant all on lp to authenticated;

select tests.login('39000000-0000-4000-a000-000000000002');
select is((select count(*)::int from public.guardian_users where student_id = tests.sid('A2')), 1,
  'the class teacher reads A2''s link');
select tests.logout();
select tests.login('39000000-0000-4000-a000-000000000004');
select is((select count(*)::int from public.guardian_users), 0, 'another teacher reads no link');
select throws_ok($$select public.revoke_guardian_link('39000000-0000-4000-b000-000000000001', (select id from lp))$$,
  '42501', 'FORBIDDEN', 'another teacher cannot revoke');
select tests.logout();
select tests.login('39000000-0000-4000-a000-000000000005');
select throws_ok($$select public.revoke_guardian_link('39000000-0000-4000-b000-000000000001', (select id from lp))$$,
  '42501', 'FORBIDDEN', 'staff cannot revoke');
select tests.logout();
select tests.login('39000000-0000-4000-a000-000000000002');
select lives_ok($$select public.revoke_guardian_link('39000000-0000-4000-b000-000000000001', (select id from lp))$$,
  'the class teacher revokes P''s link to A2');
select tests.logout();
select is((select count(*)::int from public.audit_events
            where action = 'guardian_users.update'
              and actor_id = '39000000-0000-4000-a000-000000000002'),
  1, 'the revoke is audited with the class teacher as the actor');
select is((select status::text from public.workspace_members
            where user_id = '39000000-0000-4000-a000-000000000006'
              and workspace_id = '39000000-0000-4000-b000-000000000001'), 'removed',
  'with a pure parent''s last link gone, their parent membership is removed');

-- =====================================================================
-- C. Escalation: a class teacher's revoke never removes staff, never a
--    parent who still has another link, never reaches outside their own
--    section, and the members guard's D-109 removal cannot be forged.
-- =====================================================================
select tests.mkuser('39000000-0000-4000-a000-000000000007', 'gf-parent2@test.local', 'Parent Q');
select tests.login('39000000-0000-4000-a000-000000000001');
select tests.invite('s', 'A1');
select tests.invite('q-a', 'A2');
select tests.invite('q-b', 'B1');
select tests.logout();
select tests.login('39000000-0000-4000-a000-000000000005');
select lives_ok($$select public.accept_guardian_invitation(tests.tok('s'))$$, 'staff S accepts a link to A1');
select tests.logout();
select tests.login('39000000-0000-4000-a000-000000000007');
select lives_ok($$select public.accept_guardian_invitation(tests.tok('q-a'))$$, 'Q accepts a link to A2');
select lives_ok($$select public.accept_guardian_invitation(tests.tok('q-b'))$$, 'and a link to B1');
select tests.logout();
create temp table lx as
  select tests.link('39000000-0000-4000-a000-000000000005', 'A1') as s_a1,
         tests.link('39000000-0000-4000-a000-000000000007', 'A2') as q_a2,
         tests.link('39000000-0000-4000-a000-000000000007', 'B1') as q_b1;
grant all on lx to authenticated;

select tests.login('39000000-0000-4000-a000-000000000002');
select lives_ok($$select public.revoke_guardian_link('39000000-0000-4000-b000-000000000001', (select s_a1 from lx))$$,
  'the class teacher of A revokes staff S''s link to A1');
select lives_ok($$update public.workspace_members set status = 'removed'
                   where user_id = '39000000-0000-4000-a000-000000000005'
                     and workspace_id = '39000000-0000-4000-b000-000000000001'$$,
  'a direct update of S''s membership by the class teacher changes nothing (RLS)');
select tests.logout();
select is((select role::text || '/' || status::text from public.workspace_members
            where user_id = '39000000-0000-4000-a000-000000000005' and workspace_id = '39000000-0000-4000-b000-000000000001'), 'staff/active',
  'a class teacher cannot remove a staff member: S stays active staff');

select tests.login('39000000-0000-4000-a000-000000000002');
select lives_ok($$select public.revoke_guardian_link('39000000-0000-4000-b000-000000000001', (select q_a2 from lx))$$,
  'the class teacher of A revokes Q''s link to A2');
select throws_ok($$select public.revoke_guardian_link('39000000-0000-4000-b000-000000000001', (select q_b1 from lx))$$,
  '42501', 'FORBIDDEN', 'the class teacher of A cannot revoke Q''s link to B1 (outside their section)');
select tests.logout();
select is((select role::text || '/' || status::text from public.workspace_members
            where user_id = '39000000-0000-4000-a000-000000000007' and workspace_id = '39000000-0000-4000-b000-000000000001'), 'parent/active',
  'a parent who still has another link keeps their membership');
select is((select status::text from public.guardian_users where id = (select q_b1 from lx)), 'active',
  'and their link to B1');

-- Forge the proof: Q's last link revoked at now() without the definer
-- function removing the membership (as postgres, which no client can be).
update public.guardian_users set status = 'revoked', revoked_at = now() where id = (select q_b1 from lx);
select tests.login('39000000-0000-4000-a000-000000000007');
select throws_ok($$update public.workspace_members set status = 'removed'
                    where user_id = '39000000-0000-4000-a000-000000000007'
                     and workspace_id = '39000000-0000-4000-b000-000000000001'$$,
  '42501', 'members cannot change their own role or status',
  'a parent cannot use a same-transaction revoked link to change their own membership');
select tests.logout();
select tests.login('39000000-0000-4000-a000-000000000002');
select lives_ok($$update public.workspace_members set status = 'removed'
                   where user_id = '39000000-0000-4000-a000-000000000007'
                     and workspace_id = '39000000-0000-4000-b000-000000000001'$$,
  'a class teacher''s direct update with the proof in place changes nothing');
select tests.logout();
select is((select role::text || '/' || status::text from public.workspace_members
            where user_id = '39000000-0000-4000-a000-000000000007' and workspace_id = '39000000-0000-4000-b000-000000000001'), 'parent/active',
  'the forged proof removed no one: only the SECURITY DEFINER path qualifies');

-- The same 60/h school limit applies to the class teacher.
insert into public.workspace_invitations (workspace_id, channel, phone, role, token_hash, token_prefix,
                                          invited_by, guardian_id, student_id, status)
select '39000000-0000-4000-b000-000000000001', 'phone', '+8801700000000', 'parent',
       app.hash_token('bulk39-' || n), 'bulk39-' || n, '39000000-0000-4000-a000-000000000001',
       tests.gid('B1'), tests.sid('B1'), 'revoked'
  from generate_series(1, 60) n;
select tests.login('39000000-0000-4000-a000-000000000002');
select throws_ok($$select tests.invite('x', 'A1')$$, '54000', 'RATE_LIMITED',
  'the class teacher is refused after 60 guardian invitations in an hour');
select tests.logout();

select * from finish();
rollback;
