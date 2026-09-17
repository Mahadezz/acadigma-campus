# Design System — addendum from an external article review

**Status:** proposal · **Owner:** lead (merge decisions into `DESIGN-SYSTEM.md`) · **Date:** 2026-09-17

Sources reviewed:

- `docs/reference/articles/ai-design-system.md` — Charlie Hills, _How to quit AI slop_ (30 Aug 2026)
- `docs/reference/articles/resource-vault-gate.md` — the two `resource?mcp_token=…` URLs
- `docs/reference/articles/42-css-motion-recipes.md` — for the two motion rules in §4

**Nothing in `DESIGN-SYSTEM.md` has been edited.** This file is the merge
request.

---

## 1. The one-line summary

The article argues that AI design output is generic because the model _has
nothing of yours to read_, and that the fix is four files: a **reference**
(what is allowed), a **build rulebook** (how to build it), a line in `CLAUDE.md`
making the agent read both before it draws, and a folder of **examples** to
clone from.

We already have three of the four, at far higher quality — `DESIGN-SYSTEM.md` is
both reference and rulebook, `packages/ui/tokens/tokens.css` is its single
implementation, and `CLAUDE.md` rule 12 plus HANDBOOK §8 "React / UI" already
forbid ad-hoc values. **The gaps the article exposes are the fourth file
(examples) and one specific verb: _check your own output against the file before
showing me_.**

---

## 2. Adopted

### 2.1 The self-check line — the single most valuable idea in the article

The article's own assessment of its four-line `CLAUDE.md` block:

> That last line does more than the other three combined (by a distance).

The line is: _"When you have finished, check your own output against
REFERENCE.md, fix what fails, and only then show me."_

We have the reference and the read-before-you-build rule. **We do not have the
self-check.** The Definition of Done (D-14) requires a11y, both viewports and a
test report — all of which are checked _after_ the work is presented, by CI or
by the owner. Nothing requires the agent to audit its own UI against
`DESIGN-SYSTEM.md` before opening the PR.

**Proposed change — `DESIGN-SYSTEM.md` §9 (Change control), new subsection:**

> **§9.x — Self-check before review.** Before marking a UI PR ready, the
> implementer re-reads §2 (tokens), §3 (layout), §8.1 (Do / Don't) and the
> relevant §8.2 wireframe against their own diff, and fixes what fails. The PR
> description states which sections were checked. A PR whose screenshots
> contradict its own wireframe is a review block, not a discussion.

This is cheap, it is the one thing the article demonstrably proved on itself,
and it catches the class of error CI cannot: a screen that passes axe, hits both
viewports and still does not look like the design system.

### 2.2 An `examples/` equivalent — reference _builds_, not reference _images_

> A library of work to point at, there's sixty-six builds in my system now, so
> it clones the closest one instead of starting again.

This is the real mechanism behind his speed, and it is the gap in our setup.
`DESIGN-SYSTEM.md` §8.2 has eight ASCII wireframes — excellent as specification,
useless as something to clone. An implementer starting screen nine has no built
screen to copy the _structure_ of.

**Proposed change — `DESIGN-SYSTEM.md` §4, new subsection:**

> **§4.14 — Reference implementations.** Three built screens are designated
> canonical and are the thing to copy from when building a fourth: one list
> (Attendance roll-call), one form (a `FormSheet`), one dashboard (teacher
> Dashboard). Each carries a header comment naming it a reference
> implementation and pointing at its §8.2 wireframe. Changing one is a design
> review, because everything after it inherits its shape.

Not a new folder, not screenshots — three real files, named. Screenshots go
stale silently; a reference implementation goes stale loudly, in CI.

### 2.3 "Ask for three or four variants"

> And never accept the first version. Ask for three or four variants and put
> them side by side, or you'll end up polishing whatever came out first.

Correct, and it is the exact failure mode of an agent-built UI. **Scoped
narrowly**, because generating four variants of all 31 features would be
enormous waste:

**Proposed change — `DESIGN-SYSTEM.md` §9:**

> Variants are required for a **new pattern** — a screen shape no §8.2
> wireframe covers. Not for the 12th screen that reuses `DataList`. The
> rejected variants and the reason go in the decision entry.

### 2.4 Two motion rules (from article 3)

**Proposed change — `DESIGN-SYSTEM.md` §2.7**, appended to the Banned paragraph:

> **Only ambient motion may cycle forever** — a shimmer, a spinner, a pulse.
> Anything that _reveals_ plays once and holds. This is why the two loops we
> ship (skeleton shimmer §3.7, pull-to-refresh ring §3.6) are permitted
> exceptions to the infinite-loop ban and a third one is not.

and, as a footnote:

> In any looping animation, every internal timing must divide evenly into the
> loop period, or the motion stutters on wrap.

### 2.5 Two motion tokens to promote

`packages/ui/src/motion/recipes.css` declares two recipe-local properties
because §2.7's table has no home for a loop _period_:

| Property                  | Value                          | Specified in                                  |
| ------------------------- | ------------------------------ | --------------------------------------------- |
| `--motion-shimmer-period` | `calc(1400ms * var(--motion))` | §3.7 — "a 1.4s translate"                     |
| `--motion-spin-period`    | `calc(900ms * var(--motion))`  | §3.6 — currently unspecified; 900 ms proposed |

**Proposed change:** promote both into `tokens.css` §5 and the §2.7 table, as a
short "loop periods" row group distinct from transition durations. Both already
carry the `--motion` multiplier. Until the lead rules, they stay private to
`recipes.css` and feature code must not read them.

---

## 3. Rejected

| Idea                                                                   | Why not                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Point Claude at a Figma file via MCP and derive the system from it** | Backwards for us. We have the spec; Figma would be the derivative. §2 tokens are _measured_ — "Colour-blind and contrast figures quoted in comments were computed, not estimated (Viénot LMS simulation + WCAG 2.1 relative luminance)". A Figma frame cannot carry a ΔE of 13.9 between adjacent attendance statuses, and re-deriving tokens from a picture would silently discard that work. Figma may be useful _downstream_ for marketing collateral; it must never become an input to `tokens.css`. |
| **`REFERENCE.md` + `DESIGN.md` as separate files**                     | The article splits "what is allowed" from "how to build". `DESIGN-SYSTEM.md` does both, and `CLAUDE.md` is explicit that a second source of truth is the failure to avoid: _"that is how two sources of truth begin"_. Adding two root-level files to a repo that already has a governed docs tree is a regression.                                                                                                                                                                                      |
| **"Sample every hex off five finished pieces with a pixel reader"**    | Right method, wrong direction, and we are past it. Our palette is OKLCH with computed contrast ratios, not sampled sRGB. `MIGRATION-FROM-BASE44.md` records what was kept from the prototype; D-22 records the rulings. Re-sampling would replace measured values with eyedropped ones.                                                                                                                                                                                                                  |
| **The "29 tells of AI design" checker skill**                          | Not obtainable. The list is not in the article; it is gated behind a newsletter subscription and a third-party skill download. Our equivalent already exists and is enforceable: §8.1 Do/Don't, §7.1 a11y checklist, axe in CI.                                                                                                                                                                                                                                                                          |
| **Four colours named by job (background, ink, accent, muted)**         | We have ~90 semantic tokens, and the extra ones are load-bearing: five attendance statuses with ΔE separation, seven grade bands as an _ordered_ ramp, `-soft`/`-ink` pairs so status text meets contrast on tinted fills. Collapsing to four would break §2.4 and §2.5.                                                                                                                                                                                                                                 |
| **A decision log at the bottom of the design file**                    | Already exists, better: `docs/decisions/DECISION-LOG.md`, numbered, never reused, with the owner's exact words. D-22 is the design-system entry.                                                                                                                                                                                                                                                                                                                                                         |
| **Both `resource?mcp_token=…` URLs**                                   | Nothing there. Both tokens resolve to the identical subscription gate; the content is delivered by email after signing up. We did not subscribe — putting the owner's address on a marketing list is his decision. See `docs/reference/articles/resource-vault-gate.md`.                                                                                                                                                                                                                                 |

---

## 4. Downloadable resources

**None saved.** `docs/reference/articles/assets/` exists and is empty.

| Candidate                                                      | Outcome                                                                                                                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The article's four prompts                                     | Captured verbatim in `docs/reference/articles/ai-design-system.md`. Text, not an asset.                                                                                               |
| His real `REFERENCE.md`, his `CLAUDE.md`, the 66-build library | Shown as screenshots only; not published.                                                                                                                                             |
| The "29 tells" skill                                           | Newsletter-gated. Not obtained.                                                                                                                                                       |
| `motion.html` starter file + 42 CSS recipes                    | Lazy-loaded Notion code blocks that would not render. Not obtained — and §"Recipes we did not write" in `packages/ui/src/motion/RECIPES.md` explains why we would not have used them. |
| HyperFrames (HTML→video renderer)                              | Linked, not bundled. No product use: we ship an app, not feed graphics. Noted here only so nobody re-researches it.                                                                   |

On licence: nothing was offered under an explicit licence. The articles are
quoted under fair-dealing for review, with source, author and date on every
capture. Any asset that later becomes available goes in
`docs/reference/articles/assets/` **with its licence recorded**, or it is linked
and not copied.

---

## 5. What the lead has to decide

1. **§9.x self-check** — adopt as written, or fold into the existing DoD list?
   (§2.1. Recommended: adopt. Highest value-to-cost ratio in this document.)
2. **§4.14 reference implementations** — which three screens, and does
   designating them create a review gate that slows the first three Parts?
   (§2.2)
3. **Variants for new patterns** — required, or recommended? (§2.3)
4. **§2.7 motion rules** — the ambient-vs-reveal line and the divisible-loop
   footnote. (§2.4. Low risk; clarifies an existing ban.)
5. **Promote the two loop-period tokens** into `tokens.css` §5 and the §2.7
   table, and confirm 900 ms for the pull-to-refresh ring, which §3.6 currently
   leaves unspecified. (§2.5)
