# @acadigma/ui

The design system: tokens, shadcn components (new-york, copied from the registry and
extended) and the phone-first primitives the app is assembled from — `AppShell`,
`TopBar`, `BottomNav`, `FormSheet`, `DataList`, `EmptyState`, `StatusChip`,
`MoneyText`.

Feature code imports by subpath, never through a barrel:

```tsx
import { Button } from "@acadigma/ui/components/button"
import { FormSheet } from "@acadigma/ui/primitives/form-sheet"
```

`globals.css` is the one stylesheet every surface imports. Colours, spacing, radii,
type and motion all come from `tokens/tokens.css` — no ad-hoc values in feature code
(ARCHITECTURE §6).

## Motion: CSS first, GSAP when it earns it

**Default to CSS transitions with the motion tokens.** Everything in the core app —
sheets, popovers, chips, hovers, route changes — is a tokenised CSS transition. They
cost nothing, they respect `prefers-reduced-motion` automatically through the
`--motion` multiplier, and they never block the main thread while a teacher is
tapping through a register.

**Reach for GSAP only when CSS genuinely cannot do it**: marketing pages, a deliberate
delight moment, and `Flip` layout transitions, where an element moves between two
positions in the DOM. Import `@acadigma/ui/motion/gsap`, call `registerGsap()` once
inside the client component, and check `useReducedMotion()` before animating — GSAP
runs in JavaScript and cannot see the CSS token that turns motion off.
