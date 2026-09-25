# Acadigma Campus — Design System

**Binding, like `ARCHITECTURE.md`.** That document fixes how the app is built;
this one fixes how it looks, reads and responds. A feature may not introduce a
colour, a spacing value, a nav pattern or an interaction that is not in here. If
it must, the deviation goes in `docs/decisions/DECISION-LOG.md` first and this
document changes in the same PR.

Implementation: `packages/ui/tokens/tokens.css` (the only place values live) and
`packages/ui/tokens/README.md` (how to wire it up). Components are copied from
the local shadcn registry at `F:\shadcn-ui\apps\v4\registry\new-york-v4`.

Related: `ARCHITECTURE.md` §6 (client architecture — binding) ·
`docs/product/PRODUCT-DECISIONS.md` (features and roles) ·
`docs/reference/base44-inventory/01-auth-tenancy-personal.md` §6–7 (what the
prototype did, and why most of it is not being kept).

---

## 1. Design direction

### 1.1 The read

> A phone-first operational tool for school staff in Bangladesh — an
> **instrument**, not a dashboard product — in a records-office language,
> built on shadcn v4 primitives with a refined indigo/amber identity and a
> genuinely bilingual type system.

The people who open this app every day are teachers standing in a corridor with
a ৳12,000 Android phone in one hand, ninety seconds before the bell. The people
who open it on a Windows PC are an office administrator with a keyboard, a
printer and a deadline. Both are doing clerical work they already know how to do
on paper. The product's job is to be _faster than the paper_, and to be trusted
the way the paper is trusted.

### 1.2 The feeling: the class register, made fast

Bangladeshi schools run on the হাজিরা খাতা — the ruled attendance register. A
name column that never moves. A grid of single-letter marks. A running total in
the last column. It is dense, tabular, unglamorous and completely legible to
anyone who has ever worked in a school. That artefact, not a SaaS dashboard, is
the reference for how information is arranged here.

Three consequences, and they are the whole design:

1. **Structure comes from rules and rows, not cards.** Lists of records sit on
   hairline-ruled rows. A card is reserved for something genuinely elevated —
   a pending approval, a number that changed, an action you must take. The
   prototype put everything in a rounded card with a soft shadow; that is the
   default shadcn look and it flattens hierarchy until nothing is important.
2. **Ink and paper is the chrome (amended per D-57).** The owner's read of the
   original indigo/navy identity was that it looked nothing like
   [acadigma.com](https://acadigma.com), the site this product is a sibling
   of. `--primary`, the focus ring and the sidebar surface are now the same
   achromatic ink (`#0b0b0b`) and paper (`#f4f4f2`) as the marketing site —
   copied token-for-token from its `globals.css`. Colour is reserved for what
   §2 makes genuinely semantic: attendance status (§2.4), grade bands (§2.5),
   the danger/destructive red, and the chart palette (§6.1). Nothing else in
   the product carries a hue by default; a user's chosen `palette-*` class
   (§2 "Palette overrides") is the one opt-in exception.
3. **Amber survives only where it is semantic.** The old "amber is the
   highlighter, one element per screen" rule (superseded by D-57) is retired
   as a decorative device — `--accent` is now a plain neutral surface, same as
   acadigma-website's own `--accent`. Amber remains exactly where §2 already
   measured it as a status colour: `--warning` and attendance's `late`.

### 1.3 Three references

| Reference                                                    | What we take from it                                                                                                                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The Bangladeshi school attendance register (হাজিরা খাতা)** | The frozen name column; a grid of single-letter marks rather than colour dots; the running total pinned to the end of the row; hairline rules instead of cards.                         |
| **Linear's command surface**                                 | What "fast" means for an operator: every routine action reachable in ≤ 2 inputs, a persistent command palette on desktop, state changes that never move the page under your finger.     |
| **bKash / Google Wallet on a low-end Android**               | What phone-first actually means here: the working area is the bottom half of the screen, targets are large, contrast survives 400 nits of Dhaka daylight, and nothing depends on hover. |

Explicitly **not** a reference: Google Classroom (a student product, not an
operator's), and the prototype's `Welcome.jsx` (a dark hero with drifting
blurred orbs that ignored every token it defined).

### 1.4 What keeps it from reading as a template

- **The Bengali/English pair is a pair, not a fallback.** Bengali is set in a
  face designed for Bengali UI, with its own line-height and its own numerals
  option, and the two scripts are optically matched. Most bilingual products in
  this market are a Latin design with Bengali dropped into it, and it shows.
- **Rules instead of cards** for every list of records. This is the single
  biggest visible departure from stock shadcn.
- **`AttendanceToggle` is a segmented letter control**, not five coloured dots —
  it reads at a glance, works for colour-blind users, and is the fastest input
  on the phone.
- **Amber is rationed to semantic use** (§2, amended per D-57) and enforced in
  review — it no longer decorates a "must act" card anywhere in the product.
- **No gradients, no glass, no mesh, no hero blobs, no orbs.** Elevation is a
  1px border plus one ink-tinted shadow (D-57: retinted from hue-272 to plain
  ink, `rgb(11 11 11 / …)`, matching acadigma-website's `shadow-input`). The
  sidebar (amended per D-57) is a paper/chalk surface with ink text, not the
  inverted navy the prototype used — the previous entry's reasoning ("reads as
  the crest bar over a school gate") is superseded by the owner's instruction
  that Campus read as the same product as acadigma.com, which has no inverted
  surface. Nav-specific component styling follows once #17 merges.
- **Tabular figures everywhere.** The product is numbers in columns; digits are
  never allowed to jitter between renders.

### 1.5 Brand

**Acadigma** is the parent. **Acadigma Campus** is this product. In the UI:

- **Logo (D-68).** `<Logo product="campus" />` from
  `@acadigma/ui/primitives/logo`: the Campus grid mark at 22px, then
  `Acadigma` in Inter 500 at 17px / `-0.02em`, with `Campus` in
  `--muted-foreground` — the acadigma.com lockup. It is on the sign-in pages
  (linked home), the onboarding chooser header and the school shell's top
  bar. Never a gradient, never a raster copy, never the prototype's JPEG.
- **Marks (D-68).** Every Acadigma product has a mark on the same 3×3 grid
  (152u cells, 32u gaps, 24u radius): `acadigma`, `campus`, `ledger`,
  `students`, `parents`. `<GridMark mark="…" />` is a static port of
  acadigma-website's `brand/marks.ts` geometry — never redraw one. Marks
  draw in `currentColor` with the grey cell at 35%, so they follow the text
  colour and invert with dark mode. Anything that lists Acadigma products (a
  future product switcher, suite links) shows each product's mark with
  `PRODUCT_NAMES`. `/design` shows all five.
- **App icons (D-68)** are copied or resized from
  `acadigma-brand/exports/products/campus/`, never drawn here:
  `app/icon.svg` (mark, light/dark via `prefers-color-scheme`),
  `app/favicon.ico`, `app/apple-icon.png`, `public/icons/*` (PWA) and
  `app/opengraph-image.png`.
- Marketplace, Hiring and Selling are **modules inside Campus**, not
  sub-brands. The prototype's de-facto violet seller identity is removed —
  `/sell` uses the same tokens with a different nav, nothing more.
- Purge on sight: _School Troop_, _TeachFlow_, _TEACH FLOW V2_, _Print Box_.
  The print agent is **Acadigma Print Agent**.

### 1.6 Typography

**Inter** carries all Latin text and every digit. **Hind Siliguri** carries
Bengali. Two families, three weights each. Both verified live on Google Fonts.

|                    | Family                                    | Why this one                                                                                                                                                                                                                                                                                             |
| ------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Latin + all digits | **Inter** 400/500/600/700 (variable axis) | Best-in-class tabular figures and a slashed zero (`cv05`), which the marks grid, money and student IDs depend on; legible at 13px on a low-DPI 360px screen; metrically close to Roboto, so the fallback stack does not reflow while the webfont loads on a slow connection.                             |
| Bengali            | **Hind Siliguri** 400/500/600             | Indian Type Foundry's UI-optimised Bengali face: correct, compact conjuncts (যুক্তাক্ষর) at small sizes, static weights (no variable-font rasterising cost on an Android 9 WebView), and the smallest Bengali subset on Google Fonts — 69 KB vs 105 KB for Noto Sans Bengali and 152 KB for Anek Bangla. |
| Monospace          | **JetBrains Mono** 400/500 (D-57)         | Matches acadigma-website's `--font-mono`. Bound to `--font-mono` for the one monospace surface DESIGN-SYSTEM already names — the correlation id on a route error boundary (§3.9) — plus any future code-shaped value. Latin-only subset; no monospace surface needs a Bengali glyph.                     |

**cv11/ss01 (D-57).** `html` carries `font-feature-settings: "cv11" 1, "ss01" 1`
(single-storey `a`, open forms), matching acadigma-website. `--fs-prose` and
`--fs-tabular` repeat the same two features so text under `body`'s or a
tabular element's own `font-feature-settings` (which does not merge with
`html`'s) keeps them.

**Budget.** Google's stylesheet is split by `unicode-range`, so the Bengali
subset downloads **only when a Bengali codepoint is painted**. English-only
session: 48 KB. Bengali session: 48 + 138 KB.

**Wiring.** `apps/web/app/fonts.ts` loads both families through
`next/font/google` (self-hosted, `font-display: swap`; Hind Siliguri with
`preload: false`, so the Bengali subset is fetched only when it is painted), the
root layout puts the generated variables on `<html>`, and
`packages/ui/tokens/tokens.css` binds `--font-sans` / `--font-bn` to them with the
CSS family names as fallbacks.

**Rejected, with reasons.** _Plus Jakarta Sans_ (the prototype's display face):
a second Latin family that only differed at heading sizes, for 40 KB and no
Bengali — removed. Hierarchy now comes from weight, size and rules. _Anek
Bangla_: the most beautiful option and a true multi-script superfamily, but the
variable Bengali subset is 2.2× the payload and variable Indic shaping janks on
the low-end devices this product targets — revisit when the floor rises.
_Noto Sans Bengali_: the safe default, but wider and less economical in a table
than Hind Siliguri at the same size.

**Rules.**

- Bengali gets `line-height: 1.75` (matras sit above and below the body) and
  **never** gets letter-spacing (enforced by an unlayered `:lang(bn)` rule
  that beats `tracking-*` utilities). Latin headings get `tracking-tight`
  (`-0.03em`, D-68); Latin ≤ 12px gets `+0.01em`.
- **Headings are light (D-68):** weight 500 (`font-medium`), tightly tracked
  — page titles, card titles, sheet/dialog titles, the TopBar title. Bold
  (600/700) is for emphasis inside body text, not for headings.
- **Eyebrow (D-68):** a small label above a section title, `className="eyebrow"`
  — JetBrains Mono 12px, uppercase, `0.08em` tracking, `--muted-foreground`.
  One per section at most, never a sentence. Prefer digits or copy that needs
  no translation (the wizard shows its step as `01 / 05`).
- Bengali has no italic and no small caps. Emphasis is weight only.
- A mixed-script line uses `--font-bn` for the Bengali run with Inter still in
  the stack after it, so Latin words and digits inside a Bengali sentence keep
  Inter's figures. `<BnEnText>` does this automatically; do not do it by hand.
- **Digits default to Western (0-9)**, including in Bengali UI, because every
  numeric keypad and every mark sheet in a Bangladeshi school office uses them.
  `<MoneyText numerals="bn">` and `<BnEnText numerals="bn">` opt in to ০-৯ for
  printed report cards and parent-facing PDFs, where Bengali numerals are
  expected.
- Inputs are 16px (`--text-md`) minimum. Anything smaller makes iOS Safari zoom
  the page and the user loses their place.

Type scale (`tokens.css` §2): 11 · 12 · 13 · 16 · 18 · 22 · 28 · 36 px
(`--text-md` is an alias of `--text-base` since D-68).
`--text-base` is **16px** (D-68, the owner's "Blend" decision; it was 15px,
which bought about four more characters per line in a student-name column).
Dense tables still set `--text-sm` explicitly. Inputs are 16 as before.

**Addendum — Bengali needs its own base size (amended per SYNTHESIS).** The
Latin base size above is derived from Latin-script reasoning only (character count,
Inter's hinting at small sizes) and must not be assumed to transfer to Bengali.
Bengali script — with its matras, conjuncts (যুক্তাক্ষর) and generally taller
x-height-equivalent shapes — typically needs to run **larger than Latin at the
same perceived size** to stay legible and to avoid the conjunct-crowding that
Bengali reviewers call out by name (§4.9 of `VOICE-OF-CUSTOMER.md`: a 4★ review
line-by-line-correcting glyph and spelling errors). This does not necessarily
change the Latin value in `--text-base`; it means Bengali runs need their
own reviewed size (and, per the mixed-script rule above, Hind Siliguri already
gets its own `line-height: 1.75`) rather than inheriting the Latin scale
unexamined. Set and verify a Bengali-specific base size before shipping any
Bengali-heavy screen (report cards, parent-facing PDFs) rather than assuming
the Latin base reads the same in both scripts.

### 1.7 Light and dark

Both ship from day one and neither is a derivative of the other. Dark mode is
_selected_: every step was chosen against the dark surfaces and measured there.
Default is `system`; `user_preferences.theme` (`light | dark | system`) overrides
and syncs across devices, per PRODUCT-DECISIONS 1.10.

Dark mode is the common case here, not a nicety — a teacher marking attendance
in a corridor at 7am and an admin working a night shift on fee collection are
both real. Ship it correct.

---

## 2. Tokens

The complete, authoritative set is `packages/ui/tokens/tokens.css`. This section
explains the decisions; the file holds the values.

### 2.1 What we kept from the prototype, and what we refined

|          | Prototype                                               | Now                                                                                       | Why                                                                                                                                                                                                                                                                                             |
| -------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary  | `hsl(234 62% 46%)` = `oklch(0.436 0.202 270)`           | `oklch(0.472 0.190 269)`                                                                  | The old value sits on the sRGB gamut edge at that lightness, so chroma clipped unevenly across cheap Android panels and it skewed violet. +0.036 L, −0.012 C reads as the same indigo, holds **7.15:1** with white (AAA), and leaves an actually-darker hover step at `oklch(0.404 0.162 269)`. |
| Accent   | `hsl(38 92% 55%)` used as both fill and text            | `--accent` `oklch(0.762 0.160 74)` (fill) + `--accent-ink` `oklch(0.578 0.128 74)` (text) | The prototype used one amber for both. As text on white it measured 2.2:1 — a failure that shipped. Split into a fill you put ink on (7.96:1) and an ink you put on white (4.42:1).                                                                                                             |
| Radius   | `0.75rem`                                               | `0.75rem` (D-68 later moved it to `0.375rem`, §2.6)                                       | It is right, and the whole component set is drawn to it.                                                                                                                                                                                                                                        |
| Neutrals | mixed `225°`/`230°` hues                                | one ramp at `272°`                                                                        | Three neutral hues in one product is how a design system stops looking like one.                                                                                                                                                                                                                |
| Sidebar  | dark navy in light mode                                 | kept, `oklch(0.255 0.062 275)`                                                            | It is the most distinctive thing the prototype had. Foreground measures 12.95:1 on it.                                                                                                                                                                                                          |
| Palettes | 6, each recolouring `--sidebar-primary` away from amber | 6, brand-only                                                                             | The old behaviour made the sidebar accent mean nothing. Palettes now override `--primary`, `--primary-hover`, `--primary-ink`, `--ring`, `--chart-1` and nothing else.                                                                                                                          |
| Charts   | 5 ad-hoc tokens                                         | 6, fixed order, validated                                                                 | See §6.                                                                                                                                                                                                                                                                                         |

**D-57 — ink/paper chrome (supersedes the Primary/Sidebar rows above for
everything except attendance, grades, charts and danger).** The owner's read
of the indigo/navy identity this table describes was "looks bad, nothing like
[acadigma.com](https://acadigma.com)". `--primary`, `--ring`, `--accent` and
every `--sidebar-*` token are now literal, achromatic hex copied from
acadigma-website's `globals.css` — `--primary`/`--foreground` ink `#0b0b0b` on
`--background`/paper `#f4f4f2`, `--card`/chalk `#fbfbfa`, `--sidebar` chalk
with ink text (not navy). `--danger` is recoloured to the website's literal
`#b42318` / dark `#f97066`. `--muted-foreground` `#636363` measures 5.46:1 on
`--background` (Opus review, PR #20: the website's literal `#6f6f6f` cleared
4.5:1 on `--background` but not on `--muted`/`--secondary`, where real 13px
semibold text sits — `AttendanceToggle`'s unselected letters, avatar
initials) — never use the website's lighter `#a3a3a3` primitive for text,
and never below 13px. `--input` deliberately does **not** match the
website's literal `#d6d6d2` — see §2.6. Attendance (§2.4) and grade bands
(§2.5) keep their token _values_ unchanged by D-57 — the old
`packages/ui/globals.css` fallback never declared `--att-*`/`--grade-*` at
all, so the §1.1 cascade-layer bug never shadowed them and they always
rendered correctly. **The chart palette (§6.1) is the one place
value-unchanged is not the same as render-unchanged**: the fallback's own
`--chart-1`…`--chart-5` (stock shadcn orange/teal/blue, 5 series) were
winning over tokens.css's real `--chart-1`…`--chart-6`
(indigo/rose/amber/teal/violet/green) for every series but the sixth, so
fixing §1.1 changes what a chart actually looks like even though no chart
hex in tokens.css moved — see the test report's before/after evidence.
`--success`/`--warning`/`--info` in §2.3 are also unchanged in value — out of
this Part's scope. Radius gets the
website's multipliers on the same `0.75rem` base (§2.6; D-68 later made the base `0.375rem`); a new
`--ease-out-expo` `cubic-bezier(.16,1,.3,1)` (§2.7) is available for
entrances; JetBrains Mono is now `--font-mono` (§1.6). Full reasoning:
`DECISION-LOG.md` D-57.

### 2.2 Colour structure

Every family has the same four slots. This is the contract that makes contrast
provable instead of argued about:

| Slot       | Role                        | Paired with |
| ---------- | --------------------------- | ----------- |
| `--x`      | the solid mark              | `--x-fg`    |
| `--x-fg`   | text **on** the mark        | `--x`       |
| `--x-soft` | a tint used as a background | `--x-ink`   |
| `--x-ink`  | text **on** the tint        | `--x-soft`  |

`--x` is never used as text on a page background, and `--x` is never paired with
`--x-ink`. Those are the combinations that were not measured.

### 2.3 Semantic colours (measured)

| Token       | Light                                         | White on it                                          | Dark                                          | Ink on it    |
| ----------- | --------------------------------------------- | ---------------------------------------------------- | --------------------------------------------- | ------------ |
| `--success` | `oklch(0.545 0.140 152)`                      | 4.64:1                                               | `oklch(0.720 0.130 152)`                      | 7.99:1       |
| `--warning` | `oklch(0.655 0.150 74)`                       | 3.25:1 → **use `--warning-foreground` (ink), 7.4:1** | `oklch(0.820 0.150 74)`                       | 10.54:1      |
| `--danger`  | `#b42318` (D-57, was `oklch(0.520 0.200 25)`) | 6.57:1 (white)                                       | `#f97066` (D-57, was `oklch(0.660 0.185 25)`) | 7.06:1 (ink) |
| `--info`    | `oklch(0.540 0.150 250)`                      | 5.07:1                                               | `oklch(0.700 0.145 250)`                      | 7.06:1       |

`--danger` (D-57) is now acadigma-website's literal destructive red rather
than an independently-derived hue, so the "something is wrong" colour matches
across both products. `--danger-soft`/`--danger-ink` moved with it: light
`#fbeae8` / `#8a1a12` (8.06:1), dark `#3a1210` / `#ffb4ad` (9.72:1) — all four
numbers are computed by `scripts/check-contrast-tokens.mjs`, not estimated.

Every `-ink` on `-soft` pair measures between **6.5:1 and 9.0:1** in both themes.

`--warning` is the one fill in the system that cannot carry white text. Its
`-foreground` is ink, and the linter has an exception documented for it.

### 2.4 Attendance status colours

Five statuses: `present · absent · late · excused · half_day`
(PRODUCT-DECISIONS 2.1). This is the hardest palette in the product because the
marks appear as 24px squares in a dense grid, on a cheap screen, in daylight.

**Constraint that drove the design:** green/red is the worst possible pair for
red-green colour blindness (~8% of men, and this is a workforce product). Five
categorical hues that all separate under deuteranopia and protanopia is not
achievable. So:

- **Four chromatic statuses** — present (green 148°), absent (red 25°),
  late (amber 80°), excused (blue 262°) — spread across lightness as the primary
  separator, since the blue-yellow axis survives red-green deficiency and
  lightness survives everything.
- **`half_day` is deliberately not a fifth hue.** It is a neutral with a 50%
  diagonal fill. It separates by _chroma_ (ΔE 16.4 from the nearest chromatic
  colour) and by _shape_ at any size, which is more robust than any fifth hue
  would have been — and it reads correctly: half-filled means half a day.

**Verified** with a Viénot LMS simulation, OKLab ΔE × 100, target ≥ 8:

| Mode  | Worst adjacent deuteran/protan ΔE | Result |
| ----- | --------------------------------- | ------ |
| Light | **13.9** (present ↔ absent)       | pass   |
| Dark  | **12.9** (present ↔ late)         | pass   |

| Status   | Light fill               | vs card         | Dark fill                | vs card         | Letter (en / bn) |
| -------- | ------------------------ | --------------- | ------------------------ | --------------- | ---------------- |
| present  | `oklch(0.600 0.150 148)` | 3.70:1          | `oklch(0.700 0.150 148)` | 6.84:1          | `P` / `উ`        |
| absent   | `oklch(0.440 0.195 25)`  | 8.16:1          | `oklch(0.545 0.205 25)`  | 3.12:1          | `A` / `অ`        |
| late     | `oklch(0.845 0.155 80)`  | 1.64:1 **ring** | `oklch(0.900 0.150 80)`  | 11.99:1         | `L` / `বি`       |
| excused  | `oklch(0.520 0.150 262)` | 5.63:1          | `oklch(0.640 0.155 262)` | 5.04:1          | `E` / `ছু`       |
| half_day | `oklch(0.755 0.018 268)` | 2.19:1 **ring** | `oklch(0.460 0.016 268)` | 2.41:1 **ring** | `½` / `অর্ধ`     |

**Non-negotiable:** status is never conveyed by colour alone (WCAG 1.4.1). Every
mark carries its letter and an `aria-label` with the full name. `late` and
`half_day` fills fall below 3:1 against their card on purpose — keeping them
light is what preserves the colour-blind lightness ordering — so their chips
**always** carry a 1px `--x-ink` ring, which supplies the 3:1 boundary.

### 2.5 Grade band colours

An **ordered ramp**, not a categorical palette — A+ → F is a sequence, so
adjacent steps are _meant_ to look similar and a low adjacent ΔE is correct
rather than a failure. The letter is always printed; colour only reinforces it.
Used as `-soft` tint behind `--grade-ink`, never as a solid behind white text.

| Band | % (BD default) | GP   | Token                    |
| ---- | -------------- | ---- | ------------------------ |
| A+   | 80–100         | 5.00 | `oklch(0.545 0.145 150)` |
| A    | 70–79          | 4.00 | `oklch(0.600 0.140 140)` |
| A−   | 60–69          | 3.50 | `oklch(0.660 0.130 118)` |
| B    | 50–59          | 3.00 | `oklch(0.720 0.135 92)`  |
| C    | 40–49          | 2.00 | `oklch(0.790 0.150 72)`  |
| D    | 33–39          | 1.00 | `oklch(0.700 0.145 48)`  |
| F    | 0–32           | 0.00 | `oklch(0.520 0.190 25)`  |

The band boundaries are per-school data (`grade_scales`), not constants. The
ramp has exactly seven steps because the BD default has seven; a school with a
different scale gets the ramp interpolated across its band count, in order.

### 2.6 Spacing, radius, elevation

**Spacing** is a 4px base: `0 · 2 · 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80`.
Page gutter is **16px at 360**, 24px from `sm`. Nothing else is permitted —
ESLint blocks arbitrary Tailwind spacing values.

**Radius** `--radius: 0.375rem` (6px, D-68; was 12px). The multipliers are
acadigma-website's (D-57: `0.6 / 0.8 / 1 / 1.4 / 1.8`, plus `2.2`/`2.6`
reserved for parity): ~4px (chips, badges, in-grid inputs) · ~5px (inputs,
buttons) · 6px (cards, popovers, menus, dialogs — `rounded-lg`) · ~8px
(sheet top corners) · ~11px (avatar on a stat tile).
**One scale, applied by role, documented here** — a pill button next to a
12px card is broken, not playful.

**Elevation — hairline rings, not drop shadows (D-68).** A card or popover
is separated from the page by a 1px ring, never by a blurred shadow and never
by `border` plus a ring (one edge, not two).

| Token              | Value                         | Use                                                                         |
| ------------------ | ----------------------------- | --------------------------------------------------------------------------- |
| `--shadow-flat`    | 1px ink-tinted ring           | the default. Cards, auth card, choice cards, lists.                         |
| `--shadow-raised`  | 1px ring in `--border-strong` | cards that are genuinely elevated: a pending approval, a stat that changed. |
| `--shadow-overlay` | 1px ring in `--border-strong` | popovers, dropdowns, select menus, toasts.                                  |
| `--shadow-sheet`   | upward shadow                 | the bottom sheet only — it slides over the page from the bottom edge.       |
| `--shadow-nav`     | 1px rule                      | above the bottom nav, not a shadow.                                         |

**Exemption:** Dialog and Sheet sit on a scrim and keep the registry's
`border` plus `shadow-lg`; the ring rule covers cards and anything that
floats over content without a scrim (popovers, dropdowns, select menus).

**Forced colours (Windows High Contrast).** `forced-colors: active` removes
every box-shadow, so a ring-only edge would vanish. `tokens.css` §11 gives
those surfaces a `1px solid CanvasText` outline instead, keyed on
`data-slot`: `card`, `choice-card`, `auth-card` (from `sm`, where it is a
card), `popover-content`, `dropdown-menu-content`,
`dropdown-menu-sub-content`, `select-content`. A new ring-only surface adds
its `data-slot` to that list.

Shadows are ink-tinted (D-57: `rgb(11 11 11 / …)` in light, matching
acadigma-website's `shadow-input`; was the hue-272 neutral tint), never pure
black and never a hue. Cards do **not** lift on hover — hover does not exist
on the primary device, and a hover lift on desktop that the phone cannot
express is a split design.

**`--input` deviates from the literal acadigma-website value (D-57).** The
website's `#d6d6d2` measures 1.32:1 against its own `#f4f4f2` background —
fine for a marketing page, where an input's shape and label carry the
boundary. An unfocused `Field` here has no other way to show its edge, so
`--input` is darkened to `#808080` light / `#6b6b6b` dark, clearing WCAG
1.4.11's 3:1 non-text minimum against every real surface a `Field` can sit
on — `--background` (3.59:1 / 3.69:1), `--card` (3.81:1 / 3.52:1) **and**
`--muted` (3.25:1 / 3.20:1, e.g. a form inside a sheet or filter panel) —
script-verified, see `scripts/check-contrast-tokens.mjs`. (Opus review, PR
#20: the first cut, `#8a8a86`, cleared `--background` at 3.15:1 but fell to
2.85:1 against `--muted` — checking only one surface missed the second.)
`--border` and `--border-strong` (hairline row/table dividers, not a form
control's own edge) keep the website's literal, sub-3:1 values, consistent
with how this token set has always treated a divider as decorative rather
than a 1.4.11-scoped UI-component boundary.

### 2.7 Motion

| Token                | ms  | Use                                    |
| -------------------- | --- | -------------------------------------- |
| `--duration-instant` | 90  | tap feedback, checkbox, toggle segment |
| `--duration-fast`    | 140 | hover, chip swap, focus ring           |
| `--duration-base`    | 200 | popover, toast, inline expand          |
| `--duration-slow`    | 280 | sheet / drawer slide                   |
| `--duration-page`    | 360 | route transition                       |

Easings: `--ease-standard` `cubic-bezier(.2,0,0,1)` default ·
`--ease-entrance` for things arriving · `--ease-exit` (faster) for things
leaving · `--ease-spring` for the sheet snap **only** · `--ease-out-expo`
`cubic-bezier(.16,1,.3,1)` (D-57, matches acadigma-website) for entrances that
want a stronger overshoot-free deceleration than `--ease-entrance` — still
subject to the "motion must be motivated" rule below; it does not license a
new class of decorative animation.

**Motion must be motivated.** Permitted: a sheet sliding from the edge it will
return to; a row collapsing after an undo expires; a number counting when it
actually changed; the pull-to-refresh spinner. **Banned:** entrance animations on
page sections (the prototype's `fadeUp` stagger on every dashboard card cost
180ms before a teacher could read anything), infinite loops, decorative
parallax, animating `width`/`height`/`top` instead of `transform`/`opacity`.

Reduced motion flips one variable — `--motion: 0.01` — so every tokenised
transition collapses without touching a component. Never write a literal `ms`.

### 2.8 Z-index

The complete list; nothing else may be written.

`base 0` · `raised 1` (frozen first column) · `sticky 10` (sticky headers,
sticky date bar) · `topbar 20` · `bottomnav 30` · `scrim 40` · `sheet 50` ·
`dialog 60` · `popover 70` · `toast 80` (must clear the bottom nav) ·
`tooltip 90` · `banner 100` (offline banner — above everything, always).

---

## 3. Phone-first layout system

Baseline is **360 × 800 CSS px, 2× DPR** — a 2021 entry Android, which is what
teachers actually carry. Everything is designed here first and _relaxed_ upward.
The desktop layout is a widening of the same components, never a different UI.

```
sm  640   density increases; gutter 16 → 24; some sheets become dialogs
lg  1024  the shell changes: BottomNav → Sidebar, sheets → dialogs/panels,
          cards → tables, command palette appears
xl  1280  tables gain optional columns; detail pages gain a right rail
```

### 3.1 AppShell

```
┌─────────────────────────────── 360 ───────────────────────────────┐
│ ░░░░░░░░░░░░░░░ safe-area-inset-top ░░░░░░░░░░░░░░░               │
├───────────────────────────────────────────────────────────────────┤
│ TopBar                                                   56px     │
│ [◎ Workspace ▾]              Ridgeview School    [🔍] [🔔³] [◑]   │
├───────────────────────────────────────────────────────────────────┤
│ (offline banner, only when offline)                      36px     │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  scroll region — overscroll-behavior: contain                     │
│  padding-inline: 16px                                             │
│  padding-block-end: calc(var(--inset-bottomnav) + 16px)           │
│                                                                   │
│                                          ╭──────────╮             │
│                                          │  FAB     │  optional,  │
│                                          ╰──────────╯  one per pg │
├───────────────────────────────────────────────────────────────────┤
│ BottomNav                                                56px     │
│   ⌂        ✓         ▦         ✉        ⋯                         │
│  Today  Attendance Timetable Messages  More                       │
├───────────────────────────────────────────────────────────────────┤
│ ░░░░░░░░░░░░░ safe-area-inset-bottom (gesture bar) ░░░░░░░        │
└───────────────────────────────────────────────────────────────────┘
```

**TopBar (56px + safe top).**

- Left: **workspace switcher** — the workspace avatar + name, truncated to 14
  characters, with a `▾`. Tapping opens a bottom sheet listing every membership
  grouped by type (Schools, Personal), the current one checked, plus _Join a
  school_ and _Create a school_. The switcher is the highest-consequence control
  in a multi-tenant product; it is never a small icon and it always shows the
  current workspace's name and colour.
- Centre: the page title, only when it is not already the first thing in the
  scroll region. Do not print the title twice.
- Right: at most three 44px targets — search (opens the command sheet),
  notifications (badge is a count, `aria-live="polite"`), and the avatar menu
  (profile, theme, language, selling, sign out).
- The TopBar is **sticky, not fixed**, and scrolls away on long reading pages
  (student profile, a listing). It is fixed on pages that have a persistent
  action bar (attendance, marks).
- For a **parent**, the workspace switcher is replaced by the **child
  switcher** when they are linked to more than one student.

**BottomNav (56px + safe bottom).**

- 5 items maximum, always 5 slots wide so the labels never reflow between roles.
- Icon 22px + label at `--text-2xs`, both visible. Icon-only nav fails for a
  workforce with mixed literacy in English UI terms.
- Target is the **full 56px column height**, not the icon.
- Active state: the icon fills, the label goes `--weight-semibold`, and a 2px
  `--primary` bar sits on the **top** edge of the slot (not the bottom — the
  bottom edge is under the user's thumb and often under the gesture bar).
- Slot 5 is always **More**, opening a sheet. A badge on More aggregates the
  badges of everything inside it.
- The nav hides on scroll-down and returns on scroll-up **only** on pure reading
  pages. It never hides on a page with a data-entry task.
- `env(safe-area-inset-bottom)` padding, with `--inset-bottomnav` reserved as
  scroll padding on the content region so the last row is never trapped.

**Desktop ≥ 1024.** BottomNav is replaced by the paper/chalk `Sidebar`
(amended per D-57; was navy) (`--size-sidebar: 264px`, collapsible to 68px), carrying the **full** nav — the
"More" grouping disappears entirely, since the constraint that created it is
gone. The TopBar keeps the workspace switcher, adds breadcrumbs, and adds
`⌘K / Ctrl+K`. Same nav config object, different renderer.

### 3.2 Navigation config

One typed object per workspace type, filtered by `role ∧ plan-entitlement ∧
owner-visibility` (PRODUCT-DECISIONS 1.12). Order below is the order shipped.

**Single source (D-56, M0 wrap-up).** The types below and the five curated
trees this section defines live in exactly one place, `packages/domain/src/nav`
(`types.ts`, `config.ts`, `filterNav.ts`) — zero UI dependency, so the same
engine filters both a route guard on the server and the rendered nav on the
client, and the two can never disagree about what a role can see (the direct
fix for the prototype's D6 finding: `module_*` toggles no navigation code
read). `packages/ui`'s `nav-config.ts` imports these rather than redefining
them, and adds only what is genuinely UI-only: the icon-name → `lucide-react`
lookup, and the `sellerNav`/`platformNav` trees below, which are entered from
a link/the avatar menu rather than resolved from `workspace type ∧ role`, so
they have no home in the domain engine. "Owner-only within More" (the
footnote under the owner/admin table) is `roles: ["owner"]`, not a separate
flag — `owner` is already its own role, distinct from `admin`. The school
shell (`/app`) resolves its tree from `WorkspaceContext.role` server-side and
renders `BottomNavFromConfig` (phone) / `SidebarFromConfig` (desktop) off the
identical filtered result. The nav's module keys below and the plan
catalogue's `plan_modules.module` bundles are two different, only partly
reconciled taxonomies — `packages/domain/src/nav/entitlements.ts` maps the
few that correspond and leaves every other nav key ungated rather than
guessing; see D-56 for the full list.

```ts
type NavItem = {
  id: string
  href: string
  labelEn: string
  labelBn: string
  icon: IconName
  roles?: Role[] // omitted = every role in this workspace type
  module?: ModuleKey // gated by plan entitlement + owner visibility
  badge?: BadgeSource
}
type NavConfig = { bottom: NavItem[]; more: NavGroup[] } // bottom.length <= 5
```

#### School workspace `/app` — **teacher** (the primary user)

| Slot | Item       | Route             |
| ---- | ---------- | ----------------- |
| 1    | Today      | `/app/dashboard`  |
| 2    | Attendance | `/app/attendance` |
| 3    | Timetable  | `/app/timetable`  |
| 4    | Messages   | `/app/messages`   |
| 5    | More       | sheet             |

_Why these:_ a teacher's daily loop is _what am I teaching next → take the
register → any messages_. Everything else is weekly or monthly.

**More →** _Teaching:_ Classes · Marks · Assignments · Lesson plans ·
Curriculum & pacing · Lesson log — _Students:_ Students · Behaviour notes ·
At-risk — _Exams:_ Exams · Mark entry · Report cards — _Library:_ My resources ·
School library · AI tools & credits — _Work:_ My workload · Cover requests ·
Staff attendance (self check-in) — _Other:_ Reports · Print queue ·
Marketplace · Selling · Settings · Help & feedback

#### School workspace `/app` — **owner / admin**

| Slot | Item       | Route             |
| ---- | ---------- | ----------------- |
| 1    | Overview   | `/app/dashboard`  |
| 2    | Attendance | `/app/attendance` |
| 3    | Students   | `/app/students`   |
| 4    | Messages   | `/app/messages`   |
| 5    | More       | sheet             |

_Why these:_ on a phone an admin monitors and communicates. Configuration
(billing, hiring, team, labels) is desktop work; it lives in More on phone and
in the sidebar on desktop, where it belongs.

**More →** _Academic:_ Classes & sections · Timetable · Exams · Marks ·
Curriculum · Assignments · Lesson plans — _People:_ Staff · Staff attendance ·
Team & access · Hiring · Cover teacher · Custom labels — _Output:_ Reports ·
Print queue · Announcements — _Library:_ Resource library · AI usage & credits —
_Business:_ Billing & plan · Expenses · Marketplace · Analytics — _Admin:_
Audit log · School settings · Help & feedback

Owner-only within More: _Billing & plan_, _Audit log_, _Ownership transfer_
(inside School settings).

#### School workspace `/app` — **staff** (office, accounts, library)

| Slot | Item     | Route            |
| ---- | -------- | ---------------- |
| 1    | Home     | `/app/dashboard` |
| 2    | Students | `/app/students`  |
| 3    | Print    | `/app/print`     |
| 4    | Messages | `/app/messages`  |
| 5    | More     | sheet            |

**More →** My attendance (self check-in) · Timetable · Resource library ·
Expenses · Files · Reports · Marketplace · Settings · Help

#### Parent shell `/family` — **parent**

| Slot | Item       | Route                |
| ---- | ---------- | -------------------- |
| 1    | Home       | `/family`            |
| 2    | Attendance | `/family/attendance` |
| 3    | Results    | `/family/results`    |
| 4    | Messages   | `/family/messages`   |
| 5    | More       | sheet                |

**More →** Timetable · Exam schedule · Assignments · Behaviour notes ·
Announcements · Fees & receipts · Contact the school · Switch child ·
Settings · Help

TopBar for a parent carries the **child switcher** in place of the workspace
switcher when more than one student is linked. Read-only throughout — there is
no FAB anywhere in this shell.

#### Personal workspace `/personal`

Flat — every member of a personal workspace is its owner, so no role filtering.

| Slot | Item       | Route                  |
| ---- | ---------- | ---------------------- |
| 1    | Home       | `/personal`            |
| 2    | Students   | `/personal/students`   |
| 3    | Attendance | `/personal/attendance` |
| 4    | Diary      | `/personal/diary`      |
| 5    | More       | sheet                  |

**More →** File vault · CV & teacher profile · Job applications ·
Document requests · Schools (join / create / switch) · Selling ·
Marketplace · Settings · Help

#### Seller area `/sell`

Not a workspace and not a shell. It is a **focused sub-shell** entered from the
avatar menu, with its own bottom nav and a TopBar whose left slot is
`← Back to <workspace name>` instead of the switcher.

| Slot | Item      | Route            |
| ---- | --------- | ---------------- |
| 1    | Dashboard | `/sell`          |
| 2    | Listings  | `/sell/listings` |
| 3    | Orders    | `/sell/orders`   |
| 4    | Earnings  | `/sell/earnings` |
| 5    | More      | sheet            |

**More →** Verification & KYC · Payout methods · Storefront · Monthly
statements · Browse marketplace · Back to `<workspace>`

The prototype's violet seller sub-brand is removed. Selling uses the same
tokens; only the nav differs.

#### Marketplace `/market`

Deliberately **not** a shell. It is a destination inside whatever shell you came
from: a full-screen stack with its own top bar (back, search, cart) that keeps
the host's bottom nav, so a teacher browsing resources never loses their way
back. A fourth nav model for a browsing surface is not worth the cost.

#### Platform console `/platform`

| Slot | Item       | Route                  |
| ---- | ---------- | ---------------------- |
| 1    | Queue      | `/platform/queue`      |
| 2    | Sellers    | `/platform/sellers`    |
| 3    | Payouts    | `/platform/payouts`    |
| 4    | Workspaces | `/platform/workspaces` |
| 5    | More       | sheet                  |

_Queue_ is one inbox for listing moderation and KYC/verification — they are the
same job done by the same person. **More →** Refunds · Plans & pricing ·
Platform settings · Audit · Exit to my workspace.

Platform is desktop-primary; the phone layout exists so a moderator can clear a
queue on a bus, not so they can configure plans.

### 3.3 Sheets vs dialogs

| Situation                                  | < 1024                                                            | ≥ 1024                              |
| ------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------- |
| Create / edit a record                     | **bottom Sheet**, `max-height: 92svh`, drag handle, sticky footer | **Dialog**, `max-width: 560px`      |
| A picker (section, subject, student, date) | **Sheet**, full-height, with search when > 8 options              | **Popover** anchored to the trigger |
| Destructive confirmation                   | **AlertDialog** (centred, both sizes)                             | **AlertDialog**                     |
| A record's detail                          | **push a route** (`/app/students/[id]`), never a sheet            | side panel or route                 |
| More than 6 fields                         | **push a route** with a stepper, not a sheet                      | Dialog with sections                |
| Quick single-field edit                    | **Sheet**, one field, autofocus                                   | inline edit                         |

Rules: a sheet never opens another sheet — it either pushes a route or replaces
its own content with a back affordance. A sheet's primary action is in a sticky
footer, full-width, 48px, never scrolled off. `AlertDialog` is centred in both
breakpoints because a destructive confirmation must not be dismissible by the
same downward drag that closes a sheet.

### 3.4 One-thumb zones

On a 360 × 800 phone held one-handed, the comfortable arc is roughly the bottom
55% and the inner 80% horizontally.

```
        ┌────────────────────────┐  0
        │  hard reach            │
        │  · page title          │
        │  · read-only summary   │  ~280px
        ├────────────────────────┤
        │  ok                    │
        │  · content             │
        │  · secondary actions   │  ~440px
        ├────────────────────────┤
        │  THUMB ZONE            │
        │  · primary action      │
        │  · the repeated tap    │
        │  · destructive = NO    │  800px
        └────────────────────────┘
```

- The **primary action** of every task screen sits in the thumb zone: a sticky
  footer bar, a FAB at `bottom: calc(var(--inset-bottomnav) + 16px); right: 16px`,
  or the repeated control itself (the attendance segments).
- **Destructive actions never sit in the thumb zone.** Delete/Remove lives in an
  overflow menu in the top-right or in a sheet's own footer after confirmation.
- The top-right corner holds at most two controls; anything more goes in a menu.
- Maximum **one FAB per page**. If a page seems to need two, it is two pages.

### 3.5 Touch targets

- **44 × 44 px minimum** for every interactive element (WCAG 2.5.5 AAA; taken as
  a hard floor here). The visible chip may be smaller — a 24px status dot is fine
  — but its hit area is padded to 44.
- **8px minimum** between adjacent targets. In the attendance row the five
  segments are contiguous by design — they form a single segmented control, so
  the adjacency rule does not apply, and each segment is ≥ 56px wide × 44 tall.
- No action depends on hover, long-press or a swipe **alone**. Swipe-to-act
  always has a visible equivalent in an overflow menu.
- `-webkit-tap-highlight-color: transparent` plus an explicit `:active` state of
  `scale(0.97)` at `--duration-instant`, because on a slow device the system
  highlight arrives after the user has already doubted the tap.

### 3.6 Pull-to-refresh

On every list and dashboard route in the phone shell.

- Threshold 64px; the spinner appears at 24px of pull and locks at 64.
- `overscroll-behavior-y: none` on `body`; the gesture is owned by the scroll
  container, so the Android WebView never runs its own refresh underneath.
- Disabled while a sheet is open, while a row is in an optimistic-pending state,
  and inside a horizontally-scrolling grid.
- Refresh **revalidates**; it never resets scroll position or clears an
  in-progress form.
- On desktop there is no pull-to-refresh — there is a refresh control next to
  the "Updated 2 min ago" timestamp in the page header.

### 3.7 Skeletons

Skeletons match the final geometry, not a generic grey block. Never a spinner
for initial page content.

- **List:** 6 rows at `--size-row`, each with a 36px circle, a 60%-width bar and
  a 35%-width bar. Rules between rows are drawn immediately (they are not data).
- **Stat tile:** the label renders as real text (it is static), only the value is
  a skeleton — this halves the perceived wait.
- **Table (desktop):** header row is real, 8 body rows are skeletons.
- **Chart:** the axes, gridlines and title render; only the marks are skeleton.
- Shimmer is a 1.4s translate on a `--muted` → `--secondary` → `--muted` gradient,
  and is **removed** under reduced-motion (a static `--muted` fill remains).
- Skeletons only after **150ms** of loading — faster than that, show nothing and
  avoid a flash.

### 3.8 Empty states

Composed, never apologetic, and **exactly one CTA**.

```
┌──────────────────────────────────────────┐
│                                          │
│              ▦   (24px icon in a         │
│                   48px --muted tile)     │
│                                          │
│        No attendance taken yet           │  18px semibold
│   Mark today's register for Class 6 – A. │  15px muted, ≤ 20 words
│                                          │
│        ┌──────────────────────┐          │
│        │   Take attendance    │          │  primary, 44px
│        └──────────────────────┘          │
└──────────────────────────────────────────┘
```

Registry: `ui/empty.tsx` (`Empty` / `EmptyHeader` / `EmptyMedia` / `EmptyTitle` /
`EmptyDescription` / `EmptyContent`).

Four distinct cases, never conflated:

| Case                    | Title                             | Body                     | CTA                        |
| ----------------------- | --------------------------------- | ------------------------ | -------------------------- |
| **Nothing yet**         | names the thing that is missing   | what to do, one sentence | the action that creates it |
| **Filtered to nothing** | "No students match these filters" | names the active filters | **Clear filters**          |
| **Not permitted**       | "Only admins can see billing"     | who to ask               | **Message an admin**       |
| **Not on this plan**    | names the module                  | what it does, one line   | **See plans**              |

No illustrations. No mascot. No emoji (the prototype's `👋 📚 🔒 🏫 🛍️` are
removed). Copy is the design.

### 3.9 Error states

| Scope              | Treatment                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Field**          | Message below the field, `--danger-ink`, with a 14px icon. The field gets `aria-invalid` and `aria-describedby`. Never only at the top of the form.                      |
| **Form**           | On submit failure, focus moves to the first invalid field and an `aria-live="assertive"` summary names the count: _"2 fields need attention."_                           |
| **Section**        | An inline `--danger-soft` panel in place of the section, with **Try again**. The rest of the page still works.                                                           |
| **Page**           | A route error boundary: what failed, the correlation id in `--font-mono` at `--text-xs` (copyable — it is what support will ask for), **Try again** and **Go to Today**. |
| **Write conflict** | A sheet showing both values side by side: _Keep mine_ / _Use theirs_. Never a silent overwrite, and never "something went wrong".                                        |

Errors state what happened and what to do. They do not apologise, they do not
say "Oops", and they never blame the user.

### 3.10 Offline banner

The offline path is real for this product: attendance is saved in a corridor
with one bar of EDGE, and the Android wrapper makes the queue default-on.

```
┌───────────────────────────────────────────────────────────────────┐
│ ▲  Offline — 12 changes will sync when you reconnect     [View]   │  36px
└───────────────────────────────────────────────────────────────────┘
```

- `z-index: var(--z-banner)` — above literally everything, including sheets.
- `--warning-soft` background, `--warning-ink` text, a 1px `--warning` bottom
  rule. Never a toast: a toast is transient and this state is not.
- It pushes content down; it does not overlay it.
- States: **Offline** (amber, with a pending count) → **Syncing…** (info, with a
  progress bar) → **Synced** (success, auto-dismisses after 2.5s) →
  **Couldn't sync 2 changes** (danger, persists, `[Review]` opens the queue).
- `role="status"` + `aria-live="polite"`.
- While offline, every write control stays enabled and queues optimistically.
  Reads that are not cached show a section-level empty state that says the data
  needs a connection — never a blank page.

---

## 4. Component inventory

Registry root: `F:\shadcn-ui\apps\v4\registry\new-york-v4`. Paths below are
relative to it. "Copy" means: copy the file into `packages/ui/src/components/ui/`
unmodified, then extend in `packages/ui/src/components/` — never edit a copied
primitive in place, so a registry update stays a diff.

### 4.1 Auth

|                                   | Registry                                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login / register / forgot / reset | `blocks/login-02/components/login-form.tsx` — the **card-less** variant; a card inside a 360px viewport is wasted chrome. Add the `Card` wrapper at `sm` only. |
| Field composition                 | `ui/field.tsx` + `examples/field-input.tsx`, `examples/field-checkbox.tsx`, `examples/field-choice-card.tsx`                                                   |
| Phone OTP                         | `ui/input-otp.tsx`                                                                                                                                             |
| Sign-up                           | `blocks/signup-02/components/signup-form.tsx`                                                                                                                  |

### 4.2 Dashboard cards and stat tiles

|                                           | Registry                                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Stat tile row                             | `blocks/dashboard-01/components/section-cards.tsx` (structure), `ui/card.tsx`                   |
| Action/summary rows                       | `ui/item.tsx` + `examples/item-icon.tsx`, `examples/item-avatar.tsx`, `examples/item-group.tsx` |
| Badges, counts                            | `ui/badge.tsx`                                                                                  |
| Progress (attendance %, storage, credits) | `ui/progress.tsx`                                                                               |
| Section header actions                    | `ui/button-group.tsx`                                                                           |

**Custom:** `StatTile` — label (real text, always) + value in `--text-2xl`
tabular + a delta with a direction glyph + an optional 40px sparkline. The value
is the only large thing on it. Deltas use `--success-ink` / `--danger-ink`, never
a coloured background.

### 4.3 Data list / table

|               | Registry                                                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop table | `ui/table.tsx`, `examples/data-table-demo.tsx`, `blocks/dashboard-01/components/data-table.tsx`                                        |
| Phone rows    | `ui/item.tsx` (`ItemGroup` / `ItemSeparator` for the hairline)                                                                         |
| Row overflow  | `ui/dropdown-menu.tsx`                                                                                                                 |
| Selection     | `ui/checkbox.tsx`                                                                                                                      |
| Filters       | `ui/combobox.tsx` + `examples/combobox-responsive.tsx` (popover on desktop, drawer on phone — exactly our rule), `ui/toggle-group.tsx` |
| Paging        | `ui/pagination.tsx` (desktop), infinite scroll + `ui/spinner.tsx` (phone)                                                              |
| Loading       | `ui/skeleton.tsx`                                                                                                                      |
| Empty         | `ui/empty.tsx`                                                                                                                         |
| Scroll        | `ui/scroll-area.tsx`                                                                                                                   |

**Custom:** `DataList` — one component, two renderers. Virtualised, cursor-paginated,
server-filtered (no client-side filtering of whole tables, per ARCHITECTURE §6).
Below `lg` it renders `ItemGroup` rows; at `lg` it renders a `Table` with the same
column definitions. Sticky header, frozen first column, selection, bulk bar,
per-row overflow. Every list in the product is this component.

### 4.4 Attendance roll-call

|                       | Registry                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------- |
| The segmented control | `ui/toggle-group.tsx` + `examples/toggle-group-lg.tsx`, `examples/toggle-group-outline.tsx` |
| Student identity      | `ui/avatar.tsx`, `ui/item.tsx`                                                              |
| Bulk header           | `ui/button-group.tsx`, `ui/dropdown-menu.tsx`                                               |
| Undo                  | `ui/sonner.tsx`                                                                             |
| Note per student      | `ui/sheet.tsx` + `ui/textarea.tsx`                                                          |

**Custom:** `AttendanceToggle` — a five-segment control rendering the status
letter. `type="single"`, `--size-touch-lg` per segment, `role="radiogroup"` with
the student's name in the group label. Selected segment fills with `--att-X`,
letter in `--att-X-fg`, plus the ring for `late`/`half_day`. Unselected segments
are `--muted` with `--muted-foreground` letters. Never five separate buttons.

### 4.5 Marks entry grid

|                | Registry                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Grid           | `ui/table.tsx`                                                                                 |
| Cell input     | `ui/input.tsx`, `ui/input-group.tsx` + `examples/input-group-text.tsx` (for the `/100` suffix) |
| Keyboard hints | `ui/kbd.tsx` + `examples/kbd-input-group.tsx`                                                  |
| Validation     | `ui/tooltip.tsx`, `ui/field.tsx`                                                               |
| Save state     | `ui/spinner.tsx`, `ui/sonner.tsx`                                                              |

**Custom:** `MarkCell` — a controlled numeric cell. `inputMode="decimal"`,
`enterKeyHint="next"`, tabular figures, selects-all on focus, clamps to
`exam_subject.max_marks`, shows the derived letter grade in a `--grade-X-soft`
chip to the right the instant the value is valid. Out-of-range is an inline
`--danger` ring plus a tooltip stating the max — it does not block typing.

### 4.6 Timetable

|                      | Registry                                              |
| -------------------- | ----------------------------------------------------- |
| Grid                 | `ui/table.tsx`                                        |
| Day switcher (phone) | `ui/tabs.tsx`                                         |
| Period detail        | `ui/hover-card.tsx` (desktop), `ui/sheet.tsx` (phone) |
| Horizontal scroll    | `ui/scroll-area.tsx`                                  |
| Subject colour       | `ui/badge.tsx`                                        |

**Custom:** `PeriodGrid` — the week grid, generated from
`school_profiles.working_days` (default Sat–Thu — never a hardcoded 5-day week).
Phone: one day per `Tabs` panel as a vertical list of periods, current period
marked with a `--primary` left rule and `aria-current="time"`. Desktop: a full
days × periods grid with frozen period column, cells at `--size-row-dense`.
Subject colours derive from a stable hash into the six chart tokens — never the
prototype's seven hardcoded light-only subject colours.

### 4.7 Chat and messaging

|                          | Registry                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| Message list             | `ui/message.tsx`, `ui/message-scroller.tsx`                                                   |
| Bubbles + reactions      | `ui/bubble.tsx` (`BubbleGroup` / `Bubble` / `BubbleContent` / `BubbleReactions`)              |
| Attachments              | `ui/attachment.tsx`                                                                           |
| Unread / date divider    | `ui/marker.tsx`                                                                               |
| Composer                 | `ui/input-group.tsx` + `examples/input-group-textarea.tsx`, `examples/input-group-button.tsx` |
| Channel list             | `ui/item.tsx`, `ui/avatar.tsx`, `ui/badge.tsx`                                                |
| Channel switcher (phone) | `ui/sheet.tsx`; `ui/resizable.tsx` for the desktop two-pane                                   |

Composer is pinned above the bottom nav with `--inset-bottomnav` and grows to
5 lines before scrolling. Announcements (one-way, to parents) use the same list
with the composer replaced by a _New announcement_ button — visually distinct
from a conversation, because it is one.

### 4.8 Hiring pipeline (kanban → list on phone)

|                      | Registry                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Stage tabs (phone)   | `ui/tabs.tsx`                                                                                                                |
| Candidate rows       | `ui/item.tsx`, `ui/avatar.tsx`, `ui/badge.tsx`                                                                               |
| Stage change         | `ui/native-select.tsx` on phone (the OS wheel is faster and more reliable than a custom popover), `ui/select.tsx` on desktop |
| Desktop columns      | `ui/resizable.tsx`, `ui/scroll-area.tsx`, `ui/card.tsx`                                                                      |
| Scorecards           | `ui/slider.tsx`, `ui/field.tsx`, `ui/radio-group.tsx`                                                                        |
| Interview scheduling | `ui/calendar.tsx`, `ui/popover.tsx`                                                                                          |

**No drag-and-drop on phone.** A horizontally-scrolling kanban at 360px is
unusable and drag conflicts with the scroll gesture. Phone gets stage tabs with
counts and a select-to-move control; desktop gets real columns. Drag is a
desktop-only enhancement, never the only way to move a candidate.

### 4.9 Forms in sheets

|            | Registry                                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Container  | `ui/sheet.tsx` + `examples/sheet-side.tsx`; `ui/drawer.tsx` + `examples/drawer-dialog.tsx` (the responsive dialog/drawer switch)                                                                                                            |
| Structure  | `ui/form.tsx`, `ui/field.tsx` + `examples/field-group.tsx`, `examples/field-fieldset.tsx`, `examples/field-responsive.tsx`                                                                                                                  |
| Controls   | `ui/input.tsx` · `ui/textarea.tsx` · `ui/native-select.tsx` (phone) · `ui/select.tsx` (desktop) · `ui/combobox.tsx` · `ui/checkbox.tsx` · `ui/radio-group.tsx` · `ui/switch.tsx` · `ui/calendar.tsx` · `ui/input-otp.tsx` · `ui/slider.tsx` |
| Long forms | `ui/accordion.tsx`, `ui/collapsible.tsx`                                                                                                                                                                                                    |
| Confirm    | `ui/alert-dialog.tsx`                                                                                                                                                                                                                       |

**Custom:** `FormSheet` — the single form container. Wires `react-hook-form` +
the Zod schema from `packages/contracts` (the same schema the server parses),
renders a `Sheet` below `lg` and a `Dialog` at `lg`, owns the sticky footer,
the dirty-close guard, the pending state and the server-error mapping. **No
feature writes its own sheet or dialog for a form.**

Form rules: label above input, always visible — never placeholder-as-label.
Helper text present in the markup even when empty, so nothing shifts when it
appears. Error below the field. `autocomplete` on every identity field. Bengali
labels come from the same message catalogue as English, never hardcoded.

### 4.10 Files and PDF preview

|                     | Registry                                                            |
| ------------------- | ------------------------------------------------------------------- |
| File row / card     | `ui/item.tsx` + `examples/item-image.tsx`, `examples/item-icon.tsx` |
| Upload + progress   | `ui/attachment.tsx`, `ui/progress.tsx`                              |
| Thumbnail framing   | `ui/aspect-ratio.tsx`                                               |
| Actions             | `ui/dropdown-menu.tsx`, `ui/button-group.tsx`                       |
| PDF page flip       | `ui/carousel.tsx`                                                   |
| Full-screen preview | `ui/drawer.tsx` (phone), `ui/dialog.tsx` (desktop)                  |
| Loading             | `ui/spinner.tsx`, `ui/skeleton.tsx`                                 |

PDF preview renders the **first page as an image** by default and loads the
viewer on demand — a report-card PDF is 1–3 MB and must not sit in the initial
route bundle. Marketplace previews render only the approved preview page, and
purchased files are watermarked server-side at download (PRODUCT-DECISIONS 4.7).

### 4.11 Charts

`ui/chart.tsx` is the wrapper (`ChartContainer` / `ChartTooltip` /
`ChartLegend`). Specific charts to copy are listed in §6.

### 4.12 Shell and navigation

|                 | Registry                                                                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop sidebar | `ui/sidebar.tsx`; structure from `blocks/sidebar-07/components/app-sidebar.tsx`, `nav-main.tsx`, `nav-user.tsx`, and **`team-switcher.tsx` → our workspace switcher** |
| Desktop header  | `blocks/dashboard-01/components/site-header.tsx`                                                                                                                      |
| Breakpoint hook | `hooks/use-mobile.ts`                                                                                                                                                 |
| Command palette | `ui/command.tsx` + `examples/command-dialog.tsx`                                                                                                                      |
| Toasts          | `ui/sonner.tsx`                                                                                                                                                       |
| Breadcrumbs     | `ui/breadcrumb.tsx`                                                                                                                                                   |
| Tooltips        | `ui/tooltip.tsx` (desktop only — never the only carrier of information)                                                                                               |
| Avatar menu     | `ui/dropdown-menu.tsx`, `ui/avatar.tsx`                                                                                                                               |

### 4.13 Custom primitives `packages/ui` must add

Everything below is ours; nothing in the registry does it.

| Primitive              | Contract                                                                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`AppShell`**         | Owns TopBar, optional offline banner, scroll region, BottomNav / Sidebar, safe-area insets, scroll restoration, the `--inset-bottomnav` scroll padding, and the single `Toaster`. Takes `navConfig` + `WorkspaceContext`. Renders phone and desktop from the same config. |
| **`BottomNav`**        | ≤ 5 slots, always 5 columns. Active detection from the route segment, badges, the More sheet with grouped sections and its aggregate badge, hide-on-scroll where permitted, safe-area padding.                                                                            |
| **`FormSheet`**        | Sheet < lg / Dialog ≥ lg. RHF + Zod from `packages/contracts`, sticky footer, dirty-close guard, pending state, server-error → field mapping.                                                                                                                             |
| **`DataList`**         | Rows < lg / Table ≥ lg from one column definition. Virtualised, cursor-paginated, server-filtered, sticky header, frozen first column, selection + bulk bar, skeleton, empty, error.                                                                                      |
| **`StatusChip`**       | `status` + `variant="soft" \| "solid"`. Resolves fill / fg / soft / ink and the ring rule from tokens. Always renders a glyph and an accessible name. The one place a status colour is read.                                                                              |
| **`AttendanceToggle`** | Five-segment radiogroup of status letters. See §4.4 and §5.1.                                                                                                                                                                                                             |
| **`MarkCell`**         | Controlled numeric cell with clamping, derived grade chip and the keyboard grid contract. See §4.5 and §5.2.                                                                                                                                                              |
| **`PeriodGrid`**       | Week grid from `working_days`; day-tabs on phone, full grid on desktop; current-period marker.                                                                                                                                                                            |
| **`MoneyText`**        | Takes `bigint` **paisa** (ARCHITECTURE §4) and renders `৳12,50,000.00` in the **Indian digit grouping** (2,2,3 — `৳১২,৫০,০০০`), tabular figures, `<bdi>`-wrapped, `numerals="en" \| "bn"`, optional `sign` and `compact` (`৳12.5L`). Never do currency formatting inline. |
| **`BnEnText`**         | Renders a mixed Bn/En string with correct `lang` attributes on each run, so the right font, line-height and screen-reader voice apply to each. Handles the numerals preference and `<bdi>` isolation. Every user-generated name goes through it.                          |

---

## 5. Interaction patterns

### 5.1 Attendance: ≤ 2 taps per student

This is the single most-used interaction in the product. A class of 45 must be
markable in under 60 seconds.

**The flow.**

1. Open Attendance. The correct section and today's date are **pre-selected**
   from the teacher's timetable and the workspace timezone. If the teacher
   teaches one section this period, there is no picker at all.
2. **(amended per SYNTHESIS — mirrors D-22/D-40)** The roster's default status
   is **`unmarked`**, not pre-filled to `present`. A default that fabricates
   attendance records poisons every downstream number (attendance %, risk
   score, GPA denominators) and cannot be fixed retroactively once a school
   relies on the history — attendance must never be invented on the teacher's
   behalf. "সবাই উপস্থিত / Mark all present" is available as **one explicit
   header tap** that writes an audited bulk action (`bulk_marked_by`,
   `bulk_marked_at`, surfaced in the monthly register), with an **Undo** toast.
3. After that explicit bulk tap (or per-student), the teacher taps only the
   exceptions: **one tap** on the relevant segment of that student's row. Done.
4. Not-present statuses that need a reason (`excused`) open a one-field note
   sheet — that is the **second tap**, and it is the only case that has one.

So: **1 header tap to bulk-mark present (audited) + 1 tap per exception, or 1
tap per student if marking individually from `unmarked`; 2 taps for excused.**
Worst realistic case for a 45-student class with 5 absences: 1 bulk tap + 5
exception taps.

**Rules.**

- Saving is **continuous and optimistic** — there is no Save button to forget.
  Each change writes immediately with an `idempotency_key`. The header shows
  _Saving…_ → _Saved 12:04_.
- The row **never moves or reorders** after a tap. Reordering under a moving
  finger is how mis-marks happen.
- The list is virtualised and keeps a **sticky section header** with a live
  count, including the unmarked default: `Unmarked 5 · Present 35 · Absent 3 ·
Late 1 · Excused 1` (amended per SYNTHESIS — an `Unmarked` bucket exists
  because the roster no longer defaults to present).
- **Bulk header actions:** _Mark all present_ · _Mark all absent_ · _Clear_, each
  followed by an undo toast. Never a confirmation dialog — undo is faster and
  less punishing.
- Long-press a row → per-student note + attendance history for the month. The
  same is reachable from the row's overflow button, so the gesture is never the
  only path.
- **Offline:** every change queues in IndexedDB with its idempotency key and
  replays on reconnect; the row shows a small pending glyph until confirmed.

### 5.2 Marks entry

**Desktop — keyboard first, and it is the whole point.** An admin entering 45 × 6
subjects must never touch the mouse.

| Key                  | Action                                                                     |
| -------------------- | -------------------------------------------------------------------------- |
| `Enter` / `↓`        | commit, move **down** one student (the column is the natural run)          |
| `Shift+Enter` / `↑`  | commit, move up                                                            |
| `Tab` / `→`          | commit, move right one subject                                             |
| `Esc`                | revert the cell to its last saved value                                    |
| `Ctrl/⌘+S`           | flush the save queue (it is already autosaving; this is for peace of mind) |
| `A` in an empty cell | mark **Absent** for that exam subject                                      |
| `/`                  | focus the student-search filter                                            |

Focus always lands with the value **selected**, so typing replaces. The grid
autoscrolls to keep the focused cell 2 rows clear of the sticky header. A live
region announces `Rahim Uddin, Mathematics, 78 of 100, A` on each commit.

**Phone — a numeric pad, not a keyboard.**

One student at a time, full-screen, not a grid: student name and photo at the
top, the subject and max marks below it, a large value display, and a **custom
10-key numeric pad in the thumb zone** (`--size-touch-lg` keys, `⌫`, `Absent`,
`Next ▸`). We draw the pad rather than relying on the OS keyboard because the
Android numeric keyboard covers 55% of the viewport, varies wildly by OEM, and
often has no reliable "next" affordance.

`Next ▸` commits and advances; a progress rail shows `12 / 45`. Swipe left/right
also moves between students, with visible arrows as the non-gesture equivalent.

### 5.3 Bulk actions

- Selection starts from a checkbox in the row's leading slot; on phone a
  long-press also enters selection mode.
- Entering selection mode replaces the BottomNav with a **bulk action bar** in
  the same 56px slot — same position, same thumb zone, no layout shift.
  It reads `3 selected` on the left, up to three actions, and an overflow.
- The bar always has **Cancel** (or the hardware back button) as the first exit.
- Destructive bulk actions confirm with an `AlertDialog` that **names the count
  and the thing**: _"Remove 3 students from Class 6 – A?"_ — never "Are you
  sure?".
- Non-destructive bulk actions do not confirm; they act and offer undo.
- A bulk action over 50 rows runs as a **job** with a progress toast, not a
  blocking spinner.

### 5.4 Undo toasts

Undo is the default safety mechanism; confirmation dialogs are the exception.

- `ui/sonner.tsx`, bottom-anchored, offset by `--inset-bottomnav` so it never
  hides the nav or sits under the gesture bar.
- 6 seconds for a single-record action, 10 seconds for a bulk action. The timer
  pauses on hover, on focus, and while a screen reader is on the toast.
- Copy is `<Verb past-tense> <object>` + `Undo`: _"Marked 40 present"_ ·
  _"Removed 3 students"_. The verb matches the button that caused it, exactly.
- Undo reverses via the **inverse action**, not by cancelling an in-flight
  request — the write has already happened and other people may already see it.
- One toast at a time. A second action replaces the first and commits it.
- `role="status"`, `aria-live="polite"`; an `aria-live="assertive"` region is
  reserved for errors only.
- **Not undoable → not a toast.** Payments, submissions to moderation, sending
  an announcement to parents, and anything that leaves the system confirm up
  front with an `AlertDialog`.

### 5.5 Optimistic updates

TanStack Query, keys scoped by workspace (ARCHITECTURE §6).

- **Optimistic:** attendance marks, mark entry, read receipts, stage changes,
  toggles, reordering, notes. These are frequent, low-consequence and reversible.
- **Not optimistic:** anything involving money, entitlement, moderation,
  invitations, role changes, or a state machine the server owns. These show a
  pending state and wait for the server's canonical row.
- On failure: restore the previous value **in place**, mark the row with a
  `--danger` left rule and a **Retry**, and raise an assertive toast. Never a
  silent revert — the user must know their change did not stick.
- The server action returns the canonical row and the cache is reconciled to it,
  so a server-side derivation (grade letter, attendance %) always wins over the
  optimistic guess.
- Mutations carry an `idempotency_key` so a retry after a timeout cannot
  double-apply.

### 5.6 Long lists

- **Virtualise above 50 rows.** A 2,500-student school is a Pro-plan reality.
- **Cursor pagination, server-side filter and sort.** Never fetch a whole table
  to filter it in the browser.
- Phone: infinite scroll with a 24-row page and a 300px root margin, plus a
  visible **Load more** as the non-scroll equivalent. Desktop: `ui/pagination.tsx`
  with a page-size control, because an operator wants a stable position.
- **Sticky section headers** — `A`, `B`, `C` for student lists; date for
  activity; stage for pipelines. Headers are `position: sticky` at `--z-sticky`.
- **Alphabet rail** on the right edge of the student list at ≥ 400 rows, 24px
  wide, with a haptic-style highlight on drag.
- **Search is always at the top and always server-side**, debounced 250ms, with
  the result count announced politely.
- Scroll position is restored on back-navigation. Losing a teacher's place in a
  45-row roster is the difference between the app being used and not.

---

## 6. Charts

Loaded and applied: the `dataviz` skill's procedure (form → colour job →
**validate** → marks → interaction → accessibility).

### 6.1 Palette

Fixed categorical order, **never cycled**. Series colour follows the entity, so
the same hue order is used in light and dark — a filter that removes a series
must not repaint the survivors.

| Slot        | Light            | Dark      | Typical role                         |
| ----------- | ---------------- | --------- | ------------------------------------ |
| `--chart-1` | `#4461e0` indigo | `#6383f2` | the primary metric — always series 1 |
| `--chart-2` | `#b3276e` rose   | `#d44d8c` |                                      |
| `--chart-3` | `#c78100` amber  | `#c78100` |                                      |
| `--chart-4` | `#009490` teal   | `#25a4a1` |                                      |
| `--chart-5` | `#7241a0` violet | `#8b55c1` |                                      |
| `--chart-6` | `#4ea253` green  | `#419547` |                                      |

**Validated** with `dataviz/scripts/validate_palette.js` — all six checks PASS in
both modes. Worst adjacent CVD ΔE: **13.7** (light, protan) and **14.6** (dark,
deutan) against a target of ≥ 8. All six clear 3:1 against their surface.

- A **7th series never gets a generated hue.** It folds into _Other_, or the
  chart becomes small multiples.
- **Status colours are reserved.** `--att-*` and `--success/warning/danger/info`
  never stand in for "series 5".
- Sequential (heat maps): one hue, `--indigo-100 → --indigo-800`, light to dark.
- Diverging (mark change vs last exam): `--danger` ← `--neutral-300` → `--success`,
  a neutral grey midpoint, never a hue at the middle.
- **No dual-axis charts, ever.** Two measures of different scale become two
  charts or an indexed series.

### 6.2 Chart per metric

| Dashboard            | Metric                                  | Form                                                                             | Registry file to copy               |
| -------------------- | --------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------- |
| School overview      | Attendance % over the term              | **line, one series**                                                             | `charts/chart-line-default.tsx`     |
| School overview      | Today by status                         | **stat tile row**, not a chart — 5 numbers do not need a plot                    | `ui/card.tsx` + `StatTile`          |
| School overview      | Enrolment by class                      | **horizontal bar** (12 long labels)                                              | `charts/chart-bar-horizontal.tsx`   |
| Attendance           | Section × weekday heat map              | **sequential heat grid** (custom, indigo ramp)                                   | `ui/chart.tsx` + `ui/table.tsx`     |
| Attendance           | Present / absent / late over time       | **stacked bar**, 2px surface gap between segments                                | `charts/chart-bar-stacked.tsx`      |
| Academics            | Grade distribution for an exam          | **bar with labels**, ordered A+→F, grade band colours                            | `charts/chart-bar-label.tsx`        |
| Academics            | Subject average comparison              | **bar, one series**, sorted descending                                           | `charts/chart-bar-default.tsx`      |
| Academics            | A student's subjects vs class average   | **radar** — the one place it earns its keep (6–8 subjects, one shape to compare) | `charts/chart-radar-multiple.tsx`   |
| Academics            | GPA trend across exams                  | **line with dots**                                                               | `charts/chart-line-dots.tsx`        |
| Staff / workload     | Scheduled vs logged periods per teacher | **grouped bar**, two series                                                      | `charts/chart-bar-multiple.tsx`     |
| Staff                | Cover hours this month                  | **stat tile + sparkline**                                                        | `StatTile`                          |
| AI usage             | Credits used vs granted, daily          | **area, stacked**                                                                | `charts/chart-area-stacked.tsx`     |
| AI usage             | Credits remaining today                 | **radial** — a single bounded ratio, the one honest radial                       | `charts/chart-radial-text.tsx`      |
| Marketplace (seller) | Earnings over time                      | **area with gradient**                                                           | `charts/chart-area-gradient.tsx`    |
| Marketplace (seller) | Sales by listing                        | **horizontal bar**, top 5 + "Other"                                              | `charts/chart-bar-horizontal.tsx`   |
| Marketplace (seller) | Earnings status split                   | **donut with centre total**                                                      | `charts/chart-pie-donut-text.tsx`   |
| Platform             | Workspaces by plan                      | **donut**, 4 slices max                                                          | `charts/chart-pie-donut.tsx`        |
| Platform             | Queue age                               | **bar, negative capable**                                                        | `charts/chart-bar-negative.tsx`     |
| Any                  | Range-selectable time series (desktop)  | **interactive area**                                                             | `charts/chart-area-interactive.tsx` |

Banned outright: pie charts with more than 4 slices, 3D anything, any dual axis,
and a donut whose centre does not carry the total.

### 6.3 Mobile sizing

- Chart block at 360px: full bleed to the 16px gutter, **height 180px**, aspect
  ~16:9. Never square — a square chart at 328px wide wastes the fold.
- **Maximum 6 x-axis ticks** at 360px. A 30-day series shows 6 labels and all 30
  marks. Labels never rotate; if they do not fit, the chart is the wrong form —
  switch to horizontal bars.
- Bars ≥ 8px wide with a 2px surface gap. Lines 2px. Dots ≥ 8px.
- Legend **above** the plot, horizontal, wrapping — never to the right (it steals
  a third of a 360px width) and never below (it falls under the fold).
- ≤ 4 series are also **direct-labelled** at the last point, so identity never
  depends on matching a legend swatch to a line.
- Touch: the whole vertical band of an x-position is the hit target; the tooltip
  is a pinned panel **above the plot**, not a floating bubble under the finger.
  Tap elsewhere or press `Esc` to dismiss.
- Every chart has a **table view** toggle in its header. It is the accessible
  representation and also what an admin actually wants half the time.
- Gridlines: horizontal only, `--chart-grid`, 1px. No vertical gridlines, no
  axis domain line, no background fill.
- Numbers on axes and in tooltips use `MoneyText` / tabular figures and the
  Indian grouping for BDT.

---

## 7. Accessibility and performance

### 7.1 Accessibility checklist

Enforced by `@axe-core/playwright` at 360×800 and 1280×800, in both themes,
per ARCHITECTURE §9. Items marked **manual** are on the PR review template.

**Colour and contrast**

- [ ] Body text ≥ 4.5:1; text ≥ 18.66px/bold ≥ 14px ≥ 3:1. Every measured pair is in §2.
- [ ] Non-text UI (borders, icons, focus rings, chart marks) ≥ 3:1, or carries a ring.
- [ ] No information by colour alone — every status has a glyph and a name. **manual**
- [ ] Both themes tested. A token added to one and not the other fails review. **manual**
- [ ] `forced-colors: active` keeps the layout legible. **manual**

**Keyboard**

- [ ] Every action reachable and operable by keyboard; no traps.
- [ ] Visible focus on everything, never removed; 2px `--ring` at 2px offset.
- [ ] Logical tab order matching visual order; sheets and dialogs trap and restore focus.
- [ ] `Esc` closes the topmost layer only.
- [ ] Skip-to-content link, first in the tab order.
- [ ] Marks grid arrow-key contract works and is discoverable (`ui/kbd.tsx` hints).

**Screen reader**

- [ ] Landmarks: one `<main>`, `<nav aria-label>` on TopBar and BottomNav, `<header>`.
- [ ] One `<h1>` per route; heading levels never skip.
- [ ] Icon-only buttons have `aria-label`; decorative icons are `aria-hidden`.
- [ ] `aria-current="page"` on the active nav item; `aria-current="time"` on the current period.
- [ ] `aria-live="polite"` for toasts, save state, counts; `assertive` **only** for errors.
- [ ] Tables have `<caption>`, `scope` on headers, and `aria-sort` on sortable columns.
- [ ] `AttendanceToggle` is a `radiogroup` labelled with the student's name.
- [ ] Charts have an accessible summary and a table view. **manual**
- [ ] `lang` is correct per text run — Bengali announced by a Bengali voice. **manual**

**Touch and motion**

- [ ] 44×44 minimum, 8px spacing (segmented controls exempt, documented).
- [ ] No hover-only, long-press-only or swipe-only affordance.
- [ ] `prefers-reduced-motion` honoured via `--motion`; skeleton shimmer stops.
- [ ] Pinch-zoom never disabled; layout survives 200% text zoom with no loss. **manual**
- [ ] No horizontal page scroll at 320px.

**Forms**

- [ ] Visible label above every input; no placeholder-as-label.
- [ ] Errors below the field, `aria-invalid` + `aria-describedby`, plus a summary.
- [ ] `autocomplete` on identity fields; `inputMode` on numeric ones.
- [ ] Inputs ≥ 16px.
- [ ] Destructive actions confirm with the object and count named.
- [ ] Session timeout warns and preserves entered data.

### 7.2 Performance budget

Target device: a 4-core entry Android on **"Fast 3G"** (1.6 Mbps, 150ms RTT) —
the CI Lighthouse profile.

| Metric                  | Budget                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **LCP**                 | **< 2.5s** on Fast 3G / low-end Android (< 1.8s on cable)                                                                                                                            |
| **INP**                 | < 200ms, every route                                                                                                                                                                 |
| **CLS**                 | < 0.1                                                                                                                                                                                |
| **TTFB**                | < 600ms (Vercel ap-south / edge for the shell)                                                                                                                                       |
| **JS per route**        | **< 200 KB** gzipped, including shared chunks                                                                                                                                        |
| **Shared app-shell JS** | < 120 KB gzipped                                                                                                                                                                     |
| **CSS**                 | < 40 KB gzipped total                                                                                                                                                                |
| **Fonts**               | 48 KB (English session) / **186 KB (Bengali session — 48 KB Inter + 138 KB Hind Siliguri subset, budgeted explicitly, amended per SYNTHESIS)**, loaded on demand per `unicode-range` |
| **Route HTML**          | < 60 KB gzipped                                                                                                                                                                      |
| **Images**              | AVIF/WebP, explicit dimensions, lazy below the fold                                                                                                                                  |
| **Lighthouse PWA**      | ≥ 90 on the app shell (ARCHITECTURE §9)                                                                                                                                              |

**How the budget is met, not just asserted.**

- **Server Components by default.** `"use client"` is a leaf-level decision. The
  attendance roster is a Server Component; only `AttendanceToggle` is a client
  island.
- **Dynamic import** everything heavy and conditional: the PDF viewer, the chart
  bundle (Recharts is ~90 KB — it is never in a route that does not plot),
  the calendar, the command palette (desktop only), the QR generator, the rich
  text editor.
- **No client-side data grid library.** `DataList` is ours and is measured.
- **No animation library on the critical path.** The prototype shipped
  framer-motion (~50 KB) for a fade-up stagger it should not have had. CSS
  transitions cover everything in §2.7.
- **One icon set, tree-shaken, per-icon imports.** No barrel imports.
- **Route-level code splitting** by App Router segment; the app shell is cached
  by the service worker so a repeat open is instant even on EDGE.
- **`font-display: swap`** with `adjustFontFallback` metric overrides, so the
  fallback render is not a layout shift. **(amended per SYNTHESIS — fallback-
  flash behavior specified explicitly.)** For the ~200–400ms before the Hind
  Siliguri Bengali webfont arrives, the UI shows Bengali text set in a
  metric-matched **system-font fallback** (the fallback stack's Bengali-capable
  system font, with `ascent-override`/`descent-override`/`size-adjust` tuned to
  Hind Siliguri's metrics via `adjustFontFallback`) rather than invisible text
  or a blank region — the fallback glyphs may look slightly different, but the
  line box, line count and layout do not visibly jump or reflow when the
  webfont swaps in.
- **Explicit dimensions on every image and skeleton**, and gridlines/axes drawn
  before chart data arrives, so CLS stays near zero.
- CI fails the build on a budget regression; the numbers above are the gate, not
  a goal.

---

## 8. Do / Don't, and the eight screens

### 8.1 Do / Don't

**Layout**

- **Do** put lists on hairline-ruled rows. **Don't** wrap every row in a card
  with a shadow — when everything is elevated, nothing is.
- **Do** keep the primary action in the thumb zone. **Don't** put Delete there.
- **Do** reserve space for content that is loading. **Don't** let a toast, a
  banner or a late-arriving image push the page under a finger.
- **Do** push a route for a record's detail. **Don't** stack sheets.
- **Do** design the 360px layout first. **Don't** design at 1440 and squeeze.

**Colour**

- **Do** use amber for one thing per screen: the action a human must take.
  **Don't** use it as a brand wash, a header, or a gradient.
- **Do** pair `--x` with `--x-fg` and `--x-soft` with `--x-ink`. **Don't**
  invent a pairing; it has not been measured.
- **Do** give every status a letter and a name. **Don't** ship a colour-only dot.
- **Do** add both light and dark steps when adding a colour. **Don't** invert.
- **Don't** reuse a status colour as a chart series, or a chart colour as a status.

**Type**

- **Do** use tabular figures for every number in a column. **Don't** let digits
  jitter between renders.
- **Do** give Bengali its own line-height and zero tracking. **Don't** track
  Bengali, italicise it, or set it in Inter.
- **Do** keep inputs at 16px. **Don't** shrink them to fit — reduce the field
  count instead.
- **Don't** put an all-caps tracked-out eyebrow above every section. One per
  screen at most, and usually none.

**Interaction**

- **Do** default to optimistic + undo. **Don't** confirm a reversible action.
- **Do** confirm irreversible ones, naming the object and count. **Don't** ship
  "Are you sure?".
- **Do** give every gesture a visible equivalent. **Don't** hide an action
  behind a swipe or a long-press alone.
- **Do** keep the row still after a tap. **Don't** reorder under a moving finger.
- **Do** animate only what changed. **Don't** stagger a dashboard on entry.

**Content**

- **Do** name things as a teacher would: _Take attendance_, _Class 6 – A_,
  _Report card_. **Don't** expose the schema: _attendance_session_,
  _section_subject_.
- **Do** keep a verb identical through a flow — the button that says _Publish_
  produces a toast that says _Published_. **Don't** drift to _Submit_.
- **Do** say what failed and what to do next. **Don't** apologise, and never
  "Oops".
- **Don't** use emoji anywhere in the product UI.

**Data**

- **Do** compute every number from real tables (PRODUCT-DECISIONS 3.9).
  **Don't** ship a mock array, a fake chart, or a placeholder metric — not even
  temporarily.
- **Do** show a real empty state when there is no data. **Don't** invent data to
  make a screen look finished.

### 8.2 Wireframes — the eight most-used screens at 360 × 800

Boxes are to scale. `▀` = a 2px active rule. `[ ]` = a ≥44px target.

---

#### 1. Login — `/login`

```
┌────────────────────────────── 360 ──────────────────────────────┐
│                                                          64px   │
│  ▪ Acadigma                                                     │  28px mark + wordmark
│    Campus                                                       │
│                                                          48px   │
│  Sign in                                                        │  22/700
│  Use the phone number or email your school has.                 │  15/400 muted
│                                                          32px   │
│  Phone or email                                                 │  13/500
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 01712 345678                                              │  │  48px, 16px text
│  └───────────────────────────────────────────────────────────┘  │
│                                                          16px   │
│  Password                                    [Forgot?]          │  label + right link
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ ••••••••                                          [ 👁 ]  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                          24px   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Sign in                                │  │  48px primary
│  └───────────────────────────────────────────────────────────┘  │
│                                                          16px   │
│  ─────────────────────  or  ─────────────────────               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Sign in with a code                          │  │  48px outline (OTP)
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│                     (spacer pushes to bottom)                   │
│                                                                 │
│  New here? Create an account                                    │  15px, thumb zone
│  বাংলা · English                                    ~740px      │  language toggle
└─────────────────────────────────────────────────────────────────┘
```

No card, no icon tile above the title, no illustration. The form is the page.
The language toggle is at the bottom because it is the first thing a
Bengali-first user looks for and it must be in the thumb zone. Autofocus is
**not** set — it would open the keyboard and hide the form on arrival.

---

#### 2. Dashboard (teacher) — `/app/dashboard`

```
┌─────────────────────────────────────────────────────────────────┐
│ [◎ Ridgeview ▾]                              [🔍] [🔔³] [◑]    │  TopBar 56
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Thursday, 17 September                                         │  13/500 muted
│  Good morning, Nasreen                                          │  22/700 (no emoji)
│                                                          16px   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ▌NOW · Period 3 · 11:10–11:50                               │ │  --accent left rule,
│ │  Class 6 – A · Mathematics · Room 204                       │ │  --accent-soft bg.
│ │  ┌───────────────────────────────────────────────────────┐  │ │  The ONE amber
│ │  │              Take attendance                          │  │ │  element on the page
│ │  └───────────────────────────────────────────────────────┘  │ │  48px primary
│ └─────────────────────────────────────────────────────────────┘ │
│                                                          20px   │
│  Today                                                          │  18/600
│ ┌───────────────────┐ ┌───────────────────┐                     │
│ │ Classes           │ │ Unmarked          │                     │  13 label (real text)
│ │ 5                 │ │ 2                 │                     │  28 tabular
│ │ 2 left today      │ │ P2 · P5           │                     │  12 muted
│ └───────────────────┘ └───────────────────┘                     │
│                                                          16px   │
│  Next up                                                        │  18/600
│ ─────────────────────────────────────────────────────────────── │  hairline
│  12:00  Class 7 – B · Science           Room 110           ›    │  60px row
│ ─────────────────────────────────────────────────────────────── │
│  14:00  Class 9 – A · Mathematics       Room 204           ›    │
│ ─────────────────────────────────────────────────────────────── │
│                                                          20px   │
│  Needs you                                                      │  18/600
│ ─────────────────────────────────────────────────────────────── │
│  ● Marks due — Class 9 – A, Mid-term       2 days left     ›    │  --danger-ink dot
│ ─────────────────────────────────────────────────────────────── │
│  ● Cover request — Period 6, Class 8 – C   Respond         ›    │
│ ─────────────────────────────────────────────────────────────── │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│   ⌂        ✓         ▦         ✉        ⋯                       │  BottomNav 56
│ ▀Today  Attendance Timetable Messages  More                     │
└─────────────────────────────────────────────────────────────────┘
```

Four cards on the whole screen, and only one of them is amber. Rows carry the
lists. No greeting emoji, no stagger animation, no decorative chart.

---

#### 3. Attendance roll-call — `/app/attendance`

```
┌─────────────────────────────────────────────────────────────────┐
│ [‹]  Attendance                                    [⋯]          │  fixed TopBar
├─────────────────────────────────────────────────────────────────┤
│  Class 6 – A ▾            Thu 17 Sep ▾              Saved 12:04 │  sticky bar, 44px
├─────────────────────────────────────────────────────────────────┤
│  P 40   A 3   L 1   E 1                            [Bulk ▾]     │  sticky counts 36px
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ All 45 marked present — change the exceptions.      [Undo]  │ │  --info-soft, 44px
│ └─────────────────────────────────────────────────────────────┘ │
│ ─────────────────────────────────────────────────────────────── │
│ ( ) 01 · Abdullah Al Mamun                    STU-2026-00001    │  avatar 32 + name 15
│     ┌──────┬──────┬──────┬──────┬──────┐                        │  + id 12 muted
│     │  P   │  A   │  L   │  E   │  ½   │                        │  56×44 segments
│     └──────┴──────┴──────┴──────┴──────┘                        │  P filled --att-present
│ ─────────────────────────────────────────────────────────────── │
│ ( ) 02 · আয়েশা সিদ্দিকা                        STU-2026-00002    │  Bengali name,
│     ┌──────┬──────┬──────┬──────┬──────┐                        │  Hind Siliguri,
│     │  P   │  A   │  L   │  E   │  ½   │                        │  lh 1.75
│     └──────┴──────┴──────┴──────┴──────┘                        │
│ ─────────────────────────────────────────────────────────────── │
│ ( ) 03 · Rahim Uddin                          STU-2026-00003    │
│     ┌──────┬──────┬──────┬──────┬──────┐                        │  A filled --att-absent,
│     │  P   │  A   │  L   │  E   │  ½   │                        │  white letter
│     └──────┴──────┴──────┴──────┴──────┘                        │
│     ↳ Note: informed by guardian                        [✎]     │  only when present
│ ─────────────────────────────────────────────────────────────── │
│ ( ) 04 · Tasnim Jahan                         STU-2026-00004    │
│     ┌──────┬──────┬──────┬──────┬──────┐                        │  L filled --att-late
│     │  P   │  A   │  L   │  E   │  ½   │                        │  + 1px ring
│     └──────┴──────┴──────┴──────┴──────┘                        │
│ ─────────────────────────────────────────────────────────────── │
│                        … 41 more, virtualised                   │
├─────────────────────────────────────────────────────────────────┤
│  Legend: P present · A absent · L late · E excused · ½ half-day │  11px, always shown
├─────────────────────────────────────────────────────────────────┤
│   ⌂        ✓         ▦         ✉        ⋯                       │
│  Today ▀Attendance Timetable Messages  More                     │
└─────────────────────────────────────────────────────────────────┘
```

No Save button — saving is continuous. The segmented control puts all five
statuses one tap away, in the thumb zone, with letters carrying the meaning.
The legend is permanent because the letters are the primary encoding.

---

#### 4. Timetable — `/app/timetable`

```
┌─────────────────────────────────────────────────────────────────┐
│ [◎ Ridgeview ▾]      Timetable                 [🔍] [🔔] [◑]   │
├─────────────────────────────────────────────────────────────────┤
│  Sat   Sun   Mon   Tue  ▀Wed   Thu                      [Week]  │  Tabs, working_days
├─────────────────────────────────────────────────────────────────┤     from school_profiles
│  Wednesday, 17 September                            6 periods   │  13 muted
│                                                          12px   │
│ ─────────────────────────────────────────────────────────────── │
│  P1   08:00                                                     │  time col 56px,
│  ────  09:40  Class 6 – A · Mathematics        Room 204    ›    │  tabular figures
│ ─────────────────────────────────────────────────────────────── │
│  P2   09:40                                                     │
│       10:20   Free                                              │  --muted-foreground
│ ─────────────────────────────────────────────────────────────── │
│ ▌P3   11:10                                                     │  --primary left rule
│ ▌     11:50   Class 6 – A · Mathematics        Room 204    ›    │  aria-current="time"
│ ▌             ● now · 22 min left                               │  --primary-ink 12px
│ ─────────────────────────────────────────────────────────────── │
│  P4   11:50                                                     │
│       12:30   Class 7 – B · Science            Room 110    ›    │
│ ─────────────────────────────────────────────────────────────── │
│              ┄┄┄┄┄┄┄  Break · 12:30–13:00  ┄┄┄┄┄┄┄              │  dashed rule, 32px
│ ─────────────────────────────────────────────────────────────── │
│  P5   13:00                                                     │
│       13:40   Class 9 – A · Mathematics        Room 204    ›    │
│ ─────────────────────────────────────────────────────────────── │
│  P6   13:40                                                     │
│       14:20   Cover · Class 8 – C · Physics    Room 301    ›    │  --accent-soft chip
│ ─────────────────────────────────────────────────────────────── │
│                                                          16px   │
│  Add to calendar (.ics)                                         │  text link
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│   ⌂        ✓         ▦         ✉        ⋯                       │
│  Today  Attendance ▀Timetable Messages  More                    │
└─────────────────────────────────────────────────────────────────┘
```

A day is a **list**, not a grid — a 6 × 6 grid at 360px produces 50px cells that
cannot hold a class name. `[Week]` opens the horizontally-scrollable full grid
for the rare case of needing the overview. Days come from
`school_profiles.working_days`, Sat–Thu by default.

---

#### 5. Marks entry — `/app/marks/[examSubjectId]`

```
┌─────────────────────────────────────────────────────────────────┐
│ [‹]  Mid-term · Mathematics                     [⋯]             │
├─────────────────────────────────────────────────────────────────┤
│  Class 9 – A · out of 100                     12 / 45 entered   │  sticky, 44px
│  ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░                      │  2px progress rail
├─────────────────────────────────────────────────────────────────┤
│                                                          24px   │
│              ┌────┐                                             │
│              │ AM │   Abdullah Al Mamun                         │  avatar 48 + 18/600
│              └────┘   STU-2026-00013 · Roll 13                  │  13 muted tabular
│                                                          20px   │
│                    ┌───────────────────┐                        │
│                    │      78           │  A+                    │  56px tabular value
│                    └───────────────────┘  ← --grade-a-plus-soft │  + live grade chip
│                         out of 100                              │  13 muted
│                                                          24px   │
│  ┌───────────┬───────────┬───────────┐                          │
│  │     1     │     2     │     3     │                          │  56px keys,
│  ├───────────┼───────────┼───────────┤                          │  --size-touch-lg
│  │     4     │     5     │     6     │                          │
│  ├───────────┼───────────┼───────────┤                          │
│  │     7     │     8     │     9     │                          │
│  ├───────────┼───────────┼───────────┤                          │
│  │  Absent   │     0     │     ⌫     │                          │
│  └───────────┴───────────┴───────────┘                          │
│                                                          12px   │
│  ┌──────────┐  ┌───────────────────────────────────────────┐    │
│  │    ‹     │  │              Next  ›                      │    │  48px, thumb zone
│  └──────────┘  └───────────────────────────────────────────┘    │
│                                                                 │
│  Saved automatically · last saved 12:04                         │  12 muted
└─────────────────────────────────────────────────────────────────┘
```

No bottom nav — this is a focused task and leaving it mid-entry is an explicit
back. The numeric pad is drawn rather than delegated to the OS keyboard, which
on a low-end Android would cover 55% of the screen and vary by OEM. Desktop
renders the same route as the keyboard-driven grid in §5.2.

---

#### 6. Messages — `/app/messages/[channelId]`

```
┌─────────────────────────────────────────────────────────────────┐
│ [‹]  ┌──┐  # Class 6 – A                             [⋯]        │  channel avatar 32
│      └──┘  32 members · 3 online                                │  12 muted
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│              ──────── Wednesday, 17 September ────────          │  Marker, 12 muted
│                                                                 │
│  ┌──┐ Nasreen Akhter                              11:02         │  32 avatar, 13/600
│  └──┘ ┌──────────────────────────────────────────┐              │
│       │ Tomorrow's chapter 7 quiz is postponed   │              │  --muted bubble,
│       │ to Sunday.                               │              │  radius-lg
│       └──────────────────────────────────────────┘              │
│       👍 4                                                      │  BubbleReactions
│                                                                 │
│  ┌──┐ করিম হাসান                                  11:14         │  Bengali, lh 1.75
│  └──┘ ┌──────────────────────────────────────────┐              │
│       │ ঠিক আছে স্যার, শিক্ষার্থীদের জানিয়ে দিচ্ছি।    │              │
│       └──────────────────────────────────────────┘              │
│                                                                 │
│                    ┌───────────────────────────────────┐ ┌──┐   │  own message,
│                    │ Thanks. I've updated the plan.    │ └──┘   │  --primary bubble,
│                    └───────────────────────────────────┘        │  right-aligned
│                                                  11:20 ✓✓       │  read receipt
│                                                                 │
│                    ┌───────────────────────────────────┐        │
│                    │ 📎 chapter-7-revision.pdf  1.2 MB │        │  Attachment
│                    └───────────────────────────────────┘        │
│                                                  11:21 ✓        │
│                                                                 │
│              ─────────── 2 unread ───────────                   │  Marker, --primary
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ ┌──┐ ┌────────────────────────────────────────────┐ ┌────┐      │  composer, sticky
│ │📎│ │ Message #Class 6 – A                       │ │ ▶  │      │  above bottom nav,
│ └──┘ └────────────────────────────────────────────┘ └────┘      │  grows to 5 lines
├─────────────────────────────────────────────────────────────────┤
│   ⌂        ✓         ▦         ✉        ⋯                       │
│  Today  Attendance Timetable ▀Messages  More                    │
└─────────────────────────────────────────────────────────────────┘
```

---

#### 7. Student profile — `/app/students/[id]`

```
┌─────────────────────────────────────────────────────────────────┐
│ [‹]                                            [✎]  [⋯]         │  TopBar scrolls away
├─────────────────────────────────────────────────────────────────┤
│                                                          16px   │
│   ┌──────┐   Abdullah Al Mamun                                  │  64 avatar, 22/700
│   │  AM  │   আব্দুল্লাহ আল মামুন                                   │  Bengali name 15
│   └──────┘   STU-2026-00013 · Class 6 – A · Roll 13             │  13 muted tabular
│                                                          16px   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
│  │ Attendance   │ │ GPA          │ │ Behaviour    │             │  13 labels
│  │ 94.2%        │ │ 4.67         │ │ +12          │             │  22 tabular
│  │ this term    │ │ Mid-term     │ │ this term    │             │  12 muted
│  └──────────────┘ └──────────────┘ └──────────────┘             │
│                                                          20px   │
│  Overview  Attendance  Marks  Behaviour  Guardians  Files       │  Tabs, h-scroll
│  ▀▀▀▀▀▀▀▀                                                       │
│ ─────────────────────────────────────────────────────────────── │
│                                                          16px   │
│  Attendance, last 30 days                          [Table]      │  18/600 + toggle
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 100 ┤                                                     │  │  180px line chart,
│  │     │      ╭──╮       ╭─────╮                             │  │  one series,
│  │  90 ┤ ╭────╯  ╰───────╯     ╰──╮                          │  │  --chart-1,
│  │     │╯                          ╰───                      │  │  6 x ticks max
│  │  80 ┼────┬────┬────┬────┬────┬────┬                       │  │
│  │     19   24   29   3    8    13   17                      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                          20px   │
│  Latest marks                                      [See all]    │  18/600
│ ─────────────────────────────────────────────────────────────── │
│  Mathematics      Mid-term        78 / 100    ┃ A+ ┃       ›    │  grade chip in
│ ─────────────────────────────────────────────────────────────── │  --grade-a-plus-soft
│  Science          Mid-term        71 / 100    ┃ A  ┃       ›    │
│ ─────────────────────────────────────────────────────────────── │
│  Bangla           Mid-term        66 / 100    ┃ A− ┃       ›    │
│ ─────────────────────────────────────────────────────────────── │
│                                                          20px   │
│  Guardians                                                      │  18/600
│ ─────────────────────────────────────────────────────────────── │
│  ┌──┐ Md. Karim Mia · Father        01712 345678  [📞] [✉]     │  60px row,
│  └──┘ Primary contact · Portal linked                           │  44px targets
│ ─────────────────────────────────────────────────────────────── │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│   ⌂        ✓         ▦         ✉        ⋯                       │
└─────────────────────────────────────────────────────────────────┘
```

Three stat tiles, one chart, then rules all the way down. The edit affordance is
in the top-right, away from the thumb — this screen is read far more often than
it is edited.

---

#### 8. Marketplace listing — `/market/[slug]`

```
┌─────────────────────────────────────────────────────────────────┐
│ [‹]                                            [🔍] [🛒²]       │  market top bar,
├─────────────────────────────────────────────────────────────────┤     host nav kept
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │                                                             │ │
│ │           first approved preview page                       │ │  4:3, AspectRatio,
│ │           (rendered image, not the PDF)                     │ │  explicit dims
│ │                                                             │ │
│ │                                                  ● ○ ○      │ │  Carousel dots
│ └─────────────────────────────────────────────────────────────┘ │
│                                                          16px   │
│  Class 9 Physics — Chapter 1–4 Worksheet Pack                   │  20/700, 2 lines max
│                                                           8px   │
│  ┌──┐ Nasreen Akhter   ✓ Verified seller                        │  32 avatar, 13
│  └──┘ 4.7 ★ (23)  ·  184 sold                                   │  13 muted tabular
│                                                          16px   │
│  ┃ ৳250                                                         │  28/700 tabular,
│  ┃ PDF · 42 pages · Bangla + English                            │  MoneyText
│                                                          16px   │
│ ─────────────────────────────────────────────────────────────── │
│  What's inside                                                  │  18/600
│  Four chapter-aligned worksheet sets with answer keys,          │  15/400, ≤ 72ch
│  built to the 2026 NCTB Physics syllabus for Class 9.           │
│                                                          16px   │
│  • 4 worksheet sets (12 pages each)                             │
│  • Answer keys                                                  │
│  • Editable .docx source                                        │
│ ─────────────────────────────────────────────────────────────── │
│  Reviews (23)                                      [See all]    │  18/600
│ ─────────────────────────────────────────────────────────────── │
│  ★★★★★  Rafiqul I.                             12 Sep 2026      │
│  Saved me a full weekend. The answer keys are accurate.         │  ≤ 3 lines
│ ─────────────────────────────────────────────────────────────── │
│                                                                 │
│                  (scroll padding clears the bar)                │
├─────────────────────────────────────────────────────────────────┤
│  ৳250          ┌───────────────────────────────────────────┐    │  sticky action bar
│  one-time      │              Buy now                      │    │  56px + safe area,
│                └───────────────────────────────────────────┘    │  above bottom nav
├─────────────────────────────────────────────────────────────────┤
│   ⌂        ✓         ▦         ✉        ⋯                       │
└─────────────────────────────────────────────────────────────────┘
```

A teacher on a school workspace also sees **Request school purchase** as the
secondary action in the bar (PRODUCT-DECISIONS 4.6). The preview is the approved
preview image, never the purchasable file. Price always renders through
`MoneyText` from paisa, in Indian grouping.

---

## 9. Change control

- Adding a colour means adding **both theme steps** and recording the measured
  contrast in §2 and in the token comment. A single-theme colour is rejected.
- Adding a nav item means editing the nav config in §3.2 in the same PR. A nav
  item that exists in code and not here is a bug.
- A component that duplicates a custom primitive from §4.13 is rejected. Extend
  the primitive.
- Screenshots of the eight screens in §8.2, in both themes, at 360×800 and
  1280×800, are e2e artefacts. A visual change to any of them updates the
  wireframe here.

---

_Owner: design lead. Implementation: `packages/ui/tokens/tokens.css`.
Registry source: `F:\shadcn-ui\apps\v4\registry\new-york-v4`._
