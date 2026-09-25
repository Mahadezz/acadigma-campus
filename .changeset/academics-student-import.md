---
"@acadigma/web": minor
"@acadigma/contracts": minor
"@acadigma/domain": minor
"@acadigma/db": minor
---

F-AC-02 §4.7 bulk student import, demo cut (D-106): owners and admins upload an Excel (.xlsx) or CSV register from a bilingual template, see every bad row by line and column in plain English or Bangla, and import the valid rows — each through `admit_student`, idempotent per batch and row — with the report kept in `student_import_batches`. Re-uploading a register skips students already on the roster; `.xlsx` files that would unpack too large are refused. New permission `students.import`.
