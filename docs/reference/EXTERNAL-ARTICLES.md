# External articles — what we read, what we took

Six articles supplied by the owner, read 2026-09-17. Raw captures live in
`docs/reference/articles/`; each carries its URL, author, date accessed and a
capture note.

**How to read the verdict column:** these are marketing-funnel newsletter posts
aimed at solo marketers, not engineering write-ups. Two contain a genuinely good
idea each, one contains a good idea buried in an advert, one is mislabelled, and
two are a signup page. That is the finding, and it is recorded here so nobody
re-reads them hoping for more.

---

## The six

| #   | Title                                                               | Author                   | URL                                                                                                                                                                                    | Fetched                                                                                                                | Verdict                                                                                                                                                                                                                                                                                                                            | Implemented where                                                                                                                                                                            |
| --- | ------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 23 things that stop Claude eating your tokens                       | Charlie Hills (Notion)   | [link](https://app.notion.com/p/23-things-that-stop-Claude-eating-your-tokens-3c6e396e06bb81028c50d7b565f270d6) · [capture](articles/23-things-that-stop-claude-eating-your-tokens.md) | **Partial** — prose and the full 23-row table; two lazy-loaded Bash blocks did not render                              | **Mostly reject.** Not 23 practices — 23 third-party repos, several of them LLM proxies, with star counts that do not survive scrutiny. The four-stage framing and "take a baseline first" are worth keeping. 3 adopted as native equivalents, 2 as rules, 2 deferred, 16 rejected.                                                | `docs/engineering/CLAUDE-CODE-PRACTICES.md` (all 23 with a verdict each) · `.claude/settings.json` · `.claude/README.md`                                                                     |
| 2   | Graph engineering in Claude Code: the 4-prompt folder map           | Charlie Hills (Substack) | [link](https://charliehills.substack.com/p/graph-engineering-claude-code) · [capture](articles/graph-engineering-claude-code.md)                                                       | **Full**                                                                                                               | **Adopt the diagnosis, replace the method.** The orphan-file check is a real and useful audit. Its four LLM prompts are the wrong instrument on a repository — a parser gives facts where a model gives guesses. Ran `graphify` instead; declined the "read the map before every job" prompt.                                      | `docs/engineering/GRAPH-ENGINEERING.md` · `graphify-out/` (3,727 nodes · 4,303 edges · 100% EXTRACTED)                                                                                       |
| 3   | 42 CSS Motion Recipes You Can Paste Anywhere                        | Charlie Hills (Notion)   | [link](https://app.notion.com/p/42-CSS-Motion-Recipes-You-Can-Paste-Anywhere-3b7e396e06bb818d8854c2c5658453c6) · [capture](articles/42-css-motion-recipes.md)                          | **Partial** — all prose and the 42-recipe taxonomy; every CSS body is a lazy-loaded Notion block that would not render | **Reject the recipes, keep two rules.** Mislabelled: these are motion-**graphics** recipes for rendering GIFs, all on 6-second infinite loops. None of the nine UI patterns we needed appears in the 42; five of its seven families breach `DESIGN-SYSTEM.md` §2.7 outright.                                                       | `packages/ui/src/motion/recipes.css` (9 `.motion-*` classes, written from our own §2.7/§3.6/§3.7/§5.4) · `packages/ui/src/motion/RECIPES.md` · two rules proposed into §2.7 via the addendum |
| 4   | Design in Claude Code (without the AI look) / "How to quit AI slop" | Charlie Hills (Substack) | [link](https://charliehills.substack.com/p/ai-design-system) · [capture](articles/ai-design-system.md)                                                                                 | **Full** — including all four prompts verbatim                                                                         | **Adopt two ideas, reject the workflow.** The self-check line ("check your own output against the file before you show me") is the single most valuable idea across all six. The reference-builds library is the second. The Figma-MCP-as-source-of-truth workflow is backwards for a repo whose tokens are measured, not sampled. | `docs/architecture/DESIGN-SYSTEM-ADDENDUM.md` — 5 adopted, 7 rejected, 5 decisions for the lead                                                                                              |
| 5   | The Free AI Resource Vault (`?mcp_token=…657e5752…`)                | Charlie Hills (Substack) | [link](https://charliehills.substack.com/p/resource) · [capture](articles/resource-vault-gate.md)                                                                                      | **Full page, no article**                                                                                              | **Nothing to implement.** A subscription gate. The vault link is emailed after signing up and is not on the page for anyone.                                                                                                                                                                                                       | —                                                                                                                                                                                            |
| 6   | The Free AI Resource Vault (`?mcp_token=…d0538e8f…`)                | Charlie Hills (Substack) | [link](https://charliehills.substack.com/p/resource) · [capture](articles/resource-vault-gate.md)                                                                                      | **Full page, no article**                                                                                              | **Duplicate of 5.** Byte-identical content; the two `mcp_token` values differ only in an `ax` claim and 14 seconds of `ts`. They are per-request tracking tokens, not per-resource keys. Both expire 2026-10-14.                                                                                                                   | —                                                                                                                                                                                            |

---

## Notes on fetching

- **WebFetch was not sufficient for any of the six.** The Notion pages returned
  an empty shell (client-rendered app); the Substack pages returned a
  model-written _summary_ rather than source text, which is not a capture. All
  six were re-read through Chrome with `get_page_text`, in an isolated tab that
  was closed afterwards.
- **Nothing was logged into and nothing was subscribed to.** Articles 5 and 6
  gate their content behind a newsletter signup. Putting the owner's email
  address on a third-party marketing list is his decision, not an agent's. If he
  wants the vault, the path is in `articles/resource-vault-gate.md`.
- **The two Notion pages are only partially capturable by design.** Their code
  blocks load on demand and did not materialise even with every toggle expanded
  programmatically. In both cases the missing content is code we had already
  decided not to use — third-party install commands (1) and video-loop CSS (3).

## What was changed in this repository

| File                                          | New? | Article |
| --------------------------------------------- | ---- | ------- |
| `.claude/settings.json`                       | new  | 1       |
| `.claude/README.md`                           | new  | 1       |
| `docs/engineering/CLAUDE-CODE-PRACTICES.md`   | new  | 1       |
| `docs/engineering/GRAPH-ENGINEERING.md`       | new  | 2       |
| `graphify-out/` (derived, do not commit)      | new  | 2       |
| `packages/ui/src/motion/recipes.css`          | new  | 3       |
| `packages/ui/src/motion/RECIPES.md`           | new  | 3       |
| `docs/architecture/DESIGN-SYSTEM-ADDENDUM.md` | new  | 4, 5, 6 |
| `docs/reference/articles/*.md` (5 captures)   | new  | all     |
| `docs/reference/EXTERNAL-ARTICLES.md`         | new  | all     |

No existing file was edited. `CLAUDE.md`, `package.json`, `.gitignore`,
`apps/**`, `docs/architecture/DESIGN-SYSTEM.md` and everything already under
`packages/ui/src` were left alone — the hand-off lists are at the top of
`CLAUDE-CODE-PRACTICES.md` and in `.claude/README.md`.

## Open items for the lead

1. `.claude/settings.json` — move `"Bash(git push *)"` from `deny` to `ask`. It
   currently blocks the D-14 push-on-first-commit rule.
2. `.gitignore` — add `.claude/settings.local.json`. (`graphify-out/` was added
   by another agent during this work; nothing to do.)
3. `packages/ui/package.json` + `globals.css` — two one-line changes to make
   `recipes.css` load at all (`RECIPES.md` §"Wiring this in").
4. `graphify` — install the SQL grammar (`graphifyy[sql]`); migrations and pgTAP
   tests are currently invisible to the graph.
5. `docs/README.md` and `CLAUDE.md` — convert the path columns to real markdown
   links. 554 of our 705 internal doc references are inert backticks, which is
   why twelve documents (including `ROADMAP.md` and `COMPLIANCE-PDPA.md`) are
   unreachable to any tool. Detail in `GRAPH-ENGINEERING.md` §3.2.
6. `DESIGN-SYSTEM.md` — the five decisions in `DESIGN-SYSTEM-ADDENDUM.md` §5.
