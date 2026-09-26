-- =====================================================================
-- F-AC-06 Part 4, the non-offline half (demo cut, D-307) — submit, lock
-- and unlock a paper, and the marks entry window. Builds on exams
-- (20260925300305, D-303), marks (20260925300312, D-304) and results
-- (20260925300318, D-305). The offline queue is F-ID-11 (D-71).
--
--   * exam_subjects gains entry_opens_on / entry_closes_on (§5.11) and
--     status_reason (the unlock reason, like exams.status_reason). The
--     effective window is app.marks_entry_window: opens on the date set,
--     else the paper's exam_date; closes on the date set, else 7 days
--     after it opens. No date at all = no window (open while the exam is
--     in marks_entry, as before).
--   * public.save_marks: outside the window a teacher is refused
--     (OUTSIDE_ENTRY_WINDOW); an owner/admin must give `late_reason`
--     (REASON_REQUIRED without it), the written rows are stamped
--     marks.edited_after_window and the reason goes in the marks.entered
--     audit event. Everything else is D-304's function unchanged.
--   * public.submit_exam_subject: the paper's teacher or an owner/admin.
--     Missing students come back as a warning list and nothing changes,
--     unless the caller confirms (§7 INCOMPLETE_ENTRY is a warning). The
--     paper moves to `submitted`; `marks.submitted` is audited.
--   * public.lock_exam_subject / public.unlock_exam_subject: owner/admin.
--     Lock takes a submitted paper to `locked`. Unlock needs a reason and
--     takes it back to `submitted`; if the exam is `marks_locked`, the exam
--     goes back to `marks_entry` with the same reason, so the existing
--     app.tg_exams_clear_results deletes the results and logs
--     results.cleared. A published exam must be unpublished first.
--   * The paper chain (app.tg_exam_papers_lock) gains its one reversal,
--     locked -> submitted, with a reason; a forward step clears it.
--   * Notifications: F-ID-07 has no delivery yet, so marks.due and
--     marks.submitted are TODO(D-307); the audit events are the record.
-- =====================================================================

alter table public.exam_subjects
  add column if not exists entry_opens_on  date,
  add column if not exists entry_closes_on date,
  add column if not exists status_reason   text
    check (status_reason is null or length(btrim(status_reason)) between 1 and 500);
alter table public.exam_subjects
  add constraint exam_subjects_entry_window_order
  check (entry_opens_on is null or entry_closes_on is null or entry_closes_on >= entry_opens_on);

comment on column public.exam_subjects.entry_opens_on is
  'F-AC-06 §5.11 (D-307): first day a teacher may enter marks; null = the paper''s exam_date.';
comment on column public.exam_subjects.entry_closes_on is
  'F-AC-06 §5.11 (D-307): last day a teacher may enter marks; null = 7 days after it opens.';
comment on column public.exam_subjects.status_reason is
  'F-AC-06 §5.12 (D-307): why the paper was unlocked; cleared by the next forward step.';

alter table public.marks
  add column if not exists edited_after_window boolean not null default false;
comment on column public.marks.edited_after_window is
  'F-AC-06 §5.11 (D-307): an owner/admin last wrote this mark outside the entry window, with a reason (audited).';

-- ---------------------------------------------------------------------
-- The effective window, in one place (the screen mirrors it in
-- packages/domain/src/academic/marks.ts marksEntryWindow).
-- ---------------------------------------------------------------------
create or replace function app.marks_entry_window(p_paper public.exam_subjects,
                                                  out opens_on date, out closes_on date)
language sql
immutable
set search_path = ''
as $$
  -- ponytail: 7 days is §5.11's default; a per-school setting
  -- (grading.entry_window_days) when a school asks for another.
  select coalesce(p_paper.entry_opens_on, p_paper.exam_date),
         coalesce(p_paper.entry_closes_on, coalesce(p_paper.entry_opens_on, p_paper.exam_date) + 7)
$$;

revoke all on function app.marks_entry_window(public.exam_subjects) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- The paper chain gains its reversal (§5.12): locked -> submitted with a
-- reason. Otherwise D-303's function unchanged; a forward step now also
-- clears the reason.
-- ---------------------------------------------------------------------
create or replace function app.tg_exam_papers_lock()
returns trigger
language plpgsql
security definer   -- reads the exam's status whatever the caller's RLS
set search_path = ''
as $$
declare
  v_status public.exam_status;
  v_locked boolean;
  v_chain  text[] := array['pending', 'entering', 'submitted', 'locked'];
begin
  if app.is_privileged_context() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select e.status into v_status from public.exams e
   where e.id = case when tg_op = 'DELETE' then old.exam_id else new.exam_id end;
  if not found then   -- the exam itself is being deleted (a draft): cascade
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_locked := v_status::text in ('marks_entry', 'marks_locked', 'published', 'archived');

  if tg_op = 'DELETE' then
    if v_status <> 'draft' then
      raise exception 'EXAM_NOT_DRAFT' using errcode = '22023';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if v_locked then
      raise exception 'EXAM_LOCKED' using errcode = '22023';
    end if;
    return new;
  end if;

  if tg_table_name = 'exam_sections' then
    if v_locked and (new.exam_id, new.section_id) is distinct from (old.exam_id, old.section_id) then
      raise exception 'EXAM_LOCKED' using errcode = '22023';
    end if;
    return new;
  end if;

  -- exam_subjects
  if v_locked and (new.exam_id, new.section_id, new.subject_id, new.full_marks, new.pass_marks)
                  is distinct from (old.exam_id, old.section_id, old.subject_id, old.full_marks, old.pass_marks) then
    raise exception 'EXAM_LOCKED' using errcode = '22023';
  end if;
  if new.status is distinct from old.status then
    if old.status = 'locked' and new.status = 'submitted' then
      if new.status_reason is null then
        raise exception 'REASON_REQUIRED' using errcode = '22023';
      end if;
    elsif array_position(v_chain, new.status::text) <> array_position(v_chain, old.status::text) + 1 then
      raise exception 'INVALID_TRANSITION' using errcode = '22023',
        detail = format('%s -> %s', old.status, new.status);
    else
      new.status_reason := null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app.tg_exam_papers_lock() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Audit catalogue
-- ---------------------------------------------------------------------
insert into public.audit_action_catalog (action, severity, sentence_en, sentence_bn, is_generic)
values
  ('marks.submitted', 'info', '{actor} submitted an exam paper''s marks',
    '{actor} একটি পরীক্ষার পেপারের নম্বর জমা দিয়েছেন', false),
  ('marks.locked', 'notable', '{actor} locked an exam paper''s marks',
    '{actor} একটি পরীক্ষার পেপারের নম্বর লক করেছেন', false),
  ('marks.unlocked', 'notable', '{actor} unlocked an exam paper''s marks ({reason})',
    '{actor} একটি পরীক্ষার পেপারের নম্বর আনলক করেছেন ({reason})', false)
on conflict (action) do update
  set severity    = excluded.severity,
      sentence_en = excluded.sentence_en,
      sentence_bn = excluded.sentence_bn,
      is_generic  = excluded.is_generic;

-- ---------------------------------------------------------------------
-- public.save_marks — D-304's function plus the entry window (§5.11).
-- ---------------------------------------------------------------------
create or replace function public.save_marks(p_workspace_id uuid, p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_key     text := p_input ->> 'idempotency_key';
  v_hash    bytea;
  v_prior   app.idempotency_keys;
  v_paper   public.exam_subjects;
  v_exam    public.exams;
  v_opens   date;
  v_closes  date;
  v_today   date;
  v_late    boolean;
  v_reason  text;
  v_written integer;
  v_result  jsonb;
begin
  if v_uid is null or not app.has_role(p_workspace_id, array['owner', 'admin', 'teacher']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if jsonb_typeof(p_input) is distinct from 'object'
     or jsonb_typeof(p_input -> 'entries') is distinct from 'array'
     or (case when jsonb_typeof(p_input -> 'entries') = 'array'
              then jsonb_array_length(p_input -> 'entries') not between 1 and 300
              else true end)
     or v_key is null
     or v_key !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(p_input ->> 'exam_subject_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or length(p_input ->> 'late_reason') > 500 then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;
  v_reason := nullif(btrim(p_input ->> 'late_reason'), '');

  -- A replayed save returns what the first one stored.
  perform pg_advisory_xact_lock(hashtext('save_marks'), hashtext(v_key));
  v_hash := sha256(convert_to((p_input - 'idempotency_key')::text, 'UTF8'));
  select * into v_prior from app.idempotency_keys k
   where k.scope = 'save_marks' and k.key = v_key;
  if found then
    if v_prior.user_id is distinct from v_uid
       or v_prior.workspace_id is distinct from p_workspace_id
       or v_prior.request_hash <> v_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
    end if;
    return v_prior.response || jsonb_build_object('replayed', true);
  end if;

  -- The paper row lock serialises two devices saving the same paper.
  select * into v_paper from public.exam_subjects es
   where es.id = (p_input ->> 'exam_subject_id')::uuid and es.workspace_id = p_workspace_id
     for update;
  if not found then
    raise exception 'PAPER_NOT_FOUND' using errcode = '22023';
  end if;
  if not app.can_enter_marks(p_workspace_id, v_paper.id) then
    raise exception 'NOT_ASSIGNED' using errcode = '42501';
  end if;
  select * into v_exam from public.exams e where e.id = v_paper.exam_id;
  if v_exam.status <> 'marks_entry' then
    raise exception 'ENTRY_CLOSED' using errcode = '22023';
  end if;
  if v_paper.status = 'locked' then
    raise exception 'SUBJECT_LOCKED' using errcode = '42501';
  end if;

  -- §5.11: teachers inside the window; an owner/admin beyond it, with a
  -- reason, stamped (like attendance's edited_after_window, D-104).
  select w.opens_on, w.closes_on into v_opens, v_closes from app.marks_entry_window(v_paper) w;
  v_today := app.school_today(p_workspace_id);
  v_late := coalesce(v_today < v_opens, false) or coalesce(v_today > v_closes, false);
  if v_late then
    if not app.has_role(p_workspace_id, array['owner', 'admin']) then
      raise exception 'OUTSIDE_ENTRY_WINDOW' using errcode = '42501';
    end if;
    if v_reason is null then
      raise exception 'REASON_REQUIRED' using errcode = '22023';
    end if;
  end if;

  create temp table if not exists pg_temp.mk_expected (student_id uuid primary key, enrollment_id uuid) on commit drop;
  create temp table if not exists pg_temp.mk_given (
    student_id uuid, status public.mark_status, obtained numeric,
    expected_updated_at timestamptz, issue text) on commit drop;
  truncate pg_temp.mk_expected, pg_temp.mk_given;

  insert into pg_temp.mk_expected
  select e.student_id, e.id
    from public.enrollments e
    join public.students st on st.id = e.student_id
   where e.section_id = v_paper.section_id
     and e.workspace_id = p_workspace_id
     and e.status = 'active'
     and st.status = 'active'
     and st.deleted_at is null;

  begin
    insert into pg_temp.mk_given (student_id, status, obtained, expected_updated_at)
    select x.student_id, x.status, x.obtained, x.expected_updated_at
      from jsonb_to_recordset(p_input -> 'entries')
        as x(student_id uuid, status public.mark_status, obtained numeric, expected_updated_at timestamptz);
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'VALIDATION' using errcode = '22023';
  end;

  if exists (select 1 from pg_temp.mk_given g
              where g.student_id is null or g.status is null
                 or (g.status = 'entered') <> (g.obtained is not null))
     or (select count(*) from pg_temp.mk_given)
        <> (select count(distinct g.student_id) from pg_temp.mk_given g) then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;
  if exists (select 1 from pg_temp.mk_given g
              where not exists (select 1 from pg_temp.mk_expected x where x.student_id = g.student_id)) then
    raise exception 'STUDENT_NOT_ENROLLED' using errcode = '22023';
  end if;

  -- Per-row checks: the rest of the rows still save (§4.2, AC12).
  update pg_temp.mk_given g
     set issue = 'MARK_OUT_OF_RANGE'
   where g.obtained is not null
     and (g.obtained < 0 or g.obtained > v_paper.full_marks or g.obtained <> round(g.obtained, 2));
  update pg_temp.mk_given g
     set issue = 'CONFLICT'
   where g.issue is null
     and g.expected_updated_at is distinct from
         (select mk.updated_at from public.marks mk
           where mk.exam_subject_id = v_paper.id and mk.student_id = g.student_id);

  if app.current_correlation_id() is null then
    perform set_config('app.correlation_id', gen_random_uuid()::text, true);
  end if;

  insert into public.marks
    (workspace_id, exam_subject_id, student_id, enrollment_id, status, obtained, entered_by, created_by,
     edited_after_window)
  select p_workspace_id, v_paper.id, g.student_id, x.enrollment_id, g.status, g.obtained, v_uid, v_uid, v_late
    from pg_temp.mk_given g
    join pg_temp.mk_expected x on x.student_id = g.student_id
   where g.issue is null
  on conflict (exam_subject_id, student_id) do update
     set status = excluded.status, obtained = excluded.obtained,
         enrollment_id = excluded.enrollment_id, entered_by = excluded.entered_by,
         edited_after_window = excluded.edited_after_window
   where (public.marks.status, public.marks.obtained)
         is distinct from (excluded.status, excluded.obtained);
  get diagnostics v_written = row_count;

  if v_written > 0 then
    perform app.log_audit_event('marks.entered', p_workspace_id, 'exam_subjects', v_paper.id,
      null, jsonb_build_object('written', v_written, 'exam_id', v_paper.exam_id)
            || case when v_late then jsonb_build_object('late_reason', v_reason) else '{}'::jsonb end);
  end if;

  if v_paper.status = 'pending' and exists (select 1 from pg_temp.mk_given g where g.issue is null) then
    update public.exam_subjects set status = 'entering' where id = v_paper.id;
  end if;

  v_result := jsonb_build_object(
    'saved', (select count(*) from pg_temp.mk_given g where g.issue is null),
    'rejected', coalesce((select jsonb_agg(jsonb_build_object('student_id', g.student_id, 'issue', g.issue)
                                           order by g.student_id)
                            from pg_temp.mk_given g where g.issue is not null), '[]'::jsonb),
    'marks', coalesce((select jsonb_agg(jsonb_build_object(
                                'student_id', mk.student_id, 'status', mk.status,
                                'obtained', mk.obtained, 'updated_at', mk.updated_at)
                              order by mk.student_id)
                         from public.marks mk
                         join pg_temp.mk_given g on g.student_id = mk.student_id
                        where mk.exam_subject_id = v_paper.id), '[]'::jsonb),
    'entered', (select count(*) from public.marks mk
                 join pg_temp.mk_expected x on x.student_id = mk.student_id
                where mk.exam_subject_id = v_paper.id),
    'enrolled', (select count(*) from pg_temp.mk_expected));

  insert into app.idempotency_keys
    (scope, key, workspace_id, user_id, request_hash, status, response, completed_at)
  values
    ('save_marks', v_key, p_workspace_id, v_uid, v_hash, 'succeeded', v_result, now());

  return v_result || jsonb_build_object('replayed', false);
end;
$$;

comment on function public.save_marks(uuid, jsonb) is
  'F-AC-06 §4.2 saveMarks (D-304, window D-307): upserts a paper''s marks '
  'in one statement. Only an owner/admin, the paper''s teacher or the class '
  'teacher; only while the exam is in marks_entry, the paper is not locked '
  'and (for a teacher) today is inside the entry window — an owner/admin '
  'outside it gives late_reason and the rows are stamped edited_after_window; '
  'only students enrolled in the paper''s section. Per row: MARK_OUT_OF_RANGE '
  'or CONFLICT (stale expected_updated_at) rejects that row, the rest save. '
  'Raises FORBIDDEN, VALIDATION, IDEMPOTENCY_KEY_REUSED, PAPER_NOT_FOUND, '
  'NOT_ASSIGNED, ENTRY_CLOSED, SUBJECT_LOCKED, OUTSIDE_ENTRY_WINDOW, '
  'REASON_REQUIRED, STUDENT_NOT_ENROLLED; PLAN_READ_ONLY comes from the table guard.';

revoke all on function public.save_marks(uuid, jsonb) from public, anon;
grant execute on function public.save_marks(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- public.submit_exam_subject — §7 submitExamSubject.
-- ---------------------------------------------------------------------
create or replace function public.submit_exam_subject(
  p_workspace_id uuid, p_exam_subject_id uuid, p_confirm_incomplete boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_paper   public.exam_subjects;
  v_status  public.exam_status;
  v_missing jsonb;
begin
  if auth.uid() is null or not app.has_role(p_workspace_id, array['owner', 'admin', 'teacher']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_paper from public.exam_subjects es
   where es.id = p_exam_subject_id and es.workspace_id = p_workspace_id
     for update;
  if not found then
    raise exception 'PAPER_NOT_FOUND' using errcode = '22023';
  end if;
  -- The paper's own teacher, not the class teacher (who may only enter).
  if not (app.has_role(p_workspace_id, array['owner', 'admin'])
          or exists (select 1 from public.workspace_members m
                      where m.id = v_paper.teacher_id and m.workspace_id = p_workspace_id
                        and m.user_id = auth.uid() and m.status = 'active'
                        and m.role in ('owner', 'admin', 'teacher'))) then
    raise exception 'NOT_ASSIGNED' using errcode = '42501';
  end if;
  select e.status into v_status from public.exams e where e.id = v_paper.exam_id;
  if v_status <> 'marks_entry' then
    raise exception 'ENTRY_CLOSED' using errcode = '22023';
  end if;
  if v_paper.status = 'locked' then
    raise exception 'SUBJECT_LOCKED' using errcode = '42501';
  end if;

  -- The students with no mark yet, counted like app.exam_marks_missing.
  select coalesce(jsonb_agg(jsonb_build_object(
           'student_id', st.id, 'full_name', st.full_name, 'full_name_bn', st.full_name_bn,
           'roll_number', e.roll_number) order by e.roll_number nulls last, st.full_name), '[]'::jsonb)
    into v_missing
    from public.enrollments e
    join public.students st on st.id = e.student_id and st.status = 'active' and st.deleted_at is null
   where e.section_id = v_paper.section_id and e.workspace_id = p_workspace_id and e.status = 'active'
     and not exists (select 1 from public.marks mk
                      where mk.exam_subject_id = v_paper.id and mk.student_id = e.student_id);

  if v_paper.status = 'submitted' then
    return jsonb_build_object('submitted', true, 'missing', v_missing);
  end if;
  -- §7 INCOMPLETE_ENTRY is a warning: nothing changes until it is confirmed.
  if jsonb_array_length(v_missing) > 0 and not coalesce(p_confirm_incomplete, false) then
    return jsonb_build_object('submitted', false, 'missing', v_missing);
  end if;

  if app.current_correlation_id() is null then
    perform set_config('app.correlation_id', gen_random_uuid()::text, true);
  end if;
  if v_paper.status = 'pending' then
    update public.exam_subjects set status = 'entering' where id = v_paper.id;
  end if;
  update public.exam_subjects set status = 'submitted' where id = v_paper.id;
  perform app.log_audit_event('marks.submitted', p_workspace_id, 'exam_subjects', v_paper.id,
    null, jsonb_build_object('exam_id', v_paper.exam_id, 'missing', jsonb_array_length(v_missing)));
  -- TODO(D-307): marks.submitted notification to the school's admins once
  -- F-ID-07 delivers (Parts 2-5); the audit event is the record until then.
  -- marks.due (1 day before entry_closes_on) waits for the same.

  return jsonb_build_object('submitted', true, 'missing', v_missing);
end;
$$;

comment on function public.submit_exam_subject(uuid, uuid, boolean) is
  'F-AC-06 §7 submitExamSubject (D-307): the paper''s teacher or an owner/admin, '
  'while the exam is in marks_entry. Returns {submitted, missing[]}; with '
  'students missing and no confirmation nothing changes (the INCOMPLETE_ENTRY '
  'warning). Raises FORBIDDEN, PAPER_NOT_FOUND, NOT_ASSIGNED, ENTRY_CLOSED, '
  'SUBJECT_LOCKED; PLAN_READ_ONLY comes from the table guard.';

revoke all on function public.submit_exam_subject(uuid, uuid, boolean) from public, anon;
grant execute on function public.submit_exam_subject(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- public.lock_exam_subject / public.unlock_exam_subject — §7, owner/admin.
-- ---------------------------------------------------------------------
create or replace function public.lock_exam_subject(p_workspace_id uuid, p_exam_subject_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_paper public.exam_subjects;
begin
  if auth.uid() is null or not app.has_role(p_workspace_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_paper from public.exam_subjects es
   where es.id = p_exam_subject_id and es.workspace_id = p_workspace_id
     for update;
  if not found then
    raise exception 'PAPER_NOT_FOUND' using errcode = '22023';
  end if;
  if v_paper.status = 'locked' then
    raise exception 'ALREADY_LOCKED' using errcode = '22023';
  end if;
  if v_paper.status <> 'submitted' then
    raise exception 'NOT_SUBMITTED' using errcode = '22023';
  end if;

  if app.current_correlation_id() is null then
    perform set_config('app.correlation_id', gen_random_uuid()::text, true);
  end if;
  update public.exam_subjects set status = 'locked' where id = v_paper.id;
  perform app.log_audit_event('marks.locked', p_workspace_id, 'exam_subjects', v_paper.id,
    null, jsonb_build_object('exam_id', v_paper.exam_id));
end;
$$;

comment on function public.lock_exam_subject(uuid, uuid) is
  'F-AC-06 §7 lockExamSubject (D-307): owner/admin; submitted -> locked, audited. '
  'Raises FORBIDDEN, PAPER_NOT_FOUND, ALREADY_LOCKED, NOT_SUBMITTED.';

revoke all on function public.lock_exam_subject(uuid, uuid) from public, anon;
grant execute on function public.lock_exam_subject(uuid, uuid) to authenticated;

create or replace function public.unlock_exam_subject(
  p_workspace_id uuid, p_exam_subject_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_paper  public.exam_subjects;
  v_status public.exam_status;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null or not app.has_role(p_workspace_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_reason is null or length(v_reason) > 500 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  select * into v_paper from public.exam_subjects es
   where es.id = p_exam_subject_id and es.workspace_id = p_workspace_id
     for update;
  if not found then
    raise exception 'PAPER_NOT_FOUND' using errcode = '22023';
  end if;
  if v_paper.status <> 'locked' then
    raise exception 'NOT_LOCKED' using errcode = '22023';
  end if;
  select e.status into v_status from public.exams e where e.id = v_paper.exam_id for update;
  if v_status in ('published', 'archived') then
    raise exception 'EXAM_PUBLISHED' using errcode = '22023';
  end if;

  if app.current_correlation_id() is null then
    perform set_config('app.correlation_id', gen_random_uuid()::text, true);
  end if;
  update public.exam_subjects set status = 'submitted', status_reason = v_reason where id = v_paper.id;
  perform app.log_audit_event('marks.unlocked', p_workspace_id, 'exam_subjects', v_paper.id,
    null, jsonb_build_object('exam_id', v_paper.exam_id, 'reason', v_reason));
  -- Marks can change again, so results computed from them are stale: the
  -- exam goes back to marks_entry and app.tg_exams_clear_results deletes
  -- them (results.cleared).
  if v_status = 'marks_locked' then
    update public.exams set status = 'marks_entry', status_reason = v_reason where id = v_paper.exam_id;
  end if;
end;
$$;

comment on function public.unlock_exam_subject(uuid, uuid, text) is
  'F-AC-06 §7 unlockExamSubject (D-307): owner/admin, a reason; locked -> '
  'submitted, audited with the reason. On a marks_locked exam the exam goes '
  'back to marks_entry, which clears its results (results.cleared). Raises '
  'FORBIDDEN, REASON_REQUIRED, PAPER_NOT_FOUND, NOT_LOCKED, EXAM_PUBLISHED.';

revoke all on function public.unlock_exam_subject(uuid, uuid, text) from public, anon;
grant execute on function public.unlock_exam_subject(uuid, uuid, text) to authenticated;
