-- =====================================================================
-- Demo school · step 1 of 3 — the school, its teacher and Class 6 – ক (D-80)
-- ---------------------------------------------------------------------
-- Run by scripts/demo-seed.sh only (after it has created the three demo
-- accounts through the Auth admin API), followed by demo-class-6-ka.sql
-- (D-103, the 40 students) and demo-school-history.sql.
--
-- Everything the school gets goes through the app's own paths, acting as
-- the demo owner with role `authenticated` — so RLS, the security-definer
-- functions' role checks, the audit triggers and require_writable all
-- apply exactly as they do for a real request:
--   create_school_workspace → seed_bd_grade_scale → subjects (RLS insert)
--   → an email invitation (RLS insert) accepted with app.accept_invitation
--   → section with class teacher (RLS insert) → set_section_subjects.
--
-- Guards: the school's name is fixed below. The script refuses when more
-- than one workspace carries that name, or when the one that does is not a
-- school owned by the demo owner. Nothing is written to any other
-- workspace. Every step is skipped when already done, so a second run adds
-- nothing.
-- =====================================================================
do $$
declare
  c_name    constant text := 'Acadigma Demo School (ডেমো)';
  v_owner   uuid;
  v_teacher uuid;
  v_ws      uuid;
  v_n       int;
  v_today   date := (now() at time zone 'Asia/Dhaka')::date;
  v_starts  date;
  v_year    uuid;
  v_grade   uuid;
  v_section uuid;
  v_member  uuid;
  v_token   text := replace(gen_random_uuid()::text, '-', '');
  v_hash    bytea;
  v_res     jsonb;
begin
  v_hash := app.hash_token(v_token);

  select u.id into v_owner   from auth.users u where u.email = 'owner.demo@example.com';
  select u.id into v_teacher from auth.users u where u.email = 'teacher.demo@example.com';
  if v_owner is null or v_teacher is null
     or not exists (select 1 from auth.users u where u.email = 'parent.demo@example.com') then
    raise exception 'demo accounts missing: run scripts/demo-seed.sh, not this file';
  end if;

  select count(*) into v_n from public.workspaces w where lower(btrim(w.name)) = lower(c_name);
  if v_n > 1 then
    raise exception 'refusing: % workspaces are named "%"', v_n, c_name;
  end if;
  select w.id into v_ws from public.workspaces w where lower(btrim(w.name)) = lower(c_name);
  if v_ws is not null and not exists (
       select 1 from public.workspaces w
        where w.id = v_ws and w.name = c_name and w.type = 'school' and w.owner_id = v_owner) then
    raise exception 'refusing: "%" exists but is not a school owned by the demo owner', c_name;
  end if;

  -- ---- act as the demo owner, exactly as PostgREST would ----------------
  perform set_config('request.jwt.claims', json_build_object(
    'sub', v_owner, 'role', 'authenticated', 'email', 'owner.demo@example.com')::text, true);
  perform set_config('role', 'authenticated', true);

  if v_ws is null then
    -- A calendar-year school (Bangladesh), starting early enough that three
    -- weeks of history fit even in January.
    v_starts := date_trunc('year', v_today - 60)::date;
    v_res := public.create_school_workspace(jsonb_build_object(
      'idempotency_key', md5('acadigma-demo-school:' || v_owner)::uuid,
      'name', c_name,
      'board', 'dhaka',
      'medium', 'bangla',
      'timezone', 'Asia/Dhaka',
      'working_days', jsonb_build_array(6, 7, 1, 2, 3, 4),
      'academic_year', jsonb_build_object(
        'name', extract(year from v_today)::text,
        'starts_on', v_starts,
        'ends_on', make_date(extract(year from v_today)::int, 12, 31)),
      'grade_levels', jsonb_build_array(
        jsonb_build_object('name', 'Class 6',  'name_bn', 'ষষ্ঠ শ্রেণি',  'level_number', 6,  'stage', 'secondary'),
        jsonb_build_object('name', 'Class 7',  'name_bn', 'সপ্তম শ্রেণি', 'level_number', 7,  'stage', 'secondary'),
        jsonb_build_object('name', 'Class 8',  'name_bn', 'অষ্টম শ্রেণি', 'level_number', 8,  'stage', 'secondary'),
        jsonb_build_object('name', 'Class 9',  'name_bn', 'নবম শ্রেণি',   'level_number', 9,  'stage', 'secondary'),
        jsonb_build_object('name', 'Class 10', 'name_bn', 'দশম শ্রেণি',   'level_number', 10, 'stage', 'secondary'))));
    if v_res ? 'error' then
      raise exception 'create_school_workspace: %', v_res ->> 'error';
    end if;
    v_ws := (v_res ->> 'workspace_id')::uuid;
  end if;

  perform public.seed_bd_grade_scale(v_ws);

  insert into public.subjects (workspace_id, name, name_bn, code, created_by)
  select v_ws, s.name, s.name_bn, s.code, v_owner
    from (values ('Bangla', 'বাংলা', 'BAN'), ('English', 'ইংরেজি', 'ENG'),
                 ('Mathematics', 'গণিত', 'MATH'), ('Science', 'বিজ্ঞান', 'SCI'))
         as s(name, name_bn, code)
   where not exists (select 1 from public.subjects x
                      where x.workspace_id = v_ws and lower(x.name) = lower(s.name));

  -- ---- the teacher joins by an email invitation -------------------------
  select m.id into v_member from public.workspace_members m
   where m.workspace_id = v_ws and m.user_id = v_teacher and m.status = 'active';
  if v_member is null then
    -- The raw token never leaves this block; only its hash is stored.
    insert into public.workspace_invitations
      (workspace_id, channel, email, role, token_hash, token_prefix, invited_by, expires_at)
    values
      (v_ws, 'email', 'teacher.demo@example.com', 'teacher', v_hash,
       left(v_token, 8), v_owner, now() + interval '1 hour');

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_teacher, 'role', 'authenticated', 'email', 'teacher.demo@example.com')::text, true);
    perform set_config('role', session_user, true);   -- app.accept_invitation is app-internal
    perform app.accept_invitation(v_token);
    perform set_config('role', 'authenticated', true);

    -- The teacher's own settings: basic mode, large text, Bangla (F-ID-10).
    update public.user_preferences
       set ui_mode = 'basic', text_size = 'large', language = 'bn'
     where user_id = v_teacher;
    update public.profiles set last_active_workspace_id = v_ws where id = v_teacher;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated', 'email', 'owner.demo@example.com')::text, true);
    select m.id into v_member from public.workspace_members m
     where m.workspace_id = v_ws and m.user_id = v_teacher and m.status = 'active';
  end if;

  -- ---- Class 6 – ক, the teacher as class teacher and subject teacher -------
  select y.id into v_year from public.academic_years y where y.workspace_id = v_ws and y.is_current;
  select g.id into v_grade from public.grade_levels g where g.workspace_id = v_ws and g.level_number = 6;
  select s.id into v_section from public.sections s
   where s.workspace_id = v_ws and s.academic_year_id = v_year and s.grade_level_id = v_grade
     and s.name = 'ক' and s.archived_at is null;
  if v_section is null then
    insert into public.sections
      (workspace_id, academic_year_id, grade_level_id, name, class_teacher_id, room, capacity, created_by)
    values (v_ws, v_year, v_grade, 'ক', v_member, '201', 45, v_owner)
    returning id into v_section;

    -- Bangla and English stay with the head teacher (no subject teacher);
    -- Mathematics and Science are the demo teacher's.
    perform public.set_section_subjects(v_ws, v_section, (
      select jsonb_agg(jsonb_build_object(
               'subject_id', x.id,
               'teacher_id', case when x.code in ('MATH', 'SCI') then v_member end))
        from public.subjects x where x.workspace_id = v_ws and x.archived_at is null));
  end if;

  perform set_config('role', session_user, true);
  perform set_config('request.jwt.claims', '', true);

  -- For demo-class-6-ka.sql (D-103), which runs next in the same session.
  perform set_config('demo.workspace_id', v_ws::text, false);
  perform set_config('demo.workspace_name', c_name, false);
end
$$;
