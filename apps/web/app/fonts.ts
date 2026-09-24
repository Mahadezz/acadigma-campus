import { Hind_Siliguri, Inter } from "next/font/google"

/**
 * DESIGN-SYSTEM §1.6 / packages/ui/tokens/README.md "Fonts": Inter carries all
 * Latin text and every digit; Hind Siliguri carries Bengali. Both are self-hosted
 * through next/font so no third-party connection sits on the critical path, and
 * tokens.css binds `--font-sans` / `--font-bn` to the variables declared here.
 */
export const inter = Inter({
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
  variable: "--font-inter",
  // Generates "Inter Fallback" with metric overrides, so the swap does not reflow.
  adjustFontFallback: true,
})

export const hindSiliguri = Hind_Siliguri({
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-hind-siliguri",
  // The Bengali subset must download only when a Bengali codepoint is painted
  // (48 KB English session, +138 KB Bengali session). A preload would fetch it on
  // every page; unicode-range in the generated @font-face does the on-demand part.
  preload: false,
  // See the metric note in tokens/README.md.
  adjustFontFallback: false,
})
