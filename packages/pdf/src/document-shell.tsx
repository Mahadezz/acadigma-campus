/**
 * F-OP-03 Part 1 — the document shell every report template sits inside:
 * header (logo/name/header lines/accent hairline), footer (generated
 * timestamp, footer note, real page numbers), an optional diagonal DRAFT
 * watermark, and an optional signature block (§5.7 render rules 1-3, 5).
 *
 * Deliberately does not import anything from `packages/db` or fetch branding
 * itself (ARCHITECTURE §3/§6: feature code, and everything under this
 * package, never touches a Supabase client) — every value here is a plain
 * prop the caller already resolved through `getSchoolProfile` /
 * `getSchoolSettings` (F-OP-07 repository).
 *
 * `logoImage` is `undefined` until F-OP-03's own "files/storage" dependency
 * ships (spec header table) — the same state `branding-form.tsx` already
 * renders as an initials monogram (D-200: "logo upload is deferred").
 * Passing an image in, once that lands, requires no change here.
 */
import type { ReactNode } from "react"

import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer"

import { FONT_HIND_SILIGURI, FONT_INTER, registerFonts } from "./fonts"
import { formatDateTime, formatNumber, type ReportLocale } from "./format"

import type { Style } from "@react-pdf/types"

const PAGE_MARGIN = 12 // mm, §5.7(4)

const styles = StyleSheet.create({
  page: {
    fontFamily: FONT_INTER,
    fontSize: 9,
    padding: PAGE_MARGIN * 2.834645669, // mm -> pt
    color: "#0b0b0b",
  },
  bn: { fontFamily: FONT_HIND_SILIGURI },
  header: { marginBottom: 8 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: { width: 51, height: 51 }, // 18mm max, §5.7(1)
  logoPlaceholder: {
    width: 51,
    height: 51,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e9e9e6",
  },
  logoPlaceholderText: { fontSize: 16, fontWeight: 600, color: "#0b0b0b" },
  schoolName: { fontSize: 13, fontWeight: 600 },
  headerLine: { fontSize: 8, color: "#4a4a48" },
  hairline: { marginTop: 6, height: 1.5 },
  titleBlock: { marginTop: 6 },
  title: { fontSize: 11, fontWeight: 600 },
  scopeLine: { fontSize: 8.5, color: "#4a4a48", marginTop: 2 },
  watermark: {
    position: "absolute",
    top: "42%",
    left: "18%",
    fontSize: 60,
    color: "#0b0b0b",
    opacity: 0.08,
    transform: "rotate(-30deg)",
  },
  footer: {
    position: "absolute",
    bottom: PAGE_MARGIN * 2.834645669 * 0.6,
    left: PAGE_MARGIN * 2.834645669,
    right: PAGE_MARGIN * 2.834645669,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#6b6b68",
    borderTopWidth: 0.5,
    borderTopColor: "#e2e2df",
    paddingTop: 4,
  },
  signatureBlock: { marginTop: 24, flexDirection: "row", gap: 24 },
  signatureCell: { flex: 1 },
  signatureRule: {
    borderTopWidth: 0.75,
    borderTopColor: "#0b0b0b",
    marginTop: 20,
    paddingTop: 3,
  },
  signatureLabel: { fontSize: 8 },
})

export type ReportShellProps = {
  locale: ReportLocale
  /** Landscape when a template's column count exceeds 12 (§5.7(4)). */
  orientation?: "portrait" | "landscape"
  schoolName: string
  /** Already resolved through `renderHeaderLine` — this component does no token substitution. */
  headerLines: readonly string[]
  accentColor?: string | null
  /** `@react-pdf/renderer`'s raster `Image` shape. See the file header note. */
  logoImage?: { data: Buffer; format: "png" | "jpg" }
  title: string
  scopeLine?: string
  footerNote?: string | null
  generatedAt: Date
  /** Any unapproved comment, or any preview render (§5.7(5)). */
  watermarkText?: string
  signatures?: readonly { label: string; name?: string; date?: string }[]
  children: ReactNode
}

/**
 * True for a run of Bengali-block codepoints, so mixed strings pick the right font per run.
 * Includes the danda/double danda (U+0964/U+0965): they live in the Devanagari block
 * but end every Bengali sentence, and Inter has no glyph for them (tofu box).
 */
function isBengaliRun(text: string): boolean {
  return /[।॥ঀ-৿]/.test(text)
}

/** Splits `text` into alternating Bengali/non-Bengali runs, each tagged with the font it needs. */
function scriptRuns(text: string): { text: string; bn: boolean }[] {
  const runs: { text: string; bn: boolean }[] = []
  let current = ""
  let currentBn: boolean | null = null
  for (const ch of text) {
    const bn = isBengaliRun(ch)
    if (currentBn === null || bn === currentBn) {
      current += ch
      currentBn = bn
    } else {
      runs.push({ text: current, bn: currentBn })
      current = ch
      currentBn = bn
    }
  }
  if (current) runs.push({ text: current, bn: currentBn ?? false })
  return runs
}

type TextStyle = Style | Style[]

/**
 * Renders `text` as Inter/Hind Siliguri runs so a mixed Bengali+Latin line
 * shapes correctly. **Every piece of text that might contain a Bengali
 * codepoint goes through this** — a plain `<Text>` uses the page's default
 * `FONT_INTER`, which has no Bengali glyphs at all and silently produces
 * garbage output (found rendering this Part's own preview PDF: Bengali
 * digits and conjunct-bearing words came out as Latin-1-lookalike mojibake
 * until the footer/body text below were switched to this component).
 */
export function ScriptText({
  text,
  style,
}: {
  text: string
  style?: TextStyle
}) {
  return (
    <Text style={style}>
      {scriptRuns(text).map((run, i) => (
        <Text key={i} style={run.bn ? styles.bn : undefined}>
          {run.text}
        </Text>
      ))}
    </Text>
  )
}

export function ReportShell({
  locale,
  orientation = "portrait",
  schoolName,
  headerLines,
  accentColor,
  logoImage,
  title,
  scopeLine,
  footerNote,
  generatedAt,
  watermarkText,
  signatures,
  children,
}: ReportShellProps) {
  registerFonts()
  const accent =
    accentColor && /^#[0-9A-Fa-f]{6}$/.test(accentColor)
      ? accentColor
      : "#0b0b0b"

  return (
    <Document>
      <Page size="A4" orientation={orientation} style={styles.page}>
        {watermarkText && (
          <ScriptText style={styles.watermark} text={watermarkText} />
        )}

        <View style={styles.header} fixed>
          <View style={styles.headerRow}>
            {logoImage ? (
              <Image style={styles.logo} src={logoImage} />
            ) : (
              <View style={styles.logoPlaceholder}>
                <ScriptText
                  text={initials(schoolName)}
                  style={styles.logoPlaceholderText}
                />
              </View>
            )}
            <View>
              <ScriptText text={schoolName} style={styles.schoolName} />
              {headerLines
                .filter((line) => line.trim().length > 0)
                .map((line, i) => (
                  <ScriptText key={i} text={line} style={styles.headerLine} />
                ))}
            </View>
          </View>
          <View style={[styles.hairline, { backgroundColor: accent }]} />
          <View style={styles.titleBlock}>
            <ScriptText text={title} style={styles.title} />
            {scopeLine && (
              <ScriptText text={scopeLine} style={styles.scopeLine} />
            )}
          </View>
        </View>

        {children}

        {signatures && signatures.length > 0 && (
          <View style={styles.signatureBlock}>
            {signatures.map((sig, i) => (
              <View key={i} style={styles.signatureCell}>
                <View style={styles.signatureRule}>
                  <ScriptText
                    style={styles.signatureLabel}
                    text={`${sig.label}${sig.name ? ` — ${sig.name}` : ""}${sig.date ? ` (${sig.date})` : ""}`}
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.footer} fixed>
          <ScriptText
            text={`${locale === "bn" ? "তৈরি হয়েছে" : "Generated"} ${formatDateTime(generatedAt, locale)}${footerNote ? ` · ${footerNote}` : ""}`}
          />
          <Text
            render={({ pageNumber, totalPages }) => (
              <ScriptText
                text={
                  locale === "bn"
                    ? `পৃষ্ঠা ${formatNumber(pageNumber, "bn")} / ${formatNumber(totalPages, "bn")}`
                    : `Page ${pageNumber} of ${totalPages}`
                }
              />
            )}
          />
        </View>
      </Page>
    </Document>
  )
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")
}
