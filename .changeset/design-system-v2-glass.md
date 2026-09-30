---
"@acadigma/ui": minor
"@acadigma/web": minor
---

Design System v2 (D-408). The signed-in app now sits on an ambient mesh with liquid-glass chrome in both light and dark: a glass header, a floating glass tab bar, a glass sidebar, glass dashboard cards, sheets, dialogs and toasts. Contrast is checked by `scripts/check-glass-contrast.mjs` (16/16 pairs ≥ 4.5:1). The dashboard has one big number per card, tinted icon chips and one primary action ("Open attendance"), which sits in the phone thumb zone. A Light/Dark/System control with previews and the language switch now live at `/app/settings/appearance`. Every page that is not a top-level destination gets a back control at the top-left of the header: a chevron on phone and tablet, and the chevron plus the parent's name on desktop. It steps back through in-app history, or goes to the logical parent after a deep link. Reduced transparency and missing `backdrop-filter` fall back to opaque surfaces.
