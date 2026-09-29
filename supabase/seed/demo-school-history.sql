-- =====================================================================
-- Demo school · step 3 of 3 — attendance history, one published exam and a
-- linked parent (D-80)
-- ---------------------------------------------------------------------
-- Runs after demo-school.sql and demo-class-6-ka.sql, in the same session
-- (scripts/demo-seed.sh). Same rules as step 1: the demo school only, every
-- write through the app's own functions acting as a real member with role
-- `authenticated`, every part skipped when already done.
--
--   1. The last 18 school days before today: roll call saved through
--      save_attendance by the head teacher (the owner). Days older than the
--      edit window are stamped edited_after_window, exactly as the rule says
--      for an admin entering past registers. Today is left for the live demo.
--   2. "অর্ধবার্ষিক পরীক্ষা" (midterm), four papers: the teacher enters and
--      submits Mathematics and Science, the head teacher Bangla and English;
--      the owner locks every paper, computes and publishes the results.
--   3. The parent account is linked to roll 1 through invite_guardian and
--      accept_guardian_invitation.
-- =====================================================================
do $$
declare
  c_name    constant text := 'Acadigma Demo School (ডেমো)';
  c_exam    constant text := 'অর্ধবার্ষিক পরীক্ষা';
  v_ws      uuid := nullif(current_setting('demo.workspace_id', true), '')::uuid;
  v_owner   uuid;
  v_teacher uuid;
  v_parent  uuid;
  v_member  uuid;
  v_section uuid;
  v_year    uuid;
  v_starts  date;
  v_today   date;
  v_dates   date[];
  v_i       int;
  v_exam    uuid;
  v_paper   record;
  v_res     jsonb;
  c_owner   text;
  c_teacher text;
  c_parent  text;
begin
  -- step 1 left the id; re-check it names the demo school.
  select w.owner_id into v_owner from public.workspaces w
   where w.id = v_ws and w.name = c_name and w.type = 'school';
  if v_owner is null
     or v_owner is distinct from (select u.id from auth.users u where u.email = 'owner.demo@example.com') then
    raise exception 'demo school not resolved: run scripts/demo-seed.sh, not this file';
  end if;
  select u.id into v_teacher from auth.users u where u.email = 'teacher.demo@example.com';
  select u.id into v_parent  from auth.users u where u.email = 'parent.demo@example.com';
  select m.id into v_member from public.workspace_members m
   where m.workspace_id = v_ws and m.user_id = v_teacher and m.status = 'active';
  select y.id, y.starts_on into v_year, v_starts
    from public.academic_years y where y.workspace_id = v_ws and y.is_current;
  select s.id into v_section from public.sections s
    join public.grade_levels g on g.id = s.grade_level_id and g.level_number = 6
   where s.workspace_id = v_ws and s.academic_year_id = v_year and s.name = 'ক' and s.archived_at is null;
  v_today := app.school_today(v_ws);

  c_owner   := json_build_object('sub', v_owner,   'role', 'authenticated', 'email', 'owner.demo@example.com')::text;
  c_teacher := json_build_object('sub', v_teacher, 'role', 'authenticated', 'email', 'teacher.demo@example.com')::text;
  c_parent  := json_build_object('sub', v_parent,  'role', 'authenticated', 'email', 'parent.demo@example.com')::text;

  -- ---- 1. attendance history ------------------------------------------------
  if not exists (select 1 from public.attendance_sessions a where a.section_id = v_section) then
    select array_agg(d order by d) into v_dates
      from (select d::date as d
              from generate_series(v_today - 40, v_today - 1, interval '1 day') d
             where d::date >= v_starts and app.is_school_day(v_ws, d::date)
             order by d desc limit 18) x;

    perform set_config('request.jwt.claims', c_owner, true);
    perform set_config('role', 'authenticated', true);
    for v_i in 1 .. coalesce(array_length(v_dates, 1), 0) loop
      perform public.save_attendance(v_ws, jsonb_build_object(
        'idempotency_key', md5(v_ws::text || ':demo-attendance:' || v_dates[v_i])::uuid,
        'section_id', v_section,
        'date', v_dates[v_i],
        'records', (
          select jsonb_agg(jsonb_build_object('student_id', e.student_id, 'status',
                   case
                     -- roll 12 misses every third day: the "at risk" child.
                     when e.roll_number = 12 and v_i % 3 = 0 then 'absent'
                     when (e.roll_number * 7 + v_i * 3) % 29 = 0 then 'absent'
                     when (e.roll_number * 5 + v_i) % 37 = 0 then 'late'
                     else 'present'
                   end))
            from public.enrollments e
           where e.section_id = v_section and e.status = 'active'
             and e.enrolled_on <= v_dates[v_i])));
    end loop;
    perform set_config('role', session_user, true);
  end if;

  -- ---- 2. one exam, marked, locked, computed and published -----------------
  if not exists (select 1 from public.exams x where x.workspace_id = v_ws and x.name = c_exam) then
    perform set_config('request.jwt.claims', c_owner, true);
    perform set_config('role', 'authenticated', true);
    v_exam := public.create_exam(jsonb_build_object(
      'workspace_id', v_ws,
      'academic_year_id', v_year,
      'name', c_exam,
      'exam_type', 'midterm',
      'starts_on', greatest(v_starts, v_today - 12),
      'ends_on', greatest(v_starts, v_today - 5),
      'full_marks', 100,
      'section_ids', jsonb_build_array(v_section),
      'subject_ids', (select jsonb_agg(x.id) from public.subjects x
                       where x.workspace_id = v_ws and x.archived_at is null)));
    update public.exams set status = 'scheduled'   where id = v_exam;
    update public.exams set status = 'in_progress' where id = v_exam;
    update public.exams set status = 'marks_entry' where id = v_exam;

    for v_paper in
      select es.id, es.teacher_id, sub.code
        from public.exam_subjects es join public.subjects sub on sub.id = es.subject_id
       where es.exam_id = v_exam order by sub.code
    loop
      -- The paper's own teacher enters and submits it.
      perform set_config('request.jwt.claims',
        case when v_paper.teacher_id = v_member then c_teacher else c_owner end, true);
      perform public.save_marks(v_ws, jsonb_build_object(
        'idempotency_key', md5(v_ws::text || ':demo-marks:' || v_paper.id)::uuid,
        'exam_subject_id', v_paper.id,
        'entries', (
          select jsonb_agg(jsonb_build_object(
                   'student_id', e.student_id, 'status', 'entered', 'obtained',
                   case
                     -- one fail, so the report shows what a fail looks like.
                     when e.roll_number = 40 and v_paper.code = 'MATH' then 28
                     else least(100, 45 + (e.roll_number * 11) % 45
                                     + (e.roll_number * length(v_paper.code) * 7) % 12)
                   end))
            from public.enrollments e
           where e.section_id = v_section and e.status = 'active')));
      perform public.submit_exam_subject(v_ws, v_paper.id, false);
    end loop;

    perform set_config('request.jwt.claims', c_owner, true);
    perform public.lock_exam_subject(v_ws, es.id) from public.exam_subjects es where es.exam_id = v_exam;
    update public.exams set status = 'marks_locked' where id = v_exam;
    perform public.compute_results(v_ws, v_exam);
    perform public.publish_results(v_ws, v_exam);
    perform set_config('role', session_user, true);
  end if;

  -- ---- 3. the parent, linked to roll 1 --------------------------------------
  if not exists (select 1 from public.guardian_users gu
                  where gu.workspace_id = v_ws and gu.user_id = v_parent and gu.status = 'active') then
    perform set_config('request.jwt.claims', c_owner, true);
    perform set_config('role', 'authenticated', true);
    v_res := public.invite_guardian(v_ws, (
      select g.id from public.guardians g
        join public.enrollments e on e.student_id = g.student_id
       where e.section_id = v_section and e.status = 'active' and e.roll_number = 1
       order by g.is_primary desc limit 1));
    perform set_config('request.jwt.claims', c_parent, true);
    perform public.accept_guardian_invitation(v_res ->> 'token');
    perform set_config('role', session_user, true);
  end if;

  perform set_config('request.jwt.claims', '', true);
  raise notice 'demo school ready: % students, % attendance days, % published results, % linked parent(s)',
    (select count(*) from public.enrollments e where e.section_id = v_section and e.status = 'active'),
    (select count(*) from public.attendance_sessions a where a.section_id = v_section),
    (select count(*) from public.results r join public.exams x on x.id = r.exam_id
      where x.workspace_id = v_ws and x.status = 'published'),
    (select count(*) from public.guardian_users gu where gu.workspace_id = v_ws and gu.status = 'active');
end
$$;
