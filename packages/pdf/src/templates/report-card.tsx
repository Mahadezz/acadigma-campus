/**
 * F-OP-03 Part 3 (D-206) — the report card template, on the Part 1/2 PDF
 * engine. Renders one `ReportCardDto` (`@acadigma/contracts`) onto one A4
 * portrait page: letterhead (via `ReportShell`), student details, a subject
 * table with marks/grade/GPA, the totals line, an attendance summary, and
 * class-teacher/guardian signature lines.
 *
 * No grade band table, no percentage-to-letter map, no averaging here (spec
 * §5.1) — every letter, grade point, GPA and rank on the DTO already came
 * from the caller (today: a fixture using `@acadigma/domain`'s `bandFor` /
 * `BD_GRADE_BANDS`, the #46/D-302 grade scale; later: the real
 * `app.compute_exam_result`). This file only lays the numbers out.
 *
 * Bengali numerals: DESIGN-SYSTEM §1.6 opts printed report cards in to
 * Bengali digits when `locale === 'bn'` — the same `formatNumber` every
 * other template in this package uses, no separate formatting here.
 */
import { StyleSheet, View } from "@react-pdf/renderer"

import type { ReportCardDto } from "@acadigma/contracts"

import {
  ReportShell,
  ScriptText,
  type ReportShellProps,
} from "../document-shell"
import { formatNumber, type ReportLocale } from "../format"

const styles = StyleSheet.create({
  section: { marginTop: 10 },
  studentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
  },
  studentField: { width: "50%", fontSize: 9 },
  studentFieldLabel: { color: "#6b6b68" },
  table: { marginTop: 10 },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e2df" },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#0b0b0b",
    paddingBottom: 3,
  },
  tableHeaderCell: { fontSize: 8, fontWeight: 600, color: "#4a4a48" },
  tableCell: { fontSize: 9, paddingVertical: 3 },
  colSubject: { flex: 3 },
  colMarks: { flex: 1.4, textAlign: "right" as const },
  colFull: { flex: 1.4, textAlign: "right" as const },
  colGrade: { flex: 1, textAlign: "right" as const },
  colGp: { flex: 1, textAlign: "right" as const },
  totalsRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#0b0b0b",
    marginTop: 2,
    paddingTop: 4,
    fontWeight: 600,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 12,
  },
  summaryField: { width: "33%", fontSize: 9 },
  incompleteBanner: {
    marginTop: 8,
    fontSize: 8.5,
    color: "#8a1a12",
  },
  attendanceLine: { marginTop: 8, fontSize: 9 },
  attendanceWarning: { color: "#8a1a12" },
})

export type ReportCardDocumentProps = ReportCardDto & {
  locale: ReportLocale
  generatedAt: Date
  /** Branding, read live from `school_profiles` — never carried on the DTO
   * itself (see the contract's file header). Same fields `SampleDocument`
   * already takes for the same reason. */
  schoolName: string
  headerLines: readonly string[]
  accentColor?: string | null
  footerNote?: string | null
  logoImage?: ReportShellProps["logoImage"]
  /** Any preview render, or a card carrying an unapproved comment (§5.7(5)) — not used yet (no comments in this Part). */
  watermarkText?: string
}

function Field({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <View style={styles.studentField}>
      <ScriptText text={`${label}: `} style={styles.studentFieldLabel} />
      <ScriptText text={value} />
    </View>
  )
}

export function ReportCardDocument(props: ReportCardDocumentProps) {
  const { locale } = props
  const bn = locale === "bn"

  const title = bn ? "প্রতিবেদন পত্র" : "Report Card"
  const examName = bn ? props.examNameBn : props.examNameEn
  const studentName = bn ? props.studentNameBn : props.studentNameEn
  const scopeLine = `${props.className} – ${props.sectionName} · ${examName}`
  const incompleteSubjectNames = props.subjects
    .filter((row) => row.marksObtained === null)
    .map((row) => (bn ? row.subjectNameBn : row.subjectNameEn))

  const labels = {
    studentName: bn ? "শিক্ষার্থীর নাম" : "Student name",
    studentCode: bn ? "আইডি" : "Student ID",
    roll: bn ? "রোল" : "Roll",
    classSection: bn ? "শ্রেণি – শাখা" : "Class – Section",
    subject: bn ? "বিষয়" : "Subject",
    marksObtained: bn ? "প্রাপ্ত নম্বর" : "Marks obtained",
    fullMarks: bn ? "পূর্ণমান" : "Full marks",
    grade: bn ? "গ্রেড" : "Grade",
    gp: bn ? "জিপি" : "GP",
    total: bn ? "মোট" : "Total",
    percentage: bn ? "শতকরা" : "Percentage",
    gpa: bn ? "জিপিএ" : "GPA",
    result: bn ? "ফলাফল" : "Result",
    pass: bn ? "উত্তীর্ণ" : "Pass",
    fail: bn ? "অনুত্তীর্ণ" : "Fail",
    rank: bn ? "মেধাক্রম" : "Rank",
    attendance: bn ? "উপস্থিতি" : "Attendance",
    incomplete: bn
      ? "নম্বর এখনও দেওয়া হয়নি এমন বিষয়:"
      : "Subjects not yet marked:",
    classTeacher: bn ? "শ্রেণি শিক্ষক" : "Class Teacher",
    guardian: bn ? "অভিভাবক" : "Guardian",
  }

  return (
    <ReportShell
      locale={locale}
      schoolName={props.schoolName}
      headerLines={props.headerLines}
      accentColor={props.accentColor}
      logoImage={props.logoImage}
      title={title}
      scopeLine={scopeLine}
      footerNote={props.footerNote}
      generatedAt={props.generatedAt}
      watermarkText={props.watermarkText}
      signatures={[
        { label: labels.classTeacher },
        { label: labels.guardian },
      ]}
    >
      <View style={styles.section}>
        <View style={styles.studentGrid}>
          <Field label={labels.studentName} value={studentName} />
          <Field label={labels.studentCode} value={props.studentCode} />
          <Field
            label={labels.roll}
            value={formatNumber(props.rollNumber, locale)}
          />
          <Field
            label={labels.classSection}
            value={`${props.className} – ${props.sectionName}`}
          />
        </View>
      </View>

      <View style={styles.table}>
        <View style={styles.tableHeaderRow}>
          <ScriptText style={[styles.tableHeaderCell, styles.colSubject]} text={labels.subject} />
          <ScriptText style={[styles.tableHeaderCell, styles.colMarks]} text={labels.marksObtained} />
          <ScriptText style={[styles.tableHeaderCell, styles.colFull]} text={labels.fullMarks} />
          <ScriptText style={[styles.tableHeaderCell, styles.colGrade]} text={labels.grade} />
          <ScriptText style={[styles.tableHeaderCell, styles.colGp]} text={labels.gp} />
        </View>
        {props.subjects.map((row, i) => (
          <View key={i} style={styles.tableRow}>
            <ScriptText
              style={[styles.tableCell, styles.colSubject]}
              text={bn ? row.subjectNameBn : row.subjectNameEn}
            />
            <ScriptText
              style={[styles.tableCell, styles.colMarks]}
              text={
                row.marksObtained === null
                  ? "—"
                  : formatNumber(row.marksObtained, locale)
              }
            />
            <ScriptText
              style={[styles.tableCell, styles.colFull]}
              text={formatNumber(row.fullMarks, locale)}
            />
            <ScriptText
              style={[styles.tableCell, styles.colGrade]}
              text={row.letter ?? "—"}
            />
            <ScriptText
              style={[styles.tableCell, styles.colGp]}
              text={row.gradePoint === null ? "—" : formatNumber(row.gradePoint, locale, 2)}
            />
          </View>
        ))}
        <View style={styles.totalsRow}>
          <ScriptText
            style={[styles.tableCell, styles.colSubject]}
            text={labels.total}
          />
          <ScriptText
            style={[styles.tableCell, styles.colMarks]}
            text={formatNumber(props.totalObtained, locale)}
          />
          <ScriptText
            style={[styles.tableCell, styles.colFull]}
            text={formatNumber(props.totalFull, locale)}
          />
          <ScriptText style={[styles.tableCell, styles.colGrade]} text={props.overallLetter} />
          <ScriptText
            style={[styles.tableCell, styles.colGp]}
            text={formatNumber(props.gpa, locale, 2)}
          />
        </View>
      </View>

      {incompleteSubjectNames.length > 0 && (
        <ScriptText
          style={styles.incompleteBanner}
          text={`${labels.incomplete} ${incompleteSubjectNames.join(", ")}`}
        />
      )}

      <View style={styles.summaryGrid}>
        <Field
          label={labels.percentage}
          value={`${formatNumber(props.percentage, locale)}%`}
        />
        <Field label={labels.gpa} value={formatNumber(props.gpa, locale, 2)} />
        <Field
          label={labels.result}
          value={props.result === "pass" ? labels.pass : labels.fail}
        />
        {props.rank !== null && props.rankOf !== null && (
          <Field
            label={labels.rank}
            value={`${formatNumber(props.rank, locale)} / ${formatNumber(props.rankOf, locale)}`}
          />
        )}
      </View>

      <ScriptText
        style={
          props.attendance.belowMinimum
            ? [styles.attendanceLine, styles.attendanceWarning]
            : styles.attendanceLine
        }
        text={`${labels.attendance}: ${formatNumber(props.attendance.presentDays, locale)} / ${formatNumber(props.attendance.totalDays, locale)} (${formatNumber(props.attendance.percent, locale)}%)`}
      />
    </ReportShell>
  )
}
