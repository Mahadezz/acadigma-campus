# F-<area>-<nn> — <Feature name>

|                  |                                                                   |
| ---------------- | ----------------------------------------------------------------- |
| Area             | <auth / academics / teaching / market / billing / ops / platform> |
| Status           | planned · in-progress · shipped (vX.Y.Z)                          |
| Owner branch     | `feat/<area>-<slug>`                                              |
| Depends on       | F-…                                                               |
| Plan             | `docs/plan/ROADMAP.md` chunk <n>                                  |
| Base44 reference | `docs/reference/base44-inventory/<file>.md` §…                    |

## 1. Purpose

One paragraph: who uses it, what problem it solves, what "done" looks like from the user's chair. State what the Base44 prototype intended and what was fake/broken there.

## 2. Roles and permissions

Table: action → roles allowed (owner / admin / teacher / staff / parent / platform). Reference `permissions` keys in `packages/domain`.

## 3. Data

Tables touched (names per `docs/architecture/DATA-MODEL.md`; if the table is new, propose it here with columns, enums, indexes, and the RLS policy in words). State the tenant key and any private files.

## 4. Workflows

Numbered user flows, each: trigger → steps → outcome → notifications/audit events emitted → failure cases. Include the phone flow explicitly (what's a sheet, what's a tab, what's one-thumb reachable).

## 5. Business rules and calculations

Every rule and formula, precisely, with defaults and where the setting lives.

## 6. UI

Screens list with route, layout at 360×800 and at ≥1024, primary action, empty state, loading state, error state. Components from `packages/ui` used.

## 7. Server contracts

Server actions / route handlers: name, input schema (Zod, named), output, errors, idempotency, rate limit.

## 8. Parts (build chunks)

Break the feature into independently shippable parts, each ≤ ~2 days: **Part n — title** · scope · files · tests · demo criterion. Order them.

## 9. Acceptance criteria

Given/When/Then list. These become Playwright journeys.

## 10. Tests

Unit (domain), DB (pgTAP RLS isolation + escalation), integration (server actions), e2e (journeys at both viewports), a11y, performance budgets.

## 11. Open questions

Anything unresolved; default assumed until answered.
