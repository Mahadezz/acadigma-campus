/**
 * F-OP-03 Part 6 (D-208) — the exam mark sheet: students x papers, landscape
 * A4 (§5.7(4): the column count — one per paper plus five summary columns —
 * clears 12 for almost every real exam). Every mark, letter, GPA, rank and
 * result on the DTO is already computed by F-AC-06's `app.compute_results`
 * (via `getMarkSheetData`, `@acadigma/db`) — §5.1's "one grading truth" rule:
 * no grade band, pass rule or averaging lives in this file.
 *
 * A student whose own result is `incomplete`/`withheld` still has a row —
 * their GPA/grade/rank cells print "অসম্পূর্ণ"/"Incomplete" instead (the
 * same rule the report card already applies, §5.10). Every formatted number
 * and Bengali label goes through `ScriptText`, never a plain `<Text>`
 * (`document-shell.tsx`'s file header: Inter has no Bengali glyphs).
 */
import { StyleSheet, Text, View } from "@react-pdf/renderer"

import type { MarkSheetDto } from "@acadigma/contracts"

import {
  ReportShell,
  ScriptText,
  type ReportShellProps,
} from "../document-shell"
import { formatNumber, type ReportLocale } from "../format"

const styles = StyleSheet.create({
  section: { marginTop: 8 },
  table: { marginTop: 6 },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#0b0b0b",
    paddingBottom: 2,
  },
  studentRow: {
    flexDirection: "row",
    borderBottomWidth: 0.4,
    borderBottomColor: "#e2e2df",
    paddingVertical: 1,
  },
  footerRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#0b0b0b",
    paddingTop: 2,
  },
  rollCell: {
    width: 20,
    fontSize: 6.5,
    textAlign: "right" as const,
    paddingRight: 2,
  },
  nameCell: { width: 86, fontSize: 6.5, paddingRight: 2 },
  subjectCell: { flex: 1, minWidth: 34, textAlign: "center" as const },
  subjectMarks: { fontSize: 6.5 },
  subjectLetter: { fontSize: 5.5, color: "#6b6b68" },
  summaryCell: {
    width: 34,
    fontSize: 6.5,
    textAlign: "right" as const,
    paddingLeft: 2,
  },
  resultCell: { width: 40, fontSize: 6.5, textAlign: "center" as const },
  headerCellText: { fontSize: 6, fontWeight: 600, color: "#4a4a48" },
  incompleteText: { color: "#8a1a12" },
})

export type MarkSheetDocumentProps = MarkSheetDto & {
  locale: ReportLocale
  generatedAt: Date
  schoolName: string
  headerLines: readonly string[]
  accentColor?: string | null
  footerNote?: string | null
  logoImage?: ReportShellProps["logoImage"]
}

export function MarkSheetDocument(props: MarkSheetDocumentProps) {
  const { locale, subjects, students, columnStats } = props
  const bn = locale === "bn"

  const labels = {
    title: bn ? "নম্বরপত্র" : "Mark Sheet",
    roll: bn ? "রোল" : "Roll",
    name: bn ? "নাম" : "Name",
    total: bn ? "মোট" : "Total",
    gpa: bn ? "জিপিএ" : "GPA",
    grade: bn ? "গ্রেড" : "Grade",
    rank: bn ? "মেধাক্রম" : "Rank",
    result: bn ? "ফলাফল" : "Result",
    pass: bn ? "উত্তীর্ণ" : "Pass",
    fail: bn ? "অনুত্তীর্ণ" : "Fail",
    incomplete: bn ? "অসম্পূর্ণ" : "Incomplete",
    withheld: bn ? "স্থগিত" : "Withheld",
    absent: bn ? "অনু." : "Abs.",
    exempt: bn ? "অব্যা." : "Exmpt",
    highest: bn ? "সর্বোচ্চ" : "Highest",
    lowest: bn ? "সর্বনিম্ন" : "Lowest",
    average: bn ? "গড়" : "Average",
    passRate: bn ? "পাসের হার" : "Pass rate",
  }

  const resultText = (result: MarkSheetDto["students"][number]["result"]) => {
    if (result === "incomplete") return labels.incomplete
    if (result === "withheld") return labels.withheld
    return result === "pass" ? labels.pass : labels.fail
  }

  const scopeLine = `${props.sectionLabel} · ${bn ? props.examNameBn : props.examNameEn}`

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
            {subjects.map((subject) => (
              <ScriptText
                key={subject.subjectNameEn}
                style={[styles.subjectCell, styles.headerCellText]}
                text={bn ? subject.subjectNameBn : subject.subjectNameEn}
              />
            ))}
            <ScriptText
              style={[styles.summaryCell, styles.headerCellText]}
              text={labels.total}
            />
            <Text style={[styles.summaryCell, styles.headerCellText]}>%</Text>
            <ScriptText
              style={[styles.summaryCell, styles.headerCellText]}
              text={labels.gpa}
            />
            <ScriptText
              style={[styles.summaryCell, styles.headerCellText]}
              text={labels.grade}
            />
            <ScriptText
              style={[styles.summaryCell, styles.headerCellText]}
              text={labels.rank}
            />
            <ScriptText
              style={[styles.resultCell, styles.headerCellText]}
              text={labels.result}
            />
          </View>

          {students.map((student) => {
            const withheld =
              student.result === "incomplete" || student.result === "withheld"
            return (
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
                {student.lines.map((line) => (
                  <View key={line.subjectNameEn} style={styles.subjectCell}>
                    <ScriptText
                      style={styles.subjectMarks}
                      text={
                        line.status === "absent"
                          ? labels.absent
                          : line.status === "exempt"
                            ? labels.exempt
                            : line.obtained === null
                              ? "—"
                              : formatNumber(line.obtained, locale)
                      }
                    />
                    <ScriptText
                      style={styles.subjectLetter}
                      text={line.letter ?? "—"}
                    />
                  </View>
                ))}
                {withheld ? (
                  <>
                    <Text style={styles.summaryCell} />
                    <Text style={styles.summaryCell} />
                    <Text style={styles.summaryCell} />
                    <Text style={styles.summaryCell} />
                    <Text style={styles.summaryCell} />
                  </>
                ) : (
                  <>
                    <ScriptText
                      style={styles.summaryCell}
                      text={formatNumber(student.totalObtained, locale)}
                    />
                    <ScriptText
                      style={styles.summaryCell}
                      text={
                        student.percentage === null
                          ? "—"
                          : formatNumber(student.percentage, locale)
                      }
                    />
                    <ScriptText
                      style={styles.summaryCell}
                      text={
                        student.gpa === null
                          ? "—"
                          : formatNumber(student.gpa, locale, 2)
                      }
                    />
                    <ScriptText
                      style={styles.summaryCell}
                      text={student.letter ?? "—"}
                    />
                    <ScriptText
                      style={styles.summaryCell}
                      text={
                        student.rank === null
                          ? "—"
                          : formatNumber(student.rank, locale)
                      }
                    />
                  </>
                )}
                <ScriptText
                  style={[
                    styles.resultCell,
                    withheld ? styles.incompleteText : {},
                  ]}
                  text={resultText(student.result)}
                />
              </View>
            )
          })}

          <View style={styles.footerRow}>
            <Text style={[styles.rollCell, styles.headerCellText]} />
            <ScriptText
              style={[styles.nameCell, styles.headerCellText]}
              text={labels.highest}
            />
            {columnStats.map((stat) => (
              <ScriptText
                key={stat.subjectNameEn}
                style={[styles.subjectCell, styles.headerCellText]}
                text={
                  stat.highest === null
                    ? "—"
                    : formatNumber(stat.highest, locale)
                }
              />
            ))}
          </View>
          <View style={styles.studentRow}>
            <Text style={styles.rollCell} />
            <ScriptText style={styles.nameCell} text={labels.lowest} />
            {columnStats.map((stat) => (
              <ScriptText
                key={stat.subjectNameEn}
                style={styles.subjectCell}
                text={
                  stat.lowest === null ? "—" : formatNumber(stat.lowest, locale)
                }
              />
            ))}
          </View>
          <View style={styles.studentRow}>
            <Text style={styles.rollCell} />
            <ScriptText style={styles.nameCell} text={labels.average} />
            {columnStats.map((stat) => (
              <ScriptText
                key={stat.subjectNameEn}
                style={styles.subjectCell}
                text={
                  stat.average === null
                    ? "—"
                    : formatNumber(stat.average, locale, 2)
                }
              />
            ))}
          </View>
          <View style={styles.studentRow}>
            <Text style={styles.rollCell} />
            <ScriptText style={styles.nameCell} text={labels.passRate} />
            {columnStats.map((stat) => (
              <ScriptText
                key={stat.subjectNameEn}
                style={styles.subjectCell}
                text={
                  stat.passRate === null
                    ? "—"
                    : `${formatNumber(stat.passRate, locale, 1)}%`
                }
              />
            ))}
          </View>
        </View>
      </View>
    </ReportShell>
  )
}
