---
"@acadigma/web": patch
"@acadigma/ui": patch
---

Load Inter and Hind Siliguri through `next/font` in the root layout and bind the `--font-sans` / `--font-bn` tokens to them (DESIGN-SYSTEM §1.6). Until now no font was loaded at all, so every surface rendered in the browser default.
