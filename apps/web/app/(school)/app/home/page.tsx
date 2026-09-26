import Link from "next/link"

import { GraduationCapIcon } from "lucide-react"

import { getBasicHome } from "@acadigma/db/repositories/basic-home"
import { buttonVariants } from "@acadigma/ui/components/button-variants"
import { ClassBlock } from "@acadigma/ui/primitives/class-block"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"
import type { SimpleLinkRenderer } from "@acadigma/ui/primitives/link-renderer"
import { TodayStrip } from "@acadigma/ui/primitives/today-strip"

import { getMessages } from "@/lib/i18n"
import { getCachedSchoolProfile } from "@/lib/school-profile"
import { createClient } from "@/lib/supabase/server"
import { requireShell } from "@/lib/workspace"

import { EssentialsRow } from "./essentials-row"
import { classBlockTitle, fill, pluralize } from "./format"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Basic mode" }

const renderLink: SimpleLinkRenderer = ({ href, className, children }) => (
  <Link href={href} className={className}>
    {children}
  </Link>
)

/**
 * `buttonVariants` from the radix-free `components/button-variants` path —
 * see `essentials-row.tsx`'s docblock. Only the empty state's Call school
 * office link and the error state's Retry link need it here; every other
 * button-shaped element on this page already goes through
 * `ClassBlock`/`TodayStrip`, which style themselves without `Button`.
 */
const PRIMARY_BUTTON_CLASSNAME = buttonVariants({
  variant: "default",
  size: "lg",
  className: "min-h-14 text-base",
})
const OUTLINE_BUTTON_CLASSNAME = buttonVariants({
  variant: "outline",
  size: "lg",
  className: "min-h-14 text-base",
})

/**
 * F-ID-10 §4.4/§6 `/app/home` — the real basic-mode home (Part 2). Today
 * strip (greeting + to-dos), one `ClassBlock` per class from
 * `getBasicHome`, an "All classes" block for owner/admin (§4.4 footnote ¹,
 * AC16), then the essentials row. Every read goes through `getBasicHome`
 * (itself built only from already-shipped repositories/RLS, D-405) — this
 * page adds one more query beyond that, `getSchoolProfile` (via
 * `getCachedSchoolProfile`, review fix — see that module's docblock), only
 * for the empty state's Call school office link.
 */
export default async function BasicHomePage() {
  const ctx = await requireShell("school")
  const { t, locale } = await getMessages()
  const s = t.basicMode.home
  const supabase = await createClient()

  const home = await getBasicHome(supabase, ctx)
  if (!home.ok) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-start gap-4">
        <InlineAlert tone="error">{t.classes.errors.generic}</InlineAlert>
        <Link href="/app/home" className={OUTLINE_BUTTON_CLASSNAME}>
          {t.common.actions.retry}
        </Link>
      </div>
    )
  }
  const data = home.data

  const greetingLabel = fill(
    data.greetingPeriod === "morning"
      ? s.greetingMorning
      : data.greetingPeriod === "afternoon"
        ? s.greetingAfternoon
        : s.greetingEvening,
    { name: data.fullName }
  )
  const dateLabel = new Intl.DateTimeFormat(
    locale === "bn" ? "bn-BD-u-nu-latn" : "en-GB",
    { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }
  ).format(new Date(`${data.todayIso}T00:00:00Z`))

  const todos = data.todos.map((todo) => ({
    key: todo.kind,
    label: pluralize(todo.count, s.todoRollCallsOne, s.todoRollCallsOther),
    // The class hub (Part 3) will own a real "roll calls due" view; until
    // then this opens the existing Today attendance overview, which already
    // lists every section's taken/not-taken state (D-405).
    href: "/app/attendance",
  }))

  const noClasses = data.classes.length === 0 && !data.showAllClasses
  const profile = noClasses
    ? await getCachedSchoolProfile(ctx.workspaceId)
    : null
  const phone = profile?.ok ? profile.data.fields.contact_phone : null

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <TodayStrip
        greeting={greetingLabel}
        dateLabel={dateLabel}
        todos={todos}
        allDoneLabel={s.allDone}
        renderLink={renderLink}
      />

      {noClasses ? (
        <EmptyState
          title={s.emptyTitle}
          description={s.emptyDescription}
          action={
            phone ? (
              <a href={`tel:${phone}`} className={PRIMARY_BUTTON_CLASSNAME}>
                {fill(t.basicMode.help.callSchoolOffice, { phone })}
              </a>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {data.classes.map((cls) => (
            <ClassBlock
              key={cls.sectionId}
              href={`/app/attendance/${cls.sectionId}`}
              title={classBlockTitle(locale, cls, s.classTeacher)}
              studentCountLabel={pluralize(
                cls.studentCount,
                s.studentCountOne,
                s.studentCountOther
              )}
              attendanceState={cls.attendanceToday}
              attendanceLabel={
                cls.attendanceToday === "taken"
                  ? fill(s.attendanceTaken, {
                      taken: cls.taken ?? 0,
                      expected: cls.expected ?? 0,
                    })
                  : cls.attendanceToday === "not_taken"
                    ? s.attendanceNotTaken
                    : s.attendanceNotSchoolDay
              }
              renderLink={renderLink}
            />
          ))}

          {data.showAllClasses ? (
            <Link
              href="/app/classes/all"
              className="border-border bg-card text-card-foreground focus-visible:ring-ring flex min-h-24 w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-hidden active:opacity-90"
            >
              <GraduationCapIcon
                className="size-10 shrink-0"
                aria-hidden="true"
              />
              <span className="flex flex-col">
                <span className="text-lg leading-tight font-semibold tracking-tight">
                  {s.allClasses}
                </span>
                <span className="text-muted-foreground text-base">
                  {s.allClassesDescription}
                </span>
              </span>
            </Link>
          ) : null}
        </div>
      )}

      <EssentialsRow
        t={{
          settingsLabel: s.settingsLabel,
          switchToFullApp: s.switchToFullApp,
          signOut: t.auth.logout.button,
          languageToggle: t.auth.languageToggle,
        }}
        locale={locale}
      />
    </div>
  )
}
