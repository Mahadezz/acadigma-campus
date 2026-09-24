---
"@acadigma/ui": minor
"@acadigma/web": minor
---

D-57: visual language from acadigma.com. Chrome tokens (background, foreground, card, popover, muted, border, input, ring, primary, secondary, accent, sidebar) are now literal ink (`#0b0b0b`) / paper (`#f4f4f2`) hex copied from acadigma-website's `globals.css`, replacing the indigo `--primary` and dark-navy `--sidebar`. `--danger`/`--destructive` is recoloured to the website's literal red (`#b42318` light, `#f97066` dark). `--accent` is retired from a rationed amber highlight to a plain neutral surface. Attendance, grade-band and chart colours are unchanged. Radius multipliers now match the website's; shadows are ink-tinted instead of hue-272; a new `--ease-out-expo` token is available for entrances. JetBrains Mono is added as `--font-mono` via `next/font`, and `html` gets `cv11`/`ss01` font features. `button`, `card`, `input` and `auth-card` move to the ink-tinted `shadow-flat` token in place of Tailwind's stock shadow utilities.
