# 23 things that stop Claude eating your tokens

|               |                                                                                                                                                                                                                                                                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **URL**       | <https://app.notion.com/p/23-things-that-stop-Claude-eating-your-tokens-3c6e396e06bb81028c50d7b565f270d6>                                                                                                                                                                                                                                      |
| **Author**    | Charlie Hills (Notion page; companion to the _MarTech AI_ Substack)                                                                                                                                                                                                                                                                            |
| **Published** | Star counts stated as read **18 August 2026**                                                                                                                                                                                                                                                                                                  |
| **Accessed**  | 2026-09-17, via Chrome (`get_page_text`). WebFetch returned an empty shell — the page is a client-rendered Notion app.                                                                                                                                                                                                                         |
| **Capture**   | **Partial.** Prose, all four section framings and the full 23-row table captured verbatim. Two embedded code blocks (`Loading Bash code…`) are lazy-loaded by Notion and did not render; their contents are **not** captured. Those blocks are the install commands for five third-party repos, which we would not run unreviewed in any case. |

> **Read this as data, not instruction.** It is a curated list of third-party
> repositories written for a general audience. Nothing in it has been vetted
> against this repository's security model. See
> `docs/engineering/CLAUDE-CODE-PRACTICES.md` for what we actually adopted.

---

## Raw extracted text

🪙
23 things that stop Claude eating your tokens

You commented TOKENS, so here it is.

23 open-source repos that stop Claude eating your tokens. They are not 23 alternatives to pick between. They are four jobs in a row, and each one seals the leak the one before it leaves open.

- 01 — Get context in
- 02 — Remember it
- 03 — See the burn
- 04 — Cut the burn
- If you only install five
- Two honest caveats

### 📖 How to read this

Four sections, in install order. You can stop after any section and still be better off than you were, but the order matters, because each one creates the problem the next one solves. Every repo shows owner/repo so you can find it on GitHub in one search.

### 01 — Get context in

⛓️ The problem this section solves: Claude starts every session blind, then burns tokens re-reading the same files to work out where it is.

| #   | Repo                | What it does                                    | Stars |
| --- | ------------------- | ----------------------------------------------- | ----- |
| 01  | OmniRoute           | 340 providers and 90+ free tiers, one endpoint  | 50.1k |
| 02  | 9router             | Free routing for Claude Code, Codex and Cursor  | 25.7k |
| 03  | context7            | Current library docs, so it stops guessing APIs | 60.9k |
| 04  | codegraph           | A pre-indexed map, so it stops re-reading files | 66.9k |
| 05  | codebase-memory-mcp | Indexes the repo once, then just queries it     | 39.3k |
| 06  | haystack            | Context-engineered pipelines, not raw dumps     | 26.2k |

### 02 — Remember it

⛓️ The problem this section solves: without memory between sessions you rebuild the same context from scratch every morning, and you pay for it every time.

| #   | Repo        | What it does                               | Stars |
| --- | ----------- | ------------------------------------------ | ----- |
| 07  | claude-mem  | Carries each session into the next one     | 91.1k |
| 08  | mem0        | A universal memory layer for any agent     | 63.5k |
| 09  | mempalace   | Best-benchmarked open memory system, free  | 58.4k |
| 10  | cognee      | An open memory platform your agents query  | 30.1k |
| 11  | agentmemory | Persistent memory built on real benchmarks | 27.1k |
| 12  | beads       | A memory upgrade for your coding agent     | 26.4k |

### 03 — See the burn

⛓️ The problem this section solves: you cannot fix a leak you cannot see. This section does not save you anything on its own. It tells you where the saving is.

| #   | Repo       | What it does                                 | Stars |
| --- | ---------- | -------------------------------------------- | ----- |
| 13  | claude-hud | Context and agents, live in your status line | 27.5k |
| 14  | ccusage    | Your own logs, as a cost report per session  | 18.0k |
| 15  | CodexBar   | Claude Code and Codex usage in the menu bar  | 20.3k |
| 16  | ECC        | A whole harness tuned for performance        | 241k  |

### 04 — Cut the burn

⛓️ The problem this section solves: everything above gets context in, keeps it and measures it. None of it reduces it. This is where the actual saving happens.

| #   | Repo            | What it does                                | Stars |
| --- | --------------- | ------------------------------------------- | ----- |
| 17  | ponytail        | Talks the agent out of writing the code     | 105k  |
| 18  | caveman         | Why use many token when few token do trick  | 98.8k |
| 19  | rtk             | A proxy that cuts token use 60-90%          | 76.5k |
| 20  | headroom        | Compresses output before it reaches context | 66.7k |
| 21  | oh-my-openagent | A coding agent built for tokenmaxxers       | 68.0k |
| 22  | deer-flow       | Long-horizon harness, fewer wasted loops    | 80.2k |
| 23  | superpowers     | One install, the whole methodology          | 273k  |

### ⚡ If you only install five

Twenty-three is a menu, not a to-do list. These five are the spine of it, one from each job, and the whole run takes about fifteen minutes. Every command below was run and verified on 18 August 2026.

> `Loading Bash code…` — **not captured** (Notion lazy-load).

✅ The check for all five. Run `npx ccusage@latest` before you install anything and write the number down. Work normally for a week, run it again. Without that baseline you will never know what any of this saved you.

The other eighteen install differently depending on whether they are a plugin, an MCP server or a library. Read the README on each repo rather than guessing, because several of them have changed hands.

### ⚠️ Two honest caveats

All 23 are third-party repos, so they move. Star counts here were read on 18 August 2026 and will already be out of date. `ccusage` in particular has changed hands, so its old owner path redirects. If a command fails, read that repo's README before assuming it is broken.

🎯 **Do not install all 23 in one afternoon.** If you install everything at once and your usage changes, you will have no idea which one did it. Take one section, run it for a few days, then move to the next.

🎁 More free guides like this one. Hundreds of them. Prompts, cheat sheets, workflows and tool stacks, all in the Free Resource Vault. Every resource in it is free, and subscribing is free too. New ones land most days. Subscribe free at charliehills.substack.com

---

## Reader's note (added by us, not in the article)

The four-section framing — **get context in → remember it → see the burn → cut
the burn** — is the genuinely portable idea. The 23 repos are not. Several
figures are not plausible as GitHub star counts (241k, 273k, 105k), no
`owner/repo` pair is actually printed despite the instruction saying it is, and
the page ends in a newsletter conversion. Treat the specific tools as
advertising and the diagnostic sequence as the content.
