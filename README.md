# Acadigma Campus

School operations for Bangladesh — attendance, timetables, marks, fees, messaging,
hiring and a marketplace — in one installable web app designed for the phone in a
teacher's hand.

The flagship of the Acadigma suite (`DECISION-LOG` D-10). One Next.js 15 app on
Vercel, one Supabase project, one design system. Android (Capacitor) and Windows
(Tauri) wrappers come after web Release 1.

---

## Stack

| Layer    | Choice                                       | Why                                                                  |
| -------- | -------------------------------------------- | -------------------------------------------------------------------- |
| Web      | Next.js 15 App Router, React 19, TypeScript  | Server Components + Server Actions **are** the API (ARCHITECTURE §1) |
| Data     | Supabase Postgres 17, RLS on every table     | The database is the security boundary, not the UI                    |
| Styling  | Tailwind v4 + shadcn (new-york)              | Tokens in `packages/ui`; no ad-hoc colours in feature code           |
| State    | TanStack Query, scoped by workspace          | No global store                                                      |
| Payments | SSLCommerz (BDT) behind a provider interface | D-09                                                                 |
| Offline  | `@serwist/next` PWA                          | A teacher on two bars still gets a screen                            |

## Layout

```
apps/web          Next.js app (route groups per ARCHITECTURE §2)
packages/
  contracts       Zod schemas shared by UI, actions, jobs and tests
  domain          Pure business rules — permissions, money, ids, workspace time
  db              Supabase clients, generated types, WorkspaceContext
  ui              Design system: tokens, shadcn components, phone-first primitives
  config          Shared tsconfig presets, ESLint config, Tailwind preset
supabase/         Migrations, pgTAP tests, seed, Edge Functions
docs/             Everything human-readable — start at docs/README.md
```

## Quick start (Windows)

Node 24 and pnpm 10 are the pinned toolchain (D-12). pnpm's exact version comes from
`packageManager`, so `corepack` keeps every machine on the same one.

```powershell
corepack enable
git clone https://github.com/Mahadezz/acadigma-campus.git
cd acadigma-campus
pnpm install

Copy-Item .env.example .env.local   # then fill in the blanks
pnpm dev                            # http://localhost:3000
```

`.env.local` is never committed. Only `NEXT_PUBLIC_*` values ever reach the browser
(ARCHITECTURE §8); the service-role key is server-side and passes through
`withServiceRole(reason)`, which logs every use.

There is **no Docker on the development machine**, so the local Supabase stack is
never started. Migrations are authored here and applied to the cloud project by CI
on merge to `main` — never by hand (RELEASES §6.2).

### Everyday commands

```powershell
pnpm dev            # Next.js dev server
pnpm typecheck      # tsc --noEmit across every package
pnpm lint           # ESLint (warnings are errors in CI)
pnpm format         # Prettier, write
pnpm test           # Vitest with coverage
pnpm test:e2e       # Playwright at 360x800 and 1280x800
pnpm build          # production build of the whole workspace
pnpm db:types       # regenerate packages/db/src/types.generated.ts
pnpm changeset      # describe your change for the release notes
```

`pnpm test:e2e` builds nothing itself — run `pnpm build` first; Playwright starts
`next start` for you.

## Working here

Every feature is a branch → PR → green CI → squash-merge (D-14). `main` is protected
and always deployable; a push that did not come through a merged PR fails the
`guard` job (D-21).

Before you write code, read — in this order:

1. [`docs/README.md`](docs/README.md) — the map of everything else
2. [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md) — the
   binding contract for _how_ this is built
3. [`docs/engineering/HANDBOOK.md`](docs/engineering/HANDBOOK.md) — how we work
4. [`docs/decisions/DECISION-LOG.md`](docs/decisions/DECISION-LOG.md) — why things
   are the way they are

`CONTRIBUTING.md` has the PR checklist; `SECURITY.md` has the threat model and how to
report a vulnerability.

### The three rules that are not negotiable

1. **The database and the server are the security boundary.** UI guards are for
   experience only. Every tenant table has RLS, and every policy has a pgTAP test.
2. **Tenant context comes from the session, never from a client-writable field**
   (D-04). `x-workspace-id` is a hint; membership is re-derived from
   `workspace_members` on every request.
3. **Money is computed on the server, in integer paisa** (D-06). Never a float, never
   in the browser.

## Licence

Proprietary. All rights reserved.
