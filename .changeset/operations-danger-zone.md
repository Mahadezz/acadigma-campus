---
"@acadigma/web": patch
"@acadigma/contracts": patch
"@acadigma/db": patch
"@acadigma/domain": patch
---

F-OP-07 Part 6, danger zone (D-211): Settings → Danger zone (owner only) — download a zip of every school record as CSV (3 a day, audited), archive and restore a school (archived = read-only for everyone, owner can restore within 12 months), and schedule a school's deletion 30 days out with a banner on every screen and a cancel button; a daily cron (`/api/cron/workspaces/purge`) deletes schools whose grace has ended. All rules are enforced in the database (`archive_workspace`, `schedule_workspace_deletion`, `purge_due_workspace` & co., pgTAP `48_danger_zone.sql`). `requireWritable` now also refuses writes in an archived school. New: `getDangerZoneState`/`archiveWorkspace`/`unarchiveWorkspace`/`scheduleWorkspaceDeletion`/`cancelWorkspaceDeletion`/`exportWorkspaceData`/`purgeDueWorkspaces` (`@acadigma/db`), `confirmNameInputSchema`/`DANGER_ERROR`/`dangerZoneStateSchema` (`@acadigma/contracts`).
