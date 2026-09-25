-- =====================================================================
-- F-AC-02 demo cut — students, their private details, guardians and
-- enrolments (Parts 1, 2 and the contact half of Part 4; D-103).
--
-- Builds on sections (20260925300304, D-102). Same trigger set as every
-- tenant table: tenant freeze, updated_at, generic audit + catalogue rows,
-- require_writable (D-300), immutable created_by.
--
-- Children's data (COMPLIANCE-PDPA §4.1), so the rules live here, not in
-- the app:
--   * RLS is row-level, so the sensitive fields sit in their own tables
--     (the D-63 pattern): date of birth in `student_private_details`, the
--     guardian's name and phone in `guardians`. Both are readable only by
--     owner/admin and the class teacher of the student's live section
--     (`app.can_read_student_private`). Teachers and staff read the
--     roster (`students`, `enrollments`); parents read nothing yet;
--     platform staff read nothing (PDPA §4.1 "never by default").
--   * Every foreign key between tenant rows is composite with
--     workspace_id, so no row can point into another school.
--   * A student is created only through `public.admit_student`: one
--     transaction for the student, their private details, the primary
--     guardian and the enrolment, with the code from app.next_id and the
--     roll number assigned under a section lock.
-- =====================================================================

do $$ begin
  create type public.student_gender as enum ('male', 'female', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.student_status as enum
    ('draft', 'active', 'inactive', 'transferred_out', 'graduated', 'removed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.enrollment_status as enum ('active', 'transferred', 'withdrawn', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.guardian_relation as enum
    ('father', 'mother', 'brother', 'sister', 'uncle', 'aunt', 'grandparent', 'legal_guardian', 'other');
exception when duplicate_object then null; end $$;

-- Target for enrolments' composite key: the section AND its year, so an
-- enrolment's academic_year_id can never disagree with its section's.
alter table public.sections
  add constraint sections_id_year_workspace_key unique (id, academic_year_id, workspace_id);

-- ---------------------------------------------------------------------
-- students — the roster record. Nothing sensitive lives here.
-- ---------------------------------------------------------------------
create table if not exists public.students (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  student_code text not null check (length(student_code) between 1 and 30),
  first_name   text not null check (length(btrim(first_name)) between 1 and 60),
  last_name    text not null check (length(btrim(last_name)) between 1 and 60),
  full_name    text generated always as (first_name || ' ' || last_name) stored,
  full_name_bn text check (full_name_bn is null or length(btrim(full_name_bn)) between 1 and 120),
  gender       public.student_gender not null,
  status       public.student_status not null default 'active',
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles (id) on delete set null,
  constraint students_id_workspace_key unique (id, workspace_id)
);

comment on table public.students is
  'F-AC-02 / DATA-MODEL.md §2: the child record, roster fields only. Date of '
  'birth is in student_private_details and guardians hold contact data, so '
  'every column here is safe for any teacher or staff member (D-103). '
  'Created only by public.admit_student. Soft delete (deleted_at).';

create unique index if not exists students_workspace_code_key
  on public.students (workspace_id, student_code);
-- justification: F-AC-02 §3, one code per school; also the exact-code search.
create index if not exists students_workspace_status_idx
  on public.students (workspace_id, status) where deleted_at is null;
-- justification: the default roster filter.
create index if not exists students_full_name_trgm
  on public.students using gin (full_name extensions.gin_trgm_ops);
create index if not exists students_full_name_bn_trgm
  on public.students using gin (full_name_bn extensions.gin_trgm_ops);
-- justification: §5.13 server-side ILIKE search, in English and Bangla.
create index if not exists students_created_by_idx
  on public.students (created_by) where created_by is not null;

-- ---------------------------------------------------------------------
-- student_private_details — 1:1 with students, the sensitive fields
-- ---------------------------------------------------------------------
create table if not exists public.student_private_details (
  student_id    uuid primary key,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  date_of_birth date not null check (date_of_birth >= date '1950-01-01'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles (id) on delete set null,
  constraint student_private_details_student_fkey
    foreign key (student_id, workspace_id) references public.students (id, workspace_id)
    on delete cascade
);

comment on table public.student_private_details is
  'F-AC-02 §5.14 / COMPLIANCE-PDPA §4.1: a student''s sensitive fields, split '
  'from students because RLS is row-level (the D-63 pattern). Readable by '
  'owner/admin and the class teacher of the student''s live section only '
  '(app.can_read_student_private). Address and health join here later.';

create index if not exists student_private_details_workspace_idx
  on public.student_private_details (workspace_id);
create index if not exists student_private_details_created_by_idx
  on public.student_private_details (created_by) where created_by is not null;

-- ---------------------------------------------------------------------
-- guardians — contact data, not users (PRODUCT-DECISIONS 1.13)
-- ---------------------------------------------------------------------
create table if not exists public.guardians (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  student_id   uuid not null,
  relation     public.guardian_relation not null,
  full_name    text not null check (length(btrim(full_name)) between 1 and 120),
  full_name_bn text check (full_name_bn is null or length(btrim(full_name_bn)) between 1 and 120),
  phone        text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles (id) on delete set null,
  constraint guardians_student_fkey
    foreign key (student_id, workspace_id) references public.students (id, workspace_id)
    on delete cascade
);

comment on table public.guardians is
  'F-AC-02 §3: a student''s guardian as contact data (phone in E.164). '
  'Readable by owner/admin and the student''s class teacher only (PDPA §4.1). '
  'A parent account is linked later through guardian_users (Part 4).';

create index if not exists guardians_workspace_student_idx
  on public.guardians (workspace_id, student_id);
create unique index if not exists guardians_one_primary
  on public.guardians (student_id) where is_primary;
-- justification: §5.9, exactly one primary guardian per student.
create index if not exists guardians_workspace_phone_idx
  on public.guardians (workspace_id, phone);
-- justification: §5.13 search by guardian phone; siblings by shared phone.
create index if not exists guardians_created_by_idx
  on public.guardians (created_by) where created_by is not null;

-- ---------------------------------------------------------------------
-- enrollments — one student, one section, one academic year
-- ---------------------------------------------------------------------
create table if not exists public.enrollments (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  student_id       uuid not null,
  academic_year_id uuid not null,
  section_id       uuid not null,
  roll_number      integer check (roll_number is null or roll_number between 1 and 9999),
  status           public.enrollment_status not null default 'active',
  enrolled_on      date not null default current_date,
  ended_on         date check (ended_on is null or ended_on >= enrolled_on),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references public.profiles (id) on delete set null,
  constraint enrollments_student_fkey
    foreign key (student_id, workspace_id) references public.students (id, workspace_id),
  constraint enrollments_section_fkey
    foreign key (section_id, academic_year_id, workspace_id)
    references public.sections (id, academic_year_id, workspace_id)
);

comment on table public.enrollments is
  'F-AC-02 §3 / PRODUCT-DECISIONS 2.3: a student in one section for one '
  'academic year. The section key includes the year, so the two cannot '
  'disagree. History is kept: a transfer closes a row, it never edits one.';

create unique index if not exists enrollments_one_active_per_year
  on public.enrollments (student_id, academic_year_id) where status = 'active';
-- justification: §5.4, one active enrolment per student per academic year.
create unique index if not exists enrollments_section_roll_key
  on public.enrollments (section_id, roll_number)
  where status = 'active' and roll_number is not null;
-- justification: §5.5, roll numbers unique among a section's active
-- enrolments (a section belongs to exactly one year).
create index if not exists enrollments_workspace_section_idx
  on public.enrollments (workspace_id, section_id, status);
-- justification: the class list / roll call.
create index if not exists enrollments_student_idx on public.enrollments (student_id);
create index if not exists enrollments_created_by_idx
  on public.enrollments (created_by) where created_by is not null;

-- ---------------------------------------------------------------------
-- The one sensitivity rule: owner/admin, or the class teacher of the
-- student's live section.
-- ---------------------------------------------------------------------
create or replace function app.can_read_student_private(p_workspace_id uuid, p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_role(p_workspace_id, array['owner', 'admin'])
      or exists (
           select 1
             from public.enrollments e
             join public.sections s on s.id = e.section_id
             join public.workspace_members m on m.id = s.class_teacher_id
            where e.workspace_id = p_workspace_id
              and e.student_id = p_student_id
              and e.status = 'active'
              and s.archived_at is null
              and m.user_id = auth.uid()
              and m.status = 'active')
$$;

comment on function app.can_read_student_private(uuid, uuid) is
  'F-AC-02 §2 students.read_sensitive (D-103): true for an active owner/admin '
  'of the workspace, or the active class teacher of the student''s live '
  'section. Used by the student_private_details and guardians policies.';

revoke all on function app.can_read_student_private(uuid, uuid) from public, anon;
grant execute on function app.can_read_student_private(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Triggers, audit catalogue
-- ---------------------------------------------------------------------
select app.attach_freeze_workspace('public.students');
select app.attach_updated_at('public.students');
select app.attach_audit('public.students');
select app.attach_require_writable('public.students');
select app.attach_freeze_workspace('public.student_private_details');
select app.attach_updated_at('public.student_private_details');
select app.attach_audit('public.student_private_details');
select app.attach_require_writable('public.student_private_details');
select app.attach_freeze_workspace('public.guardians');
select app.attach_updated_at('public.guardians');
select app.attach_audit('public.guardians');
select app.attach_require_writable('public.guardians');
select app.attach_freeze_workspace('public.enrollments');
select app.attach_updated_at('public.enrollments');
select app.attach_audit('public.enrollments');
select app.attach_require_writable('public.enrollments');

create trigger created_by_immutable before update on public.students
  for each row execute function app.tg_created_by_immutable();
create trigger created_by_immutable before update on public.student_private_details
  for each row execute function app.tg_created_by_immutable();
create trigger created_by_immutable before update on public.guardians
  for each row execute function app.tg_created_by_immutable();
create trigger created_by_immutable before update on public.enrollments
  for each row execute function app.tg_created_by_immutable();

do $$
declare
  v_table  text;
  v_tables text[] := array['students', 'student_private_details', 'guardians', 'enrollments'];
begin
  foreach v_table in array v_tables loop
    insert into public.audit_action_catalog (action, severity, sentence_en, sentence_bn, is_generic)
    values
      (v_table || '.insert', 'info',
        '{actor} created a ' || replace(v_table, '_', ' ') || ' record',
        '{actor} একটি ' || replace(v_table, '_', ' ') || ' রেকর্ড তৈরি করেছেন', true),
      (v_table || '.update', 'notable',
        '{actor} updated a ' || replace(v_table, '_', ' ') || ' record ({fields})',
        '{actor} একটি ' || replace(v_table, '_', ' ') || ' রেকর্ড হালনাগাদ করেছেন ({fields})', true),
      (v_table || '.delete', 'critical',
        '{actor} deleted a ' || replace(v_table, '_', ' ') || ' record',
        '{actor} একটি ' || replace(v_table, '_', ' ') || ' রেকর্ড মুছে ফেলেছেন', true)
    on conflict (action) do update
      set severity    = excluded.severity,
          sentence_en = excluded.sentence_en,
          sentence_bn = excluded.sentence_bn,
          is_generic  = excluded.is_generic;
  end loop;
end
$$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.students enable row level security;
alter table public.student_private_details enable row level security;
alter table public.guardians enable row level security;
alter table public.enrollments enable row level security;

-- students: the roster. Soft-deleted rows only for owner/admin (§2).
drop policy if exists students_select on public.students;
create policy students_select on public.students
  for select to authenticated
  using (
    app.has_role(workspace_id, array['owner', 'admin'])
    or (deleted_at is null and app.has_role(workspace_id, array['teacher', 'staff']))
  );
drop policy if exists students_update on public.students;
create policy students_update on public.students
  for update to authenticated
  using      (app.has_role(workspace_id, array['owner', 'admin']))
  with check (app.has_role(workspace_id, array['owner', 'admin']));

drop policy if exists student_private_details_select on public.student_private_details;
create policy student_private_details_select on public.student_private_details
  for select to authenticated
  using (app.can_read_student_private(workspace_id, student_id));
drop policy if exists student_private_details_update on public.student_private_details;
create policy student_private_details_update on public.student_private_details
  for update to authenticated
  using      (app.has_role(workspace_id, array['owner', 'admin']))
  with check (app.has_role(workspace_id, array['owner', 'admin']));

drop policy if exists guardians_select on public.guardians;
create policy guardians_select on public.guardians
  for select to authenticated
  using (app.can_read_student_private(workspace_id, student_id));
drop policy if exists guardians_insert on public.guardians;
create policy guardians_insert on public.guardians
  for insert to authenticated
  with check (
    app.has_role(workspace_id, array['owner', 'admin'])
    and created_by = (select auth.uid())
  );
drop policy if exists guardians_update on public.guardians;
create policy guardians_update on public.guardians
  for update to authenticated
  using      (app.has_role(workspace_id, array['owner', 'admin']))
  with check (app.has_role(workspace_id, array['owner', 'admin']));
drop policy if exists guardians_delete on public.guardians;
create policy guardians_delete on public.guardians
  for delete to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin']));

drop policy if exists enrollments_select on public.enrollments;
create policy enrollments_select on public.enrollments
  for select to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin', 'teacher', 'staff']));
drop policy if exists enrollments_update on public.enrollments;
create policy enrollments_update on public.enrollments
  for update to authenticated
  using      (app.has_role(workspace_id, array['owner', 'admin']))
  with check (app.has_role(workspace_id, array['owner', 'admin']));

-- Students, their private details and enrolments are created only by
-- public.admit_student (no INSERT grant); students are soft-deleted and
-- enrolments are history (no DELETE grant). Guardians are plain contact rows.
revoke all on public.students, public.student_private_details, public.guardians, public.enrollments
  from anon, authenticated;
grant select, update on public.students to authenticated;
grant select, update on public.student_private_details to authenticated;
grant select, insert, update, delete on public.guardians to authenticated;
grant select, update on public.enrollments to authenticated;

-- ---------------------------------------------------------------------
-- student_roster — the roster projection (§4.9): a student with their
-- live enrolment's section and roll. security_invoker, so it shows only
-- what the caller's own RLS on every joined table allows; it carries no
-- private field by construction.
-- ---------------------------------------------------------------------
create or replace view public.student_roster
with (security_invoker = true) as
select st.id,
       st.workspace_id,
       st.student_code,
       st.full_name,
       st.full_name_bn,
       st.gender,
       st.status,
       st.deleted_at,
       e.section_id,
       e.roll_number,
       se.name        as section_name,
       g.name         as grade_name,
       g.name_bn      as grade_name_bn,
       g.level_number as grade_level_number
  from public.students st
  left join public.enrollments e
    on e.student_id = st.id and e.status = 'active'
  left join public.sections se on se.id = e.section_id
  left join public.grade_levels g on g.id = se.grade_level_id;

comment on view public.student_roster is
  'F-AC-02 §4.9 (D-103): students with their active enrolment, for the '
  'roster and search. security_invoker: the caller''s RLS applies to every '
  'joined table. No private column. A student with active enrolments in two '
  'years (after promotion, before the old one closes) appears once per year.';

revoke all on public.student_roster from anon, authenticated;
grant select on public.student_roster to authenticated;

-- ---------------------------------------------------------------------
-- public.admit_student — F-AC-02 §4.1 quick admit, one transaction.
-- ---------------------------------------------------------------------
create or replace function public.admit_student(p_workspace_id uuid, p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_key        text := p_input ->> 'idempotency_key';
  v_hash       bytea;
  v_prior      app.idempotency_keys;
  v_guardian   jsonb := p_input -> 'guardian';
  v_section    public.sections;
  v_is_current boolean;
  v_dob        date;
  v_roll       integer;
  v_student_id uuid := gen_random_uuid();
  v_enroll_id  uuid := gen_random_uuid();
  v_code       text;
  v_constraint text;
  v_result     jsonb;
begin
  if v_uid is null or not app.has_role(p_workspace_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if jsonb_typeof(p_input) is distinct from 'object'
     or jsonb_typeof(v_guardian) is distinct from 'object'
     or v_key is null
     or v_key !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or (p_input ->> 'section_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or (p_input ->> 'date_of_birth') !~ '^\d{4}-\d{2}-\d{2}$'
     or (p_input ? 'roll_number' and jsonb_typeof(p_input -> 'roll_number') not in ('number', 'null')) then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

  v_dob := (p_input ->> 'date_of_birth')::date;
  if v_dob > current_date then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

  -- A double tap replays the first admission instead of making a twin.
  perform pg_advisory_xact_lock(hashtext('admit_student'), hashtext(v_key));
  v_hash := sha256(convert_to((p_input - 'idempotency_key')::text, 'UTF8'));
  select * into v_prior
    from app.idempotency_keys k
   where k.scope = 'admit_student' and k.key = v_key;
  if found then
    if v_prior.user_id is distinct from v_uid
       or v_prior.workspace_id is distinct from p_workspace_id
       or v_prior.request_hash <> v_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
    end if;
    return v_prior.response || jsonb_build_object('replayed', true);
  end if;

  -- The section row lock serialises roll-number assignment per section.
  select * into v_section
    from public.sections s
   where s.id = (p_input ->> 'section_id')::uuid
     and s.workspace_id = p_workspace_id
     for update;
  if not found then
    raise exception 'SECTION_NOT_FOUND' using errcode = '22023';
  end if;
  if v_section.archived_at is not null then
    raise exception 'SECTION_ARCHIVED' using errcode = '22023';
  end if;
  select y.is_current into v_is_current
    from public.academic_years y where y.id = v_section.academic_year_id;
  if not coalesce(v_is_current, false) then
    raise exception 'YEAR_CLOSED' using errcode = '22023';
  end if;

  v_roll := (p_input ->> 'roll_number')::integer;
  if v_roll is null then
    select coalesce(max(e.roll_number), 0) + 1 into v_roll
      from public.enrollments e
     where e.section_id = v_section.id and e.status = 'active';
  end if;

  -- One correlation id for every audit row this admission writes (§4.1).
  if app.current_correlation_id() is null then
    perform set_config('app.correlation_id', gen_random_uuid()::text, true);
  end if;

  v_code := app.next_id(p_workspace_id, 'student');

  begin
    insert into public.students
      (id, workspace_id, student_code, first_name, last_name, full_name_bn, gender, created_by)
    values
      (v_student_id, p_workspace_id, v_code,
       btrim(p_input ->> 'first_name'), btrim(p_input ->> 'last_name'),
       nullif(btrim(coalesce(p_input ->> 'full_name_bn', '')), ''),
       (p_input ->> 'gender')::public.student_gender, v_uid);

    insert into public.student_private_details (student_id, workspace_id, date_of_birth, created_by)
    values (v_student_id, p_workspace_id, v_dob, v_uid);

    insert into public.guardians
      (workspace_id, student_id, relation, full_name, full_name_bn, phone, is_primary, created_by)
    values
      (p_workspace_id, v_student_id,
       (v_guardian ->> 'relation')::public.guardian_relation,
       btrim(v_guardian ->> 'full_name'),
       nullif(btrim(coalesce(v_guardian ->> 'full_name_bn', '')), ''),
       v_guardian ->> 'phone', true, v_uid);

    insert into public.enrollments
      (id, workspace_id, student_id, academic_year_id, section_id, roll_number, created_by)
    values
      (v_enroll_id, p_workspace_id, v_student_id, v_section.academic_year_id,
       v_section.id, v_roll, v_uid);
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'enrollments_section_roll_key' then
        raise exception 'ROLL_TAKEN' using errcode = '23505';
      end if;
      raise;
    when invalid_text_representation or check_violation or not_null_violation then
      raise exception 'VALIDATION' using errcode = '22023';
  end;

  v_result := jsonb_build_object(
    'student_id', v_student_id,
    'student_code', v_code,
    'enrollment_id', v_enroll_id,
    'roll_number', v_roll);

  insert into app.idempotency_keys
    (scope, key, workspace_id, user_id, request_hash, status, response, completed_at)
  values
    ('admit_student', v_key, p_workspace_id, v_uid, v_hash, 'succeeded', v_result, now());

  return v_result || jsonb_build_object('replayed', false);
end;
$$;

comment on function public.admit_student(uuid, jsonb) is
  'F-AC-02 §4.1 quick admit (D-103): owner/admin only. One transaction: the '
  'student (code from app.next_id), private details, primary guardian and '
  'an active enrolment in a live section of the current year, roll number '
  'given or next free. Idempotent by idempotency_key. Raises FORBIDDEN, '
  'VALIDATION, IDEMPOTENCY_KEY_REUSED, SECTION_NOT_FOUND, SECTION_ARCHIVED, '
  'YEAR_CLOSED, ROLL_TAKEN; PLAN_READ_ONLY comes from the table guard.';

revoke all on function public.admit_student(uuid, jsonb) from public, anon;
grant execute on function public.admit_student(uuid, jsonb) to authenticated;
