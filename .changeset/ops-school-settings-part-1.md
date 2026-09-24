---
"@acadigma/web": minor
"@acadigma/contracts": minor
"@acadigma/domain": minor
"@acadigma/db": minor
"@acadigma/ui": minor
---

F-OP-07 School settings, Part 1 remainder (D-200): `/app/settings` (grouped rows with search), the read-only "How this school works" page for every member, the school profile form and branding with a live report-card header preview.

- `packages/contracts/src/settings.ts`: `schoolProfileFieldsSchema`, `schoolTypeSchema`, `updateSchoolProfileInputSchema`, `updateBrandingInputSchema` (version = `updated_at`). `./identity/school` is now an export subpath.
- `packages/domain/src/settings/header.ts`: `renderHeaderLine` / `unknownHeaderTokens` for `{token}` header lines.
- `packages/db/src/repositories/settings.ts`: `getSchoolProfile`, `updateSchoolProfile` with optimistic concurrency (a stale version returns `conflict`, nothing is overwritten) and a duplicate-EIIN `conflict` on the `eiin` field.
- `apps/web/app/(school)/app/settings/profile-actions.ts`: `updateSchoolProfile` / `updateBranding`: owner/admin only, `requireWritable` before any write, unknown header tokens refused.
- `packages/ui/src/components/ui/native-select.tsx` (new, shadcn `new-york-v4`).
