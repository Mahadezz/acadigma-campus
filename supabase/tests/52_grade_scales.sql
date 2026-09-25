-- =====================================================================
-- pgTAP · F-AC-06 Part 1 — grade scales and the grading domain (D-302)
--
--   A. public.seed_bd_grade_scale: owner seeds the Bangladesh scale; a
--      second call returns the same scale and adds nothing (idempotent).
--   B. RLS: every active member reads; only owner/admin write; another
--      school sees and touches nothing (isolation + escalation).
--   C. Coverage: a gap or an overlap is refused (BAND_GAP / BAND_OVERLAP);
--      a valid custom band set saves.
--   D. PARITY with packages/domain/src/grading — the rows between the
--      `-- parity:` markers are read verbatim by round.test.ts/scale.test.ts,
--      so SQL and TypeScript are pinned to one table. Full range: every
--      0.01 step from 0 to 100 has exactly one band.
--   E. read_only: the owner's save is refused with PLAN_READ_ONLY.
-- =====================================================================
begin;
select plan(50);

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
    json_build_object(
      'sub',   p_id::text,
      'role',  'authenticated',
      'email', (select u.email from auth.users u where u.id = p_id)
    )::text, true);
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

-- Fixture: school A (owner, teacher, parent), school B (owner).
select tests.mkuser('52000000-0000-4000-a000-000000000001', 'gs-owner-a@test.local', 'Owner A');
select tests.mkuser('52000000-0000-4000-a000-000000000002', 'gs-teacher-a@test.local', 'Teacher A');
select tests.mkuser('52000000-0000-4000-a000-000000000003', 'gs-parent-a@test.local', 'Parent A');
select tests.mkuser('52000000-0000-4000-a000-000000000004', 'gs-owner-b@test.local', 'Owner B');

insert into public.workspaces (id, type, name, slug, owner_id, created_by, status)
values
  ('52000000-0000-4000-b000-000000000001', 'school', 'Grading School A', 'grading-school-a-52',
   '52000000-0000-4000-a000-000000000001', '52000000-0000-4000-a000-000000000001', 'active'),
  ('52000000-0000-4000-b000-000000000002', 'school', 'Grading School B', 'grading-school-b-52',
   '52000000-0000-4000-a000-000000000004', '52000000-0000-4000-a000-000000000004', 'active');

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
values
  ('52000000-0000-4000-b000-000000000001', '52000000-0000-4000-a000-000000000002', 'teacher', 'active', now()),
  ('52000000-0000-4000-b000-000000000001', '52000000-0000-4000-a000-000000000003', 'parent',  'active', now());

-- ---------------------------------------------------------------------
-- A. Seed
-- ---------------------------------------------------------------------
select tests.login('52000000-0000-4000-a000-000000000001');

select set_config('tests.bd',
  public.seed_bd_grade_scale('52000000-0000-4000-b000-000000000001')::text, true);

select isnt(current_setting('tests.bd'), '', 'owner seeds the Bangladesh scale');

select is(
  public.seed_bd_grade_scale('52000000-0000-4000-b000-000000000001')::text,
  current_setting('tests.bd'),
  'seeding again returns the same scale (idempotent)');

select is(
  (select count(*)::int from public.grade_bands
    where grade_scale_id = current_setting('tests.bd')::uuid),
  7, 'the BD scale has exactly 7 bands after two seeds');

select is(
  (select code || ' ' || is_default::text from public.grade_scales
    where id = current_setting('tests.bd')::uuid),
  'BD_GPA5 true', 'code BD_GPA5, and it is the school''s default');

-- ---------------------------------------------------------------------
-- B. RLS
-- ---------------------------------------------------------------------
select tests.logout();
select tests.login('52000000-0000-4000-a000-000000000002');   -- teacher A

select is(
  (select count(*)::int from public.grade_bands
    where grade_scale_id = current_setting('tests.bd')::uuid),
  7, 'a teacher reads the bands');

select throws_ok(
  $$insert into public.grade_scales (workspace_id, code, name, created_by)
    values ('52000000-0000-4000-b000-000000000001', 'MINE', 'Mine',
            '52000000-0000-4000-a000-000000000002')$$,
  '42501', 'new row violates row-level security policy for table "grade_scales"',
  'a teacher cannot create a scale');

with attempted as (
  update public.grade_bands set grade_point = 5
   where grade_scale_id = current_setting('tests.bd')::uuid
  returning 1)
select is((select count(*)::int from attempted), 0, 'a teacher''s band update affects zero rows');

select tests.logout();
select tests.login('52000000-0000-4000-a000-000000000003');   -- parent A

select is(
  (select count(*)::int from public.grade_scales
    where workspace_id = '52000000-0000-4000-b000-000000000001'),
  1, 'a parent reads the school''s scale (letters on the portal)');

select tests.logout();
select tests.login('52000000-0000-4000-a000-000000000004');   -- owner B

select is(
  (select count(*)::int from public.grade_bands
    where grade_scale_id = current_setting('tests.bd')::uuid),
  0, 'another school sees none of school A''s bands');

with attempted as (
  delete from public.grade_bands
   where grade_scale_id = current_setting('tests.bd')::uuid
  returning 1)
select is((select count(*)::int from attempted), 0, 'another school''s delete affects zero rows');

select throws_ok(
  format($$insert into public.grade_bands
           (workspace_id, grade_scale_id, letter, min_percent, max_percent, grade_point)
           values ('52000000-0000-4000-b000-000000000001', %L, 'Z', 0, 100, 0)$$,
         current_setting('tests.bd')),
  '42501', 'new row violates row-level security policy for table "grade_bands"',
  'another school cannot add a band to school A''s scale');

select throws_ok(
  format($$insert into public.grade_bands
           (workspace_id, grade_scale_id, letter, min_percent, max_percent, grade_point)
           values ('52000000-0000-4000-b000-000000000002', %L, 'Z', 0, 100, 0)$$,
         current_setting('tests.bd')),
  '23503', null,
  'a band cannot point at another school''s scale (composite FK)');

-- ---------------------------------------------------------------------
-- C. Coverage (owner A)
-- ---------------------------------------------------------------------
select tests.logout();
select tests.login('52000000-0000-4000-a000-000000000001');

select throws_ok(
  format($$select public.save_grade_scale(%L, 'Gappy', '[
    {"letter":"P","min_percent":40,"max_percent":100,"grade_point":1,"sort_order":1},
    {"letter":"F","min_percent":0,"max_percent":38.99,"grade_point":0,"is_fail":true,"sort_order":2}]')$$,
    current_setting('tests.bd')),
  '23514', 'BAND_GAP', 'a gap (39.00-39.99) is refused');

select throws_ok(
  format($$select public.save_grade_scale(%L, 'Overlap', '[
    {"letter":"P","min_percent":40,"max_percent":100,"grade_point":1,"sort_order":1},
    {"letter":"F","min_percent":0,"max_percent":40,"grade_point":0,"is_fail":true,"sort_order":2}]')$$,
    current_setting('tests.bd')),
  '23514', 'BAND_OVERLAP', 'an overlap at 40.00 is refused');

select throws_ok(
  format($$select public.save_grade_scale(%L, 'Short', '[
    {"letter":"F","min_percent":0,"max_percent":99.99,"grade_point":0,"sort_order":1}]')$$,
    current_setting('tests.bd')),
  '23514', 'BAND_GAP', 'bands that stop short of 100 are refused');

select is(
  (select count(*)::int from public.grade_bands
    where grade_scale_id = current_setting('tests.bd')::uuid),
  7, 'a refused save leaves the 7 BD bands untouched');

-- A separate valid custom scale saves.
insert into public.grade_scales (id, workspace_id, code, name, created_by)
values ('52000000-0000-4000-c000-000000000001', '52000000-0000-4000-b000-000000000001',
        'PASS_FAIL', 'Pass / fail', '52000000-0000-4000-a000-000000000001');

select lives_ok(
  $$select public.save_grade_scale('52000000-0000-4000-c000-000000000001', 'Pass / fail', '[
    {"letter":"P","min_percent":40,"max_percent":100,"grade_point":1,"sort_order":1},
    {"letter":"F","min_percent":0,"max_percent":39.99,"grade_point":0,"is_fail":true,"sort_order":2}]')$$,
  'a valid custom band set saves');

select is(
  (select string_agg(letter, ',' order by sort_order) from public.grade_bands
    where grade_scale_id = '52000000-0000-4000-c000-000000000001'),
  'P,F', 'the custom scale holds exactly its two bands');

select tests.logout();

-- ---------------------------------------------------------------------
-- D. Parity — rows between the markers are read by the TS tests.
-- ---------------------------------------------------------------------
select is(app.round_half_up(t.v, t.p), t.e,
          format('round_half_up(%s, %s) = %s', t.v, t.p, t.e))
  from (values
-- parity:round
    (1.005, 2, 1.01),
    (2.675, 2, 2.68),
    (4.345, 2, 4.35),
    (4.344, 2, 4.34),
    (4.285, 2, 4.29),
    (0.125, 2, 0.13),
    (33.335, 2, 33.34),
    (99.995, 2, 100),
    (4.3, 2, 4.3),
    (72.5, 0, 73),
    (0, 2, 0)
-- /parity:round
  ) as t(v, p, e);

select is((app.band_for(current_setting('tests.bd')::uuid, t.pct)).letter, t.letter,
          format('band_for(BD, %s) = %s', t.pct, t.letter))
  from (values
-- parity:band
    (0, 'F'),
    (32.99, 'F'),
    (32.994, 'F'),
    (32.995, 'D'),
    (33, 'D'),
    (39.99, 'D'),
    (40, 'C'),
    (49.99, 'C'),
    (50, 'B'),
    (59.99, 'B'),
    (60, 'A-'),
    (69.99, 'A-'),
    (70, 'A'),
    (72, 'A'),
    (79.99, 'A'),
    (79.995, 'A+'),
    (80, 'A+'),
    (100, 'A+')
-- /parity:band
  ) as t(pct, letter);

select is(
  (select count(*)::int
     from generate_series(0, 10000) as g(h)
    where app.band_for(current_setting('tests.bd')::uuid, g.h / 100.0) is null),
  0, 'every 0.01 step from 0 to 100 falls in a BD band');

select is(
  (select count(*)::int from app.band_for(current_setting('tests.bd')::uuid, 72) b
    where b.grade_point = 4.00),
  1, 'the demo: 72 % is A at grade point 4.00 in SQL');

-- ---------------------------------------------------------------------
-- E. read_only
-- ---------------------------------------------------------------------
select app.set_access_mode('52000000-0000-4000-b000-000000000001', 'read_only', 'Trial ended.');
select tests.login('52000000-0000-4000-a000-000000000001');

select throws_ok(
  $$select public.save_grade_scale('52000000-0000-4000-c000-000000000001', 'Renamed', '[
    {"letter":"P","min_percent":0,"max_percent":100,"grade_point":1,"sort_order":1}]')$$,
  '42501', 'PLAN_READ_ONLY', 'read_only: the owner cannot change a scale');

select tests.logout();

select * from finish();
rollback;
