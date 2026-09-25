---
"@acadigma/contracts": patch
"@acadigma/db": patch
---

F-OP-06 Part 1: staff schema, RLS and the compensation split. New tables `staff_records`, `staff_compensation` (period-versioned, exclusion constraint) and `staff_documents`; the `staff_directory` view; `app.staff_hourly_rate` and `app.can_open_staff_document`; the membership↔record status trigger; default `custom_labels` seeding for new school workspaces. Contracts (`@acadigma/contracts/operations/staff`) and a read-only repository (`@acadigma/db/repositories/staff`) ship with it — no server actions or UI yet (Parts 2-5).
