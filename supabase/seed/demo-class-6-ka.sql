-- =====================================================================
-- Demo data · Class 6 – ক with 40 students (F-AC-02 demo cut, D-103)
-- ---------------------------------------------------------------------
-- For a DEMO school only. Admits 40 fictional students, each with a
-- primary guardian, into Class 6 – ক of the school's current academic
-- year, creating that section if it does not exist. Every student goes
-- through public.admit_student as the school's owner, so codes, roll
-- numbers, audit rows and every database rule are exactly what the app
-- produces. Phone numbers are in the unassigned 010 range
-- (+8801000000001 … 40), so no real family is ever called. Students are
-- enrolled from the academic year's first day, so they count in
-- attendance history.
--
-- Guards: the school's exact name must be given as well as its id (so a
-- pasted wrong uuid cannot fill a real school), and nothing happens when
-- Class 6 – ক already has active students.
--
-- Usage (psql, or the Supabase SQL editor with the first lines edited):
--   select set_config('demo.workspace_id', '<school workspace uuid>', false);
--   select set_config('demo.workspace_name', '<the school''s exact name>', false);
--   \i supabase/seed/demo-class-6-ka.sql
-- =====================================================================
do $$
declare
  v_ws      uuid := nullif(current_setting('demo.workspace_id', true), '')::uuid;
  v_name    text := current_setting('demo.workspace_name', true);
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
  if v_ws is null or v_name is null then
    raise exception 'set demo.workspace_id and demo.workspace_name first';
  end if;
  if not exists (select 1 from public.workspaces w
                  where w.id = v_ws and w.type = 'school' and w.name = v_name) then
    raise exception 'workspace % is not a school named "%"', v_ws, v_name;
  end if;

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
