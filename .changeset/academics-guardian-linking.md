---
"@acadigma/web": minor
"@acadigma/domain": minor
"@acadigma/db": minor
"@acadigma/contracts": minor
---

F-AC-02 Part 4 (D-108): guardian linking. On a student's profile an owner or admin can invite a guardian to the parent app: a single-use link for that child (30 days) to copy or send on WhatsApp. The guardian signs in or registers, sees the school and child, and accepts; they become a parent of the school linked to that child only, and `/family` lists the child and their published results. Owners and admins can remove a parent's access, which ends at once. Adds the `students.guardian.invite` permission.
