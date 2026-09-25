/**
 * F-OP-03 Part 1 demo document (spec §8, Part 1): "one throwaway 'Hello'
 * document renders with a Bengali school name, the school's logo, and
 * 'পৃষ্ঠা ১ / ২' in the footer — from two different school fixtures,
 * producing two different headers."
 *
 * Doubles as Part 2's pipeline exercise (§8 Part 2 demo: "enqueue a stub
 * report") — `report_kind = 'sample'` is the one kind this PR's run pipeline
 * knows how to render; every real report kind (report_card, mark_sheet, ...)
 * needs exam/marks data this PR does not build (F-AC-0x), so inventing
 * content for them here would be exactly the "fake data in the product" this
 * build avoids. `report_runs.kind` is a Postgres enum — later Parts add
 * their own values with `alter type ... add value`, additive and forward-only.
 */
import { StyleSheet, View } from "@react-pdf/renderer"

import {
  ReportShell,
  ScriptText,
  type ReportShellProps,
} from "../document-shell"
import { formatNumber, type ReportLocale } from "../format"

const styles = StyleSheet.create({
  body: { marginTop: 16, gap: 6 },
  line: { fontSize: 10 },
  conjunctTest: { fontSize: 12, marginTop: 12 },
})

export type SampleDocumentProps = {
  locale: ReportLocale
  schoolName: string
  headerLines: readonly string[]
  accentColor?: string | null
  logoImage?: ReportShellProps["logoImage"]
  footerNote?: string | null
  generatedAt: Date
}

/**
 * Bengali coverage this template exists to prove: "শিক্ষার্থী" (student — a
 * plain word with the everyday যুক্তাক্ষর/conjunct pattern a report card is
 * full of) and "ক্ষ" (the kha-conjunct that breaks the most Bengali
 * renderers when hyphenation or naive glyph-by-glyph layout is on).
 */
export function SampleDocument({
  locale,
  schoolName,
  headerLines,
  accentColor,
  logoImage,
  footerNote,
  generatedAt,
}: SampleDocumentProps) {
  return (
    <ReportShell
      locale={locale}
      schoolName={schoolName}
      headerLines={headerLines}
      accentColor={accentColor}
      logoImage={logoImage}
      title="Sample document"
      scopeLine="F-OP-03 Part 1 — PDF foundation demo"
      footerNote={footerNote}
      generatedAt={generatedAt}
    >
      <View style={styles.body}>
        <ScriptText
          style={styles.line}
          text="Hello — this page proves the letterhead renders correctly."
        />
        <ScriptText style={styles.line} text="শিক্ষার্থী: রহিমা আক্তার" />
        <ScriptText style={styles.conjunctTest} text="ক্ষ ক্ষমতা পরীক্ষা" />
        <ScriptText
          style={styles.line}
          text={`Sample number: ${formatNumber(1234, locale)}`}
        />
      </View>
    </ReportShell>
  )
}
