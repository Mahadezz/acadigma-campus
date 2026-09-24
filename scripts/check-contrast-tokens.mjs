// D-57 (visual language / ink-paper tokens): computes real WCAG 2.1 contrast
// ratios for every text/background and UI-boundary pair touched by the
// monochrome ink/paper token set in packages/ui/tokens/tokens.css, so the
// numbers in DESIGN-SYSTEM.md and the test report are reproducible, not
// eyeballed. Run: `node scripts/check-contrast-tokens.mjs`.
//
// Thresholds (WCAG 2.1 + DESIGN-SYSTEM §7.1): normal text >= 4.5:1,
// non-text UI (borders, focus rings) >= 3:1.

function hexToRgb(hex) {
  const h = hex.replace("#", "")
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h
  const int = Number.parseInt(full, 16)
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  }
}

function channelToLinear(c) {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function relativeLuminance({ r, g, b }) {
  const R = channelToLinear(r)
  const G = channelToLinear(g)
  const B = channelToLinear(b)
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

function contrastRatio(hexA, hexB) {
  const lA = relativeLuminance(hexToRgb(hexA))
  const lB = relativeLuminance(hexToRgb(hexB))
  const [lighter, darker] = lA >= lB ? [lA, lB] : [lB, lA]
  return (lighter + 0.05) / (darker + 0.05)
}

// Literal values from packages/ui/tokens/tokens.css (D-57). Kept as a plain
// hex table here — deliberately duplicated rather than parsed from the CSS,
// so this script has zero dependency on the CSS parsing story and stays a
// two-minute read for a reviewer checking a number against the file.
const LIGHT = {
  background: "#f4f4f2",
  foreground: "#0b0b0b",
  card: "#fbfbfa",
  cardForeground: "#0b0b0b",
  popover: "#fbfbfa",
  popoverForeground: "#0b0b0b",
  muted: "#e9e9e6",
  mutedForeground: "#6f6f6f",
  border: "#e2e2df", // decorative hairline (rows, rules) — not a 1.4.11 boundary
  input: "#8a8a86", // deviates from acadigma.com's literal #d6d6d2 (1.32:1) to
  // clear the 3:1 non-text boundary WCAG 1.4.11 requires for a form field's
  // own outline, since Field has no fill contrast to carry that job instead.
  ring: "#0b0b0b",
  primary: "#0b0b0b",
  primaryForeground: "#f4f4f2",
  primaryInk: "#0b0b0b",
  secondary: "#e9e9e6",
  secondaryForeground: "#0b0b0b",
  accent: "#e9e9e6",
  accentForeground: "#0b0b0b",
  danger: "#b42318",
  dangerForeground: "#ffffff",
  dangerSoft: "#fbeae8",
  dangerInk: "#8a1a12",
  sidebar: "#fbfbfa",
  sidebarForeground: "#0b0b0b",
  sidebarMuted: "#6f6f6f",
  sidebarPrimary: "#0b0b0b",
  sidebarPrimaryForeground: "#fbfbfa",
  sidebarAccent: "#e9e9e6",
  sidebarAccentForeground: "#0b0b0b",
  sidebarBorder: "#e2e2df",
}

const DARK = {
  background: "#0b0b0b",
  foreground: "#f4f4f2",
  card: "#121212",
  cardForeground: "#f4f4f2",
  popover: "#121212",
  popoverForeground: "#f4f4f2",
  muted: "#1c1c1c",
  mutedForeground: "#8e8e8e",
  border: "#232323", // decorative hairline — not a 1.4.11 boundary
  input: "#6b6b6b", // deviates from acadigma.com's translucent-white ~#323232
  // (1.54:1) to clear the 3:1 non-text boundary for an unfocused form field.
  ring: "#f4f4f2",
  primary: "#f4f4f2",
  primaryForeground: "#0b0b0b",
  primaryInk: "#f4f4f2",
  secondary: "#1c1c1c",
  secondaryForeground: "#f4f4f2",
  accent: "#1c1c1c",
  accentForeground: "#f4f4f2",
  danger: "#f97066",
  dangerForeground: "#0b0b0b",
  dangerSoft: "#3a1210",
  dangerInk: "#ffb4ad",
  sidebar: "#161616",
  sidebarForeground: "#f4f4f2",
  sidebarMuted: "#8e8e8e",
  sidebarPrimary: "#f4f4f2",
  sidebarPrimaryForeground: "#0b0b0b",
  sidebarAccent: "#242424",
  sidebarAccentForeground: "#f4f4f2",
  sidebarBorder: "#232323",
}

// [label, fg key, bg key, threshold, kind]
const TEXT_PAIRS = [
  ["foreground / background", "foreground", "background", 4.5],
  ["card-foreground / card", "cardForeground", "card", 4.5],
  ["popover-foreground / popover", "popoverForeground", "popover", 4.5],
  ["muted-foreground / background", "mutedForeground", "background", 4.5],
  ["muted-foreground / card", "mutedForeground", "card", 4.5],
  [
    "primary-foreground / primary (button text)",
    "primaryForeground",
    "primary",
    4.5,
  ],
  ["primary-ink / background", "primaryInk", "background", 4.5],
  ["secondary-foreground / secondary", "secondaryForeground", "secondary", 4.5],
  ["accent-foreground / accent", "accentForeground", "accent", 4.5],
  ["danger-foreground / danger", "dangerForeground", "danger", 4.5],
  ["danger-ink / danger-soft", "dangerInk", "dangerSoft", 4.5],
  ["sidebar-foreground / sidebar", "sidebarForeground", "sidebar", 4.5],
  ["sidebar-muted / sidebar", "sidebarMuted", "sidebar", 4.5],
  [
    "sidebar-primary-foreground / sidebar-primary",
    "sidebarPrimaryForeground",
    "sidebarPrimary",
    4.5,
  ],
  [
    "sidebar-accent-foreground / sidebar-accent",
    "sidebarAccentForeground",
    "sidebarAccent",
    4.5,
  ],
]

// WCAG 1.4.11 applies to a boundary that is the visual information required to
// identify a UI component or its state — a form field's outline, a focus
// ring. It does NOT require hairline row/table dividers to hit 3:1; those are
// decorative structure, and DESIGN-SYSTEM.md has treated `--border`/`--rule`
// as sub-3:1 by design since the original token set (a "hairline", not a
// component boundary). Required pairs fail the script; decorative ones are
// printed for the record only.
const REQUIRED_UI_PAIRS = [
  ["input / background (3:1 boundary)", "input", "background", 3],
  ["input / card (3:1 boundary)", "input", "card", 3],
  ["ring / background (focus ring)", "ring", "background", 3],
  ["ring / card (focus ring)", "ring", "card", 3],
  ["danger (fill) / card (icon/border use)", "danger", "card", 3],
]

const DECORATIVE_UI_PAIRS = [
  ["border / background (hairline, informational)", "border", "background", 0],
  [
    "sidebar-border / sidebar (hairline, informational)",
    "sidebarBorder",
    "sidebar",
    0,
  ],
]

function run(themeName, tokens) {
  console.log(`\n=== ${themeName} ===`)
  let failed = 0
  for (const [label, fgKey, bgKey, threshold] of [
    ...TEXT_PAIRS,
    ...REQUIRED_UI_PAIRS,
    ...DECORATIVE_UI_PAIRS,
  ]) {
    const fg = tokens[fgKey]
    const bg = tokens[bgKey]
    if (!fg || !bg) {
      console.log(`  SKIP  ${label} (missing token)`)
      continue
    }
    const ratio = contrastRatio(fg, bg)
    const pass = ratio >= threshold
    if (!pass) failed += 1
    console.log(
      `  ${pass ? "PASS" : "FAIL"}  ${label.padEnd(46)} ${ratio.toFixed(2)}:1 (>= ${threshold}:1)`
    )
  }
  return failed
}

const failedLight = run("light", LIGHT)
const failedDark = run("dark", DARK)

const totalFailed = failedLight + failedDark
console.log(
  `\n${totalFailed === 0 ? "ALL CHECKS PASS" : `${totalFailed} CHECK(S) FAILED`}`
)
process.exit(totalFailed === 0 ? 0 : 1)
