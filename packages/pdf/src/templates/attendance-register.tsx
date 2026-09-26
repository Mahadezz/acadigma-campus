/**
 * F-OP-03 Part 6 (D-208) — the monthly attendance register. Landscape A4,
 * students x every calendar day of the month, non-school days greyed
 * (§5.7(4): landscape when the column count exceeds 12, which every month
 * with more than a handful of school days already does). No attendance
 * math happens here: every cell, total and percentage on the DTO is already
 * computed (`getAttendanceRegister`, `@acadigma/db`) — this file only lays
 * the grid out.
 *
 * Codes on the grid are the plain Latin letters P/A/L/E/H in both locales
 * (a deliberate simplification, D-208: several Bengali status words share a
 * first letter — উপস্থিত/অনুপস্থিত both start with a vowel sound close enough
 * to collide at one glyph — so the legend, not the cell, carries the
 * Bengali meaning). Every OTHER piece of text — including every formatted
 * number, which prints Bengali digits in `bn` locale — goes through
 * `ScriptText`, never a plain `<Text>` (`document-shell.tsx`'s file header:
 * Inter has no Bengali glyphs at all and silently produces mojibake).
 */
import { StyleSheet, Text, View } from "@react-pdf/renderer"

import type {
  AttendanceRegisterDto,
  AttendanceStatus,
} from "@acadigma/contracts"

import {
  ReportShell,
  ScriptText,
  type ReportShellProps,
} from "../document-shell"
import { formatMonthYear, formatNumber, type ReportLocale } from "../format"

const STATUS_CODE: Record<AttendanceStatus, string> = {
  present: "P",
  absent: "A",
  late: "L",
  excused: "E",
  half_day: "H",
}

const styles = StyleSheet.create({
  section: { marginTop: 8 },
  table: { marginTop: 6 },
  row: { flexDirection: "row" },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#0b0b0b",
    paddingBottom: 2,
  },
  footerRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#0b0b0b",
    paddingTop: 2,
    marginTop: 1,
  },
  studentRow: {
    flexDirection: "row",
    borderBottomWidth: 0.4,
    borderBottomColor: "#e2e2df",
  },
  rollCell: {
    width: 20,
    fontSize: 6.5,
    textAlign: "right" as const,
    paddingRight: 2,
  },
  nameCell: { width: 92, fontSize: 6.5, paddingRight: 2 },
  dayCell: {
    width: 15,
    fontSize: 6,
    textAlign: "center" as const,
  },
  dayCellGrey: { backgroundColor: "#efefec", color: "#9a9a96" },
  totalCell: {
    width: 28,
    fontSize: 6.5,
    textAlign: "right" as const,
    paddingLeft: 2,
  },
  headerCellText: { fontSize: 6, fontWeight: 600, color: "#4a4a48" },
  legend: { marginTop: 8, fontSize: 7.5, color: "#4a4a48" },
  incompleteBanner: { marginTop: 4, fontSize: 8, color: "#8a1a12" },
})

export type AttendanceRegisterDocumentProps = AttendanceRegisterDto & {
  locale: ReportLocale
  generatedAt: Date
  schoolName: string
  headerLines: readonly string[]
  accentColor?: string | null
  footerNote?: string | null
  logoImage?: ReportShellProps["logoImage"]
}

export function AttendanceRegisterDocument(
  props: AttendanceRegisterDocumentProps
) {
  const { locale, days, students } = props
  const bn = locale === "bn"

  const labels = {
    title: bn ? "মাসিক উপস্থিতি রেজিস্টার" : "Monthly Attendance Register",
    roll: bn ? "রোল" : "Roll",
    name: bn ? "নাম" : "Name",
    total: bn ? "মোট" : "Total",
    present: bn ? "উপস্থিত সংখ্যা" : "Present count",
    legendTitle: bn ? "সংকেত" : "Legend",
    codes: bn
      ? "P = উপস্থিত, A = অনুপস্থিত, L = বিলম্বে উপস্থিত, E = ছুটি (অনুমোদিত), H = অর্ধদিবস"
      : "P = Present, A = Absent, L = Late, E = Excused, H = Half-day",
    policyYes: bn ? "হ্যাঁ" : "Yes",
    policyNo: bn ? "না" : "No",
    latePolicy: bn
      ? "বিলম্বকে উপস্থিত হিসেবে গণনা করা হয়:"
      : "Late counts as present:",
    halfDayPolicy: bn
      ? "অর্ধদিবসকে উপস্থিত হিসেবে গণনা করা হয়:"
      : "Half-day counts as present:",
    incomplete: bn ? "দিন এখনও হাজিরা নেওয়া হয়নি:" : "days not yet taken:",
  }

  const scopeLine = `${props.className} – ${props.sectionName} · ${formatMonthYear(props.year, props.month, locale)}`

  return (
    <ReportShell
      locale={locale}
      orientation="landscape"
      schoolName={props.schoolName}
      headerLines={props.headerLines}
      accentColor={props.accentColor}
      logoImage={props.logoImage}
      title={labels.title}
      scopeLine={scopeLine}
      footerNote={props.footerNote}
      generatedAt={props.generatedAt}
    >
      <View style={styles.section}>
        {props.incompleteDaysCount > 0 && (
          <ScriptText
            style={styles.incompleteBanner}
            text={`${formatNumber(props.incompleteDaysCount, locale)} ${labels.incomplete}`}
          />
        )}

        <View style={styles.table}>
          <View style={styles.headerRow}>
            <ScriptText
              style={[styles.rollCell, styles.headerCellText]}
              text={labels.roll}
            />
            <ScriptText
              style={[styles.nameCell, styles.headerCellText]}
              text={labels.name}
            />
            {days.map((day) => (
              <ScriptText
                key={day.date}
                style={[
                  styles.dayCell,
                  styles.headerCellText,
                  !day.isSchoolDay ? styles.dayCellGrey : {},
                ]}
                text={formatNumber(day.dayOfMonth, locale)}
              />
            ))}
            <ScriptText
              style={[styles.totalCell, styles.headerCellText]}
              text={labels.total}
            />
            <Text style={[styles.totalCell, styles.headerCellText]}>%</Text>
          </View>

          {students.map((student) => (
            <View key={student.studentId} style={styles.studentRow}>
              <ScriptText
                style={styles.rollCell}
                text={
                  student.rollNumber === null
                    ? "—"
                    : formatNumber(student.rollNumber, locale)
                }
              />
              <ScriptText
                style={styles.nameCell}
                text={bn ? student.studentNameBn : student.studentNameEn}
              />
              {student.cells.map((cell, i) => (
                <Text
                  key={days[i]!.date}
                  style={[
                    styles.dayCell,
                    !days[i]!.isSchoolDay ? styles.dayCellGrey : {},
                  ]}
                >
                  {cell === null ? "-" : STATUS_CODE[cell]}
                </Text>
              ))}
              <ScriptText
                style={styles.totalCell}
                text={formatNumber(student.presentEquivalent, locale)}
              />
              <ScriptText
                style={styles.totalCell}
                text={
                  student.percent === null
                    ? "—"
                    : formatNumber(student.percent, locale)
                }
              />
            </View>
          ))}

          <View style={styles.footerRow}>
            <Text style={[styles.rollCell, styles.headerCellText]} />
            <ScriptText
              style={[styles.nameCell, styles.headerCellText]}
              text={labels.present}
            />
            {days.map((day) => (
              <ScriptText
                key={day.date}
                style={[
                  styles.dayCell,
                  styles.headerCellText,
                  !day.isSchoolDay ? styles.dayCellGrey : {},
                ]}
                text={
                  day.sessionTaken ? formatNumber(day.presentCount, locale) : ""
                }
              />
            ))}
            <Text style={styles.totalCell} />
            <Text style={styles.totalCell} />
          </View>
        </View>

        <ScriptText
          style={styles.legend}
          text={`${labels.legendTitle}: ${labels.codes}`}
        />
        <ScriptText
          style={styles.legend}
          text={`${labels.latePolicy} ${props.policy.lateCountsPresent ? labels.policyYes : labels.policyNo}  ·  ${labels.halfDayPolicy} ${props.policy.halfDayCountsPresent ? labels.policyYes : labels.policyNo}`}
        />
      </View>
    </ReportShell>
  )
}
