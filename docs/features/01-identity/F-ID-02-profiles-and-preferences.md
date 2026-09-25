# F-ID-02 — Profiles and preferences

|                  |                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Area             | auth                                                                                                                                 |
| Status           | planned                                                                                                                              |
| Owner branch     | `feat/identity-profiles-preferences`                                                                                                 |
| Depends on       | F-ID-01                                                                                                                              |
| Plan             | `docs/plan/ROADMAP.md` chunk 1                                                                                                       |
| Base44 reference | `docs/reference/base44-inventory/01-auth-tenancy-personal.md` §3 rows 31–35, 39, 46–48; §5.1 B3, B13; §5.2 D7; §5.3 W2, W7, W12, W15 |

## 1. Purpose

One place where a person tells Acadigma Campus who they are and how they want the app to behave, and one guarantee: those choices follow them from the school computer to their phone. It owns the account profile (name, avatar, phone, headline), the per-user preference set (theme mode, colour palette, density, language, notification channel defaults, default landing workspace), and the language switch between **English and বাংলা**. "Done" looks like: a teacher picks dark mode and Bangla on the staff-room PC, opens the PWA on her phone during the bus ride home, and it is already dark and already Bangla — no flash of the wrong theme, no re-picking.

The Base44 prototype had the entity for this (`UserPreferences`) and **zero references to it in `src/`** (inventory D7). Everything was `localStorage`: theme in `tf-mode`, palette in `tf-palette`. The personal-settings screen destructured a `setMode` function the theme context never exported, so clicking Light/Dark threw (W2); it shipped a _second, different_ five-palette list that wrote CSS variables straight onto `documentElement` and lost them on reload (W15); its notification toggles wrote `notif_*` fields that did not exist on the user schema and never visually flipped (W7); the school-settings notification panel was five `<Switch defaultChecked />` with no handler (B3); the Staff ID badge was computed from the user id at render and never persisted (B13); and the AI-usage and subscription panels on the profile page were hardcoded literals (B11, B12). None of the fake panels are rebuilt here — AI usage belongs to the teaching-intelligence area and plans to billing. This feature rebuilds only what is genuinely identity: profile, preferences, theme, language.

## 2. Roles and permissions

| Action                                                                                             | Self                                | Workspace owner/admin | Any active co-member | Platform staff | Permission key                                   |
| -------------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------- | -------------------- | -------------- | ------------------------------------------------ |
| Read own profile in full                                                                           | ✅                                  | —                     | —                    | ✅             | —                                                |
| Edit own profile (name, avatar, headline, phone)                                                   | ✅                                  | —                     | —                    | —              | `profile.self.write`                             |
| Read a co-member's directory card (name, avatar, role, custom label)                               | —                                   | ✅                    | ✅                   | ✅             | `members.read`                                   |
| Read a co-member's work contact (work email, work phone, department)                               | —                                   | ✅                    | ❌                   | ✅             | `members.contact.read`                           |
| Edit a member's **workspace-scoped** staff fields (employee no., department, subjects, work phone) | —                                   | ✅                    | —                    | —              | `members.staff_fields.write` (spec'd in F-ID-03) |
| Read / write own preferences                                                                       | ✅                                  | —                     | —                    | —              | `preferences.self.write`                         |
| Set the **workspace default** theme accent and language                                            | —                                   | ✅ owner/admin        | —                    | —              | `workspace.branding.write`                       |
| Read another user's preferences                                                                    | ❌ nobody, including platform staff |                       |                      |                |                                                  |

A member's _personal_ profile is user-owned and identical in every workspace. Anything a school controls about a person (employee number, department, taught subjects, custom label, role) lives on `workspace_members`, not on `profiles` — this is the split the prototype never made, which is why a teacher's "department" changed for every school they belonged to.

## 3. Data

Tenant key: `user_preferences` and `profiles` are **user-scoped, not workspace-scoped**. `notification_preferences` rows may optionally carry `workspace_id` for per-workspace overrides. Columns below are **proposed; DATA-MODEL.md wins**.

**`profiles`** — defined in F-ID-01 §3; this feature adds:

| column       | type                        | notes                                                                          |
| ------------ | --------------------------- | ------------------------------------------------------------------------------ |
| `headline`   | text (≤ 120)                | "Physics teacher · Class 9–12" — shown on directory cards and the CV (F-ID-06) |
| `avatar_url` | text                        | `public` bucket, `avatars/{user_id}/{uuid}.webp`                               |
| `timezone`   | text default `'Asia/Dhaka'` | personal fallback; school screens always use `school_profiles.timezone`        |

**`user_preferences`** (1:1 with `profiles`; proposed, DATA-MODEL.md wins)

| column                  | type                | default                                              | notes                                                                                                                                 |
| ----------------------- | ------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `user_id`               | uuid PK FK profiles |                                                      |                                                                                                                                       |
| `theme_mode`            | enum `theme_mode`   | `'system'`                                           | `light \| dark \| system`                                                                                                             |
| `palette`               | enum `palette_key`  | `'campus'`                                           | `campus \| emerald \| violet \| rose \| amber \| arctic` — the single list; the prototype's second five-palette list is dropped (W15) |
| `density`               | enum `ui_density`   | `'comfortable'`                                      | `comfortable \| compact`; compact is desktop-only in effect                                                                           |
| `language`              | enum `app_language` | `'en'`                                               | `en \| bn`                                                                                                                            |
| `reduce_motion`         | boolean             | false                                                | honours the OS setting when null-equivalent                                                                                           |
| `notification_channels` | jsonb               | `{"in_app":true,"push":true,"email_digest":"daily"}` | global channel defaults; per-category overrides live in `notification_preferences` (F-ID-07)                                          |
| `default_workspace_id`  | uuid                | null                                                 | "always open this workspace"; overrides the last-used cookie when set and still valid                                                 |
| `updated_at`            | timestamptz         | now()                                                | used for last-write-wins sync                                                                                                         |

Index: PK only; the table is read once per session and cached.

**`notification_preferences`** — owned by F-ID-07; referenced here because the preferences screen renders it.

**Enums mirrored in `packages/contracts`** (`ThemeMode`, `PaletteKey`, `UiDensity`, `AppLanguage`) and verified by the enum-parity test required by ARCHITECTURE §4.

**RLS, in words**

- `user_preferences` **select/insert/update**: `user_id = app.current_user_id()` only. **No platform-admin read policy** — a person's theme is nobody else's business, and keeping the table closed means it can never become a covert profiling surface. **No delete grant**; the row is created by the same `handle_new_user()` trigger that creates `profiles` and dies with the account.
- `profiles` peer reads go through the `member_directory` view (F-ID-01 §3), which exposes `id, full_name, avatar_url, headline` and joins `workspace_members` for role and custom label. The view is `security_invoker` so RLS on `workspace_members` does the tenant filtering.
- Avatar objects: `public` bucket, path-prefixed by user id; the storage policy allows insert/update/delete only where the first path segment equals `auth.uid()::text`.

Private files: none. Avatars are deliberately public so they can be rendered in emails and PDFs without signing.

## 4. Workflows

### 4.1 Edit my profile

**Trigger:** avatar in the top bar → "My profile", or shell settings → Profile.
**Phone:** a full-height `Sheet` with the avatar at the top (tap to change), fields stacked, a sticky Save button. Each field saves on blur with an inline "Saved" tick; the Save button exists for the keyboard-submit path and for screen-reader flow.

1. Fields: full name (required, 2–80), headline (≤ 120), phone (opens the verify flow from F-ID-01 §4.7 if changed), avatar.
2. Avatar: pick from camera or gallery → client-side crop to a square → resize to 512×512 → encode WebP ≤ 200 KB → upload to the `public` bucket → `profiles.avatar_url`. The old object is deleted after a successful update.
3. `updateProfile` server action validates with `UpdateProfileInput`.

**Outcome:** the new name/avatar appears everywhere within one query invalidation (the profile query key is `['profile', userId]`, not workspace-scoped).
**Notifications:** none.
**Audit:** `profile.updated` with the changed field names only — never the values, because names and phone numbers are PII and `audit_events` is retained indefinitely.
**Failure cases:** upload rejected (wrong MIME by magic-byte check, > 5 MB pre-resize) → inline error, no partial write; a `null` avatar is only written when the user explicitly removes it (the prototype's W12 bug, where an empty picker overwrote an existing photo, cannot recur because the field is omitted from the payload when untouched).

### 4.2 Change theme and palette

**Trigger:** top bar → the appearance control (a `Sheet` on phone, a popover on desktop), or settings → Appearance.

1. Three mode chips (Light / Dark / System) and a palette row of six 44 px swatches.
2. The change applies **optimistically and instantly** by setting `data-theme` and the palette data attribute on `<html>`, then `updatePreferences` persists it.
3. On the next page load, the **server** reads `user_preferences` in the root layout and renders `<html data-theme=… data-palette=…>` — so there is no flash of the wrong theme. A cookie (`acx_theme`, non-httpOnly, mirrored by the server on every preference write) covers the pre-session and offline cases.
4. `system` mode attaches a `prefers-color-scheme` listener; the OS switching at sunset flips the app without a reload.

**Outcome:** identical appearance on every device within one session refresh.
**Audit:** `preferences.updated` (field names only).
**Failure cases:** the write fails offline → the optimistic UI stays, the mutation is queued by TanStack Query and replays on reconnect; `localStorage` is only a cache and is never the source of truth (PRODUCT-DECISIONS §1.10).

### 4.3 Switch language (English ↔ বাংলা)

1. Settings → Language, two options with each name written in its own script (`English`, `বাংলা`).
2. `updatePreferences({language})` → the server sets the `NEXT_LOCALE` cookie and the route re-renders with the new message catalogue.
3. Bangla uses a bundled Bengali webfont subset (the same family embedded in the PDF renderer per ARCHITECTURE §5) so report cards and the UI agree typographically.
4. Numbers, dates and currency are formatted with `Intl` bound to the active locale; **calendar dates stay Gregorian** and money stays `৳` with Western digits by default — a `bn` user sees Bengali labels, not Bengali numerals, unless `numeral_system` is later added.

**Outcome:** all UI chrome, validation messages and emails switch. User-entered content (a student's name, a diary entry) is never translated.
**Failure cases:** a missing Bangla key falls back to the English string and logs a `i18n.missing_key` warning with the key; CI fails if the `bn` catalogue is missing keys that exist in `en` and are marked `required`.

### 4.4 Set notification channel defaults

Settings → Notifications renders the global channel switches (in-app is always on and shown disabled, push, email digest: off / daily / weekly) plus the per-category matrix owned by F-ID-07. Saving writes `user_preferences.notification_channels` and `notification_preferences` in one action. This replaces the prototype's five dead switches (B3) and the five non-existent `notif_*` user fields (W7).

### 4.5 Set a default workspace

Settings → General → "Open this workspace by default": a select over the user's active memberships plus "Last used". Writing `default_workspace_id` makes `resolveLandingRoute()` (F-ID-03 §5.3) prefer it. If that membership later becomes `removed`, the resolver falls back to last-used and the stale value is cleared on read.

### 4.6 Preference sync across devices

There is no realtime channel for preferences (that would be noise). Sync is: read on session start, read on window focus after > 5 minutes idle, and last-write-wins by `updated_at`. Two devices changing the theme within the same minute converge on the later write; this is explicitly acceptable and documented in the screen's help text ("Changes apply to your other devices next time you open them").

## 5. Business rules and calculations

| Rule                            | Value                                                                                                                                                                                 | Where                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Full name                       | 2–80 chars, trimmed, no control characters, not only whitespace                                                                                                                       | `packages/contracts/src/identity/profile.ts`  |
| Headline                        | ≤ 120 chars, single line                                                                                                                                                              | same                                          |
| Avatar                          | ≤ 5 MB pre-resize; accepted `image/jpeg,image/png,image/webp` verified by magic bytes; output 512×512 WebP quality 82, ≤ 200 KB                                                       | `packages/domain/media/avatar.ts`             |
| Palette list                    | exactly six keys, one source (`packages/ui/tokens/palettes.ts`) consumed by both the picker and the CSS-variable emitter                                                              | `packages/ui`                                 |
| Theme resolution order          | `user_preferences.theme_mode` → `acx_theme` cookie → `prefers-color-scheme` → light                                                                                                   | `packages/ui/theme/resolveTheme.ts`           |
| Language resolution order       | `user_preferences.language` → `NEXT_LOCALE` cookie → `Accept-Language` (bn* → `bn`) → `en`                                                                                            | `apps/web/i18n/resolveLocale.ts`              |
| Density                         | `compact` is ignored below the `lg` breakpoint (phone layouts are already compact)                                                                                                    | `packages/ui`                                 |
| Preference conflict             | last write wins by `updated_at`; ties broken by the server clock                                                                                                                      | `updatePreferences`                           |
| `default_workspace_id` validity | must be an `active` membership at read time, else treated as null and cleared                                                                                                         | `packages/domain/workspace/resolveLanding.ts` |
| Profile-completeness %          | **not** defined here — it is the CV score in F-ID-06 §5 and applies to `teacher_profiles`, not `profiles`                                                                             | —                                             |
| Staff ID                        | is **not** a profile field; the per-workspace employee number lives on `workspace_members.employee_no` and is generated by `app.next_id(workspace_id,'staff')` when blank (fixes B13) | F-ID-03                                       |

## 6. UI

Components: `FormSheet`, `AvatarUploader`, `SegmentedControl`, `SwatchRow`, `SettingsSection`, `SettingsRow`, `Switch`, `Select`, `InlineAlert`, `Skeleton`.

| Screen / route                                                          | 360×800                                                                                                                         | ≥1024                                                                                                  | Primary action                | Empty                                                  | Loading                                       | Error                                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------- |
| My profile — `/app/settings/profile` and `/personal/settings` → Profile | Full-height sheet reached from the avatar; avatar 96 px centred at the top; fields stacked; sticky Save                         | Two-column settings page: left section nav, right form at 640 px; avatar inline left of the name field | Save                          | n/a (always has a name)                                | Field skeletons, avatar shimmer               | Inline per field; upload errors sit under the avatar                    |
| Appearance — same routes, Appearance section                            | Mode chips as a full-width `SegmentedControl`; palette swatches in a 6-across grid at 44 px; a live preview card below          | Popover from the top bar **and** the settings section; preview card 320 px                             | applies immediately (no Save) | n/a                                                    | none (instant)                                | Toast "Couldn't save — we'll retry" while the optimistic state stands   |
| Language — Language section                                             | Two large radio rows, each label in its own script, with a one-line sample sentence underneath                                  | Same rows in the right panel                                                                           | applies immediately           | n/a                                                    | Route transition spinner on the locale switch | Falls back to `en` with an `InlineAlert` if the catalogue fails to load |
| Notifications — Notifications section                                   | Grouped switch list; category rows collapse under their category header; sticky Save is **not** used — each switch saves itself | Matrix table: categories × channels                                                                    | per-row save                  | Copy explaining in-app is always on                    | Row-level skeletons                           | Per-row revert with a toast                                             |
| General — General section                                               | "Open by default" select, timezone display (read-only, from the workspace), "Reduce motion" switch                              | Same                                                                                                   | applies immediately           | Select shows "Last used" when there are no memberships | Skeleton                                      | Inline                                                                  |

Empty/edge states worth naming: a user with no avatar sees initials on a palette-derived background (deterministic hash of the user id — the same avatar everywhere, never a random colour per render); a user with exactly one workspace does not see the "Open by default" row at all.

## 7. Server contracts

Schemas in `packages/contracts/src/identity/profile.ts` and `.../preferences.ts`. Actions in `apps/web/app/(shared)/settings/actions.ts`.

| Action / handler         | Input schema                                                                                                                                       | Output                                                                                                 | Errors                                                            | Idempotency                     | Rate limit |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------- | ---------- |
| `getProfile`             | `GetProfileInput` {}                                                                                                                               | `ProfileDto` {id, full_name, headline, avatar_url, email, phone, phone_verified_at, is_platform_admin} | `UNAUTHENTICATED`                                                 | n/a                             | 120/min    |
| `updateProfile`          | `UpdateProfileInput` {full_name?, headline?, avatar_url?: string \| null} — partial, at least one key                                              | `ProfileDto`                                                                                           | `VALIDATION`, `UNAUTHENTICATED`                                   | natural (last write wins)       | 60/h       |
| `createAvatarUploadUrl`  | `AvatarUploadInput` {content_type, byte_size}                                                                                                      | `{ upload_url, object_path }`                                                                          | `FILE_TOO_LARGE`, `UNSUPPORTED_TYPE`                              | n/a                             | 20/h       |
| `getPreferences`         | `GetPreferencesInput` {}                                                                                                                           | `UserPreferencesDto`                                                                                   | `UNAUTHENTICATED`                                                 | n/a                             | 120/min    |
| `updatePreferences`      | `UpdatePreferencesInput` {theme_mode?, palette?, density?, language?, reduce_motion?, notification_channels?, default_workspace_id?: uuid \| null} | `UserPreferencesDto` + sets `acx_theme` / `NEXT_LOCALE` cookies                                        | `VALIDATION`, `WORKSPACE_NOT_MEMBER` (bad `default_workspace_id`) | last write wins by `updated_at` | 120/h      |
| `getMemberDirectoryCard` | `MemberCardInput` {workspace_id, user_id}                                                                                                          | `MemberCardDto` {full_name, avatar_url, headline, role, custom_label}                                  | `FORBIDDEN`                                                       | n/a                             | 240/min    |

The root layout calls `getPreferences` server-side (uncached per user, `revalidate: 0`) so the first painted HTML already carries the right `data-theme`, `data-palette` and `lang` attributes.

## 8. Parts (build chunks)

**Part 1 — `user_preferences` table, server read, no-flash theming** · Migration (table, enums, `handle_new_user()` extension, RLS), `getPreferences`/`updatePreferences`, root-layout server read, `acx_theme` cookie mirror, `resolveTheme`. · Files: `supabase/migrations/*_user_preferences.sql`, `packages/ui/theme/*`, `apps/web/app/layout.tsx`. · Tests: pgTAP (no cross-user read, no platform-admin read, no delete grant), unit tests for `resolveTheme` precedence, a Playwright assertion that the first paint in dark mode has no light-mode frame. · **Demo:** set dark on one browser, hard-reload — no flash; open a second browser signed in as the same user — already dark.

**Part 2 — Profile screen and avatar pipeline** · `/settings/profile` in both shells, `updateProfile`, `AvatarUploader` with crop+resize, storage policy, initials fallback, `profile.updated` audit. · Tests: magic-byte rejection, oversize rejection, omitted-field semantics (no accidental null), pgTAP on the storage policy path prefix. · **Demo:** change name and photo on a 360×800 viewport; the top bar, the member directory and a generated PDF header all show the new values.

**Part 3 — Appearance and density** · Palette single-source tokens, six swatches, `SegmentedControl`, preview card, popover in the top bar, optimistic apply + queued retry, `reduce_motion` wiring into the motion primitives. · Tests: a unit test asserting the picker's palette list is literally the tokens module (no second list — guards against W15), axe on the picker, offline mutation replay test. · **Demo:** switch palette offline in the PWA, come back online, reload — the choice survived.

**Part 4 — Bangla (bn) localisation and the language switch** · `next-intl` (or equivalent) wiring, `en`/`bn` catalogues for this area's strings, locale cookie, Bengali font subset shared with the PDF renderer, `Intl` formatting helpers, CI key-parity check, missing-key fallback logging. · Tests: catalogue parity test, a Playwright run of the sign-in → settings journey entirely in `bn`, a snapshot asserting no hardcoded English remains in this area's components. · **Demo:** switch to বাংলা on a phone; every screen in F-ID-01/02 reads Bangla and the layout does not overflow at 360 px.

## 9. Acceptance criteria

1. **Given** a user whose `theme_mode` is `dark`, **when** they load any route on a fresh browser with no `localStorage`, **then** the server-rendered HTML already has `data-theme="dark"` and no light-mode frame is painted.
2. **Given** a user who sets the palette to Emerald on device A, **when** they open the app on device B, **then** device B renders Emerald without any manual action.
3. **Given** a user editing their profile, **when** they change only the headline and save, **then** `avatar_url` and `full_name` are unchanged in the database (omitted fields are never nulled).
4. **Given** an uploaded file renamed to `.png` but containing a PDF, **when** it is submitted as an avatar, **then** the server rejects it on magic bytes and nothing is written to storage.
5. **Given** any user, **when** they attempt to read another user's `user_preferences` row through the browser Supabase client, **then** zero rows are returned — including when the caller is a platform admin.
6. **Given** a user with `language = 'bn'`, **when** they open `/login` after signing out, **then** the page renders in Bangla because the `NEXT_LOCALE` cookie outlives the session.
7. **Given** a Bangla UI at 360×800, **when** the longest label in each settings section renders, **then** no text is clipped and no horizontal scroll appears.
8. **Given** a missing `bn` translation key, **when** the page renders, **then** the English string is shown and a structured warning with the key is logged; **and** CI fails if the key was marked required.
9. **Given** two devices changing the theme within the same minute, **when** both writes land, **then** the row reflects the later `updated_at` and neither device errors.
10. **Given** a user whose `default_workspace_id` points at a membership that has since been `removed`, **when** they sign in, **then** they land on their last-used or first active workspace and the stale default is cleared.
11. **Given** a co-member viewing the staff directory, **when** they open a colleague's card, **then** they see name, avatar, headline, role and custom label, and **not** the colleague's personal phone or email.
12. **Given** a profile update, **when** `audit_events` is inspected, **then** the row records `profile.updated` with the list of changed field names and no field values.

## 10. Tests

- **Unit:** `resolveTheme` (all four precedence branches), `resolveLocale` (including `Accept-Language: bn-BD,en;q=0.8`), avatar validation/resize math, `initialsFor(userId)` determinism, name/headline validators.
- **DB (pgTAP):** `user_preferences` cross-user select/update/insert denied; platform admin select denied; no delete grant; `member_directory` view returns only co-members of workspaces where the caller has an `active` membership; avatar storage policy rejects a path whose first segment is another user's id.
- **Integration:** `updateProfile` partial semantics; `updatePreferences` rejecting a `default_workspace_id` the caller is not an active member of; cookie mirroring on every preference write.
- **E2E (360×800 and 1280×800):** `profile-edit-avatar`, `theme-persists-across-devices` (two contexts), `language-switch-bn`, `offline-theme-change-replays`.
- **A11y:** axe on every settings section; the palette swatches are a labelled radio group reachable by keyboard; the theme control announces the selected mode as text.
- **Performance budgets:** root-layout preference read ≤ 25 ms server-side (single PK lookup); the settings route ships ≤ 40 KB of JS beyond the shell; no layout shift (CLS ≤ 0.02) when the avatar loads (reserved box).
- **Contract parity:** the enum-parity test (ARCHITECTURE §4) covers `theme_mode`, `palette_key`, `ui_density`, `app_language`.

## 11. Open questions

- **OQ-1: Bangla scope in v1.** PRODUCT-DECISIONS §1.10 lists `language` in `user_preferences` but does not say whether `bn` ships complete at launch. **Default assumed:** `bn` ships for auth, onboarding, navigation, settings and notifications (this area) at Release 1, and the remaining areas add their catalogues as they land; the switch is visible from day one because a half-Bangla app is still more useful to a BD teacher than an English-only one. Owner to confirm.
- **OQ-2: Bengali numerals.** Not decided. **Default assumed:** Western digits everywhere, including in `bn`, because marks, money and student IDs are cross-referenced with government paperwork that uses them.
- **OQ-3: Workspace-level default theme/language.** PRODUCT-DECISIONS does not mention school branding beyond the logo. **Default assumed:** a school may set a _default_ accent and language for new members (`school_profiles.default_language`, `default_palette`), which seeds `user_preferences` at first join and is overridable by the member forever after. Flagged for DATA-MODEL.
- **OQ-4: Where the work email/phone lives.** A teacher's personal phone (F-ID-01) and their school-published contact are different things. **Default assumed:** `workspace_members.work_email` / `work_phone`, admin-editable, member-editable, visible to co-members with `members.contact.read`. Confirmed in F-ID-03 §3.

**§8 Part 4 status (2026-09-25, D-401):** a demo-cut slice shipped ahead of the full Part — the `acadigma_locale` cookie mechanism (unchanged, still no `user_preferences` table or migration) now reaches the whole signed-in school/personal/family shell, not only the auth screens: `<html lang>`, the school shell's sidebar/bottom nav (previously stuck on English regardless of the cookie), a language switch in a new `UserMenu` in every shell's top bar, the read-only banner, 404/error/forbidden pages, and the placeholder dashboard. Settings and the onboarding wizard were already correct. OQ-2 (Bengali numerals) is now settled as **Western digits, confirmed** — `toIntlLocale()` pins `-u-nu-latn` on `bn` so `Intl` formatting never falls back to the locale's own Bengali numbering system. Still open for the full Part 4: `user_preferences` (theme/palette/density/language as a real column), the Settings → Language screen, cross-device sync, and OQ-1/OQ-3.
