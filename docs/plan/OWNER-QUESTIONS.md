# Owner questions

Product decisions a builder met while the owner was away, each shipped with a
safe, reversible default so the build could continue (BUILDER-BRIEF: "A genuine
product decision → OWNER-QUESTIONS.md + safest reversible default + log it +
continue"). Each links the decision entry that records the default in code.

## Identity lane

### F-ID-03 Part 6 — role changes, staff fields, labels (D-111, 2026-09-29)

1. **Work email on a staff member?** `workspace_members` has one `phone` and no
   work-email column, but the spec's `updateMemberStaffFields` lists `work_email`.
   **Default shipped:** the fields that exist — employee code, department, work
   phone. Adding a school-published work email (and splitting personal vs work
   phone) is an expand-only migration. _Do schools want a work email in v1?_
   (spec §11 OQ-7)

2. **A member's teaching subjects.** `workspace_members.subjects` is a free-text
   `text[]`; the spec's `subject_ids` into the subject catalogue does not exist.
   **Default shipped:** subject assignment stays with the academic area that
   owns the catalogue (F-AC-01); it is not on the Team & Access staff form.
   _Confirm subjects belong to the academic area, not identity._ (spec §11 OQ-8)

3. **A Bangla name for a custom label.** `custom_labels` has one `name`, no
   `name_bn`, though the app is bilingual (bn/en). **Default shipped:** one
   `name`, typed in whichever language the school prefers; `name_bn` is
   expand-only if wanted. _Do labels need both languages?_ (spec §11 OQ-9)
