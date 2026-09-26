-- =====================================================================
-- E2E CI fixtures (D-76 / OQ-27) · Acadigma Campus
-- ---------------------------------------------------------------------
-- Applied by `supabase db reset`/`supabase start`, right after seed.sql
-- (config.toml [db.seed] sql_paths order), local or in CI's `e2e-live`
-- job. seed.sql only creates FOUNDATION rows for the Model School
-- (owner/teacher/parent, the workspace, labels) -- because that
-- workspace was inserted directly rather than through
-- create_school_workspace(), it has no academic year, no grade level, no
-- subject catalogue and no grade scale, so most of the live-Supabase
-- Playwright journeys under apps/web/e2e/journeys/ (skip-gated on
-- E2E_LIVE_SUPABASE, OQ-27) would find an empty school. This file adds
-- exactly the data those journeys' own comments say they need.
--
-- Same guard and idempotency discipline as seed.sql: safe to run twice,
-- refuses to run against a database that already holds real schools.
-- =====================================================================

do $$
begin
  if (select count(*) from public.workspaces where type = 'school') > 5 then
    raise exception 'refusing to seed: this database already has % schools',
      (select count(*) from public.workspaces where type = 'school');
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 0. Four more accounts seed.sql has no reason to own (E2E-only, not
--    part of the general dev-seed narrative): membership-less accounts
--    for create-school-wizard.spec.ts (E2E_TEST_USER_*, one per
--    viewport project -- that journey really does create a real school
--    and complete onboarding for good, so the SAME account cannot also
--    still be membership-less for its own desktop-project run, the
--    exact bug this run found: sign-in no longer lands on /onboarding
--    once a school membership and last_active_workspace_id exist), the
--    onboarding chooser (E2E_ONBOARDING_TEST_*, its own account for the
--    same reason) and guardian-invite.spec.ts's parent (E2E_PARENT_*) --
--    the existing seeded `parent@acadigma.test` is already an active
--    member of the Model School (seed.sql §5), which is exactly what
--    guardian-invite.spec.ts's own comment says its account must NOT be
--    ("a second verified account that is not a member of the school").
--    Same pattern as seed.sql §1: insert into auth.users directly (fires
--    app.handle_new_user()), bcrypt-hashed here, no hash literal in the repo.
-- ---------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   '5eed0000-0000-4000-a000-000000000005',
   'authenticated', 'authenticated', 'e2e-test-user@acadigma.test',
   extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"E2E Test User"}'::jsonb, now(), now()),

  ('00000000-0000-0000-0000-000000000000',
   '5eed0000-0000-4000-a000-000000000006',
   'authenticated', 'authenticated', 'e2e-parent@acadigma.test',
   extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"E2E Guardian"}'::jsonb, now(), now()),

  ('00000000-0000-0000-0000-000000000000',
   '5eed0000-0000-4000-a000-000000000007',
   'authenticated', 'authenticated', 'e2e-onboarding-user@acadigma.test',
   extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"E2E Onboarding User"}'::jsonb, now(), now()),

  ('00000000-0000-0000-0000-000000000000',
   '5eed0000-0000-4000-a000-000000000008',
   'authenticated', 'authenticated', 'e2e-test-user-2@acadigma.test',
   extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"E2E Test User 2"}'::jsonb, now(), now())
on conflict (id) do nothing;

update public.profiles
   set phone = case id
                 when '5eed0000-0000-4000-a000-000000000005'::uuid then '+8801711000005'
                 when '5eed0000-0000-4000-a000-000000000006'::uuid then '+8801711000006'
                 when '5eed0000-0000-4000-a000-000000000007'::uuid then '+8801711000007'
                 else '+8801711000008'
               end,
       onboarding_completed_at = null,
       locale = 'en'
 where id in ('5eed0000-0000-4000-a000-000000000005',
              '5eed0000-0000-4000-a000-000000000006',
              '5eed0000-0000-4000-a000-000000000007',
              '5eed0000-0000-4000-a000-000000000008');

-- ---------------------------------------------------------------------
-- 1. The current academic year + Class 6 grade level. create_school_
--    workspace() would normally write both in the wizard; this school
--    was inserted directly by seed.sql, so nothing did yet.
-- ---------------------------------------------------------------------
do $$
declare
  v_ws    uuid := '5eed0000-0000-4000-b000-000000000001';
  v_owner uuid := '5eed0000-0000-4000-a000-000000000001';
  v_year  int  := extract(year from now())::int;
begin
  insert into public.academic_years
    (workspace_id, name, starts_on, ends_on, is_current, created_by)
  values
    (v_ws, v_year::text, make_date(v_year, 1, 1), make_date(v_year, 12, 31),
     true, v_owner)
  on conflict (workspace_id, name) do nothing;

  insert into public.grade_levels
    (workspace_id, name, name_bn, level_number, stage, created_by)
  values
    (v_ws, 'Class 6', 'ষষ্ঠ শ্রেণি', 6, 'secondary', v_owner)
  on conflict (workspace_id, level_number) do nothing;
end
$$;

-- ---------------------------------------------------------------------
-- 2. The NCTB starter subject catalogue (packages/domain/src/academic/
--    structure.ts NCTB_STARTER_SUBJECTS), copied in directly rather than
--    clicked through "Use the NCTB starter list" -- exams.spec.ts,
--    enter-marks.spec.ts, compute-results.spec.ts, publish-results.spec.ts
--    and guardian-invite.spec.ts all create an exam against existing
--    subjects; only add-section-and-assign-teacher.spec.ts seeds this
--    list itself (its own journey, safe to run twice).
-- ---------------------------------------------------------------------
insert into public.subjects
  (workspace_id, name, name_bn, code, category, subject_kind, created_by)
values
  ('5eed0000-0000-4000-b000-000000000001', 'Bangla 1st Paper', 'বাংলা প্রথম পত্র', 'BAN1', 'core', 'compulsory', '5eed0000-0000-4000-a000-000000000001'),
  ('5eed0000-0000-4000-b000-000000000001', 'Bangla 2nd Paper', 'বাংলা দ্বিতীয় পত্র', 'BAN2', 'core', 'compulsory', '5eed0000-0000-4000-a000-000000000001'),
  ('5eed0000-0000-4000-b000-000000000001', 'English 1st Paper', 'ইংরেজি প্রথম পত্র', 'ENG1', 'core', 'compulsory', '5eed0000-0000-4000-a000-000000000001'),
  ('5eed0000-0000-4000-b000-000000000001', 'English 2nd Paper', 'ইংরেজি দ্বিতীয় পত্র', 'ENG2', 'core', 'compulsory', '5eed0000-0000-4000-a000-000000000001'),
  ('5eed0000-0000-4000-b000-000000000001', 'Mathematics', 'গণিত', 'MATH', 'core', 'compulsory', '5eed0000-0000-4000-a000-000000000001'),
  ('5eed0000-0000-4000-b000-000000000001', 'Science', 'বিজ্ঞান', 'SCI', 'core', 'compulsory', '5eed0000-0000-4000-a000-000000000001'),
  ('5eed0000-0000-4000-b000-000000000001', 'Bangladesh & Global Studies', 'বাংলাদেশ ও বিশ্বপরিচয়', 'BGS', 'core', 'compulsory', '5eed0000-0000-4000-a000-000000000001'),
  ('5eed0000-0000-4000-b000-000000000001', 'ICT', 'তথ্য ও যোগাযোগ প্রযুক্তি', 'ICT', 'core', 'compulsory', '5eed0000-0000-4000-a000-000000000001'),
  ('5eed0000-0000-4000-b000-000000000001', 'Islam and Moral Education', 'ইসলাম ও নৈতিক শিক্ষা', 'ISL', 'religion', 'compulsory', '5eed0000-0000-4000-a000-000000000001'),
  ('5eed0000-0000-4000-b000-000000000001', 'Hindu Religion and Moral Education', 'হিন্দুধর্ম ও নৈতিক শিক্ষা', 'HIN', 'religion', 'compulsory', '5eed0000-0000-4000-a000-000000000001'),
  ('5eed0000-0000-4000-b000-000000000001', 'Buddhist Religion and Moral Education', 'বৌদ্ধধর্ম ও নৈতিক শিক্ষা', 'BUD', 'religion', 'compulsory', '5eed0000-0000-4000-a000-000000000001'),
  ('5eed0000-0000-4000-b000-000000000001', 'Christian Religion and Moral Education', 'খ্রিষ্টধর্ম ও নৈতিক শিক্ষা', 'CHR', 'religion', 'compulsory', '5eed0000-0000-4000-a000-000000000001'),
  ('5eed0000-0000-4000-b000-000000000001', 'Physical Education and Health', 'শারীরিক শিক্ষা ও স্বাস্থ্য', 'PEH', 'co_curricular', 'compulsory', '5eed0000-0000-4000-a000-000000000001'),
  ('5eed0000-0000-4000-b000-000000000001', 'Agriculture', 'কৃষিশিক্ষা', 'AGRI', 'optional', 'optional_fourth', '5eed0000-0000-4000-a000-000000000001'),
  ('5eed0000-0000-4000-b000-000000000001', 'Home Science', 'গার্হস্থ্য বিজ্ঞান', 'HSCI', 'optional', 'optional_fourth', '5eed0000-0000-4000-a000-000000000001'),
  ('5eed0000-0000-4000-b000-000000000001', 'Higher Mathematics', 'উচ্চতর গণিত', 'HMATH', 'optional', 'optional_fourth', '5eed0000-0000-4000-a000-000000000001'),
  ('5eed0000-0000-4000-b000-000000000001', 'Physics', 'পদার্থবিজ্ঞান', 'PHY', 'core', 'compulsory', '5eed0000-0000-4000-a000-000000000001'),
  ('5eed0000-0000-4000-b000-000000000001', 'Chemistry', 'রসায়ন', 'CHEM', 'core', 'compulsory', '5eed0000-0000-4000-a000-000000000001'),
  ('5eed0000-0000-4000-b000-000000000001', 'Biology', 'জীববিজ্ঞান', 'BIO', 'core', 'compulsory', '5eed0000-0000-4000-a000-000000000001'),
  ('5eed0000-0000-4000-b000-000000000001', 'Accounting', 'হিসাববিজ্ঞান', 'ACC', 'core', 'compulsory', '5eed0000-0000-4000-a000-000000000001'),
  ('5eed0000-0000-4000-b000-000000000001', 'Business Entrepreneurship', 'ব্যবসায় উদ্যোগ', 'BENT', 'core', 'compulsory', '5eed0000-0000-4000-a000-000000000001'),
  ('5eed0000-0000-4000-b000-000000000001', 'Economics', 'অর্থনীতি', 'ECON', 'core', 'compulsory', '5eed0000-0000-4000-a000-000000000001')
on conflict (workspace_id, lower(name)) do nothing;

-- ---------------------------------------------------------------------
-- 3. The Bangladesh GPA-5 grade scale + bands, through the real RPC
--    (public.seed_bd_grade_scale, packages/db/src/repositories/grading.ts)
--    rather than a raw insert -- pre-seeded so compute-results.spec.ts /
--    publish-results.spec.ts never race grading-settings.spec.ts's own
--    "Use the Bangladesh default" click across parallel workers.
--    Impersonates the owner the same way demo-class-6-ka.sql impersonates
--    the owner for admit_student (the function checks app.has_role() via
--    auth.uid(), which reads request.jwt.claims).
-- ---------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '5eed0000-0000-4000-a000-000000000001', 'role', 'authenticated'
  )::text,
  false);
select public.seed_bd_grade_scale('5eed0000-0000-4000-b000-000000000001');
select set_config('request.jwt.claims', '', false);

-- ---------------------------------------------------------------------
-- 4. Class 6 -- ক, 40 students. The same body as demo-class-6-ka.sql
--    (which stays a manual, `\i`-driven runbook script for the SQL
--    editor -- the Supabase CLI applies db.seed's sql_paths as batched
--    SQL, not through psql, so a `\ir` meta-command in that list fails
--    with "syntax error at or near \" (confirmed locally)), inlined here
--    with the workspace id/name as constants instead of the two
--    current_setting('demo.*') calls demo-class-6-ka.sql reads.
-- ---------------------------------------------------------------------
do $$
declare
  v_ws      uuid := '5eed0000-0000-4000-b000-000000000001';
  v_owner   uuid;
  v_year    uuid;
  v_starts  date;
  v_grade   uuid;
  v_section uuid;
  v_first   text[] := array[
    'Rahim', 'Karim', 'Tanvir', 'Arif', 'Sakib', 'Nayeem', 'Fahim', 'Imran', 'Rafi', 'Shuvo',
    'Mahin', 'Tamim', 'Rakib', 'Jubayer', 'Siam', 'Ayaan', 'Rifat', 'Hasib', 'Nafis', 'Zarif',
    'Nusrat', 'Farzana', 'Sadia', 'Tasnim', 'Anika', 'Mim', 'Riya', 'Sumaiya', 'Tahmina', 'Lamia',
    'Nabila', 'Ishrat', 'Maliha', 'Raisa', 'Afsana', 'Jannat', 'Samia', 'Tanjila', 'Fariha', 'Ayesha'];
  v_last    text[] := array[
    'Uddin', 'Hossain', 'Ahmed', 'Rahman', 'Islam', 'Hasan', 'Chowdhury', 'Karim', 'Sarkar', 'Khan'];
  v_first_bn text[] := array[
    'রহিম', 'করিম', 'তানভীর', 'আরিফ', 'সাকিব', 'নাঈম', 'ফাহিম', 'ইমরান', 'রাফি', 'শুভ',
    'মাহিন', 'তামিম', 'রাকিব', 'জুবায়ের', 'সিয়াম', 'আয়ান', 'রিফাত', 'হাসিব', 'নাফিস', 'জারিফ',
    'নুসরাত', 'ফারজানা', 'সাদিয়া', 'তাসনিম', 'আনিকা', 'মিম', 'রিয়া', 'সুমাইয়া', 'তাহমিনা', 'লামিয়া',
    'নাবিলা', 'ইশরাত', 'মালিহা', 'রাইসা', 'আফসানা', 'জান্নাত', 'সামিয়া', 'তানজিলা', 'ফারিহা', 'আয়েশা'];
  v_last_bn text[] := array[
    'উদ্দিন', 'হোসেন', 'আহমেদ', 'রহমান', 'ইসলাম', 'হাসান', 'চৌধুরী', 'করিম', 'সরকার', 'খান'];
  v_fathers text[] := array[
    'Abdul', 'Mizanur', 'Shahidul', 'Kamrul', 'Jahangir', 'Nurul', 'Rafiqul', 'Anwar', 'Mosharraf', 'Delwar'];
  i int;
begin
  select m.user_id into v_owner
    from public.workspace_members m
   where m.workspace_id = v_ws and m.role = 'owner' and m.status = 'active'
   limit 1;
  select y.id, y.starts_on into v_year, v_starts
    from public.academic_years y where y.workspace_id = v_ws and y.is_current;
  select g.id into v_grade from public.grade_levels g where g.workspace_id = v_ws and g.level_number = 6;
  if v_owner is null or v_year is null or v_grade is null then
    raise exception 'the school needs an owner, a current academic year and Class 6';
  end if;

  select s.id into v_section
    from public.sections s
   where s.workspace_id = v_ws and s.academic_year_id = v_year
     and s.grade_level_id = v_grade and s.name = 'ক' and s.archived_at is null;
  if exists (select 1 from public.enrollments e
              where e.section_id = v_section and e.status = 'active') then
    raise notice 'Class 6 – ক already has students; nothing added.';
    return;
  end if;
  if v_section is null then
    insert into public.sections (workspace_id, academic_year_id, grade_level_id, name, capacity, created_by)
    values (v_ws, v_year, v_grade, 'ক', 45, v_owner)
    returning id into v_section;
  end if;

  -- Act as the owner, so admit_student's role check and created_by hold.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);

  for i in 1..40 loop
    perform public.admit_student(v_ws, jsonb_build_object(
      'idempotency_key', md5(v_ws::text || ':demo-6ka:' || i)::uuid,
      'first_name', v_first[i],
      'last_name', v_last[1 + (i - 1) % 10],
      'full_name_bn', v_first_bn[i] || ' ' || v_last_bn[1 + (i - 1) % 10],
      'gender', case when i <= 20 then 'male' else 'female' end,
      'date_of_birth', (date '2013-01-15' + ((i * 37) % 700))::text,
      'section_id', v_section,
      'enrolled_on', v_starts,
      'guardian', jsonb_build_object(
        'relation', case when i % 5 = 0 then 'mother' else 'father' end,
        'full_name', case when i % 5 = 0 then 'Mrs. ' || v_last[1 + (i - 1) % 10]
                          else v_fathers[1 + (i - 1) % 10] || ' ' || v_last[1 + (i - 1) % 10] end,
        'phone', '+88010000000' || lpad(i::text, 2, '0'))));
  end loop;

  perform set_config('request.jwt.claims', '', true);
  raise notice 'Class 6 – ক now has % active students.',
    (select count(*) from public.enrollments e where e.section_id = v_section and e.status = 'active');
end
$$;

-- ---------------------------------------------------------------------
-- 5. Class 6 -- ক's class teacher: the seeded teacher@acadigma.test --
--    the "class teacher" persona the e2e-live CI job's journeys expect
--    on Class 6's one pre-existing section (add-section-and-assign-
--    teacher.spec.ts creates its own extra section and picks a class
--    teacher itself, so this only matters for anything reading the
--    ক section's own class_teacher_id). class_teacher_id references the
--    workspace_members row's own id, not the user id
--    (sections_class_teacher_fkey).
-- ---------------------------------------------------------------------
update public.sections s
   set class_teacher_id = m.id
  from public.workspace_members m
 where s.workspace_id = '5eed0000-0000-4000-b000-000000000001'
   and s.name = 'ক'
   and m.workspace_id = s.workspace_id
   and m.user_id = '5eed0000-0000-4000-a000-000000000002'
   and s.class_teacher_id is null;

-- ---------------------------------------------------------------------
-- 6. Widen the two IP-keyed throttle buckets for this database only
--    (D-76). `register`/`loginByIp` in the real
--    `public.throttle_record_failure` (latest definition:
--    supabase/migrations/20260925300303_throttle_per_user_keys.sql) are
--    tuned for one real person at one IP -- `loginByIp` alone is 30
--    attempts per 15 minutes before a full HOUR block. Every Playwright
--    worker in this suite signs in from the exact same IP (the runner's
--    loopback address), so the full suite's legitimate sign-ins (each
--    journey signs in at least once, several more than once) blow past
--    30 well before the run finishes, and once `loginByIp` blocks, EVERY
--    later journey's sign-in fails with "Too many attempts" -- indistin-
--    guishable, from the browser, from a real bug (found the hard way:
--    this lane's second full run, after fixing the GoTrue-level limit
--    below, went from 55 to 90 failures because more legitimate sign-ins
--    could now be attempted before GoTrue itself cut them off first).
--    `register` is the same shape (IP-keyed) and register-verify.spec.ts's
--    own AC2 case adds to it every run.
--
--    `create or replace function` here installs a version of the SAME
--    function with only these two buckets' thresholds widened, in THIS
--    database only -- supabase/seed/*.sql is never applied to the hosted
--    project by any CI workflow (only `supabase/migrations/*.sql` is, via
--    `supabase db push`, D-73's db.yml), so production's real limits are
--    untouched. `loginByEmail` is deliberately left at its real value
--    (see the inline comment below) -- rate-limit.spec.ts depends on it
--    still tripping for real. Keep this in sync with the migration's
--    function body if that one changes the LOGIC (not just numbers) -- a
--    future CI run that behaves unexpectedly differently from local dev
--    is exactly what would reveal a drift, not a silent gap.
-- ---------------------------------------------------------------------
create or replace function public.throttle_record_failure(
  p_bucket text,
  p_key    text)
returns table (blocked boolean, retry_after_seconds integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row            public.auth_throttle;
  v_max_attempts   integer;
  v_window_seconds integer;
  v_block_seconds  integer;
  v_key            text;
begin
  if p_key like 'user:%' and split_part(p_key, ':', 2) <> p_bucket then
    raise exception 'throttle key does not match bucket' using errcode = '22023';
  end if;

  v_key := app.throttle_key(
    case when p_bucket in ('changePassword', 'eiinCheck', 'createSchool')
         then 'user:' || p_bucket
         else p_key
    end);

  select l.max_attempts, l.window_seconds, l.block_seconds
    into v_max_attempts, v_window_seconds, v_block_seconds
  from (values
    -- bucket,                 max_attempts, window_seconds, block_seconds
    -- Only the two IP-keyed buckets every journey's sign-in/registration
    -- shares (one IP for the whole suite) are widened, to 2000 -- far
    -- above anything one CI run can reach. `loginByEmail` is UNCHANGED:
    -- it is keyed per email, rate-limit.spec.ts uses a fresh random email
    -- every run precisely so it never shares this bucket with any other
    -- test, and its own assertion (the 6th wrong password rate-limits)
    -- depends on this bucket's real 5-per-window threshold actually
    -- tripping. Every other bucket is per-user (`user:<bucket>`, D-101)
    -- or low-volume enough in this suite that it was never the problem.
    ('register',                2000, 3600,  3600),
    ('loginByEmail',               5,  900,   900),
    ('loginByIp',                2000,  900,  3600),
    ('passwordResetRequest',       5,  3600,  3600),
    ('passwordResetSubmit',       10,  3600,  3600),
    ('resendVerification',         5,  3600,  3600),
    ('changePassword',            10,  3600,  3600),
    ('eiinCheck',                 30,   900,   900),
    ('createSchool',              30,   900,   900)
  ) as l(bucket, max_attempts, window_seconds, block_seconds)
  where l.bucket = p_bucket;

  if v_max_attempts is null then
    raise exception 'unrecognised throttle bucket: %', p_bucket using errcode = '22023';
  end if;

  insert into public.auth_throttle (key, window_started_at, attempts)
  values (v_key, now(), 1)
  on conflict (key) do update
    set attempts = case
          when (auth_throttle.blocked_until is not null and auth_throttle.blocked_until <= now())
            or (auth_throttle.blocked_until is null
                and auth_throttle.window_started_at < now() - make_interval(secs => v_window_seconds))
            then 1
          else auth_throttle.attempts + 1
        end,
        window_started_at = case
          when (auth_throttle.blocked_until is not null and auth_throttle.blocked_until <= now())
            or (auth_throttle.blocked_until is null
                and auth_throttle.window_started_at < now() - make_interval(secs => v_window_seconds))
            then now()
          else auth_throttle.window_started_at
        end,
        blocked_until = case
          when auth_throttle.blocked_until is not null and auth_throttle.blocked_until <= now()
            then null
          else auth_throttle.blocked_until
        end
  returning * into v_row;

  if v_row.attempts > v_max_attempts then
    update public.auth_throttle
       set blocked_until = greatest(
             coalesce(blocked_until, now()),
             now() + make_interval(secs => v_block_seconds))
     where key = v_key
     returning * into v_row;
  end if;

  return query select
    (v_row.blocked_until is not null and v_row.blocked_until > now()),
    greatest(
      0,
      ceil(extract(epoch from (coalesce(v_row.blocked_until, now()) - now())))::integer
    );
end;
$$;
