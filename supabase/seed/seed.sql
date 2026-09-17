-- =====================================================================
-- Development seed · Acadigma Campus
-- ---------------------------------------------------------------------
-- Applied by `supabase db reset` after every migration. FOUNDATION TABLES
-- ONLY — academics, teaching, commerce and operations seed data arrive with
-- their own migrations.
--
-- Creates:
--   · Acadigma Model School, Dhaka — Sat-Thu week, Asia/Dhaka, BD_GPA5
--   · 3 users: owner, teacher, parent (password for all: `password123`)
--   · a pending invitation and a demo label, so the Team & Access screen
--     has something real to render
--
-- The plan matrix itself is seeded by migration 0004, not here.
--
-- Idempotent: safe to run twice. NEVER run against production.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Guard — refuse to seed a database that already holds real schools
-- ---------------------------------------------------------------------
do $$
begin
  if (select count(*) from public.workspaces where type = 'school') > 5 then
    raise exception 'refusing to seed: this database already has % schools',
      (select count(*) from public.workspaces where type = 'school');
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 1. Users
--    Inserting into auth.users fires app.handle_new_user(), which creates
--    the profile, the preferences row and exactly one personal workspace
--    per person (PRODUCT-DECISIONS 1.2).
--    The bcrypt hash below is for the literal string `password123`.
-- ---------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   '5eed0000-0000-4000-a000-000000000001',
   'authenticated', 'authenticated', 'owner@acadigma.test',
   -- nosemgrep: generic.secrets.security.detected-bcrypt-hash.detected-bcrypt-hash -- dev-only fixture hash of the literal string `password123`, never used outside `supabase db reset`; not a leaked real credential.
   '$2a$10$PZTfVVhZa5rgDwgoJrTVOOuhJ6Dq5Xm0OeHAzAGjCPZocfdMa6wfy',
   now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Rezaul Karim"}'::jsonb, now(), now()),

  ('00000000-0000-0000-0000-000000000000',
   '5eed0000-0000-4000-a000-000000000002',
   'authenticated', 'authenticated', 'teacher@acadigma.test',
   -- nosemgrep: generic.secrets.security.detected-bcrypt-hash.detected-bcrypt-hash -- dev-only fixture hash of the literal string `password123`, never used outside `supabase db reset`; not a leaked real credential.
   '$2a$10$PZTfVVhZa5rgDwgoJrTVOOuhJ6Dq5Xm0OeHAzAGjCPZocfdMa6wfy',
   now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Farhana Akter"}'::jsonb, now(), now()),

  ('00000000-0000-0000-0000-000000000000',
   '5eed0000-0000-4000-a000-000000000003',
   'authenticated', 'authenticated', 'parent@acadigma.test',
   -- nosemgrep: generic.secrets.security.detected-bcrypt-hash.detected-bcrypt-hash -- dev-only fixture hash of the literal string `password123`, never used outside `supabase db reset`; not a leaked real credential.
   '$2a$10$PZTfVVhZa5rgDwgoJrTVOOuhJ6Dq5Xm0OeHAzAGjCPZocfdMa6wfy',
   now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Shahidul Islam"}'::jsonb, now(), now())
on conflict (id) do nothing;

update public.profiles
   set phone = case id
                 when '5eed0000-0000-4000-a000-000000000001'::uuid then '+8801711000001'
                 when '5eed0000-0000-4000-a000-000000000002'::uuid then '+8801711000002'
                 else '+8801711000003'
               end,
       onboarding_completed_at = now(),
       locale = 'en'
 where id in ('5eed0000-0000-4000-a000-000000000001',
              '5eed0000-0000-4000-a000-000000000002',
              '5eed0000-0000-4000-a000-000000000003');

-- The personal workspaces get friendlier names than the auto-generated ones.
update public.workspaces w
   set name = p.full_name || ' — Personal'
  from public.profiles p
 where w.owner_id = p.id
   and w.type = 'personal'
   and p.id in ('5eed0000-0000-4000-a000-000000000001',
                '5eed0000-0000-4000-a000-000000000002',
                '5eed0000-0000-4000-a000-000000000003');

-- ---------------------------------------------------------------------
-- 2. The school workspace
--    The insert triggers create: the owner membership, the school_profiles
--    row, the invite code, the Pro trial and the trialing subscription.
-- ---------------------------------------------------------------------
insert into public.workspaces (id, type, name, slug, owner_id, created_by, status)
values ('5eed0000-0000-4000-b000-000000000001', 'school',
        'Acadigma Model School', 'acadigma-model-school',
        '5eed0000-0000-4000-a000-000000000001',
        '5eed0000-0000-4000-a000-000000000001', 'active')
on conflict (id) do nothing;

-- A fixed invite code, so the join-by-code flow is testable by hand.
update public.workspaces
   set invite_code = 'ACD-DEMO-2026', invite_code_rotated_at = now()
 where id = '5eed0000-0000-4000-b000-000000000001';

-- ---------------------------------------------------------------------
-- 3. School profile — Dhaka, Sat-Thu, Asia/Dhaka, Bangladesh grade scale
--    (PRODUCT-DECISIONS 2.4, 2.5, 6.10)
-- ---------------------------------------------------------------------
update public.school_profiles
   set legal_name               = 'Acadigma Model School',
       eiin                     = '123456',
       board                    = 'BD National',
       school_type              = 'Secondary',
       medium                   = 'Bangla',
       address_line1            = 'House 42, Road 11, Banani',
       city                     = 'Dhaka',
       district                 = 'Dhaka',
       postal_code              = '1213',
       country                  = 'BD',
       contact_email            = 'office@acadigma.test',
       contact_phone            = '+8802222000000',
       motto                    = 'Learn. Lead. Serve.',
       timezone                 = 'Asia/Dhaka',
       -- ISO days: 6=Sat 7=Sun 1=Mon 2=Tue 3=Wed 4=Thu  (Friday off)
       working_days             = '{6,7,1,2,3,4}'::smallint[],
       date_format              = 'DD/MM/YYYY',
       currency                 = 'BDT',
       bin_number               = '004512345678',
       ai_billing_model         = 'shared_pool',
       -- Policy blobs: only the values this school overrides are stored.
       -- Everything else resolves from the Zod defaults in packages/contracts.
       attendance_policy        = '{"cutoff": "09:15",
                                    "late_counts_present": true,
                                    "half_day_counts_present": true,
                                    "min_attendance_bp": 7500}'::jsonb,
       academic_settings        = '{"grade_scale_code": "BD_GPA5",
                                    "pass_mark_percent": 33,
                                    "fail_any_subject_zero_gpa": true,
                                    "rank_by": "gpa_then_total"}'::jsonb,
       cover_policy             = '{"grace_minutes": 30,
                                    "enable_missed_punch": false,
                                    "credit_cover_at_own_rate": true,
                                    "unpaid_absence_deduction": false}'::jsonb,
       messaging_policy         = '{"parents_can_reply": true}'::jsonb,
       branding                 = '{"header_line_1": "Acadigma Model School",
                                    "header_line_2": "Banani, Dhaka 1213",
                                    "accent": "#059669"}'::jsonb
 where workspace_id = '5eed0000-0000-4000-b000-000000000001';

-- ---------------------------------------------------------------------
-- 4. Labels (PRODUCT-DECISIONS 1.4 — a title, not a role)
-- ---------------------------------------------------------------------
insert into public.custom_labels (id, workspace_id, base_role, name, color, sort_order, created_by)
values ('5eed0000-0000-4000-c000-000000000001', '5eed0000-0000-4000-b000-000000000001',
        'admin',   'Principal',      '#7C3AED', 10, '5eed0000-0000-4000-a000-000000000001'),
       ('5eed0000-0000-4000-c000-000000000002', '5eed0000-0000-4000-b000-000000000001',
        'admin',   'Vice-Principal', '#2563EB', 20, '5eed0000-0000-4000-a000-000000000001'),
       ('5eed0000-0000-4000-c000-000000000003', '5eed0000-0000-4000-b000-000000000001',
        'teacher', 'Senior Teacher', '#059669', 30, '5eed0000-0000-4000-a000-000000000001')
on conflict (id) do nothing;

-- The owner is the Principal.
update public.workspace_members
   set label_id = '5eed0000-0000-4000-c000-000000000001',
       employee_code = coalesce(employee_code,
                                app.next_id('5eed0000-0000-4000-b000-000000000001', 'staff')),
       department = 'Administration'
 where workspace_id = '5eed0000-0000-4000-b000-000000000001'
   and user_id = '5eed0000-0000-4000-a000-000000000001'
   and label_id is null;

-- ---------------------------------------------------------------------
-- 5. Memberships — teacher and parent
--    Inserted directly here because the seed runs as a privileged caller;
--    in the product these rows only ever come from app.accept_invitation()
--    or from an owner/admin action.
-- ---------------------------------------------------------------------
insert into public.workspace_members
  (workspace_id, user_id, role, status, label_id, department, subjects, phone, joined_at, created_by)
values
  ('5eed0000-0000-4000-b000-000000000001', '5eed0000-0000-4000-a000-000000000002',
   'teacher', 'active', '5eed0000-0000-4000-c000-000000000003',
   'Science', array['Physics', 'General Science'], '+8801711000002', now(),
   '5eed0000-0000-4000-a000-000000000001'),

  ('5eed0000-0000-4000-b000-000000000001', '5eed0000-0000-4000-a000-000000000003',
   'parent', 'active', null, null, '{}', '+8801711000003', now(),
   '5eed0000-0000-4000-a000-000000000001')
on conflict (workspace_id, user_id) do nothing;

update public.workspace_members
   set employee_code = app.next_id('5eed0000-0000-4000-b000-000000000001', 'staff')
 where workspace_id = '5eed0000-0000-4000-b000-000000000001'
   and user_id = '5eed0000-0000-4000-a000-000000000002'
   and employee_code is null;

-- Everyone's last-opened workspace: the school for staff, personal for the parent.
update public.profiles
   set last_active_workspace_id = '5eed0000-0000-4000-b000-000000000001'
 where id in ('5eed0000-0000-4000-a000-000000000001',
              '5eed0000-0000-4000-a000-000000000002');

-- ---------------------------------------------------------------------
-- 6. One pending invitation, so the invitations inbox is not empty.
--    Raw token (dev only): acadigma-demo-invitation-token
--    Redeem at /invite/acadigma-demo-invitation-token after registering
--    as newteacher@acadigma.test.
-- ---------------------------------------------------------------------
insert into public.workspace_invitations
  (id, workspace_id, channel, email, role, label_id, token_hash, token_prefix,
   message, invited_by, expires_at)
values
  ('5eed0000-0000-4000-d000-000000000001', '5eed0000-0000-4000-b000-000000000001',
   'email', 'newteacher@acadigma.test', 'teacher',
   '5eed0000-0000-4000-c000-000000000003',
   app.hash_token('acadigma-demo-invitation-token'), 'acadigma',
   'Welcome to Acadigma Model School.',
   '5eed0000-0000-4000-a000-000000000001',
   now() + interval '14 days')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 7. Preferences worth looking at in the UI
-- ---------------------------------------------------------------------
update public.user_preferences
   set theme_mode = 'dark', palette = 'emerald', language = 'bn'
 where user_id = '5eed0000-0000-4000-a000-000000000002';

update public.user_preferences
   set email_digest = 'weekly', push_enabled = false
 where user_id = '5eed0000-0000-4000-a000-000000000003';

-- ---------------------------------------------------------------------
-- 8. What just happened
-- ---------------------------------------------------------------------
do $$
declare
  v_plan text;
  v_trial date;
begin
  select p.code, (w.trial_ends_at at time zone 'Asia/Dhaka')::date
    into v_plan, v_trial
    from public.workspaces w
    join public.plans p on p.id = w.plan_id
   where w.id = '5eed0000-0000-4000-b000-000000000001';

  raise notice '--------------------------------------------------------';
  raise notice 'Acadigma Model School seeded (Dhaka, Sat-Thu, BD_GPA5).';
  raise notice '  plan: %   trial ends: %', v_plan, v_trial;
  raise notice '  invite code: ACD-DEMO-2026';
  raise notice '  owner@acadigma.test / teacher@acadigma.test / parent@acadigma.test';
  raise notice '  password for all three: password123';
  raise notice '--------------------------------------------------------';
end
$$;
