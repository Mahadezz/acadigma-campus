# Test Report — Design D-402, readable audit trail sentences

|         |                                                                |
| ------- | -------------------------------------------------------------- |
| Feature | Design lane (4) — F-ID-09 audit viewer, sentence layer         |
| Part    | Readable sentences on `/app/audit` (D-402)                     |
| Spec    | `F-ID-09-audit-viewer.md` §4.1 (list renders sentences); D-402 |
| PR      | #49                                                            |
| Status  | **PASS WITH KNOWN ISSUES**                                     |
| Date    | 2026-09-25                                                     |
| Run by  | Claude (design lane builder)                                   |

## 1. Scope

Before, `/app/audit` on the demo school read "Demo Owner updated a profiles record ()". The desktop table's "Action" column printed the raw code (`profiles.update`), and unknown actions showed their code. Now:

- **Generic rows use a noun per table.** Each table's noun is in `GENERIC_TABLE_NOUNS`, English and Bengali: "updated a user profile", "added a holiday", "updated a school setting".
- **No gaps.** `renderAuditSentence` drops a parenthetical whose value is missing, uses "a member" or "the school" when there is no subject or workspace name, and collapses spaces.
- **Unknown actions** read "{actor} made a change".
- **One sentence everywhere.** The card title, the desktop "Action" column, the detail sheet title and the correlation list all show the same sentence through `BnEnText`.
- **Detail sheet.** It leads with the readable noun. The raw table and row id stay as a muted technical reference, as F-ID-09 §4.1 intends.
- **Unchanged:** still owner-only (`audit.read`), no migration, and the SQL catalog sentences are untouched (see D-402 §5).

## 2. Unit (Vitest)

`pnpm test`: **94 files, 1057 tests, all passed** (after merging `origin/main` @ `c1a5060`, which added `grade_scales` and `grade_bands` — both got nouns, as the coverage test requires). New or changed tests:

| Test file           | What it proves                                                                                                                                                                                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `render.test.ts`    | Readable fallback for unknown actions; generic rows name what changed (en and bn); a missing `({fields})` is dropped; missing subject and workspace get stand-ins; **every action in the full catalog, in both languages, renders with no `()`, no double space, no `_`, no `{`, and no "<table> record"**. |
| `catalog.test.ts`   | Every audited table has a noun in both languages; a table without one falls back to "a record".                                                                                                                                                                                                             |
| `sentence.test.tsx` | The web component renders the sentence with separate `lang="en"` and `lang="bn"` runs.                                                                                                                                                                                                                      |

## 3. Database (pgTAP)

Not applicable: no migration or grant.

## 4. Screenshots and axe

View-only as the demo owner, one sign-in per run. Axe is WCAG 2.1 A/AA. "Raw text" means a table name in a sentence, "()", or "unrecognised".

| Screen                                               | Viewport | axe  | Raw text on screen                       |
| ---------------------------------------------------- | -------- | ---- | ---------------------------------------- |
| before (production)                                  | 360      | none | **yes** ("updated a profiles record ()") |
| before (production)                                  | 1280     | none | action codes in the Action column        |
| after (this branch, local `next start` on port 3104) | 360      | none | no                                       |
| after (this branch)                                  | 1280     | none | no                                       |

Files are in [assets/d402/](assets/d402/): `before-audit-en-360x800(-full)`, `before-audit-en-1280x800`, `after-audit-en-360x800(-full)`, `after-audit-en-1280x800`.

## 5. Known issues

| #   | Issue                                                                                                                                                                                                                                                                                                                              | Severity |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | The audit page picks its language from `profiles.locale`, not the language cookie. The demo owner's profile is English, so a Bengali screenshot is not possible without changing their profile, which would be a write. The Bengali sentences are proven in unit tests. Reading the shared locale is the Bengali-shell Part's job. | low      |
| 2   | The SQL `audit_action_catalog.sentence_en/bn` columns keep the old wording. Nothing renders them (D-402 §5).                                                                                                                                                                                                                       | low      |
| 3   | The dashboard's curated-only filter (D-400) could now include generic rows; left for a later design pass.                                                                                                                                                                                                                          | low      |
| 4   | My first "after" run hit another lane's server on port 3100. Those shots were discarded; the numbers above come from my own build on port 3104.                                                                                                                                                                                    | n/a      |

> I ran these tests or read their output myself. The numbers above are copied from real runs.
