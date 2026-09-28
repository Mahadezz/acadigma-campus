---
"@acadigma/db": patch
---

`createReportRun` is proven through real PostgREST under the new `report_runs` column-level insert grant: a client can no longer insert a run that is already `ready` or carries a `file_id` (D-77).
