import Link from "next/link"

import { getSchoolSettings } from "@acadigma/db/repositories/settings"
import { SAT_FIRST_ORDER } from "@acadigma/domain/academic"
import { resolve } from "@acadigma/domain/settings"
import { Button } from "@acadigma/ui/components/button"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { SubPageHeader } from "../sub-page-header"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "How this school works" }

/**
 * F-OP-07 §2 ¹ / §6: the read-only page every member can open, so a teacher
 * can answer a parent's question without asking the office. Values come only
 * through `resolve()` (§5.1); a school with no row still shows the defaults.
 */
export default async function SettingsOverviewPage() {
  const ctx = await requireShell("school")
  const { t } = await getMessages()
  const s = t.settings.overview
  const result = await getSchoolSettings(await createClient(), ctx)
  const settings = result.ok ? result.data : resolve(null)

  const days = SAT_FIRST_ORDER.filter((d) => settings.workingDays.includes(d))
    .map(
      (d) =>
        t.onboarding.wizard.daysFull[
          String(d) as keyof typeof t.onboarding.wizard.daysFull
        ]
    )
    .join(", ")
  const yesNo = (value: boolean) => (value ? s.yes : s.no)
  const { academicSettings: academic, attendancePolicy: attendance } = settings

  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: s.week,
      rows: [
        [s.workingDays, days],
        [s.timezone, settings.timezone],
      ],
    },
    {
      title: s.grading,
      rows: [
        [s.passMark, `${academic.pass_mark_percent}%`],
        [s.gradeScale, academic.grade_scale_code],
        [s.failRule, yesNo(academic.fail_any_subject_zero_gpa)],
      ],
    },
    {
      title: s.attendance,
      rows: [
        [s.lateCounts, yesNo(attendance.late_counts_present)],
        [s.halfDayCounts, yesNo(attendance.half_day_counts_present)],
        [s.minAttendance, `${attendance.min_attendance_bp / 100}%`],
      ],
    },
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SubPageHeader
        backLabel={t.settings.back}
        title={s.title}
        description={s.description}
      />
      {/* F-ID-10 §2/§6 (D-403): text size is every role's own setting, but
          this page's caller (teacher/staff, no workspace.settings.write) is
          redirected away from the grouped Settings list above, which is the
          list's only other link to /app/settings/display — without this,
          those roles could never reach the text-size screen at all. */}
      <Button asChild variant="outline" size="sm">
        <Link href="/app/settings/display">{t.settings.rows.display.title}</Link>
      </Button>
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <section key={group.title} className="rounded-lg border p-4">
            <h3 className="mb-2 text-sm font-semibold">{group.title}</h3>
            <dl className="space-y-2 text-sm">
              {group.rows.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  )
}
