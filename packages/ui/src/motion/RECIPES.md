# Motion recipes — what each one is for

Companion to `./recipes.css`. Nine `.motion-*` utility classes, every value a
token, every one with a reduced-motion fallback.

Governed by `docs/architecture/DESIGN-SYSTEM.md` §2.7 (motion), §3.6
(pull-to-refresh), §3.7 (skeletons), §5.4 (undo toasts), §7.2 (performance
budget). Where this file and that one disagree, that one wins.

Origin: `docs/reference/articles/42-css-motion-recipes.md` — see
§"Where these actually came from" at the foot, because the honest answer is
"almost none of them".

---

## Wiring this in (not done — scaffold agent owns both files)

`recipes.css` is inert until two one-line changes land. I was told not to touch
existing files under `packages/ui/src` or `package.json`, so neither is applied:

1. **`packages/ui/package.json`** — the exports map has
   `"./motion/*": "./src/motion/*.ts"`, which cannot resolve a `.css` file. Add:

   ```json
   "./motion/recipes.css": "./src/motion/recipes.css"
   ```

2. **`packages/ui/globals.css`** — add the import after the tokens import, so
   recipes resolve against real token values rather than the fallback theme:

   ```css
   @import "./src/motion/recipes.css";
   ```

   `globals.css` already carries `@source "./src/**/*.{ts,tsx}"`, so Tailwind
   scans this package's components; the `.motion-*` classes are plain CSS in
   `@layer components` and are not affected by content scanning.

Until both land, `.motion-*` classes do nothing. Please do not work around it by
copying the keyframes into a component.

---

## The nine recipes

| Class                                                         | Duration · easing                               | Use it for                                                                                                                                                                                                                                                 | Screens (DESIGN-SYSTEM §8.2)                                                                                                                            |
| ------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.motion-fade-in` / `.motion-fade-out`                        | `base` 200 ms / `fast` 140 ms · entrance / exit | Something appearing or leaving **in place**: popover content, an inline `--danger-soft` error panel replacing a section (§3.9), chart marks once data lands (§3.7), a row settling from optimistic to canonical (§5.5).                                    | 2 Dashboard, 7 Student profile, 8 Marketplace listing                                                                                                   |
| `.motion-sheet-in` / `.motion-sheet-out` / `.motion-scrim-in` | `slow` 280 ms · **spring** in, exit out         | A sheet arriving from the bottom edge it will return to (§3.3). The scrim fades over the same 280 ms so the two read as one gesture.                                                                                                                       | 3 Attendance (excused-note sheet, bulk bar), 5 Marks entry, 6 Messages, 7 Student profile, any `FormSheet`                                              |
| `.motion-shimmer`                                             | 1400 ms loop · linear                           | The value area of a skeleton, and only while loading. Geometry comes from the skeleton itself (§3.7): 6 rows at `--size-row`, a 36 px circle, a 60% bar and a 35% bar. **Applied after 150 ms of loading, never sooner** — faster than that, show nothing. | Every list and dashboard route                                                                                                                          |
| `.motion-press`                                               | `instant` 90 ms · standard                      | Any control a user taps repeatedly: an `AttendanceToggle` segment, a numeric-pad key, a `BottomNav` slot, a bulk-action-bar button.                                                                                                                        | 2 Dashboard, 3 Attendance, 5 Marks entry, shell                                                                                                         |
| `.motion-toast-in` / `.motion-toast-out`                      | `base` / `fast` · entrance / exit               | A custom status surface that is not a Sonner toast — principally the offline banner (§3.10) at `--z-banner`. Rises `--space-2` and fades.                                                                                                                  | Shell, all routes                                                                                                                                       |
| `.motion-tab-rail` + `.motion-tab-rail-active`                | `fast` 140 ms · standard                        | The 2 px active rule under a tab. `scaleX` on a pseudo-element, never animated `left`/`width`.                                                                                                                                                             | 4 Timetable (day tabs), 7 Student profile (section tabs), hiring pipeline (stage tabs)                                                                  |
| `.motion-ptr-ring` / `.motion-ptr-spin`                       | finger-driven / 900 ms loop                     | Pull-to-refresh (§3.6). The ring tracks the finger via `--motion-ptr-progress` (0→1); the spin starts only after release.                                                                                                                                  | Every list and dashboard route in the phone shell. **Never on desktop** — §3.6 uses a refresh control beside the "Updated 2 min ago" timestamp instead. |
| `.motion-check`                                               | `slow` 280 ms · entrance                        | A one-shot confirmation the user caused: attendance session submitted, marks queue flushed, payment confirmed. Applied to an inline SVG `<path>`; the element must set its own `stroke-dasharray`.                                                         | 3 Attendance (submit sheet), 5 Marks entry, checkout                                                                                                    |
| `.motion-collapse-out`                                        | `base` 200 ms · exit                            | A row leaving after its undo window expires (§5.4). `clip-path`, never `height`.                                                                                                                                                                           | 3 Attendance, 7 Student profile, any `DataList` with bulk actions                                                                                       |

### Rules that apply to all nine

- **`.motion-ptr-*` and `.motion-shimmer` are the only infinite loops in the
  product.** §2.7 bans infinite animation; both are named exceptions in §3.6 and
  §3.7 because they are loading affordances that stop when content arrives. A
  third one needs a decision entry.
- **`--ease-spring` appears once**, on the sheet. §2.7 reserves the overshoot
  for the sheet snap only — "never on a control someone uses all day".
- **Motion is never the only signal.** The tab rail is paired with
  `aria-selected`; a removed row is announced politely; the pull-to-refresh ring
  is paired with a visible "Refreshing…" label, which is **required**, not
  optional, because the reduced-motion ring does not rotate.
- **`.motion-press` is the one recipe whose reduced-motion fallback is a
  different effect, not a still frame.** It swaps the scale for a `--muted`
  background tint. A tap that gives no feedback is a usability failure on the
  attendance screen regardless of motion preference.
- **Two recipe-local custom properties** — `--motion-shimmer-period` (1400 ms)
  and `--motion-spin-period` (900 ms) — are declared at the top of
  `recipes.css`. They are loop periods, not transition durations, so tokens.css
  §5 has no home for them yet. Both carry the `--motion` multiplier. Promoting
  them into tokens.css §5 and DESIGN-SYSTEM.md §2.7 is proposed in
  `docs/architecture/DESIGN-SYSTEM-ADDENDUM.md`; until the lead rules, feature
  code must not read them.
- **Reduced motion is handled twice, on purpose.** `tokens.css` already flips
  `--motion` to 0.01 and force-collapses every animation with `!important`.
  Every recipe here is _additionally_ wrapped in
  `@media (prefers-reduced-motion: no-preference)` so the static fallback is
  written out explicitly and can be reviewed, rather than being whatever a
  0.01 ms animation happens to leave on screen.

---

## Recipes we did not write, and why

The brief asked for nine. Two of the nine are not built, and a whole family from
the source article is excluded.

### Not built: list stagger

**Our own design system bans it, by name and with the receipt.** DESIGN-SYSTEM
§2.7, under _Banned_:

> entrance animations on page sections (the prototype's `fadeUp` stagger on
> every dashboard card cost 180ms before a teacher could read anything)

§7.2 adds that the prototype shipped ~50 KB of framer-motion for exactly this
effect. A stagger delays the first readable frame by its own duration times the
item count, and the thing being delayed is a register a teacher opens between
classes. Building it as a `.motion-*` class would put a banned pattern one
autocomplete away from every implementer.

If a future screen genuinely needs sequenced entry, that is a decision entry and
a GSAP timeline (D-33), not a CSS utility.

### Not built as CSS: count-up on a changed number

§2.7 permits "a number counting when it actually changed", so this is allowed —
but it cannot be done in CSS without either `@property` tricks that reflow
tabular figures or a layout-animating hack. It belongs in
`packages/ui/src/motion/gsap.ts` alongside the other tween helpers, gated on
`useReducedMotion()`. Out of scope for a stylesheet.

### Excluded wholesale: five of the article's seven families

`docs/reference/articles/42-css-motion-recipes.md` is a motion-**graphics**
toolkit — assets rendered to video with HyperFrames and posted to a feed. Its
own rule is that every recipe runs on a 6-second infinite loop. Applying that to
a school operations app would breach §2.7 forty-two times over.

| Family                                                                                                                   | Excluded because                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Texture** (film grain, lens flare, aurora, hand-drawn)                                                                 | Full-viewport `filter` and `blur` compositing. On the 4-core entry Android in the §7.2 Lighthouse profile this is a sustained GPU cost for pure decoration, and all four are infinite.                                           |
| **3D** (particles, 3D extrude, shader dissolve)                                                                          | Same, worse. Hundreds of composited layers, and D-33 already excluded MorphSVG and the physics plugins as "payload we cannot justify".                                                                                           |
| **Transitions** (zoom punch, whip pan, grid wipe, warp dissolve, glitch, light leak, flash cut, lens warp, radial split) | Cinematic cuts between two full-screen states. Our route transition is a 360 ms `--duration-page` fade; a whip pan between Attendance and Timetable is disorienting, not delightful. Several animate layout properties directly. |
| **Text** (kinetic type, typewriter, matrix decode, karaoke captions, neon glow, gradient fill, clone wall)               | Character-level animation of headings. That is the banned entrance animation, plus a screen-reader and reflow problem, plus — with Bengali — animating a script whose reph/matra stack above and below the line (§1.6).          |
| **Code** (code typing, code diff, code morph, code scroll)                                                               | No screen in this product displays source code.                                                                                                                                                                                  |

From **Data** and **Interface** the only ideas that survive are ones our design
system already specifies better: progress bars (`ui/progress.tsx`), line draw
(the `.motion-check` stroke draw), and the phone mockup (a marketing-page
concern, not an app one).

**Nothing in the article hijacks the scroll**, so the brief's "skip anything
that hijacks scroll" had nothing to catch here — but the rule already exists at
a higher level: `gsap.ts` deliberately does not register ScrollSmoother, because
"smooth scrolling hijacks the native scroller, which on a phone costs the thing
a teacher does most".

---

## Where these actually came from

Honestly: not from the article.

Of the 42 recipes, **zero** are among the nine here, and the article's CSS
bodies could not be extracted anyway (Notion lazy-loads them; see the capture
note in the reference file). The nine recipes are written from
`DESIGN-SYSTEM.md` §2.7/§3.3/§3.6/§3.7/§5.4, which already specify every one of
them in prose — this file is that prose turned into tokenised CSS.

Two ideas from the article did survive, and both are recorded in
`docs/architecture/DESIGN-SYSTEM-ADDENDUM.md` rather than in code:

1. **"Only ambient motion should cycle forever… anything that reveals should
   play once and hold."** A cleaner statement of §2.7's infinite-loop ban, and
   it explains _why_ shimmer and the spinner are allowed to be exceptions —
   they are ambient, not reveals. Proposed as a one-line addition to §2.7.
2. **The divisible-loop rule** — every timing inside a loop divides evenly into
   the loop period, or the animation stutters on wrap. It applies to exactly two
   things we ship (`--motion-shimmer-period`, `--motion-spin-period`), both of
   which are single-keyframe loops and so satisfy it trivially. Worth knowing
   before anyone adds a multi-step loop.
