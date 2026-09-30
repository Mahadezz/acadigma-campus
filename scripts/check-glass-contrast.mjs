// D-408: text contrast on liquid glass. scripts/check-contrast-tokens.mjs
// checks opaque pairs only; a glass surface has no single background — it is
// a translucent tint over whatever the ambient mesh shows at that spot. This
// script takes the worst spot: every mesh stop at full strength over the
// ambient base, plus the grain's extreme pixel, run through the glass's own
// saturate() filter, then the tint composited on top — and checks
// --foreground and --glass-muted-foreground (the utilities set it as
// --muted-foreground on glass) on each result (>= 4.5:1).
// Blending is done in gamma-encoded sRGB, as browsers do.
// Values are parsed out of tokens.css, never hand-copied.
// Run: `node scripts/check-glass-contrast.mjs` (exit 1 on any failure).

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const css = readFileSync(
  join(root, "packages/ui/tokens/tokens.css"),
  "utf8"
).replace(/\/\*[\s\S]*?\*\//g, "")

const section = (from, to) => css.slice(css.indexOf(from), css.indexOf(to))
const THEMES = {
  light: section("--background: #f4f4f2", ".dark {"),
  dark: section(".dark {", ".palette-emerald {"),
}

const decl = (block, name) => {
  const m = block.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`))
  if (!m) throw new Error(`--${name} not found`)
  return m[1].trim()
}

// Colour parsing → gamma-encoded sRGB 0..1 plus alpha.
function parse(str) {
  if (str.startsWith("#")) {
    const n = Number.parseInt(str.slice(1), 16)
    return { c: [n >> 16, (n >> 8) & 255, n & 255].map((v) => v / 255), a: 1 }
  }
  const [body, alpha] = str.slice(str.indexOf("(") + 1, -1).split("/")
  const nums = body.trim().split(/\s+/).map(Number)
  const a = alpha === undefined ? 1 : Number(alpha)
  if (str.startsWith("rgb")) return { c: nums.map((v) => v / 255), a }
  const [L, C, H] = nums // oklch → linear sRGB (Ottosson) → gamma sRGB
  const h = (H * Math.PI) / 180
  const A = C * Math.cos(h)
  const B = C * Math.sin(h)
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  const enc = (v) => {
    const x = Math.min(1, Math.max(0, v))
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
  }
  return { c: lin.map(enc), a }
}

const over = (top, bottom) =>
  bottom.map((b, i) => top.c[i] * top.a + b * (1 - top.a))
// CSS saturate() matrix (Filter Effects §feColorMatrix type=saturate).
function saturate([r, g, b], s) {
  const clamp = (v) => Math.min(1, Math.max(0, v))
  return [
    clamp(
      (0.213 + 0.787 * s) * r +
        (0.715 - 0.715 * s) * g +
        (0.072 - 0.072 * s) * b
    ),
    clamp(
      (0.213 - 0.213 * s) * r +
        (0.715 + 0.285 * s) * g +
        (0.072 - 0.072 * s) * b
    ),
    clamp(
      (0.213 - 0.213 * s) * r +
        (0.715 - 0.715 * s) * g +
        (0.072 + 0.928 * s) * b
    ),
  ]
}
const lum = (c) =>
  c
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
const ratio = (x, y) => {
  const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p)
  return (hi + 0.05) / (lo + 0.05)
}

let failed = 0
for (const [theme, block] of Object.entries(THEMES)) {
  const base = parse(decl(block, "ambient-base")).c
  const stops = [
    ...decl(block, "ambient-gradient").matchAll(/oklch\([^)]*\)/g),
  ].map((m) => parse(m[0]))
  const grain = Number(decl(block, "ambient-grain-opacity"))
  const sat = Number.parseFloat(decl(block, "glass-saturate")) / 100
  // Grain's worst pixel pushes the backdrop toward the text colour.
  const grainPixel = { c: theme === "light" ? [0, 0, 0] : [1, 1, 1], a: grain }
  const backdrops = [base, ...stops.map((s) => over(s, base))].map((b) =>
    saturate(over(grainPixel, b), sat)
  )
  // Text set straight on the mesh (the page title, the date line) — no
  // glass, no saturate, the theme's own inks.
  for (const ink of ["foreground", "glass-muted-foreground"]) {
    const fg = parse(decl(block, ink)).c
    const bare = [base, ...stops.map((s) => over(s, base))].map((b) =>
      over(grainPixel, b)
    )
    const worst = Math.min(...bare.map((b) => ratio(fg, b)))
    const ok = worst >= 4.5
    if (!ok) failed++
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${theme.padEnd(5)}  --${ink} on the bare mesh: ${worst.toFixed(2)}:1`
    )
  }
  // Coloured inks on resting cards: links (--primary-ink), primary text,
  // status text, and the input placeholder (muted on glass).
  const panel = parse(decl(block, "glass-bg-panel"))
  for (const ink of ["primary", "primary-ink", "success-ink", "danger-ink"]) {
    const fg = parse(decl(block, ink)).c
    const worst = Math.min(...backdrops.map((b) => ratio(fg, over(panel, b))))
    const ok = worst >= 4.5
    if (!ok) failed++
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${theme.padEnd(5)}  --${ink} on --glass-bg-panel: ${worst.toFixed(2)}:1`
    )
  }
  // Chrome over the most contrasting solid content that scrolls under it —
  // the primary button (near-black in light, near-white in dark) — with the
  // blur treated as no help (a solid block wider than the blur radius).
  {
    const chrome = parse(decl(block, "glass-bg"))
    const under = saturate(parse(decl(block, "primary")).c, sat)
    const bg = over(chrome, under)
    for (const ink of ["foreground", "glass-muted-foreground"]) {
      const r = ratio(parse(decl(block, ink)).c, bg)
      const ok = r >= 4.5
      if (!ok) failed++
      console.log(
        `${ok ? "PASS" : "FAIL"}  ${theme.padEnd(5)}  --${ink} on --glass-bg over --primary: ${r.toFixed(2)}:1`
      )
    }
  }
  for (const tint of ["glass-bg", "glass-bg-panel", "glass-bg-overlay"]) {
    const t = parse(decl(block, tint))
    for (const ink of ["foreground", "glass-muted-foreground"]) {
      const fg = parse(decl(block, ink)).c
      const worst = Math.min(...backdrops.map((b) => ratio(fg, over(t, b))))
      const ok = worst >= 4.5
      if (!ok) failed++
      console.log(
        `${ok ? "PASS" : "FAIL"}  ${theme.padEnd(5)}  --${ink} on --${tint}: ${worst.toFixed(2)}:1`
      )
    }
  }
}
process.exit(failed ? 1 : 0)
