# `@acadigma/ui` — tokens

`tokens.css` is the single source of every colour, space, radius, shadow,
duration and z-index in Acadigma Campus. The spec it implements is
`docs/architecture/DESIGN-SYSTEM.md`. If a value is not in this file, it does
not exist — feature code may not write a raw hex, a raw `px` margin, or a
`z-index`.

Two files live here and nothing else. The rest of `packages/ui` (components,
`cn`, the primitives listed in DESIGN-SYSTEM.md §4) is owned by the scaffold.

---

## Install

`tokens.css` already does `@import "tailwindcss"`, so it is the _only_ CSS entry
point the app needs.

```ts
// apps/web/app/layout.tsx
import "@acadigma/ui/tokens/tokens.css"
```

```jsonc
// packages/ui/package.json
{
  "exports": {
    "./tokens/tokens.css": "./tokens/tokens.css",
  },
}
```

Tailwind v4 needs to see the component sources to generate utilities. Add to the
app's own CSS (or keep in `tokens.css` if `packages/ui` is the only consumer):

```css
@source "../../packages/ui/src/**/*.{ts,tsx}";
@source "../../apps/web/{app,components}/**/*.{ts,tsx}";
```

---

## Fonts

Three families. **Inter** carries all Latin text and every digit; **Hind
Siliguri** carries Bengali; **JetBrains Mono** (D-57) carries every monospace
surface. All three are on Google Fonts and were checked against the live
`css2` endpoint.

| Family                 | Script                  | Weights shipped | Transferred                                                                                                                      |
| ---------------------- | ----------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Inter (variable)       | Latin, Latin-ext        | 400–700 axis    | 48 KB                                                                                                                            |
| Hind Siliguri (static) | Bengali, Latin fallback | 400, 600        | 69 KB / weight                                                                                                                   |
| JetBrains Mono         | Latin only              | 400, 500        | not budgeted separately — loads only on the routes that render a monospace value (a route error boundary's correlation id, §3.9) |

Google's stylesheet is split by `unicode-range`, so **the Bengali subset is
downloaded only when a Bengali codepoint is actually painted**. An
English-only session pays 48 KB; a Bengali session pays 48 + 138 KB. Do not
merge the subsets.

Production self-hosts via `next/font` so there is no third-party connection on
the critical path:

```ts
// apps/web/app/fonts.ts
import { Hind_Siliguri, Inter, JetBrains_Mono } from "next/font/google"

export const inter = Inter({
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
  variable: "--font-inter",
  adjustFontFallback: true, // generates "Inter Fallback" with metric overrides
})

export const hindSiliguri = Hind_Siliguri({
  subsets: ["bengali", "latin"],
  weight: ["400", "600"],
  display: "swap",
  variable: "--font-hind-siliguri",
  preload: false, // the Bengali subset is fetched only when painted, never preloaded
  adjustFontFallback: false, // see the metric note below
})

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-jetbrains-mono",
  adjustFontFallback: true,
})
```

Then on `<html>`:
`className={`${inter.variable} ${hindSiliguri.variable} ${jetbrainsMono.variable}`}`.

`tokens.css` binds `--font-sans` / `--font-bn` / `--font-mono` to those
generated variables, with the CSS family names as fallbacks, so `next/font`
(the default: `fonts.ts` plus the `<html>` class in
`apps/web/app/layout.tsx`) and a plain `<link>` both work:

```css
:root {
  --font-sans:
    var(--font-inter, "Inter"), "Inter Fallback", Roboto, system-ui, sans-serif;
  --font-bn:
    var(--font-hind-siliguri, "Hind Siliguri"), "Hind Siliguri Fallback",
    "Noto Sans Bengali", var(--font-inter, "Inter"), sans-serif;
  --font-mono:
    var(--font-jetbrains-mono, "JetBrains Mono"), ui-monospace, "SF Mono",
    "Cascadia Mono", Menlo, monospace;
}
```

### Metric alignment (do this once, visually)

Hind Siliguri's Bengali glyphs sit on a taller body than Inter's Latin. In a
mixed line — `ষষ্ঠ শ্রেণি – A · Room 204` — the two runs will look like
different sizes unless the Bengali face is scaled down slightly.

Calibrate with a `@font-face` override rather than a per-component font-size:

```css
@font-face {
  font-family: "Hind Siliguri Fallback";
  src: local("Hind Siliguri");
  size-adjust: 96%; /* starting point — tune against the string below */
  ascent-override: 105%;
  descent-override: 32%;
  line-gap-override: 0%;
}
```

Calibration string (put it in the Storybook a11y page and compare x-heights at
16px, light and dark):

```
ষষ্ঠ শ্রেণি – A · Room 204 · উপস্থিত ৳১,২৫০ 98.5%
```

Ship the value you can see is right. Do not guess a percentage in a review.

---

## Reading the colour tokens

Every colour family follows the same four-slot shape:

| Slot       | Meaning                               | Example use                                   |
| ---------- | ------------------------------------- | --------------------------------------------- |
| `--x`      | the solid mark                        | filled chip, dot, chart series, progress fill |
| `--x-fg`   | text that sits **on** `--x`           | the letter inside a filled attendance segment |
| `--x-soft` | a tint used as a background           | the unselected chip, a banner                 |
| `--x-ink`  | text/icon that sits **on** `--x-soft` | the label in that chip                        |

Never pair `--x` with `--x-ink`, and never put `--x` on a light background as
text. The pairs above are the ones that were measured.

**Two fills need a ring.** `--att-late` and `--att-halfday` fall below 3:1
against a white card by design (they must stay light so the colour-blind
lightness ordering holds). Any chip using them must carry
`ring-1 ring-att-late-ink` / `ring-att-halfday-ink`.

---

## Verification

The contrast and colour-blind figures in the comments are computed, not judged.
Reproduce them:

```bash
# categorical chart palettes, six checks (dataviz skill)
node scripts/validate_palette.js "#4461e0,#b3276e,#c78100,#009490,#7241a0,#4ea253" --mode light
node scripts/validate_palette.js "#6383f2,#d44d8c,#c78100,#25a4a1,#8b55c1,#419547" --mode dark

# D-57: every ink/paper text and UI-boundary pair, both themes
node scripts/check-contrast-tokens.mjs
```

Both chart checks return **ALL CHECKS PASS**. Attendance separation was
verified with a Viénot LMS simulation; worst adjacent deuteran/protan ΔE is
**13.9** (light) and **12.9** (dark) against a target of ≥ 8. The D-57 token
script also returns **ALL CHECKS PASS** — see
`docs/test-reports/2026-09-24-visual-language.md` for the full table.

CI runs `@axe-core/playwright` at 360×800 and 1280×800 in both themes. A token
change that drops any measured pair below its threshold fails the build.

---

## Rules that are not negotiable

1. **No raw values in feature code.** No hex, no `rgb()`, no `z-index: 9999`, no
   `margin: 13px`. ESLint blocks arbitrary Tailwind colour and z-index values.
2. **Amber is rationed.** `--accent` means _a human must act here_. One amber
   element per screen, maximum. It is not a decoration and not a brand wash.
3. **Status is never colour alone** (WCAG 1.4.1). Every attendance mark, grade
   band and semantic chip carries a glyph and an accessible name.
4. **Dark mode is selected, not inverted.** Adding a colour means adding both
   steps and measuring both.
5. **Palette classes override the brand only.** They must never touch
   `--accent`, `--sidebar-primary` or any status colour.
6. **Motion goes through `--motion`.** Write `transition-duration: var(--duration-fast)`,
   never a literal `ms`, so reduced-motion works without a component change.
