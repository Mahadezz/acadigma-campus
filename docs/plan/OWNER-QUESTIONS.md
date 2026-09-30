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

### Legal acceptance and guardian consent (D-114, 2026-09-30)

1. **Interim legal texts are live.** Terms of Use, Privacy Notice and a DPA
   summary are published at `/legal/*`, marked "interim — not reviewed by a
   lawyer" (`apps/web/lib/legal/texts.ts`). **Default shipped:** short, honest
   interim texts rather than no documents at all. _Please have counsel review
   them (with `docs/product/legal/*-DRAFT.md`), and supply the legal entity
   name, address and the Bengali versions; each reviewed text ships as a new
   version._
2. **The DPA is accepted in the product before counsel has settled it**
   (`DPA-DRAFT.md` says not to). **Default shipped:** the owner accepts the
   interim summary on the school's behalf and is told a full agreement will
   follow. _Is that acceptable for the pilot schools, or should school
   creation wait for the reviewed DPA?_
3. **Parent consent wording** (English and Bengali) is on the parent-link
   screen. _Please have a Bengali-speaking teacher and parent read it, and
   counsel confirm it is enough for PDPA parental consent (audit lawyer
   question 3)._
4. **"18 or older" at sign-up.** **Default shipped:** the sign-up checkbox
   says "I am 18 or older". _Counsel: may a person under 18 hold a teacher
   account (audit lawyer question 11)?_
