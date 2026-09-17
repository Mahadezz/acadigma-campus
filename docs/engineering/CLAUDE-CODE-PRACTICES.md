# Claude Code practices — token efficiency and session hygiene

**Status:** proposal from an article review · **Owner:** lead · **Date:** 2026-09-17
**Source:** `docs/reference/articles/23-things-that-stop-claude-eating-your-tokens.md`

---

## TODO — fold into `CLAUDE.md` (lead)

1. **Fix `.claude/settings.json` first:** move `"Bash(git push *)"` from `deny` to `ask`. As shipped it blocks the D-14 "push on the first commit" rule. I could not edit the file after creating it (permission classifier, `[Self-Modification]`).
2. Add a **"Read the spec, then build"** line to `CLAUDE.md` §"How a session should go": never read a feature's _implementation_ before its spec, and never read `docs/reference/base44-inventory/` during implementation.
3. Add a **subagent rule** to `CLAUDE.md`: one Part per session stays the law; subagents fan out for _search and review_, never for parallel writes to the same Part.
4. Add a **"compact at a boundary, not mid-Part"** line: compact after the migration lands and after the domain layer is green, never between "wrote the action" and "wrote its test".
5. Decide whether `.claude/settings.json` + `.claude/README.md` are referenced from `CLAUDE.md`'s "Where everything lives" table, and add `.claude/settings.local.json` to `.gitignore` (`graphify-out/` is already ignored).

---

## 1. What the article actually is

The title promises 23 practices. The page delivers **23 third-party GitHub
repositories** — routers, memory servers, usage meters and output compressors —
arranged in four stages: _get context in → remember it → see the burn → cut the
burn_.

That framing is the useful part, and it is the only part that survives contact
with this repository. The tool list does not, for three reasons:

- **The numbers do not hold up.** The page quotes star counts of 273k, 241k and
  105k for repos with no `owner/repo` printed anywhere, despite the page saying
  each entry shows one. The author's own caveat admits the list moves and that
  at least one project has changed hands.
- **Our threat model forbids most of it.** Items 01, 02 and 19 are **LLM
  proxies** — they sit between the agent and the model provider and see every
  token, which in this repository means children's medical data, NID scan
  filenames, KYC state and `WorkspaceContext` values. `CLAUDE.md` rule 13 and
  `SECURITY.md` make routing our traffic through an unaudited third-party
  endpoint a non-starter. Adding eleven MCP servers and memory daemons also
  contradicts the article's own thesis: every MCP server's tool definitions are
  loaded into the context window on every single turn.
- **Its one honest instruction is a measurement instruction**, not an install
  instruction: _take a baseline before you change anything_. We adopt that.

So this document keeps the four-stage diagnosis, adopts the handful of
mechanisms that exist natively in Claude Code, and rejects the rest on the
record so nobody re-litigates it.

---

## 2. The 23, one row each

Verdict key: **Adopt** · **Adopt (native equivalent)** · **Reject** · **Defer**

### Stage 01 — Get context in

| #   | Item                                          | Verdict                       | Mechanism in this repo                                                                                                                                                                                                                                                                                                                                                                   |
| --- | --------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | OmniRoute — multi-provider endpoint           | **Reject**                    | An LLM proxy. Every prompt in this repo can contain tenant data, and `CLAUDE.md` rule 13 forbids that leaving our provider boundary. Model choice is already governed by `CLAUDE.md` §"Which model to use" — the cost lever is _picking Sonnet for spec implementation_, not re-routing traffic.                                                                                         |
| 02  | 9router — free routing for Claude Code        | **Reject**                    | Same reason as 01, plus "free tier" means our prompts are the product.                                                                                                                                                                                                                                                                                                                   |
| 03  | context7 — current library docs               | **Adopt (native equivalent)** | The failure it targets is real: Claude guessing a Zod 4 or Tailwind v4 API. Fixed without a new server by a `WebFetch` allow-list in `.claude/settings.json` for `zod.dev`, `tailwindcss.com`, `nextjs.org`, `supabase.com`, `ui.shadcn.com`, `gsap.com`, `playwright.dev`, `vitest.dev`, `developer.mozilla.org`. Fetching docs is then unattended, and nothing new is loaded per turn. |
| 04  | codegraph — pre-indexed map                   | **Adopt (native equivalent)** | This is the same idea as article 2, and we implemented it with `graphify` instead. `graphify-out/graph.json` is a 3,727-node / 4,303-edge AST index of the repo, queried on demand, costing nothing per turn. See `docs/engineering/GRAPH-ENGINEERING.md`.                                                                                                                               |
| 05  | codebase-memory-mcp — index once, query after | **Reject**                    | Superseded by 04. An MCP server would add tool definitions to every turn to do what a CLI call does on request.                                                                                                                                                                                                                                                                          |
| 06  | haystack — context-engineered pipelines       | **Reject**                    | A Python RAG framework. Not applicable to a TypeScript monorepo, and the repo is small enough to navigate by path.                                                                                                                                                                                                                                                                       |

### Stage 02 — Remember it

| #   | Item                                       | Verdict    | Mechanism in this repo                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 07  | claude-mem — carry a session into the next | **Reject** | The problem is real; the solution is already in the repository. `CLAUDE.md` is the standing memory, `DECISION-LOG.md` is the durable _why_, `docs/test-reports/` is the durable _what happened_, and the feature spec is the durable _what next_. A memory daemon would create a fifth, unreviewed source of truth — which `CLAUDE.md` explicitly exists to prevent. |
| 08  | mem0 — universal memory layer              | **Reject** | Same. Also stores prompt content externally; see rule 13.                                                                                                                                                                                                                                                                                                            |
| 09  | mempalace                                  | **Reject** | Same.                                                                                                                                                                                                                                                                                                                                                                |
| 10  | cognee                                     | **Reject** | Same.                                                                                                                                                                                                                                                                                                                                                                |
| 11  | agentmemory                                | **Reject** | Same.                                                                                                                                                                                                                                                                                                                                                                |
| 12  | beads                                      | **Reject** | Same.                                                                                                                                                                                                                                                                                                                                                                |

**What we adopt from stage 02 instead:** the _discipline_ the tools are a proxy
for. A session that ends without updating the spec, the decision entry and the
test report has destroyed its own memory, and the next session pays to rebuild
it. That is already the Definition of Done; this is the cost argument for it.

### Stage 03 — See the burn

| #   | Item                                          | Verdict                            | Mechanism in this repo                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13  | claude-hud — context in the status line       | **Defer**                          | Useful signal, third-party code in the terminal. Claude Code shows context usage natively; `/status` and the built-in context indicator cover it. Revisit only if sessions start compacting unexpectedly.                                                                                                                                                                                                                                                                                 |
| 14  | ccusage — cost report from your own logs      | **Adopt, as a measurement ritual** | The article's one genuinely good instruction, and it does not require the tool: **take a baseline before changing anything**. Concretely: before adopting any of this, the lead records a week of session cost; after, records another. Without both numbers, every claim in this document is an opinion. Note the article itself says `ccusage` has changed hands — if we run it, we run it via `pnpm dlx` (which sits in `ask`), reading local logs only, and we read its source first. |
| 15  | CodexBar — menu bar usage                     | **Reject**                         | macOS menu-bar utility. The team is on Windows (`CLAUDE.md` §Commands).                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 16  | ECC — "a whole harness tuned for performance" | **Reject**                         | A harness replacement, quoted at 241k stars with no repo path. Replacing the harness on a codebase holding children's data, on the strength of an unverifiable number, is not a trade we make.                                                                                                                                                                                                                                                                                            |

### Stage 04 — Cut the burn

| #   | Item                                                 | Verdict                         | Mechanism in this repo                                                                                                                                                                                                                                                                                                                             |
| --- | ---------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 17  | ponytail — "talks the agent out of writing the code" | **Adopt as a rule, not a tool** | The underlying claim is correct and is the largest single saving available to us: _the cheapest tokens are the ones spent deciding not to build_. Encoded as the **read-the-spec-then-build** rule in §3 and as `CLAUDE.md`'s existing "if the spec does not answer a question, the answer goes into the spec before the code exists".             |
| 18  | caveman — compressed output style                    | **Reject for this repo**        | It is installed in this developer's `~/.claude/skills`, and it does cut output tokens. It must not be used here: our output _is_ the deliverable — decision entries quote the owner's exact words, test reports are read instead of running the app, and specs are binding prose. Compressing them corrupts the artefact to save a rounding error. |
| 19  | rtk — proxy cutting tokens 60-90%                    | **Reject**                      | A proxy. See 01. A 60-90% reduction claim also implies it is dropping context, which is the failure mode this whole document is trying to avoid.                                                                                                                                                                                                   |
| 20  | headroom — compress output before context            | **Reject**                      | Same class of intervention, same objection: silent lossy compression of the thing the next step depends on.                                                                                                                                                                                                                                        |
| 21  | oh-my-openagent — agent for "tokenmaxxers"           | **Reject**                      | Another harness replacement. See 16.                                                                                                                                                                                                                                                                                                               |
| 22  | deer-flow — long-horizon harness                     | **Reject**                      | See 16. Our long-horizon mechanism is one Part per branch per session, which is a process control, not a framework.                                                                                                                                                                                                                                |
| 23  | superpowers — "one install, the whole methodology"   | **Defer**                       | Already present in this developer's global skills. It is a methodology bundle (TDD, planning, verification-before-completion) that overlaps heavily with `HANDBOOK.md` and the Definition of Done. Where they conflict, the handbook wins. Not installed at repo level, and not a dependency.                                                      |

**Score: 3 adopted as native equivalents, 2 adopted as rules, 2 deferred, 16
rejected.** That ratio is the finding, not a failure to engage.

---

## 3. The rules we are actually adopting

These are the mechanisms. Each one is a behaviour with a place it is enforced.

### 3.1 Read the spec, then build

The single biggest waste in a session is reading code to infer intent that is
already written down. `CLAUDE.md` already orders the reads; this adds the
prohibitions:

- **Never** open a feature's implementation before its spec §8/§9.
- **Never** open `docs/reference/base44-inventory/` (15 files, ~200 KB) during
  implementation. It is product reference for _spec-writing_ sessions. The
  prototype is "a product reference, never a code reference" — reading it while
  building is how a prototype's shape leaks into a rebuild that exists because
  the prototype was wrong.
- **Never** open `docs/reference/base44-security-review.md` to "check security".
  The findings are already encoded as the fourteen non-negotiable rules.
- When a spec is ambiguous, **stop and fix the spec**. A session that guesses
  carefully costs more than a session that stops: the guess is discovered in
  review, and the whole Part is rebuilt.

### 3.2 Permissions, so the loop does not stall

`.claude/settings.json` exists so that `pnpm verify`, `pnpm typecheck`,
`git diff` and `gh pr view` — the commands a session runs dozens of times —
never prompt. Every prompt on a read-only command is a stall that costs a round
trip and an operator's attention for no decision. Anything that changes shared
state or costs money stays in `ask`. See `.claude/README.md` for the policy and
its limits.

### 3.3 Read-denies instead of an ignore file

There is **no `.claudeignore` and no `ignorePatterns` key** in Claude Code —
verified against <https://code.claude.com/docs/en/settings> and
<https://code.claude.com/docs/en/permissions> on 2026-09-17. Do not add either;
an unrecognised key is silently ignored and gives false comfort.

The supported mechanism is a `Read(...)` deny rule, and `.claude/settings.json`
denies: `node_modules/`, `.pnpm-store/`, `.next/`, `.turbo/`, `dist/`, `out/`,
`coverage/`, `playwright-report/`, `test-results/`, `blob-report/`,
`.playwright/`, `graphify-out/cache/`, and `pnpm-lock.yaml` (350 KB, never worth
reading whole). Secrets — `.env*`, `*.pem`, `*.key`, `id_rsa*`,
`service-account*.json` — are denied for both `Read` and `Edit`, with a
gitignore negation re-permitting `.env.example`.

`packages/db/src/types.generated.ts` is denied for `Edit` on purpose: it is
regenerated by `pnpm db:types`, and a hand-edit there is a silent divergence
between Postgres and TypeScript that the contracts test exists to catch.

Grep and Glob already skip `.gitignore`d paths, so these rules cover the
remaining case: a direct `Read` of a generated file.

### 3.4 Subagents: fan out on reading, never on writing

- **Use a subagent** for: searching an unfamiliar area, reviewing a diff against
  a spec, checking whether a pattern already exists, reading a long external
  document. The subagent's tool output stays out of the main context; only its
  conclusion comes back. That is the whole benefit and it is large.
- **Do not use a subagent** for: implementing part of a Part in parallel with
  another agent. One Part, one branch, one session (D-14) is a correctness rule
  about review and CI, and the token saving does not buy it back.
- **Give a subagent the spec path, not the spec contents.** Pasting 40 KB of
  spec into a subagent prompt pays for it twice.
- **A subagent must not be trusted on facts it could not verify.** It reports
  what it read; the parent decides.

### 3.5 Compacting

Compact at a **boundary**, never mid-task:

- Good boundaries: after the migration + pgTAP are green; after the domain layer
  is green; after the server action is written and its test passes.
- Bad boundary: between writing an action and writing its test — the compaction
  will summarise "wrote saveAttendance" and lose the five specific decisions
  that the test has to assert.
- Before compacting, make sure the durable state is **on disk**: the spec
  update, the decision entry, the test report's real numbers. Anything only in
  the context window is lost, and `CLAUDE.md` forbids reconstructing a test
  report from memory.

### 3.6 Measure before and after

Nothing in this document is known to save anything until the lead has two
numbers a week apart. Until then, the honest claim is "these are the changes we
believe are correct on other grounds (security, review, correctness), some of
which should also reduce cost."

---

## 4. What we did not do, and why

- **Did not install any of the 23 repos.** None is vetted, several are proxies
  that would see tenant data, and the star counts are not credible.
- **Did not set `permissions.defaultMode`.** Its interesting values (`auto`,
  `bypassPermissions`) have no effect from a project settings file.
- **Did not create `.claudeignore`.** It does not exist.
- **Did not edit `CLAUDE.md`, `package.json`, `.gitignore`, `apps/**`, or any
  existing file under `packages/ui/src`.** Another agent owns the scaffold; the
  TODO list at the top is the hand-off.
