# Graph engineering — the repo as a queryable graph

**Status:** implemented, unlabelled communities · **Owner:** lead · **Date:** 2026-09-17
**Source:** `docs/reference/articles/graph-engineering-claude-code.md`

---

## 1. What the article proposes

Charlie Hills' _Graph engineering in Claude Code: the 4-prompt folder map_
argues that four things decide how well an agent works, and that only three of
them get any attention:

- **Context** — what is in the window right now.
- **Harness** — the standing rules and files loaded before work starts.
- **Loop** — how the agent QAs itself until it passes.
- **Graph** — where things are and what connects to what.

His claim is that the graph is the neglected one, and that its absence is
invisible from the inside: _"A folder your AI never opened reads exactly like a
folder with nothing in it."_ He ran the check on his own five folders and found
2,364 documents of which 1,840 — 78% — had nothing pointing at them.

The method is four prompts:

1. **Map it.** Read every file, write `MAP.md` with four parts: topics ranked by
   inbound references; the count and percentage of files nothing points at; the
   connections you would not have spotted; a header with the file count and
   date. Every connection is marked **FOUND** (both files state it) or
   **GUESSED** (inferred) — _"Never present a guess as a find."_
2. **Read it.** Look for three things: two files giving opposite advice, one
   file living in two places, and work nothing points at.
3. **Price it.** For each problem: what breaks if left, and the smallest fix.
   Do the approved ones; stop on anything uncertain.
4. **Make it stick.** Put a line at the top of `CLAUDE.md` telling the agent to
   read the map before any job and append what it learned afterwards.

## 2. What we adopted, and what we changed

**Adopted: the diagnosis, the FOUND/GUESSED discipline, and the artefact.**

**Changed: how the graph is built.** The article's prompt-one is an LLM reading
every file and writing prose. On a repository that is the wrong instrument:

- It is expensive and non-repeatable. 258 source files, re-read on every refresh.
- It produces guesses where a parser produces facts. A TypeScript import is not
  a matter of opinion.
- `MAP.md` would become a 15th document that can itself go stale and contradict
  the specs — which is exactly the failure `CLAUDE.md` exists to prevent
  ("that is how two sources of truth begin").

So we ran **`graphify`** instead: an AST extractor that produces the same
artefact deterministically, with no LLM in the extraction path, and rebuilds in
seconds. Extraction confidence came back **100% EXTRACTED, 0% INFERRED, 0%
AMBIGUOUS** — which is the article's FOUND/GUESSED distinction, enforced by a
parser rather than by asking a model to be honest.

**Rejected: prompt four.** We did _not_ add "read the map before any job" to
`CLAUDE.md`. Loading a graph summary into every session is a per-turn context
cost paid by every session, including the many that do not need it, and it
contradicts `docs/engineering/CLAUDE-CODE-PRACTICES.md` §3.1. The graph is a
**pull** tool: query it when you have a structural question. `CLAUDE.md`'s
existing read-order (spec → data model → CLAUDE.md) is the harness, and it is
better than a map.

**Rejected: the "team OS" section.** Push-a-private-repo-and-`git pull` is
already how this project works.

## 3. What the graph found

Built 2026-09-17 from commit `9bc425f7`.

```
3,727 nodes · 4,303 edges · 257 communities
100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
0 input tokens · 0 output tokens
```

Edge relations: `contains` 3,305 · `imports` 365 · `calls` 240 ·
`references` 165 · `imports_from` 129 · `extends` 65 · `re_exports` 23 ·
`method` 4 · `dynamic_import` 4 · `indirect_call` 3.

### 3.1 The orphan number

The article's headline metric, computed on our repo:

| Measure                                          | Result                  |
| ------------------------------------------------ | ----------------------- |
| Nodes with nothing pointing at them              | 118 of 3,727 — **3.2%** |
| Fully isolated nodes (no edge either way)        | 3 — **0.1%**            |
| **Files with no link to or from any other file** | 57 of 258 — **22.1%**   |
| `docs/` files with no cross-file link            | 12 of 102 — **11.8%**   |

Not 78%. The code graph is healthy: 965 code nodes, 3 isolated.

### 3.2 The finding that is actually worth acting on

The 12 "orphaned" docs are **not** orphaned. `docs/plan/ROADMAP.md` is named in
over ten other documents. The extractor cannot see those references, because of
how we write them:

| Form                                            | Count across `docs/` + `CLAUDE.md` |
| ----------------------------------------------- | ---------------------------------- |
| Markdown links — `[text](path.md)`              | **151**                            |
| Backticked paths — `` `docs/plan/ROADMAP.md` `` | **554**                            |
| Files using at least one markdown link          | **7 of 103**                       |

Nearly four out of five of our internal document references are inert text. A
human reads them fine. A parser, a link checker, a docs site, a GitHub preview
and an indexing agent all see nothing — which is precisely the article's point
about a folder that "reads exactly like a folder with nothing in it", arrived at
from the opposite direction.

**The twelve that no tool can currently reach from anywhere:**

`docs/plan/ROADMAP.md` · `docs/product/COMPLIANCE-PDPA.md` ·
`docs/product/OWNER-QUESTIONS.md` · `docs/product/legal/DPA-DRAFT.md` ·
`docs/product/legal/PRIVACY-POLICY-DRAFT.md` ·
`docs/architecture/MIGRATION-FROM-BASE44.md` ·
`docs/product/research/GO-TO-MARKET.md` ·
`docs/product/research/OUTREACH-TEMPLATES.md` ·
`docs/product/research/PRICING-AND-SALES.md` ·
`docs/product/research/SOURCES.md` ·
`docs/product/research/TEACHER-SIDE.md` ·
`docs/product/research/VOICE-OF-CUSTOMER.md`

Note what that list is: the roadmap, the compliance analysis, the open questions
for the owner, both legal drafts, and every piece of market research. The
documents the project's direction depends on are the least connected ones.

**Proposed fix (lead's call, not applied — it touches files across `docs/`):**
in `docs/README.md` and `CLAUDE.md`'s "Where everything lives" table, convert
the path column to real markdown links. That is ~40 links in two files and makes
every one of the twelve reachable in one hop. Converting all 554 backticks is
not proposed; it would be churn for little gain once the two index files link
everything.

### 3.3 Architectural hubs

`graphify god-nodes` ranks by degree. The top of ours:

| Rank | Node                                    | Edges |
| ---- | --------------------------------------- | ----- |
| 1    | `cn()` — `packages/ui/src/lib/utils.ts` | 195   |
| 2    | _Acadigma Campus — Decision Log_        | 39    |
| 3    | `compilerOptions`                       | 20    |
| 4    | _Data Processing Agreement_             | 18    |
| 5    | _2.2 Entity reference_ (DATA-MODEL)     | 18    |

`cn()` at 195 is expected — every shadcn component imports it. The useful signal
is rank 2: **the decision log is the most connected document in the
repository**, which is the graph confirming that D-numbers are doing the job
`HANDBOOK.md` §11 assigns them.

### 3.4 Known gaps in the extraction

Stated plainly, because an index you trust wrongly is worse than none:

- **11 `.sql` files contributed nothing.** `tree_sitter_sql` is not installed.
  Every migration and every pgTAP test is therefore **absent from the graph**.
  For a repo whose security boundary is RLS, that is the most important gap.
  Fix: `uv tool install --upgrade "graphifyy[sql]"`, then `graphify update .`.
- **4 files produced zero nodes:** `.audit-exceptions.json`,
  `.lighthouserc.json`, `bn.json`, `en.json`.
- **Communities are unlabelled** — 257 of them, named `Community 0…256`.
  Labelling calls an LLM once per batch of communities. Not run: 257 communities
  is a real cost for a first pass, and the graph is queryable without it.
  Run `graphify label . --missing-only` when someone wants the map readable.
- **The graph is a snapshot.** It records `built_at_commit`. Compare
  `git rev-parse HEAD` against §3 before trusting it.

## 4. How to query it

`graphify-out/` is **not committed** — it is derived, 2.9 MB, and rebuilt in
seconds. It is already in `.gitignore`; no action needed.

```bash
# Build or refresh — deterministic, no LLM, no API cost
graphify update .

# Re-cluster after a large refactor
graphify cluster-only . --no-label

# Ask a structural question (BFS over the graph, token-budgeted)
graphify query "how does workspace context reach a repository method"
graphify query "what does FormSheet depend on" --budget 1500

# Trace a specific path rather than a neighbourhood
graphify query "attendance write path" --dfs

# Shortest path between two things
graphify path "AttendanceToggle" "WorkspaceContext"

# Plain-language explanation of one node and its neighbours
graphify explain "resolveWorkspaceContext"

# Blast radius: what breaks if I change this
graphify affected "cn" --depth 2

# Architectural hubs
graphify god-nodes --top 15
```

`graphify-out/graph.html` opens the graph in a browser. It is, as the article's
author says of his own, mostly decorative — `query`, `affected` and `path` are
where the value is.

### When to reach for it

- **Blast radius before a refactor.** `graphify affected "<symbol>"` beats
  grepping for a name that appears in prose as well as code.
- **Orientation in an unfamiliar area** — one query instead of six file reads.
- **Checking a claim.** "Nothing else uses this" is checkable in one command.

### When not to

- **Do not use it in place of reading the spec.** The graph knows what the code
  does, never what it is supposed to do. `CLAUDE.md` read-order is unchanged.
- **Do not use it for anything security-relevant** until the SQL gap in §3.4 is
  closed. Migrations and RLS policies are currently invisible to it.
- **Do not load it into every session.** That is the cost the article's prompt
  four would have imposed, and we declined it.

## 5. The one prompt from the article we kept verbatim

Not as automation — as a review question, for whoever next reorganises `docs/`:

> Mark every connection FOUND, meaning both files state it, or GUESSED, meaning
> you inferred it. Never present a guess as a find. If you cannot tell, mark it
> GUESSED.

That is the same standard `CLAUDE.md` already sets for test reports — _"If
something was not run, write 'not run' and why"_ — applied to structure instead
of results.
