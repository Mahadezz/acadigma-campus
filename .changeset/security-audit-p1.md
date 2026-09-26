---
"@acadigma/db": patch
---

`listPublishCandidates` pages through `results` so an exam with more than 1,000 students is no longer cut off at PostgREST's `max_rows` (D-75). Generated types follow the `staff_documents` composite file FK.
