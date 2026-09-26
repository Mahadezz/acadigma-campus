"use client"

// A client module only so the shared ui components tree-shake: imported
// from a server component, their `radix-ui` barrel ships whole (+40 kB).
import Link from "next/link"

import { ArrowLeftIcon, LockIcon, PhoneIcon } from "lucide-react"

import type {
  GuardianLink,
  RosterStudent,
  StudentPrivate,
} from "@acadigma/contracts"
import { formatIsoDate } from "@acadigma/domain"
import { ageOn } from "@acadigma/domain/academic"
import { Badge } from "@acadigma/ui/components/badge"
import { Button } from "@acadigma/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@acadigma/ui/components/card"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"

import { classLabel } from "../format"

import { GuardianAccess } from "./guardian-access"

/**
 * F-AC-02 §6 "Student profile" (D-103). `details` is null when RLS hid the
 * private block: the guardians card then shows a locked note, and the date
 * of birth is simply absent (acceptance criterion 7).
 */
export function StudentProfile({
  t,
  locale,
  student: s,
  details,
  privateError,
  today,
  links = null,
}: {
  t: Messages["students"]
  locale: Locale
  student: RosterStudent
  details: StudentPrivate | null
  privateError: boolean
  today: string
  /** Owner/admin only (F-AC-02 Part 4, D-108); null hides parent access. */
  links?: GuardianLink[] | null
}) {
  const primaryName =
    locale === "bn" && s.fullNameBn ? s.fullNameBn : s.fullName
  const secondaryName = primaryName === s.fullName ? s.fullNameBn : s.fullName
  const dateLocale = locale === "bn" ? "bn-BD-u-nu-latn" : "en-GB"

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button asChild variant="ghost" className="h-11 px-2">
        <Link href="/app/students">
          <ArrowLeftIcon aria-hidden="true" />
          {t.profile.back}
        </Link>
      </Button>

      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight">{primaryName}</h1>
        {secondaryName ? (
          <p className="text-muted-foreground">{secondaryName}</p>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          <Badge variant="secondary">{classLabel(t, locale, s)}</Badge>
          {s.rollNumber !== null ? (
            <Badge variant="outline" className="tabular-nums">
              {t.profile.roll} {s.rollNumber}
            </Badge>
          ) : null}
          <Badge variant="outline" className="tabular-nums">
            {s.studentCode}
          </Badge>
        </div>
      </div>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle>
            <h2 className="text-base">{t.profile.details}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">
                {t.profile.studentId}
              </dt>
              <dd className="tabular-nums">{s.studentCode}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">
                {t.profile.gender}
              </dt>
              <dd>{t.gender[s.gender]}</dd>
            </div>
            {details ? (
              <div className="col-span-2">
                <dt className="text-muted-foreground text-xs">
                  {t.profile.dateOfBirth}
                </dt>
                <dd className="tabular-nums">
                  {formatIsoDate(details.dateOfBirth, dateLocale)}
                  {" · "}
                  {(() => {
                    const age = ageOn(details.dateOfBirth, today)
                    return t.profile.age
                      .replace("{years}", String(age.years))
                      .replace("{months}", String(age.months))
                  })()}
                </dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle>
            <h2 className="text-base">{t.profile.guardians}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          {privateError ? (
            <InlineAlert tone="error">{t.errors.generic}</InlineAlert>
          ) : !details ? (
            <p className="text-muted-foreground flex items-start gap-2 text-sm">
              <LockIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {t.profile.locked}
            </p>
          ) : details.guardians.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t.profile.noGuardians}
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {details.guardians.map((g) => {
                const name =
                  locale === "bn" && g.fullNameBn ? g.fullNameBn : g.fullName
                return (
                  <li
                    key={g.id}
                    className="flex min-h-14 items-center justify-between gap-2 py-2"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {name}{" "}
                        {g.isPrimary ? (
                          <Badge variant="secondary">{t.profile.primary}</Badge>
                        ) : null}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {t.relation[g.relation]} ·{" "}
                        <span className="tabular-nums">
                          {g.phone.replace(/^\+88/, "")}
                        </span>
                      </p>
                    </div>
                    <Button
                      asChild
                      variant="outline"
                      className="size-11 shrink-0"
                    >
                      <a
                        href={`tel:${g.phone}`}
                        aria-label={t.profile.call.replace("{name}", name)}
                      >
                        <PhoneIcon aria-hidden="true" />
                      </a>
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
          {details && links ? (
            <GuardianAccess
              t={t.access}
              locale={locale}
              studentName={primaryName}
              guardians={details.guardians}
              links={links}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
