-- =====================================================================
-- pgTAP · F-AC-06 Part 1 — grade scales and the grading domain (D-302)
--
--   A. public.seed_bd_grade_scale: owner/admin only; idempotent.
--   B. Bands are written only through the RPCs; code, is_default and
--      created_by are fixed (security review, PR #46).
--   C. RLS: every active member reads; only owner/admin write; another
--      school sees and touches nothing (isolation + escalation).
--   D. Coverage (gap, overlap, short, empty) and grade-point order are
--      refused; an admin's valid save lands and is audited (band churn at
--      info severity).
--   E. PARITY with packages/domain/src/grading — the rows between the
--      `-- parity:` markers are read verbatim by round.test.ts/scale.test.ts.
--      Full sweep: letter and grade point for every integer and .99 against
--      a CASE oracle; no rounding before banding (D-302 a).
--   F. read_only: a save is refused with PLAN_READ_ONLY.
-- =====================================================================
begin;
select plan(59);

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
select tests.mkuser('52000000-0000-4000-a000-000000000005', 'gs-admin-a@test.local', 'Admin A');

insert into public.workspaces (id, type, name, slug, owner_id, created_by, status)
values
  ('52000000-0000-4000-b000-000000000001', 'school', 'Grading School A', 'grading-school-a-52',
   '52000000-0000-4000-a000-000000000001', '52000000-0000-4000-a000-000000000001', 'active'),
  ('52000000-0000-4000-b000-000000000002', 'school', 'Grading School B', 'grading-school-b-52',
   '52000000-0000-4000-a000-000000000004', '52000000-0000-4000-a000-000000000004', 'active');

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
values
  ('52000000-0000-4000-b000-000000000001', '52000000-0000-4000-a000-000000000002', 'teacher', 'active', now()),
  ('52000000-0000-4000-b000-000000000001', '52000000-0000-4000-a000-000000000003', 'parent',  'active', now()),
  ('52000000-0000-4000-b000-000000000001', '52000000-0000-4000-a000-000000000005', 'admin',   'active', now());

-- ---------------------------------------------------------------------
-- A. Seed
-- ---------------------------------------------------------------------
select tests.login('52000000-0000-4000-a000-000000000002');   -- teacher A
select throws_ok(
  $$select public.seed_bd_grade_scale('52000000-0000-4000-b000-000000000001')$$,
  '42501', 'only an owner or admin can change grading',
  'a teacher cannot seed a scale');
select tests.logout();

select tests.login('52000000-0000-4000-a000-000000000001');   -- owner A

select set_config('tests.bd',
  public.seed_bd_grade_scale('52000000-0000-4000-b000-000000000001')::text, true);

select isnt(current_setting('tests.bd'), '', 'owner seeds the Bangladesh scale');

select is(
  public.seed_bd_grade_scale('52000000-0000-4000-b000-000000000001')::text,
  current_setting('tests.bd'),
  'seeding again returns the same scale (idempotent, insert ... on conflict)');

select is(
  (select count(*)::int from public.grade_bands
    where grade_scale_id = current_setting('tests.bd')::uuid),
  7, 'the BD scale has exactly 7 bands after two seeds');

select is(
  (select code || ' ' || is_default::text || ' ' || created_by::text from public.grade_scales
    where id = current_setting('tests.bd')::uuid),
  'BD_GPA5 true 52000000-0000-4000-a000-000000000001',
  'code BD_GPA5, the school''s default, created_by the caller');

-- ---------------------------------------------------------------------
-- B. Direct writes and identity (security review, PR #46)
-- ---------------------------------------------------------------------
select throws_ok(
  format($$insert into public.grade_bands
           (workspace_id, grade_scale_id, letter, min_percent, max_percent, grade_point)
           values ('52000000-0000-4000-b000-000000000001', %L, 'Z', 0, 100, 0)$$,
         current_setting('tests.bd')),
  '42501', 'permission denied for table grade_bands',
  'even the owner cannot write bands directly (only through save_grade_scale)');

select throws_ok(
  format($$update public.grade_scales set code = 'MINE' where id = %L$$, current_setting('tests.bd')),
  '42501', 'GRADE_SCALE_IDENTITY_IMMUTABLE', 'the owner cannot change a scale''s code');

select throws_ok(
  format($$update public.grade_scales set is_default = false where id = %L$$, current_setting('tests.bd')),
  '42501', 'GRADE_SCALE_IDENTITY_IMMUTABLE', 'the owner cannot flip is_default directly');

select throws_ok(
  format($$update public.grade_scales set created_by = '52000000-0000-4000-a000-000000000005'
           where id = %L$$, current_setting('tests.bd')),
  '42501', 'created_by is immutable', 'created_by is fixed');

-- ---------------------------------------------------------------------
-- C. RLS (isolation + escalation)
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

select throws_ok(
  format($$select public.save_grade_scale('52000000-0000-4000-b000-000000000001', %L, 'X',
           '[{"letter":"P","min_percent":0,"max_percent":100,"grade_point":1,"sort_order":1}]')$$,
         current_setting('tests.bd')),
  '42501', 'only an owner or admin can change grading', 'a teacher cannot save a scale');

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

select throws_ok(
  format($$select public.save_grade_scale('52000000-0000-4000-b000-000000000002', %L, 'X',
           '[{"letter":"P","min_percent":0,"max_percent":100,"grade_point":1,"sort_order":1}]')$$,
         current_setting('tests.bd')),
  'P0002', 'grade scale not found',
  'another school cannot save school A''s scale under its own workspace');

select throws_ok(
  format($$select public.save_grade_scale('52000000-0000-4000-b000-000000000001', %L, 'X',
           '[{"letter":"P","min_percent":0,"max_percent":100,"grade_point":1,"sort_order":1}]')$$,
         current_setting('tests.bd')),
  '42501', 'only an owner or admin can change grading',
  'another school cannot save school A''s scale by naming school A');

-- ---------------------------------------------------------------------
-- D. Coverage and grade-point order (owner A)
-- ---------------------------------------------------------------------
select tests.logout();
select tests.login('52000000-0000-4000-a000-000000000001');

select throws_ok(
  format($$select public.save_grade_scale('52000000-0000-4000-b000-000000000001', %L, 'Gappy', '[
    {"letter":"P","min_percent":40,"max_percent":100,"grade_point":1,"sort_order":1},
    {"letter":"F","min_percent":0,"max_percent":38.99,"grade_point":0,"is_fail":true,"sort_order":2}]')$$,
    current_setting('tests.bd')),
  '23514', 'BAND_GAP', 'a gap (39.00-39.99) is refused');

select throws_ok(
  format($$select public.save_grade_scale('52000000-0000-4000-b000-000000000001', %L, 'Overlap', '[
    {"letter":"P","min_percent":40,"max_percent":100,"grade_point":1,"sort_order":1},
    {"letter":"F","min_percent":0,"max_percent":40,"grade_point":0,"is_fail":true,"sort_order":2}]')$$,
    current_setting('tests.bd')),
  '23514', 'BAND_OVERLAP', 'an overlap at 40.00 is refused');

select throws_ok(
  format($$select public.save_grade_scale('52000000-0000-4000-b000-000000000001', %L, 'Short', '[
    {"letter":"F","min_percent":0,"max_percent":99.99,"grade_point":0,"sort_order":1}]')$$,
    current_setting('tests.bd')),
  '23514', 'BAND_GAP', 'bands that stop short of 100 are refused');

select throws_ok(
  format($$select public.save_grade_scale('52000000-0000-4000-b000-000000000001', %L, 'Empty', '[]')$$,
    current_setting('tests.bd')),
  '23514', 'BAND_GAP', 'an empty band set is refused (review, PR #46)');

select throws_ok(
  format($$select public.save_grade_scale('52000000-0000-4000-b000-000000000001', %L, 'Upside down', '[
    {"letter":"P","min_percent":40,"max_percent":100,"grade_point":1,"sort_order":1},
    {"letter":"F","min_percent":0,"max_percent":39.99,"grade_point":2,"sort_order":2}]')$$,
    current_setting('tests.bd')),
  '23514', 'BAND_POINTS_DECREASE', 'grade points that go down band by band are refused');

select is(
  (select count(*)::int from public.grade_bands
    where grade_scale_id = current_setting('tests.bd')::uuid),
  7, 'refused saves leave the 7 BD bands untouched');

-- An admin saves a valid custom scale.
insert into public.grade_scales (id, workspace_id, code, name, created_by)
values ('52000000-0000-4000-c000-000000000001', '52000000-0000-4000-b000-000000000001',
        'PASS_FAIL', 'Pass / fail', '52000000-0000-4000-a000-000000000001');

select tests.logout();
select tests.login('52000000-0000-4000-a000-000000000005');   -- admin A

select lives_ok(
  $$select public.save_grade_scale('52000000-0000-4000-b000-000000000001',
      '52000000-0000-4000-c000-000000000001', 'Pass / fail (2026)', '[
    {"letter":"P","min_percent":40,"max_percent":100,"grade_point":1,"sort_order":1},
    {"letter":"F","min_percent":0,"max_percent":39.99,"grade_point":0,"is_fail":true,"sort_order":2}]')$$,
  'an admin saves a valid custom band set');

select tests.logout();

select is(
  (select name || ': ' || string_agg(letter, ',' order by sort_order)
     from public.grade_scales s join public.grade_bands b on b.grade_scale_id = s.id
    where s.id = '52000000-0000-4000-c000-000000000001' group by s.name),
  'Pass / fail (2026): P,F', 'the save renamed the scale and holds exactly its two bands');

select is(
  (select count(*)::int from public.audit_events
    where table_name = 'public.grade_scales' and action = 'grade_scales.update'
      and row_id = '52000000-0000-4000-c000-000000000001'
      and actor_id = '52000000-0000-4000-a000-000000000005'),
  1, 'the save wrote one grade_scales.update audit row, attributed to the admin');

select is(
  (select count(*)::int from public.audit_events
    where action = 'grade_bands.insert' and actor_id = '52000000-0000-4000-a000-000000000005'),
  2, 'band inserts are audited');

select is(
  (select coalesce(array_agg(distinct severity::text), '{}') from public.audit_events
    where action like 'grade_bands.%'),
  array['info'], 'band churn is info-level, never critical');

-- ---------------------------------------------------------------------
-- E. Parity — rows between the markers are read by the TS tests.
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

select is((select b.letter || ' ' || b.grade_point
             from app.band_for(current_setting('tests.bd')::uuid, t.pct) b),
          t.letter || ' ' || t.point,
          format('band_for(BD, %s) = %s %s', t.pct, t.letter, t.point))
  from (values
-- parity:band
    (0, 'F', 0.00),
    (32.5, 'F', 0.00),
    (32.99, 'F', 0.00),
    (33, 'D', 1.00),
    (39.99, 'D', 1.00),
    (40, 'C', 2.00),
    (49.99, 'C', 2.00),
    (50, 'B', 3.00),
    (59.99, 'B', 3.00),
    (60, 'A-', 3.50),
    (69.99, 'A-', 3.50),
    (70, 'A', 4.00),
    (72, 'A', 4.00),
    (79.5, 'A', 4.00),
    (79.99, 'A', 4.00),
    (80, 'A+', 5.00),
    (100, 'A+', 5.00)
-- /parity:band
  ) as t(pct, letter, point);

-- Full sweep against an independent CASE oracle: letter AND grade point for
-- every integer 0-100 and every .99 (D-302, review of PR #46).
select is(
  (select count(*)::int
     from (select g::numeric as pct from generate_series(0, 100) g
           union all
           select g + 0.99 from generate_series(0, 99) g) x
     left join lateral app.band_for(current_setting('tests.bd')::uuid, x.pct) b on true
    where (b.letter, b.grade_point) is distinct from (
            case when x.pct >= 80 then 'A+' when x.pct >= 70 then 'A' when x.pct >= 60 then 'A-'
                 when x.pct >= 50 then 'B' when x.pct >= 40 then 'C' when x.pct >= 33 then 'D'
                 else 'F' end,
            case when x.pct >= 80 then 5.00 when x.pct >= 70 then 4.00 when x.pct >= 60 then 3.50
                 when x.pct >= 50 then 3.00 when x.pct >= 40 then 2.00 when x.pct >= 33 then 1.00
                 else 0.00 end)),
  0, 'every integer 0-100 and every .99: band_for letter and point match the BD oracle');

select is(
  (select count(*)::int from generate_series(0, 10000) g(h)
    where app.band_for(current_setting('tests.bd')::uuid, g.h / 100.0) is null),
  0, 'every 0.01 step from 0 to 100 falls in a BD band');

select is(
  (app.band_for(current_setting('tests.bd')::uuid, 79.995)).letter, null,
  'no rounding before banding (D-302 a): 79.995 is in no band');

-- ---------------------------------------------------------------------
-- F. read_only
-- ---------------------------------------------------------------------
select app.set_access_mode('52000000-0000-4000-b000-000000000001', 'read_only', 'Trial ended.');
select tests.login('52000000-0000-4000-a000-000000000001');

select throws_ok(
  $$select public.save_grade_scale('52000000-0000-4000-b000-000000000001',
      '52000000-0000-4000-c000-000000000001', 'Renamed', '[
    {"letter":"P","min_percent":0,"max_percent":100,"grade_point":1,"sort_order":1}]')$$,
  '42501', 'PLAN_READ_ONLY', 'read_only: the owner cannot change a scale');

select tests.logout();

select * from finish();
rollback;
