# `.claude/` — agent configuration

What this folder is, what is safe to change, and the two things the lead must do
before the config is correct.

Full rationale: `docs/engineering/CLAUDE-CODE-PRACTICES.md`.

---

## ⚠️ Two corrections the lead must make

**1. Move `"Bash(git push *)"` out of `permissions.deny` and into
`permissions.ask`.**

It is currently in `deny`, which is wrong. `CLAUDE.md` requires "push on the
first commit and open a draft PR" (D-14), and a deny rule cannot be carved out
by a narrower allow rule — `Bash(git push --force *)` staying in `deny` is the
protection we actually want. As written, the config blocks the documented
workflow.

I could not make this edit myself: the permission classifier refuses agent edits
to `.claude/settings.json` after it has been created, which is a reasonable
guard and not one I tried to route around.

**2. Add one line to `.gitignore`** (I was told not to edit that file):

```gitignore
.claude/settings.local.json
```

`.claude/settings.json` and this README **are** committed — they are the shared
team policy. `.claude/settings.local.json` is per-developer and must not be.

`graphify-out/` already needs no action: another agent added it to `.gitignore`
while this work was in progress. It is a 2.9 MB derived artefact rebuilt in
seconds by `graphify update .`; see `docs/engineering/GRAPH-ENGINEERING.md`.

---

## What is in here

| File | Committed | Purpose |
| --- | --- | --- |
| `settings.json` | yes | Shared permission policy: what an agent may run unattended, what it must ask about, what it may never do or read. |
| `settings.local.json` | **no** | Your own additions. Same schema. Takes precedence over `settings.json`. Create it if you want to auto-approve something the team file asks about. |
| `README.md` | yes | This file. |

Settings files are **strict JSON** — a `//` comment or a trailing comma makes
Claude Code report a Settings Error at the next start. That is why the
explanation lives here rather than in the file.

Run `/status` inside Claude Code to confirm which settings files loaded.

## How the three lists are meant to be read

- **`allow`** — read-only inspection and the green-path verification commands
  (`pnpm verify`, `typecheck`, `lint`, `test`, `db:test`, `git status/diff/log`,
  `gh pr view`). These are the commands a session runs dozens of times; every
  prompt on one of them is a round trip that costs tokens and attention for no
  decision.
- **`ask`** — anything that changes shared state or costs money: commits, PR
  creation, dependency changes, `db:push`, `db:diff`, long-running `dev`/`e2e`.
  A human says yes once per action.
- **`deny`** — secrets, generated output, and the destructive operations this
  repo's rules already forbid: force-push, hard reset, `supabase db reset`,
  `db push` to production, `vercel deploy`, publishing a package.

`deny` beats `allow` unconditionally; an allow rule can never carve an exception
out of a deny rule. A matching `ask` rule also beats a narrower `allow`.

## What the deny rules do *not* do

Worth knowing before anyone treats this file as a security control — it is a
guard rail against accident, not a sandbox:

- A Bash deny rule matches the command as written. `Bash(rm -rf *)` does not
  match `/bin/rm -rf x` or `sh -c 'rm -rf x'`.
- Environment runners are not unwrapped. `npx`, `pnpm dlx` and `docker exec`
  execute whatever follows them, which is why both `npx` and `pnpm dlx` sit in
  `ask`.
- `Read`/`Edit` deny rules are the only file rules Claude Code consults. A path
  rule written for `Write`, `Glob` or `NotebookEdit` is accepted and then
  ignored, with a startup warning — so we write `Edit(path)` and `Read(path)`
  and never `Write(path)`.
- `permissions.defaultMode` is deliberately **not** set here: the values `auto`
  and `bypassPermissions` have no effect from a project settings file anyway.

The real boundary is the one in `CLAUDE.md`: the database and the server.

## Why there is no `.claudeignore`

There isn't one, in any version of Claude Code. Checked against
<https://code.claude.com/docs/en/settings> and
<https://code.claude.com/docs/en/permissions> on 2026-09-17: there is no
`ignorePatterns` key and no `.claudeignore` file. The supported mechanism for
"never read this" is a `Read(...)` **deny rule**, which is what `settings.json`
uses for `node_modules/`, `.next/`, `.turbo/`, `coverage/`,
`playwright-report/`, `test-results/`, `graphify-out/cache/` and
`pnpm-lock.yaml`.

Search tools (Grep, Glob) already skip everything in `.gitignore`, which covers
most of the same paths. The deny rules add the case `.gitignore` does not: a
direct `Read` of a 350 KB lockfile or a generated bundle.

`docs/reference/base44-inventory/` is **not** denied. It is 15 files of product
reference that a spec session legitimately needs. The rule that keeps it out of
context is behavioural, not mechanical — read the feature spec, not the
inventory — and it lives in `docs/engineering/CLAUDE-CODE-PRACTICES.md`.
