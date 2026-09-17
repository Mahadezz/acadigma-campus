# F-TE-07 — Analytics dashboards

|                  |                                                                                                                                                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Area             | teaching (analytics surface for the whole product)                                                                                                                                                                                                                                               |
| Status           | planned                                                                                                                                                                                                                                                                                          |
| Owner branch     | `feat/teaching-analytics`                                                                                                                                                                                                                                                                        |
| Depends on       | F-AC-04 (students, enrolments) · F-AC-05 (attendance) · F-AC-07 (exams, marks, grade scales) · F-TE-02 (lesson logs, syllabi, pacing functions) · F-TE-03 (AI ledger, generations) · F-TE-05 (resources, storage) · F-TE-06 (workload views) · F-OP-03 (staff attendance) · F-OP-04 (print jobs) |
| Plan             | `docs/plan/ROADMAP.md` chunk — teaching, position 7 (last in the area)                                                                                                                                                                                                                           |
| Base44 reference | `docs/reference/base44-inventory/03-teaching-intelligence.md` §4 rows 13–13d, §5.7, §6 "Enterprise analytics aggregates" / "Resource library aggregates", §7 items 10, 11, 19, 25, 26, §8 Q13                                                                                                    |

## 1. Purpose

Five dashboards — **school overview, attendance, academics, staff & workload, AI usage** — where **every single number is defined once, as a SQL view, over real rows**. No mock arrays, no hardcoded percentages, no "fake 30-day line", no invented storage bars. A head teacher opens the overview on a phone between periods and gets six numbers they can act on; an admin drills into attendance or academics; an owner checks what AI is costing them.

This file is the **metric dictionary** for the product. If a number appears on a screen anywhere in Campus, its definition is in §4 and its source is a view in `supabase/migrations/*_analytics_views.sql`. A component that computes an aggregate in JavaScript from a list response is a bug, and there is a lint rule and a review checklist item that says so.

**What Base44 intended, and what was broken.** Two dashboards existed. The "Academic Overview" was **mostly literals**: `mockAttendanceData`, `mockGradeData` and `mockPrintData` were hardcoded arrays; "Avg Attendance 91%" was a string; the "+3.2%" trend badge was a string. Only four numbers on the page were real. The "Enterprise Dashboard" read real entities but with field-name mismatches that made its headline numbers permanently zero: it summed `AIUsageLog.user_id` against a schema whose field was `teacher_id`, and it counted `PrintQueue.handout_id`, a field that does not exist — so "Most Printed Resources (Top 10)" was structurally always empty. Its "QR Activity" chart was print-job counts relabelled, with the code comment admitting `// QR scans (fake 30-day line from print queue)`, rendering 7 days under a "7 Days" title from a variable named for 30. Storage was `Math.min(resources.length / 10, 100)` presented as a percentage of "100 GB free", while `file_size_kb` sat on every row unused. `totalAlloc` summed `CreditAllocation.daily_limit` across **all history** with no date filter and called it today's ceiling. Two "top N" lists applied `.slice(0,10)` **before** `.sort()`, so even with data they would have shown an arbitrary ten, sorted. The one honest dashboard in the export was Risk Scoring, which did real maths over real marks and behaviour logs.

**Done looks like:** PRODUCT-DECISIONS 3.9, enforced mechanically — every dashboard number traceable to a view definition in this document, every view tested against a hand-computed fixture, and an empty school showing honest empty states rather than plausible-looking zeros.

## 2. Roles and permissions

| Dashboard                   | permission key            | owner | admin | teacher            | staff | parent | platform    |
| --------------------------- | ------------------------- | ----- | ----- | ------------------ | ----- | ------ | ----------- |
| School overview             | `analytics.overview`      | ✓     | ✓     | —                  | —     | —      | read bypass |
| Attendance                  | `analytics.attendance`    | ✓     | ✓     | own sections only¹ | —     | —      | ✓           |
| Academics                   | `analytics.academics`     | ✓     | ✓     | own sections only¹ | —     | —      | ✓           |
| Staff & workload            | `analytics.staff`         | ✓     | ✓     | —                  | —     | —      | ✓           |
| AI usage                    | `ai_credits.analytics`    | ✓     | ✓     | own usage only     | —     | —      | ✓           |
| Export any dashboard as CSV | same key as the dashboard | ✓     | ✓     | —                  | —     | —      | ✓           |
| Cost in USD on AI usage     | `platform.analytics`      | —     | —     | —                  | —     | —      | ✓ only      |

¹ A teacher sees a **scoped** version of attendance and academics limited to `section_subjects` where they are the teacher — the same views with an extra predicate, not a different set of numbers. There is no "teacher dashboard" with its own arithmetic; that is how two dashboards drift apart.

Parents never reach `/app/analytics`; their child-level figures live in the parent portal and are computed from the same views.

## 3. Data

This feature **owns no base tables**. It owns **views**, their indexes, and the screens that read them.

Every view carries `workspace_id` as its first column and is created with `security_invoker = true`, so the caller's RLS applies to the underlying tables and a view cannot become a tenancy bypass. Platform-staff access goes through the existing platform bypass policies on the base tables, not through a second set of views.

**Refresh strategy.** All views are **plain views computed on read**, with covering indexes on the base tables, except three explicitly materialised ones (§4.6) whose inputs change at most daily. A head teacher looking at attendance ten minutes after roll call must see today's roll call; staleness here is worse than latency.

**Indexes this feature adds** (proposed; DATA-MODEL.md wins):
`attendance_records(workspace_id, session_id, status)`, `attendance_sessions(workspace_id, date, section_id)`, `marks(workspace_id, exam_subject_id, student_id)`, `exam_subjects(workspace_id, exam_id, section_subject_id)`, `lesson_logs(workspace_id, taught_on, section_subject_id)`, `ai_generations(workspace_id, created_at, action_key)`, `ai_credit_ledger(workspace_id, created_at, entry_type)`, `files(workspace_id)` including `size_bytes`, `print_jobs(workspace_id, created_at, status)`.

**Snapshots.** `analytics_daily_snapshots(workspace_id, date, metric_key, value numeric, computed_at)` — written nightly by a job for the handful of metrics that must be comparable over time even after the underlying rows change (enrolment on a given day, attendance % on a given day, storage used, credits granted, credits spent). Trends read snapshots; live figures read views. This is what makes a trend badge honest — Base44's "+3.2 %" was a string literal because there was nothing to compare against.

## 4. The metric dictionary

Every definition below is the **exact** SQL that ships. `app.workspace_tz(ws)` returns `school_profiles.timezone` (default `Asia/Dhaka`). Percentages are `numeric(5,2)`; counts are `bigint`. Every ratio uses `NULLIF` on its denominator, so an empty school returns `NULL`, which the UI renders as an em dash — **never as 0 %**, which reads as a catastrophe rather than as no data.

### 4.1 School overview

```sql
-- current enrolment
create view analytics_headcount with (security_invoker = true) as
select e.workspace_id,
       count(*) filter (where e.status = 'active')          as students_active,
       count(distinct e.section_id)                         as sections_with_students
from enrollments e
join academic_years ay on ay.id = e.academic_year_id and ay.is_current
group by e.workspace_id;

create view analytics_staff_headcount with (security_invoker = true) as
select wm.workspace_id,
       count(*) filter (where wm.status = 'active')                          as members_active,
       count(*) filter (where wm.status = 'active' and wm.role = 'teacher')  as teachers_active,
       count(*) filter (where wm.status = 'pending')                         as members_pending
from workspace_members wm
group by wm.workspace_id;

-- the overview's headline number
create view analytics_attendance_today with (security_invoker = true) as
select s.workspace_id,
       count(r.*)                                                                  as marked,
       count(r.*) filter (where r.status = any(app.present_statuses(s.workspace_id))) as present_equiv,
       round(100.0 * count(r.*) filter (where r.status = any(app.present_statuses(s.workspace_id)))
             / nullif(count(r.*), 0), 2)                                           as pct_present,
       count(distinct s.section_id)                                                as sections_marked,
       (select count(*) from sections sx
         where sx.workspace_id = s.workspace_id and sx.deleted_at is null)         as sections_total
from attendance_sessions s
join attendance_records r on r.session_id = s.id
where s.date = (now() at time zone app.workspace_tz(s.workspace_id))::date
group by s.workspace_id;
```

`app.present_statuses(workspace_id)` implements PRODUCT-DECISIONS 2.2: by default `{present, late, half_day}`, overridden by `school_profiles.attendance_policy`. The policy is read in **one** place; no dashboard re-implements it.

```sql
-- "is the school using the product" strip
create view analytics_overview_activity with (security_invoker = true) as
select w.id as workspace_id,
  (select count(*) from lesson_logs l
     where l.workspace_id = w.id
       and l.taught_on >= (now() at time zone app.workspace_tz(w.id))::date - 6) as lessons_logged_7d,
  (select count(*) from lesson_plans p
     where p.workspace_id = w.id and p.deleted_at is null
       and p.created_at >= now() - interval '7 days')                            as plans_created_7d,
  (select count(*) from resources r
     where r.workspace_id = w.id and r.deleted_at is null
       and r.created_at >= now() - interval '7 days')                            as resources_added_7d,
  (select count(*) from print_jobs j
     where j.workspace_id = w.id and j.status = 'completed'
       and j.created_at >= now() - interval '7 days')                            as print_jobs_7d,
  (select coalesce(sum(g.credits_charged), 0) from ai_generations g
     where g.workspace_id = w.id and g.status = 'succeeded'
       and g.created_at >= now() - interval '7 days')                            as ai_credits_7d
from workspaces w;

-- what needs a human today
create view analytics_overview_alerts with (security_invoker = true) as
select w.id as workspace_id,
  (select count(*) from resources r
     where r.workspace_id = w.id and r.status = 'orphaned' and r.deleted_at is null) as orphaned_resources,
  (select count(*) from ai_credit_requests q
     where q.workspace_id = w.id and q.status = 'pending')                          as pending_credit_requests,
  (select count(*) from workspace_members m
     where m.workspace_id = w.id and m.status = 'pending')                          as pending_members,
  (select count(*) from analytics_attendance_unmarked u
     where u.workspace_id = w.id)                                                   as sections_unmarked_recent,
  (select count(*) from analytics_pacing_status p
     where p.workspace_id = w.id and p.band = 'behind')                             as section_subjects_behind
from workspaces w;
```

### 4.2 Attendance dashboard

```sql
-- one row per workspace per date: the trend source
create view analytics_attendance_daily with (security_invoker = true) as
select s.workspace_id, s.date,
       count(r.*)                                              as marked,
       count(r.*) filter (where r.status = any(app.present_statuses(s.workspace_id))) as present_equiv,
       count(r.*) filter (where r.status = 'absent')           as absent,
       count(r.*) filter (where r.status = 'late')             as late,
       count(r.*) filter (where r.status = 'excused')          as excused,
       round(100.0 * count(r.*) filter (where r.status = any(app.present_statuses(s.workspace_id)))
             / nullif(count(r.*), 0), 2)                       as pct_present
from attendance_sessions s
join attendance_records r on r.session_id = s.id
group by s.workspace_id, s.date;

-- section league table
create view analytics_attendance_by_section with (security_invoker = true) as
select s.workspace_id, s.section_id, date_trunc('month', s.date)::date as month,
       count(r.*) as marked,
       round(100.0 * count(r.*) filter (where r.status = any(app.present_statuses(s.workspace_id)))
             / nullif(count(r.*), 0), 2) as pct_present
from attendance_sessions s
join attendance_records r on r.session_id = s.id
group by s.workspace_id, s.section_id, date_trunc('month', s.date);

-- per-student % over a term; drives the exam-eligibility warning
create view analytics_attendance_by_student with (security_invoker = true) as
select r.workspace_id, r.student_id, t.id as term_id,
       count(*)                                                                    as sessions,
       count(*) filter (where r.status = any(app.present_statuses(r.workspace_id))) as present_equiv,
       round(100.0 * count(*) filter (where r.status = any(app.present_statuses(r.workspace_id)))
             / nullif(count(*), 0), 2)                                             as pct_present
from attendance_records r
join attendance_sessions s on s.id = r.session_id
join terms t on t.workspace_id = r.workspace_id and s.date between t.starts_on and t.ends_on
group by r.workspace_id, r.student_id, t.id;

-- sections with no session on an instructional day in the last 7 days
create view analytics_attendance_unmarked with (security_invoker = true) as
select sec.workspace_id, sec.id as section_id, d.date
from sections sec
join academic_calendar_days d
  on d.workspace_id = sec.workspace_id
 and d.kind = 'instructional'
 and d.date between (now() at time zone app.workspace_tz(sec.workspace_id))::date - 6
                and (now() at time zone app.workspace_tz(sec.workspace_id))::date
where sec.deleted_at is null
  and not exists (select 1 from attendance_sessions s
                   where s.section_id = sec.id and s.date = d.date);
```

**Exam-eligibility flag:** `pct_present < coalesce(school_profiles.min_attendance_pct, 75)` → shown as a warning, never a block (PRODUCT-DECISIONS 2.2). The threshold comes from the setting; 75 is a default, not a constant in a component.

### 4.3 Academics dashboard

Grade points, letters and GPA come from the school's `grade_scales` through one SQL function, `app.grade_for(workspace_id, pct)` → `(letter, grade_point)` (PRODUCT-DECISIONS 2.4). **No dashboard re-implements the scale.**

```sql
-- the atom every academic number is built from
create view analytics_subject_percent with (security_invoker = true) as
select m.workspace_id, m.student_id, es.exam_id, es.section_subject_id, ss.subject_id,
       es.id as exam_subject_id,
       round(100.0 * m.marks_obtained / nullif(es.max_marks, 0), 2)                as pct,
       (app.grade_for(m.workspace_id,
          100.0 * m.marks_obtained / nullif(es.max_marks, 0))).letter              as letter,
       (app.grade_for(m.workspace_id,
          100.0 * m.marks_obtained / nullif(es.max_marks, 0))).grade_point         as grade_point
from marks m
join exam_subjects es on es.id = m.exam_subject_id
join section_subjects ss on ss.id = es.section_subject_id
where m.marks_obtained is not null;

-- mean of subject grade points, with the BD "F zeroes the GPA" rule as a setting
create view analytics_student_exam_gpa with (security_invoker = true) as
select p.workspace_id, p.student_id, p.exam_id,
       count(*)                                        as subjects,
       round(avg(p.grade_point), 2)                    as gpa_mean,
       case when bool_or(p.grade_point = 0)
             and coalesce((select sp.fail_zeroes_gpa from school_profiles sp
                            where sp.workspace_id = p.workspace_id), true)
            then 0.00
            else round(avg(p.grade_point), 2) end      as gpa,
       sum(p.pct)                                      as total_pct
from analytics_subject_percent p
group by p.workspace_id, p.student_id, p.exam_id;

-- "which subject did the class not get"
create view analytics_exam_subject_stats with (security_invoker = true) as
select p.workspace_id, p.exam_subject_id, p.section_subject_id, p.subject_id, p.exam_id,
       count(*)                                                        as entered,
       round(avg(p.pct), 2)                                            as avg_pct,
       percentile_cont(0.5) within group (order by p.pct)              as median_pct,
       min(p.pct) as min_pct, max(p.pct) as max_pct,
       count(*) filter (where p.pct < app.pass_mark(p.workspace_id))   as failing,
       round(100.0 * count(*) filter (where p.pct >= app.pass_mark(p.workspace_id))
             / nullif(count(*), 0), 2)                                 as pass_rate
from analytics_subject_percent p
group by p.workspace_id, p.exam_subject_id, p.section_subject_id, p.subject_id, p.exam_id;

-- the grade bar chart, real
create view analytics_grade_distribution with (security_invoker = true) as
select p.workspace_id, p.exam_id, p.subject_id, p.letter, count(*) as students
from analytics_subject_percent p
group by p.workspace_id, p.exam_id, p.subject_id, p.letter;

-- rank by GPA then total marks (PRODUCT-DECISIONS 2.4)
create view analytics_section_rank with (security_invoker = true) as
select g.workspace_id, g.exam_id, e.section_id, g.student_id, g.gpa, g.total_pct,
       rank() over (partition by g.workspace_id, g.exam_id, e.section_id
                    order by g.gpa desc, g.total_pct desc) as rank_in_section
from analytics_student_exam_gpa g
join enrollments e on e.student_id = g.student_id and e.status = 'active';

-- curriculum coverage per section_subject (per-section, not per-topic-row)
create view analytics_topic_coverage with (security_invoker = true) as
select ss.workspace_id, ss.id as section_subject_id, t.id as topic_id,
       case when exists (select 1 from lesson_logs l
                          where l.section_subject_id = ss.id and l.syllabus_topic_id = t.id
                            and l.coverage = 'completed') then 'covered'
            when exists (select 1 from lesson_logs l
                          where l.section_subject_id = ss.id and l.syllabus_topic_id = t.id
                            and l.coverage = 'partial')   then 'partial'
            else 'not_started' end as state,
       t.estimated_periods, t.is_optional
from section_subjects ss
join sections sec on sec.id = ss.section_id
join syllabi sy on sy.workspace_id = ss.workspace_id
              and sy.subject_id = ss.subject_id
              and sy.grade_level_id = sec.grade_level_id
              and sy.status = 'published' and sy.deleted_at is null
join syllabus_topics t on t.syllabus_id = sy.id;

create view analytics_pacing_status with (security_invoker = true) as
select c.workspace_id, c.section_subject_id,
       count(*) filter (where c.state = 'covered' and not c.is_optional)  as topics_covered,
       count(*) filter (where not c.is_optional)                          as topics_total,
       round(100.0 * count(*) filter (where c.state = 'covered' and not c.is_optional)
             / nullif(count(*) filter (where not c.is_optional), 0), 2)   as pct_complete,
       sum(case c.state when 'covered' then 0
                        when 'partial' then ceil(c.estimated_periods) / 2.0
                        else c.estimated_periods end)
         filter (where not c.is_optional)                                 as estimated_remaining,
       app.periods_remaining(c.workspace_id, c.section_subject_id)        as periods_remaining,
       app.pacing_band(c.workspace_id, c.section_subject_id)              as band
from analytics_topic_coverage c
group by c.workspace_id, c.section_subject_id;
```

`app.periods_remaining` and `app.pacing_band` are the F-TE-02 §5.3–5.4 functions. **Defined once, called here** — this dashboard does not recompute pacing.

### 4.4 Staff and workload dashboard

```sql
create view analytics_workload_scheduled with (security_invoker = true) as
select ss.teacher_id as user_id, ts.workspace_id, d.date, ts.period_number,
       ts.section_subject_id, ss.role as teaching_role
from timetable_slots ts
join section_subjects ss on ss.id = ts.section_subject_id
join academic_calendar_days d
  on d.workspace_id = ts.workspace_id
 and d.kind = 'instructional'
 and extract(isodow from d.date) = ts.weekday
 and d.date >= ts.effective_from
 and (ts.effective_to is null or d.date <= ts.effective_to)
where extract(isodow from d.date) = any(
        (select sp.working_days from school_profiles sp where sp.workspace_id = ts.workspace_id));

create view analytics_workload_logged with (security_invoker = true) as
select coalesce(ss.teacher_id, l.logged_by) as user_id, l.workspace_id,
       l.taught_on as date, l.periods_used, l.section_subject_id, l.coverage
from lesson_logs l
join section_subjects ss on ss.id = l.section_subject_id;

create view analytics_workload_cover with (security_invoker = true) as
select ca.workspace_id, ca.cover_teacher_id as user_id, ca.date, ca.minutes
from cover_assignments ca
where ca.status = 'completed';

create view analytics_workload_variance with (security_invoker = true) as
select s.workspace_id, s.user_id, date_trunc('week', s.date)::date as week_start,
       count(*) as scheduled_periods,
       coalesce((select sum(g.periods_used) from analytics_workload_logged g
                  where g.workspace_id = s.workspace_id and g.user_id = s.user_id
                    and date_trunc('week', g.date) = date_trunc('week', s.date)), 0) as logged_periods,
       coalesce((select sum(c.minutes)/60.0 from analytics_workload_cover c
                  where c.workspace_id = s.workspace_id and c.user_id = s.user_id
                    and date_trunc('week', c.date) = date_trunc('week', s.date)), 0) as cover_hours
from analytics_workload_scheduled s
where s.teaching_role = 'primary'
   or app.count_assistants(s.workspace_id)
group by s.workspace_id, s.user_id, date_trunc('week', s.date);

-- staff attendance; the caller ALWAYS supplies a window (F-TE-06 §5.7)
create view analytics_staff_attendance with (security_invoker = true) as
select sa.workspace_id, sa.user_id, sa.date, sa.status
from staff_attendance sa;
```

`variance_pct` and the burnout band are computed by `packages/domain/workload.ts` from these rows using the school's thresholds — one implementation, shared by the F-TE-06 screens and this dashboard. Every join above is on `user_id`; no display-name string is a join key anywhere.

### 4.5 AI usage dashboard

```sql
create view analytics_ai_usage_daily with (security_invoker = true) as
select g.workspace_id,
       (g.created_at at time zone app.workspace_tz(g.workspace_id))::date       as date,
       count(*)                                                                 as calls,
       count(*) filter (where g.status = 'succeeded')                           as succeeded,
       coalesce(sum(g.credits_charged) filter (where g.status = 'succeeded'), 0) as credits,
       coalesce(sum(g.input_tokens), 0)                                         as input_tokens,
       coalesce(sum(g.output_tokens), 0)                                        as output_tokens,
       coalesce(sum(g.cache_read_tokens), 0)                                    as cache_read_tokens,
       coalesce(sum(g.cost_usd_micros), 0)                                      as cost_usd_micros, -- platform only
       round(avg(g.latency_ms))                                                 as avg_latency_ms
from ai_generations g
group by g.workspace_id, (g.created_at at time zone app.workspace_tz(g.workspace_id))::date;

create view analytics_ai_usage_by_teacher with (security_invoker = true) as
select g.workspace_id, g.user_id,
       date_trunc('month', g.created_at at time zone app.workspace_tz(g.workspace_id))::date as month,
       count(*) filter (where g.status = 'succeeded')                           as calls,
       coalesce(sum(g.credits_charged) filter (where g.status = 'succeeded'), 0) as credits
from ai_generations g
group by g.workspace_id, g.user_id,
         date_trunc('month', g.created_at at time zone app.workspace_tz(g.workspace_id));

create view analytics_ai_usage_by_action with (security_invoker = true) as
select g.workspace_id, g.action_key,
       date_trunc('month', g.created_at at time zone app.workspace_tz(g.workspace_id))::date as month,
       count(*) filter (where g.status = 'succeeded')                           as calls,
       coalesce(sum(g.credits_charged) filter (where g.status = 'succeeded'), 0) as credits
from ai_generations g
group by g.workspace_id, g.action_key,
         date_trunc('month', g.created_at at time zone app.workspace_tz(g.workspace_id));

create view analytics_ai_failures with (security_invoker = true) as
select g.workspace_id, g.error_code, g.action_key,
       (g.created_at at time zone app.workspace_tz(g.workspace_id))::date as date,
       count(*) as failures
from ai_generations g
where g.status not in ('succeeded', 'reserved')
group by g.workspace_id, g.error_code, g.action_key,
         (g.created_at at time zone app.workspace_tz(g.workspace_id))::date;

-- today's ceiling and consumption, correctly date-filtered
create view analytics_ai_balance_now with (security_invoker = true) as
select b.workspace_id,
       sum(b.granted_today) as granted_today,
       sum(b.carryover)     as carryover,
       sum(b.spent_today)   as spent_today,
       sum(b.reserved)      as reserved,
       sum(b.balance)       as balance,
       round(100.0 * sum(b.spent_today)
             / nullif(sum(b.granted_today) + sum(b.carryover), 0), 2) as pct_used
from ai_credit_balances b
where b.as_of_date = (now() at time zone app.workspace_tz(b.workspace_id))::date
group by b.workspace_id;

-- credits let expire: the honest usage/downgrade signal
create view analytics_ai_expiry with (security_invoker = true) as
select l.workspace_id,
       date_trunc('month', l.created_at at time zone app.workspace_tz(l.workspace_id))::date as month,
       -sum(l.credits) as credits_expired
from ai_credit_ledger l
where l.entry_type = 'expiry'
group by l.workspace_id,
         date_trunc('month', l.created_at at time zone app.workspace_tz(l.workspace_id));
```

Every one of these carries an explicit date bucket in the workspace's timezone. The prototype's `totalAlloc` summed an allocation column across all history with no date filter and presented it as today's ceiling.

### 4.6 Storage, resources and print

```sql
create view analytics_storage with (security_invoker = true) as
select f.workspace_id,
       coalesce(sum(f.size_bytes), 0)                                          as used_bytes,
       count(*)                                                                as file_count,
       coalesce(sum(f.size_bytes) filter (where f.deleted_at is not null), 0)  as recoverable_bytes,
       (select coalesce(w.storage_bytes_override, p.storage_gb * 1073741824)
          from workspaces w join plans p on p.id = w.plan_id
         where w.id = f.workspace_id)                                          as quota_bytes
from files f
where f.path not like 'system/%'
group by f.workspace_id;

create view analytics_resources_by_type with (security_invoker = true) as
select r.workspace_id, r.resource_type, count(*) as resources,
       coalesce(sum(r.size_bytes), 0) as bytes
from resources r where r.deleted_at is null
group by r.workspace_id, r.resource_type;

create view analytics_resources_monthly with (security_invoker = true) as
select r.workspace_id,
       date_trunc('month', r.created_at at time zone app.workspace_tz(r.workspace_id))::date as month,
       count(*) as added,
       count(*) filter (where r.source = 'ai') as ai_generated
from resources r where r.deleted_at is null
group by r.workspace_id,
         date_trunc('month', r.created_at at time zone app.workspace_tz(r.workspace_id));

-- no LIMIT in the view: consumers ORDER BY then LIMIT, in SQL
create view analytics_top_printed with (security_invoker = true) as
select r.workspace_id, r.id as resource_id, r.identifier, r.title, r.print_count
from resources r
where r.deleted_at is null and r.print_count > 0;
```

`analytics_storage` is the real answer to the prototype's `resources.length / 10` presented as a percentage of an imaginary 100 GB. `analytics_top_printed` deliberately has no `LIMIT`; consumers order then limit, which is the structural fix for the `.slice(0,10).sort()` bug that appeared twice in the export — and `print_count` is now a counter real print actions write (F-TE-05 §5.7), so the list is no longer permanently zero.

**Materialised (refreshed nightly, `CONCURRENTLY`):** `analytics_resources_monthly`, `analytics_attendance_by_student`, `analytics_ai_usage_by_action`. Each gains a `computed_at` column surfaced in the UI as "as of 02:00".

### 4.7 Trends

A trend badge is `round(100 × (current − previous) / NULLIF(previous, 0))` over `analytics_daily_snapshots` for the same `metric_key` and comparable windows (this week vs last week, this month vs last month). When `previous` is null or zero, **no badge renders at all** — not "+100 %", and certainly not a hardcoded "+3.2 %".

### 4.8 What is explicitly NOT built

- **QR scan analytics.** PRODUCT-DECISIONS 3.10: QR codes are printable in v1; scanning arrives with the native wrappers. There is no scan data, so there is no scan chart. Base44 relabelled print-job counts as "QR Activity" with a code comment admitting it was fake.
- **Marketplace (seller) and platform dashboards** — owned by F-MK and F-PL, built on the same view discipline.
- **Student risk scoring** — PRODUCT-DECISIONS 2.10 puts the nightly deterministic risk job in the academic area. This dashboard _displays_ the resulting `students.needs_attention` counts; it does not compute risk.

## 5. Business rules

**5.1 One definition per number.** A metric exists in exactly one view. If two screens need it, they read the same view. A CSV export reads the same view as the chart above it, so they cannot disagree.

**5.2 No client-side aggregation.** Server actions return view rows; components render them. An ESLint rule bans `.reduce(`, `.filter(...).length` and `Math.round(` inside `app/(school)/app/analytics/**` component files, and the review checklist adds "does any number on this screen come from anywhere but a view?".

**5.3 Empty is empty.** A workspace with no data renders a named empty state per card ("No attendance has been taken yet" / "No exams published yet"), not zeros. A `NULL` ratio renders as "—". A brand-new school must look obviously new.

**5.4 Timezone.** Every date bucket is computed in `school_profiles.timezone` in SQL. The known prototype bug — "today" computed in UTC — is a standing regression test executed with the clock at 23:30 Asia/Dhaka.

**5.5 Policy-driven definitions are read from settings**, never hardcoded: present statuses, minimum attendance %, pass mark, grade scale, whether an F zeroes the GPA, workload thresholds, pacing bands. A school that changes a setting sees every dashboard change with it.

**5.6 Scoping.** A teacher-scoped dashboard adds a predicate to the same view; it never uses a different formula. RLS on the base tables is the real boundary; the predicate is for relevance.

**5.7 Ranking.** Every "top N" is `ORDER BY … LIMIT n` in SQL. No JavaScript slicing before sorting, ever.

**5.8 Cost never leaves the platform.** `cost_usd_micros` is stripped from every school-facing payload by the contract's output schema, not by whichever component happens to render it.

**5.9 Export.** Every dashboard exports CSV with a header naming the metric, the workspace, the range and the generation timestamp in workspace time, so a spreadsheet emailed around a staffroom is self-describing.

**5.10 Performance contract.** Any view whose p95 exceeds its budget (§10) is indexed or materialised — never "fixed" by shipping raw rows to the client and aggregating there.

## 6. UI

Route group `/app/analytics` with five tabs; each tab is its own route so it is linkable and back-button correct.

| Screen           | Route                       | 360×800                                                                                                           | ≥1024                                                        | Primary                         | Empty                                | Loading                                                                               | Error                                                                          |
| ---------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Overview         | `/app/analytics`            | **Phone-first card stack**: attendance today (big %), headcount, 7-day activity strip, alerts list                | 4-up KPI row, 2 charts, alerts rail                          | Open the flagged item           | Per-card named empty states          | Per-card skeletons — cards load independently, so one slow view never blanks the page | Per-card inline `Alert` + Retry; one failing view does not break the dashboard |
| Attendance       | `/app/analytics/attendance` | Range chips (7d/30d/term) · big % · sparkline with inline labels · sections ranked worst-first · unmarked list    | Line chart, section table, student table, eligibility filter | Take attendance (deep link)     | "No attendance taken yet."           | Skeletons                                                                             | Per-card                                                                       |
| Academics        | `/app/analytics/academics`  | Exam picker · pass rate · grade distribution as a labelled bar list · subjects worst-first · pacing bands         | Charts + tables + rank list                                  | Open the exam                   | "No published exams yet."            | Skeletons                                                                             | Per-card                                                                       |
| Staff & workload | `/app/analytics/staff`      | Teachers ranked by load with band pills · variance flags · absences (window stated in the label)                  | Table + distribution chart + drawer                          | Open the balance view (F-TE-06) | "Build a timetable to see workload." | Skeletons                                                                             | Per-card                                                                       |
| AI usage         | `/app/analytics/ai`         | Balance card · credits today / this month · bar list by teacher · bar list by action · failures · expired credits | Charts + tables + CSV                                        | Buy credits / review requests   | "No AI usage yet."                   | Skeletons                                                                             | Per-card                                                                       |

**Phone-first specifics.** Cards are full-width, stacked, ≥88 px tall, headline figure at 32 px with its label above at 13 px. There are **no hover-only charts**: every bar carries its value inline, and the one line chart (attendance trend) renders as a sparkline with labelled first/last/min/max points on phone and as a full chart at ≥1024. Range selection is a chip row, not a date-picker dialog. Tapping any card navigates to the thing it is about — an attendance card to attendance, an orphan alert to the library — because a dashboard that cannot be acted on from a phone is a poster.

Components: `KpiCard`, `StatTile`, `Sparkline`, `BarList`, `RagBadge`, `RangeChips`, `DataTable`, `AlertList`, `EmptyState`, `ErrorState`, `Skeleton`, `AsOfLabel` (for materialised views). Charts use the design system's data-viz tokens; colour is never the only encoding and every band is labelled in text.

Accessibility: every chart has an adjacent screen-reader-available table (`<figure>` + visually-hidden `<table>`); KPI cards expose value and label as text; contrast ≥4.5:1 on every band colour; axe clean at both viewports.

## 7. Server contracts

| Name                                                   | Input                                                                                       | Output                                                                                                                     | Errors                           | Rate limit |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------- |
| `analytics.overview`                                   | `{}`                                                                                        | `{ attendanceToday, headcount, staff, activity7d, alerts, asOf }`                                                          | `FORBIDDEN`                      | 60/min     |
| `analytics.attendance`                                 | `{ range: '7d'\|'30d'\|'term'\|'custom', from?, to?, sectionId?, scope: 'school'\|'mine' }` | `{ daily[], bySection[], byStudent[], unmarked[], eligibilityAtRisk[] }`                                                   | `FORBIDDEN`                      | 60/min     |
| `analytics.academics`                                  | `{ examId?, subjectId?, sectionId?, scope }`                                                | `{ examStats[], gradeDistribution[], subjectStats[], rank[], pacing[] }`                                                   | `FORBIDDEN`, `NO_PUBLISHED_EXAM` | 60/min     |
| `analytics.staff`                                      | `{ from, to, band?, flaggedOnly? }`                                                         | `{ rows[], distribution[], absencesWindow: { from, to } }`                                                                 | `FORBIDDEN`                      | 60/min     |
| `analytics.ai`                                         | `{ range, groupBy: 'teacher'\|'action'\|'day' }`                                            | `{ balance, daily[], byTeacher[], byAction[], failures[], expired[] }` — **no `costUsdMicros` unless `is_platform_admin`** | `FORBIDDEN`                      | 60/min     |
| `analytics.export`                                     | `{ dashboard, ...sameFilters, format: 'csv' }`                                              | streamed CSV with a descriptive header                                                                                     | `FORBIDDEN`                      | 10/min     |
| Cron `analytics.snapshot` (nightly 01:00 workspace tz) | —                                                                                           | writes `analytics_daily_snapshots`                                                                                         | alert on failure                 | —          |
| Cron `analytics.refreshMaterialised` (nightly 02:00)   | —                                                                                           | `REFRESH MATERIALIZED VIEW CONCURRENTLY` ×3                                                                                | alert on failure                 | —          |

Every output schema is a Zod type in `packages/contracts/analytics.ts`, with platform-only fields on a **separate** schema so a school-facing payload cannot accidentally include them.

## 8. Parts (build chunks)

**Part 1 — View foundation and helpers (≤2 days).**
Scope: `app.workspace_tz()`, `app.present_statuses()`, `app.pass_mark()`, `app.grade_for()`, `app.count_assistants()`, plus the F-TE-02 functions `app.periods_remaining()` / `app.pacing_band()`; the overview, attendance and storage views (§4.1, §4.2, §4.6); `security_invoker` on every view; the supporting indexes; `analytics_daily_snapshots` and its nightly job.
Files: `supabase/migrations/*_analytics_helpers.sql`, `*_analytics_views_core.sql`, `packages/contracts/analytics.ts`.
Tests: pgTAP — every view returns zero rows for a foreign workspace (the direct regression test for the prototype's unfiltered `.list()`); each view matches a hand-computed fixture school; `late` counts as present under the default policy and stops when the policy changes; "today" is correct with the test clock at 23:30 Asia/Dhaka; `EXPLAIN` shows index use on the two hot paths.
**Demo:** a fixture school where every attendance number computed on paper equals the view output, including the timezone-boundary case.

**Part 2 — Overview dashboard (≤1.5 days).**
Scope: `/app/analytics`, `analytics.overview`, independent per-card loading and error boundaries, the alerts list with deep links, the phone card stack, trend badges from snapshots and their absence when there is no baseline.
Tests: e2e at 360×800 — a brand-new workspace shows five named empty states and no zeros; one failing view leaves the other cards rendered; each alert deep-links to the right screen.
**Demo:** an empty school and a seeded school side by side, showing that the empty one is obviously empty.

**Part 3 — Attendance dashboard (≤1.5 days).**
Scope: `/app/analytics/attendance`, range chips, the sparkline with inline labels, the section league table worst-first, the per-student table with the eligibility warning read from the setting, the unmarked-sections list, teacher scoping, CSV export.
Tests: changing `min_attendance_pct` from 75 to 80 moves the at-risk list; a teacher sees only their sections; export and screen agree row-for-row.
**Demo:** mark attendance for one section and watch today's % move on one refresh.

**Part 4 — Academics dashboard (≤2 days).**
Scope: `/app/analytics/academics`, exam picker, pass rate and grade distribution through `app.grade_for`, subject stats worst-first, section rank, pacing bands from F-TE-02's functions, CSV export.
Tests: a school with a custom grade scale gets its own letters and points on every card; the F-zeroes-GPA rule follows the setting; rank ties break by total marks; `NULLIF` guards render "—" instead of dividing by zero for an exam with no marks entered.
**Demo:** edit the grade scale and watch the distribution re-band with no code change.

**Part 5 — Staff & workload and AI usage dashboards (≤2 days).**
Scope: `/app/analytics/staff` reading F-TE-06's views with the window stated on screen; `/app/analytics/ai` reading §4.5 with `costUsdMicros` stripped for schools; bar lists, failure breakdown, expired-credits figure; both exports.
Tests: a school-role payload provably contains no cost field (contract-level assertion); the AI numbers equal a hand-summed ledger fixture; absences honour the stated window; a platform admin sees cost and a school owner does not.
**Demo:** an owner's AI tab beside a platform admin's — identical credit figures, only one showing USD.

**Part 6 — Materialisation, trends, exports, a11y, anti-mock CI (≤1.5 days).**
Scope: the three materialised views with concurrent nightly refresh and `AsOfLabel`; trend badges everywhere; `analytics.export` streaming with the descriptive header; the ESLint no-client-aggregation rule; the anti-mock grep suite; the screen-reader table behind every chart.
Tests: the lint rule fails a fixture component that sums a list; a failed refresh leaves the previous data readable with a stale "as of" label rather than blanking; exports stream 50,000 rows without buffering; axe clean on all five tabs at both viewports.
**Demo:** a CI run failing on a deliberately added client-side `.reduce()` inside an analytics component.

Order: 1 → 2 → 3 → 4 → 5 → 6. Parts 3, 4 and 5 are independent of each other once Part 1 lands.

## 9. Acceptance criteria

1. **Given** any dashboard screen, **when** its source is traced, **then** every number comes from a view defined in §4 — there is no literal, no mock array and no hardcoded percentage anywhere in `app/(school)/app/analytics/**`.
2. **Given** a component in the analytics route group that aggregates a list client-side, **when** CI runs, **then** the lint rule fails the build.
3. **Given** a brand-new workspace with no data, **when** every dashboard loads, **then** each card shows a named empty state and no card shows "0 %" for a ratio with no denominator.
4. **Given** an exam with no marks entered, **when** academics loads, **then** the pass rate renders as "—", not 0 %.
5. **Given** data in school A, **when** an admin of school B loads any dashboard, **then** every view returns zero rows.
6. **Given** a teacher, **when** they load attendance or academics, **then** they see only their own `section_subjects`, computed by the same views the admin sees.
7. **Given** a teacher, **when** they call `analytics.overview` or `analytics.staff`, **then** they get `FORBIDDEN`.
8. **Given** a school owner, **when** they load the AI dashboard, **then** the payload contains no `costUsdMicros` field at any level; a platform admin's payload does.
9. **Given** the workspace timezone is `Asia/Dhaka` and the server clock reads 23:30 local, **when** "today's attendance" is computed, **then** it uses the local date, not the UTC date.
10. **Given** `school_profiles.attendance_policy` excludes `late` from present, **when** the attendance % recomputes, **then** it drops accordingly on every dashboard at once.
11. **Given** `min_attendance_pct` changes from 75 to 80, **when** the eligibility list reloads, **then** more students appear and the warning text quotes 80 %.
12. **Given** a school with a custom grade scale, **when** the grade distribution renders, **then** the letters and boundaries are that school's, produced by `app.grade_for`.
13. **Given** a student with an F in one subject and `fail_zeroes_gpa = true`, **when** their GPA is computed, **then** it is 0.00; with the setting false, it is the mean.
14. **Given** two students tied on GPA, **when** section rank is computed, **then** the higher total marks ranks first, deterministically.
15. **Given** the "top 10 most printed" list, **when** it renders, **then** it is the ten highest `print_count` values — ordered in SQL before limiting.
16. **Given** a resource is printed, **when** the top-printed list reloads, **then** its count has increased — the list is not permanently empty.
17. **Given** storage usage, **when** the meter renders, **then** the number equals `sum(files.size_bytes)` excluding `system/`, and it changes when a file is deleted — never derived from a row count.
18. **Given** AI credits granted and spent today, **when** the AI dashboard loads, **then** `granted_today` is filtered to today in workspace time and equals a hand-summed ledger fixture.
19. **Given** AI generations that failed, **when** the failures card renders, **then** it groups by `error_code` and its total equals the count of non-succeeded, non-reserved generations.
20. **Given** credits that expired unused last month, **when** the AI dashboard loads, **then** the expired figure is shown from `entry_type='expiry'` ledger rows.
21. **Given** staff absences, **when** the staff dashboard renders them, **then** the displayed window matches the queried window and the label states the dates.
22. **Given** a metric with no previous-period snapshot, **when** the card renders, **then** no trend badge appears at all.
23. **Given** a metric with a previous-period snapshot, **when** the badge renders, **then** it equals `round(100 × (current − previous) / previous)` over comparable windows.
24. **Given** one view is slow or erroring, **when** the overview loads, **then** the remaining cards still render and only the failing card shows an inline error with Retry.
25. **Given** a CSV export and the on-screen table for the same filters, **when** compared, **then** every row and value matches, and the CSV header names the metric, workspace, range and generation time in workspace time.
26. **Given** a materialised view whose nightly refresh failed, **when** the dashboard loads, **then** the previous data renders with an "as of" timestamp showing it is stale — it does not blank and does not show zeros.
27. **Given** any chart, **when** a screen reader traverses it, **then** an equivalent data table is available and every band is identified by text as well as colour.
28. **Given** the overview at 360×800, **when** it renders, **then** there is no horizontal scroll, no hover-only chart, and every card is tappable through to the screen it describes.
29. **Given** sections with no attendance session on an instructional day in the last 7 days, **when** the overview loads, **then** that count appears as an alert linking to attendance filtered to them.
30. **Given** PRODUCT-DECISIONS 3.10 (no scanning in v1), **when** any dashboard is inspected, **then** there is no QR-scan metric anywhere.

## 10. Tests

- **Unit (`packages/domain`):** trend computation including the null-baseline case; CSV header construction; the platform-field stripping helper; range→date-bucket resolution per timezone.
- **DB (pgTAP) — the bulk of this feature's testing:** for each of the ~22 views — (a) zero rows across workspaces, (b) `security_invoker` honoured so a teacher's read is narrowed by the base tables' RLS, (c) numbers equal a hand-computed fixture school (two sections, 60 students, one term of attendance including holidays, two exams under a custom grade scale, 40 lesson logs, 30 resources, 100 AI generations, 2 orphans), (d) the 23:30 timezone boundary, (e) `NULLIF` guards on every ratio, (f) `EXPLAIN` index usage on the hot paths.
- **Integration:** each `analytics.*` action against the fixture school compared to the pgTAP expectations; the export stream compared against the JSON payload rendered as CSV; a platform-vs-school payload diff asserting the cost field.
- **e2e (360×800 + 1280×800, axe):** J1 empty workspace shows five empty states; J2 overview → tap an alert → land on the right screen; J3 change a setting (min attendance) and watch a dashboard change; J4 export and compare; J5 a deliberately broken view leaves the other cards alive.
- **Anti-mock regression suite** (the standing guarantee of PRODUCT-DECISIONS 3.9): a test that greps the analytics route group for numeric literals inside JSX, array literals of chart data, and the banned aggregation calls, and fails on any hit.
- **a11y:** axe on all five tabs; chart→table equivalence asserted per chart; contrast on every band token.
- **Performance budgets:** `analytics.overview` p95 < 400 ms; `analytics.attendance` (30 d, 1,000 students) p95 < 700 ms; `analytics.academics` (one exam, 600 students, 10 subjects) p95 < 800 ms; `analytics.staff` (100 teachers, one term) p95 < 700 ms; `analytics.ai` (50,000 generations) p95 < 500 ms; nightly refresh of all three materialised views < 120 s on the largest fixture; CSV export streams without buffering.

## 11. Open questions

1. **Is the overview role-split enough?** Owners and admins share one overview. A head of department may want a subject-scoped one. Default assumed: two scopes (school / mine) only; subject scoping deferred.
2. **Snapshot metric set.** §3 lists five snapshotted metrics. Adding one later cannot backfill history, so the set should be reviewed once before Part 1 ships. Default assumed: enrolment, attendance %, storage bytes, credits granted, credits spent.
3. **Materialised vs live for `analytics_attendance_by_student`.** Materialised nightly here, so today's attendance is not reflected in the per-student term % until tomorrow. Acceptable for a term figure; confirm with a real head teacher. Default assumed: materialised, with the "as of" label visible.
4. **Do parents' numbers come from these views?** They should (one definition), with an `app.is_guardian_of` predicate. F-AU owns the parent portal; flagged so the two do not diverge.
5. **Retention.** `ai_generations` and `analytics_daily_snapshots` grow without bound; ARCHITECTURE §10 states retention for `audit_events`, `email_log` and `file_access_log` but not these. Default assumed: `ai_generations` detail for 24 months then aggregate-only; snapshots kept indefinitely (they are tiny).
6. **Where does school marketplace spend live?** Base44's Enterprise Dashboard mixed it into the same screen. PRODUCT-DECISIONS 3.9 lists marketplace as a separate (seller) dashboard. Default assumed: a school's _purchasing_ spend belongs on the billing screen, not here — flagged for the commerce-area author.
7. **`app.count_assistants()` in `analytics_workload_variance`.** Calling a settings-reading function in a `WHERE` clause needs care to stay index-friendly (likely a lateral join or a per-workspace CTE). Implementation detail for Part 5; the semantics in F-TE-06 §5.3 are what matter.
