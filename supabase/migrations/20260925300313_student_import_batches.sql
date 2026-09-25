-- =====================================================================
-- F-AC-02 §4.7 bulk student import, demo cut (D-106).
--
-- `student_import_batches` keeps the validation report, so the preview
-- and the result survive the page. The app parses and validates the file
-- and inserts the batch (status 'preview'); `public.import_student_batch`
-- then admits the valid rows, a chunk per call, each through
-- `public.admit_student` — the one door for creating a student (D-103), so
-- codes, roll numbers, audit rows and every rule are the quick-admit ones.
--
-- Idempotent twice over: the batch row is locked and every row's outcome is
-- written back in the same transaction as its admission, and each row's
-- admit_student key is derived from (batch id, line), so a retried or
-- double-tapped import never admits a row twice.
-- =====================================================================

do $$ begin
  create type public.import_status as enum
    ('validating', 'preview', 'importing', 'completed', 'failed');
exception when duplicate_object then null; end $$;

create table if not exists public.student_import_batches (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  filename      text not null check (length(btrim(filename)) between 1 and 200),
  status        public.import_status not null default 'preview',
  total_rows    integer not null check (total_rows between 0 and 2000),
  valid_rows    integer not null check (valid_rows >= 0),
  error_rows    integer not null check (error_rows >= 0),
  created_count integer not null default 0 check (created_count >= 0),
  -- { rows: [ { line, status: valid|error|created|failed, errors: [{column, code}],
  --             input?: admit_student payload, raw?: {column: text}, student_code? } ],
  --   warnings: [ {code, column} ] }
  report        jsonb not null,
  finished_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles (id) on delete set null,
  constraint student_import_batches_counts_check
    check (valid_rows + error_rows = total_rows and created_count <= valid_rows),
  constraint student_import_batches_report_check
    check (case when jsonb_typeof(report -> 'rows') = 'array'
                then jsonb_array_length(report -> 'rows') = total_rows
                else false end)
);

comment on table public.student_import_batches is
  'F-AC-02 §3 / §4.7 (D-106): one uploaded student register and its per-row '
  'validation report (line, errors, the admission payload, the resulting '
  'student code). Owner/admin only. Inserted by the app in status preview; '
  'only public.import_student_batch changes it.';

create index if not exists student_import_batches_workspace_created_idx
  on public.student_import_batches (workspace_id, created_at desc);
-- justification: §3, "recent imports" newest first.
create index if not exists student_import_batches_created_by_idx
  on public.student_import_batches (created_by) where created_by is not null;

select app.attach_freeze_workspace('public.student_import_batches');
select app.attach_updated_at('public.student_import_batches');
-- The report holds children's dates of birth and guardians' phones: the
-- audit row names it as changed, never its value (the D-103 rule).
select app.attach_audit('public.student_import_batches', '{}', array['report']);
select app.attach_require_writable('public.student_import_batches');
create trigger created_by_immutable before update on public.student_import_batches
  for each row execute function app.tg_created_by_immutable();

do $$
declare
  v_table  text;
  v_tables text[] := array['student_import_batches'];
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

alter table public.student_import_batches enable row level security;

drop policy if exists student_import_batches_select on public.student_import_batches;
create policy student_import_batches_select on public.student_import_batches
  for select to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin']));
drop policy if exists student_import_batches_insert on public.student_import_batches;
create policy student_import_batches_insert on public.student_import_batches
  for insert to authenticated
  with check (
    app.has_role(workspace_id, array['owner', 'admin'])
    and created_by = (select auth.uid())
    and status = 'preview'
    and created_count = 0
    and finished_at is null
  );

-- No UPDATE or DELETE: a batch changes only through import_student_batch.
revoke all on public.student_import_batches from anon, authenticated;
grant select, insert on public.student_import_batches to authenticated;

-- ---------------------------------------------------------------------
-- public.import_student_batch — admit up to p_limit valid rows
-- ---------------------------------------------------------------------
create or replace function public.import_student_batch(
  p_workspace_id uuid,
  p_batch_id     uuid,
  p_limit        integer default 100
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_batch   public.student_import_batches;
  v_rows    jsonb := '[]'::jsonb;
  v_row     jsonb;
  v_res     jsonb;
  v_done    integer := 0;
  v_failed  integer := 0;
  v_left    integer := 0;
  v_created integer;
  v_status  public.import_status;
begin
  if auth.uid() is null or not app.has_role(p_workspace_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

  -- The row lock serialises a double tap: the second call waits, then
  -- finds every row it would have admitted already marked created.
  select * into v_batch
    from public.student_import_batches b
   where b.id = p_batch_id and b.workspace_id = p_workspace_id
     for update;
  if not found then
    raise exception 'BATCH_NOT_FOUND' using errcode = '22023';
  end if;
  if v_batch.status = 'completed' then
    return jsonb_build_object('status', 'completed', 'created_count', v_batch.created_count,
                              'remaining', 0);
  end if;
  if v_batch.status = 'preview' and v_batch.created_at < now() - interval '24 hours' then
    raise exception 'BATCH_EXPIRED' using errcode = '22023';
  end if;

  -- Every audit row of the import carries the batch id as its correlation id.
  perform set_config('app.correlation_id', p_batch_id::text, true);

  for v_row in select value from jsonb_array_elements(v_batch.report -> 'rows') loop
    if v_row ->> 'status' = 'valid' then
      if v_done + v_failed < p_limit then
        begin
          v_res := public.admit_student(p_workspace_id,
            (v_row -> 'input') || jsonb_build_object('idempotency_key',
              md5(p_batch_id::text || ':' || (v_row ->> 'line'))::uuid));
          v_row := v_row || jsonb_build_object('status', 'created',
                                               'student_code', v_res ->> 'student_code');
          v_done := v_done + 1;
        exception when others then
          -- A row the database refuses is reported, not fatal; anything else
          -- (read-only school, lost role) stops the whole call.
          if sqlerrm not in ('VALIDATION', 'ROLL_TAKEN', 'SECTION_NOT_FOUND',
                             'SECTION_ARCHIVED', 'YEAR_CLOSED', 'IDEMPOTENCY_KEY_REUSED') then
            raise;
          end if;
          v_row := v_row || jsonb_build_object('status', 'failed',
            'errors', jsonb_build_array(jsonb_build_object('column', null, 'code', sqlerrm)));
          v_failed := v_failed + 1;
        end;
      else
        v_left := v_left + 1;
      end if;
    end if;
    v_rows := v_rows || jsonb_build_array(v_row);
  end loop;

  v_created := v_batch.created_count + v_done;
  v_status := case when v_left = 0 then 'completed' else 'importing' end;

  update public.student_import_batches b
     set report        = jsonb_set(b.report, '{rows}', v_rows),
         status        = v_status,
         created_count = v_created,
         finished_at   = case when v_left = 0 then now() end
   where b.id = p_batch_id;

  return jsonb_build_object('status', v_status, 'created_count', v_created, 'remaining', v_left);
end;
$$;

comment on function public.import_student_batch(uuid, uuid, integer) is
  'F-AC-02 §4.7 (D-106): owner/admin only. Admits up to p_limit of a batch''s '
  'valid rows, each through public.admit_student with an idempotency key '
  'derived from (batch, line), and writes each outcome (student code, or the '
  'named refusal) back into the report in the same transaction. Call until '
  'remaining = 0. Raises FORBIDDEN, VALIDATION, BATCH_NOT_FOUND, BATCH_EXPIRED '
  '(a preview older than 24 h); PLAN_READ_ONLY comes from the table guards.';

revoke all on function public.import_student_batch(uuid, uuid, integer) from public, anon;
grant execute on function public.import_student_batch(uuid, uuid, integer) to authenticated;
