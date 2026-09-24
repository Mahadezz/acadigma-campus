// D-57 (visual language / ink-paper tokens): computes real WCAG 2.1 contrast
// ratios for every text/background and UI-boundary pair touched by the
// monochrome ink/paper token set in packages/ui/tokens/tokens.css, so the
// numbers in DESIGN-SYSTEM.md and the test report are reproducible, not
// eyeballed — and stay reproducible: token VALUES below are parsed directly
// out of tokens.css (both `#hex` and `oklch(L C H)` forms), not hand-copied,
// so this script cannot silently drift from the file it is checking (Opus
// review, PR #20). Run: `node scripts/check-contrast-tokens.mjs`.
//
// Thresholds (WCAG 2.1 + DESIGN-SYSTEM §7.1): normal text >= 4.5:1,
// non-text UI (borders, focus rings) >= 3:1.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const tokensPath = join(repoRoot, "packages", "ui", "tokens", "tokens.css")
const css = readFileSync(tokensPath, "utf8")

// ---------------------------------------------------------------------------
// 1. Extract top-level `<selector> { ... }` blocks by brace-counting (not a
//    regex with nested groups — tokens.css's blocks are flat, but this is
//    robust to that changing).
// ---------------------------------------------------------------------------
function extractBlocks(css, selectorPattern) {
  const blocks = []
  const re = new RegExp(selectorPattern, "g")
  let m
  while ((m = re.exec(css))) {
    let i = m.index + m[0].length
    let depth = 1
    const start = i
    while (depth > 0 && i < css.length) {
      if (css[i] === "{") depth++
      else if (css[i] === "}") depth--
      i++
    }
    blocks.push(css.slice(start, i - 1))
  }
  return blocks
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "")
}

// Only `--name: #hex;` and `--name: oklch(...);` declarations are extracted —
// exactly the forms D-57 uses for every colour this script checks. A `var()`
// indirection (radius, spacing, motion) is irrelevant to contrast and skipped.
function extractColorVars(blockText) {
  const clean = stripComments(blockText)
  const vars = {}
  const re =
    /--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|oklch\([^)]*\))\s*(?:!important)?\s*;/g
  let m
  while ((m = re.exec(clean))) {
    vars[m[1]] = m[2].trim()
  }
  return vars
}

// `:root { ... }` appears twice (the type/spacing/motion block, then the
// light-theme colour block) plus once more inside the reduced-motion
// `@media` block (just `--motion`, harmless to merge in). All three merge
// the same way the real cascade does — later declarations win.
const rootBlocks = extractBlocks(css, String.raw`:root\s*\{`)
const LIGHT_VARS = Object.assign({}, ...rootBlocks.map(extractColorVars))

// `.dark { ... }` — exactly one real block; `.dark.palette-x` / `.dark
// .palette-x` selectors don't match (no `{` immediately after `.dark`).
const darkBlocks = extractBlocks(css, String.raw`\.dark\s*\{`)
const DARK_VARS = Object.assign({}, ...darkBlocks.map(extractColorVars))

// Palette overrides (§9): each recolours --primary/--primary-hover/
// --primary-ink/--ring/--chart-1 only, in oklch(). --primary-foreground is
// NOT overridden — it stays the base theme's paper/ink value — so the thing
// worth checking is whether that unchanged foreground still reads on the
// newly-coloured fill.
const PALETTE_NAMES = ["emerald", "violet", "rose", "bronze", "cyan"]
const paletteLight = {}
const paletteDark = {}
for (const name of PALETTE_NAMES) {
  const [lightBlock] = extractBlocks(css, String.raw`\.palette-${name}\s*\{`)
  if (lightBlock) paletteLight[name] = extractColorVars(lightBlock)
  // `.dark.palette-x,\n.dark .palette-x {` — one shared block, two selectors.
  const darkBlocksForPalette = extractBlocks(
    css,
    String.raw`\.dark\s*\.palette-${name}\s*\{`
  )
  if (darkBlocksForPalette[0]) {
    paletteDark[name] = extractColorVars(darkBlocksForPalette[0])
  }
}

// ---------------------------------------------------------------------------
// 2. Colour math: hex and oklch() both resolve to a WCAG relative luminance.
// ---------------------------------------------------------------------------
function hexToLinearRgb(hex) {
  const h = hex.replace("#", "")
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h
  const int = Number.parseInt(full, 16)
  const toLinear = (c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return {
    r: toLinear((int >> 16) & 255),
    g: toLinear((int >> 8) & 255),
    b: toLinear(int & 255),
  }
}

// OKLCH -> linear sRGB (Björn Ottosson's OKLab matrices). WCAG relative
// luminance is a weighted sum of LINEAR rgb, so no re-encoding to sRGB gamma
// and back is needed once we have these.
function oklchToLinearRgb(str) {
  const inner = str.slice(str.indexOf("(") + 1, str.lastIndexOf(")"))
  const [L, C, H] = inner
    .trim()
    .split(/\s+/)
    .map((v) => Number.parseFloat(v))
  const hRad = (H * Math.PI) / 180
  const a = C * Math.cos(hRad)
  const b = C * Math.sin(hRad)

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b

  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3

  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s

  const clamp = (v) => Math.min(1, Math.max(0, v))
  return { r: clamp(r), g: clamp(g), b: clamp(bl) }
}

function relativeLuminance(colorValue) {
  const linear = colorValue.startsWith("#")
    ? hexToLinearRgb(colorValue)
    : oklchToLinearRgb(colorValue)
  return 0.2126 * linear.r + 0.7152 * linear.g + 0.0722 * linear.b
}

function contrastRatio(colorA, colorB) {
  const lA = relativeLuminance(colorA)
  const lB = relativeLuminance(colorB)
  const [lighter, darker] = lA >= lB ? [lA, lB] : [lB, lA]
  return (lighter + 0.05) / (darker + 0.05)
}

// ---------------------------------------------------------------------------
// 3. camelCase keys used below -> the kebab-case custom-property names
//    tokens.css actually declares. Resolved once per theme from the parsed
//    vars, so a rename or a re-coloured token in tokens.css is picked up
//    automatically — nothing here is a value, only a name mapping.
// ---------------------------------------------------------------------------
const KEY_TO_VAR = {
  background: "background",
  foreground: "foreground",
  card: "card",
  cardForeground: "card-foreground",
  popover: "popover",
  popoverForeground: "popover-foreground",
  muted: "muted",
  mutedForeground: "muted-foreground",
  border: "border",
  input: "input",
  ring: "ring",
  primary: "primary",
  primaryForeground: "primary-foreground",
  primaryInk: "primary-ink",
  secondary: "secondary",
  secondaryForeground: "secondary-foreground",
  accent: "accent",
  accentForeground: "accent-foreground",
  danger: "danger",
  dangerForeground: "danger-foreground",
  dangerSoft: "danger-soft",
  dangerInk: "danger-ink",
  sidebar: "sidebar",
  sidebarForeground: "sidebar-foreground",
  sidebarMuted: "sidebar-muted",
  sidebarPrimary: "sidebar-primary",
  sidebarPrimaryForeground: "sidebar-primary-foreground",
  sidebarAccent: "sidebar-accent",
  sidebarAccentForeground: "sidebar-accent-foreground",
  sidebarBorder: "sidebar-border",
}

function resolveTheme(varsMap, label) {
  const resolved = {}
  const missing = []
  for (const [key, cssVar] of Object.entries(KEY_TO_VAR)) {
    const value = varsMap[cssVar]
    if (!value) {
      missing.push(cssVar)
      continue
    }
    resolved[key] = value
  }
  if (missing.length > 0) {
    console.error(
      `${label}: tokens.css is missing expected custom propert${missing.length === 1 ? "y" : "ies"}: ${missing.join(", ")}`
    )
    process.exitCode = 1
  }
  return resolved
}

const LIGHT = resolveTheme(LIGHT_VARS, "light")
const DARK = resolveTheme(DARK_VARS, "dark")

// [label, fg key, bg key, threshold]
const TEXT_PAIRS = [
  ["foreground / background", "foreground", "background", 4.5],
  ["card-foreground / card", "cardForeground", "card", 4.5],
  ["popover-foreground / popover", "popoverForeground", "popover", 4.5],
  ["muted-foreground / background", "mutedForeground", "background", 4.5],
  ["muted-foreground / card", "mutedForeground", "card", 4.5],
  ["muted-foreground / muted", "mutedForeground", "muted", 4.5],
  ["muted-foreground / secondary", "mutedForeground", "secondary", 4.5],
  [
    "muted-foreground / sidebar-accent",
    "mutedForeground",
    "sidebarAccent",
    4.5,
  ],
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
  ["sidebar-muted / sidebar-accent", "sidebarMuted", "sidebarAccent", 4.5],
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
  [
    "input / muted (3:1 boundary, e.g. a Field inside a sheet)",
    "input",
    "muted",
    3,
  ],
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
      `  ${pass ? "PASS" : "FAIL"}  ${label.padEnd(56)} ${ratio.toFixed(2)}:1 (>= ${threshold}:1)`
    )
  }
  return failed
}

function runPalettes(themeName, palettes, primaryForeground) {
  console.log(
    `\n=== ${themeName} palettes (--primary-foreground on each --primary) ===`
  )
  let failed = 0
  for (const name of PALETTE_NAMES) {
    const vars = palettes[name]
    if (!vars || !vars.primary) {
      console.log(`  SKIP  palette-${name} (missing token)`)
      continue
    }
    const ratio = contrastRatio(primaryForeground, vars.primary)
    const pass = ratio >= 4.5
    if (!pass) failed += 1
    console.log(
      `  ${pass ? "PASS" : "FAIL"}  primary-foreground / palette-${name} primary`.padEnd(
        66
      ) + ` ${ratio.toFixed(2)}:1 (>= 4.5:1)`
    )
  }
  return failed
}

let totalFailed = 0
totalFailed += run("light", LIGHT)
totalFailed += run("dark", DARK)
totalFailed += runPalettes("light", paletteLight, LIGHT.primaryForeground)
totalFailed += runPalettes("dark", paletteDark, DARK.primaryForeground)

console.log(
  `\n${totalFailed === 0 ? "ALL CHECKS PASS" : `${totalFailed} CHECK(S) FAILED`}`
)
process.exit(totalFailed > 0 || process.exitCode === 1 ? 1 : 0)
