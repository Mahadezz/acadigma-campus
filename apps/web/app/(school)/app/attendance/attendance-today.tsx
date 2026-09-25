"use client"

// A client module only so the shared ui components tree-shake (a server
// component importing them ships the whole radix-ui barrel, D-103).

import Link from "next/link"

import { ClipboardCheckIcon } from "lucide-react"

import type { AttendanceDay, AttendanceDaySection } from "@acadigma/contracts"
import { DEFAULT_TIMEZONE } from "@acadigma/domain"
import {
  schoolDayRate,
  type AttendanceWeightsPolicy,
} from "@acadigma/domain/attendance"
import { Badge } from "@acadigma/ui/components/badge"
import { Button } from "@acadigma/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@acadigma/ui/components/card"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"
import { BnEnText } from "@acadigma/ui/primitives/bn-en-text"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"

import { fill, sectionLabel } from "./format"

type T = Messages["attendance"]

function timeLabel(locale: Locale, iso: string): string {
  return new Intl.DateTimeFormat(
    locale === "bn" ? "bn-BD-u-nu-latn" : "en-GB",
    {
      hour: "numeric",
      minute: "2-digit",
      timeZone: DEFAULT_TIMEZONE,
    }
  ).format(new Date(iso))
}

function countsLabel(t: T, c: NonNullable<AttendanceDaySection["session"]>) {
  return fill(t.today.counts, {
    present: c.present,
    absent: c.absent,
    late: c.late,
  })
}

export function AttendanceToday({
  t,
  locale,
  day,
  dateLabel,
  policy,
  canMark,
}: {
  t: T
  locale: Locale
  day: AttendanceDay
  dateLabel: string
  policy: AttendanceWeightsPolicy
  canMark: boolean
}) {
  const marked = day.sections.filter((s) => s.session)
  const rate = schoolDayRate(
    marked.map((s) => s.session!),
    policy
  )
  const mine = day.sections.filter((s) => s.isMine)

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="space-y-1">
        <p className="eyebrow">{dateLabel}</p>
        <h1 className="text-xl font-bold tracking-tight">{t.today.heading}</h1>
        {day.sections.length > 0 ? (
          <p className="text-muted-foreground text-sm tabular-nums">
            {fill(t.today.marked, {
              done: marked.length,
              total: day.sections.length,
            })}
            {" · "}
            {rate === null ? t.today.noRate : fill(t.today.rate, { rate })}
          </p>
        ) : null}
      </header>

      {!day.isSchoolDay ? (
        <InlineAlert tone="info">{t.today.notSchoolDay}</InlineAlert>
      ) : null}

      {mine.length > 0 ? (
        <section aria-labelledby="att-mine" className="space-y-3">
          <h2 id="att-mine" className="eyebrow">
            {t.today.yourClass}
          </h2>
          {mine.map((s) => (
            <Card key={s.sectionId} className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle>
                  <h3 className="text-base">{sectionLabel(locale, s)}</h3>
                </CardTitle>
                <p className="text-muted-foreground text-sm tabular-nums">
                  {s.session
                    ? countsLabel(t, s.session)
                    : fill(t.today.enrolled, { count: s.enrolled })}
                </p>
              </CardHeader>
              <CardContent className="px-4">
                <Button asChild className="h-14 w-full text-base">
                  <Link href={`/app/attendance/${s.sectionId}`}>
                    <ClipboardCheckIcon aria-hidden="true" />
                    {s.session ? t.today.open : t.today.take}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      <section aria-labelledby="att-all" className="space-y-2">
        <h2 id="att-all" className="eyebrow">
          {t.today.allClasses}
        </h2>
        {day.sections.length === 0 ? (
          <EmptyState title={t.today.noSections} />
        ) : (
          <ul className="divide-border divide-y border-y">
            {day.sections.map((s) => (
              <SectionRow
                key={s.sectionId}
                t={t}
                locale={locale}
                s={s}
                canTake={canMark}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function SectionRow({
  t,
  locale,
  s,
  canTake,
}: {
  t: T
  locale: Locale
  s: AttendanceDaySection
  canTake: boolean
}) {
  const label = sectionLabel(locale, s)
  return (
    <li className="flex min-h-16 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-medium">
          <BnEnText text={label} />
          <Badge variant={s.session ? "secondary" : "outline"}>
            {s.session ? t.today.taken : t.today.notTaken}
          </Badge>
        </p>
        <p className="text-muted-foreground truncate text-xs tabular-nums">
          <BnEnText
            text={
              s.session
                ? [
                    countsLabel(t, s.session),
                    s.session.takenByName
                      ? fill(t.today.takenBy, {
                          name: s.session.takenByName,
                          time: timeLabel(locale, s.session.takenAt),
                        })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : [
                    s.classTeacherName
                      ? fill(t.today.classTeacher, { name: s.classTeacherName })
                      : t.today.noClassTeacher,
                    fill(t.today.enrolled, { count: s.enrolled }),
                  ].join(" · ")
            }
          />
        </p>
      </div>
      <Button
        asChild
        variant={canTake && !s.session ? "default" : "outline"}
        className="h-11"
      >
        <Link
          href={`/app/attendance/${s.sectionId}`}
          aria-label={`${canTake && !s.session ? t.today.take : t.today.view} — ${label}`}
        >
          {canTake && !s.session ? t.today.take : t.today.view}
        </Link>
      </Button>
    </li>
  )
}
