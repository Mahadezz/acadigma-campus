import Link from "next/link"

import {
  BookOpenCheckIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleIcon,
  ClipboardCheckIcon,
} from "lucide-react"

import type { MemberRole } from "@acadigma/db/repositories"
import type { SetupStep } from "@acadigma/domain/dashboard"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@acadigma/ui/components/card"
import { Progress } from "@acadigma/ui/components/progress"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"
import { StatusChip } from "@acadigma/ui/primitives/status-chip"

import type { Messages } from "@/lib/i18n"

/**
 * The school dashboard (D-400), presentational only: `page.tsx` reads the
 * data and hands over finished values, so this renders the same for a test
 * fixture as for the live school. Owners and admins get the full "today"
 * view; teachers and office staff get the lighter one (no plan, no setup
 * checklist, no activity feed). Attendance and results are real empty slots
 * — the Parts that record them fill them; nothing here is a sample number.
 */
export type DashboardViewProps = {
  t: Messages["dashboard"]
  dateLabel: string
  schoolName: string
  subtitle: string | null
  isManager: boolean
  plan: { label: string; trial: string | null; readOnly: boolean }
  membersByRole: Record<MemberRole, number>
  staffRecordCount: number
  /** `href` is null while the step's page does not exist yet. */
  checklist: ChecklistRow[]
  /** null when the caller may not read the audit trail. */
  activity: { id: string; sentence: string; when: string }[] | null
}

type ChecklistRow = Omit<SetupStep, "href"> & { href: string | null }

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""))

export function DashboardView(props: DashboardViewProps) {
  const { t, isManager } = props
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">{props.dateLabel}</p>
        <h2 className="text-2xl font-medium tracking-tight">
          {props.schoolName}
        </h2>
        {props.subtitle ? (
          <p className="text-muted-foreground text-sm">{props.subtitle}</p>
        ) : null}
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section aria-labelledby="dash-today" className="space-y-3">
            <p id="dash-today" className="eyebrow">
              {t.eyebrowToday}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <SlotCard
                title={t.attendance.title}
                icon={<ClipboardCheckIcon />}
                emptyTitle={t.attendance.emptyTitle}
                emptyDescription={t.attendance.emptyDescription}
              />
              <SlotCard
                title={t.results.title}
                icon={<BookOpenCheckIcon />}
                emptyTitle={t.results.emptyTitle}
                emptyDescription={t.results.emptyDescription}
              />
            </div>
          </section>

          {isManager ? <Checklist t={t} steps={props.checklist} /> : null}
        </div>

        <div className="space-y-4">
          {isManager ? <PlanCard t={t} plan={props.plan} /> : null}
          <PeopleCard
            t={t}
            membersByRole={props.membersByRole}
            staffRecordCount={props.staffRecordCount}
          />
          {props.activity ? (
            <ActivityCard t={t} items={props.activity} />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function SlotCard(props: {
  title: string
  icon: React.ReactNode
  emptyTitle: string
  emptyDescription: string
}) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="pt-5">
        <CardTitle className="text-base">{props.title}</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <EmptyState
          icon={props.icon}
          title={props.emptyTitle}
          description={props.emptyDescription}
          className="py-8"
        />
      </CardContent>
    </Card>
  )
}

function Checklist({
  t,
  steps,
}: {
  t: Messages["dashboard"]
  steps: ChecklistRow[]
}) {
  const done = steps.filter((s) => s.done).length
  if (done === steps.length) return null
  return (
    <section aria-labelledby="dash-setup">
      <Card>
        <CardHeader>
          <p className="eyebrow">{t.eyebrowSetup}</p>
          <CardTitle id="dash-setup" className="text-lg">
            {t.checklist.title}
          </CardTitle>
          <CardDescription className="tabular">
            {fill(t.checklist.progress, { done, total: steps.length })}
          </CardDescription>
          <Progress
            value={(done / steps.length) * 100}
            aria-label={fill(t.checklist.progress, {
              done,
              total: steps.length,
            })}
            className="mt-2"
          />
        </CardHeader>
        <CardContent className="px-2 sm:px-3">
          <ul className="divide-y">
            {steps.map((step) => {
              const row = (
                <>
                  {step.done ? (
                    <CheckCircle2Icon
                      className="text-success size-5 shrink-0"
                      aria-hidden="true"
                    />
                  ) : (
                    <CircleIcon
                      className="text-muted-foreground size-5 shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={
                      step.done
                        ? "text-muted-foreground flex-1 text-sm"
                        : "flex-1 text-sm font-medium"
                    }
                  >
                    {t.checklist.steps[step.key]}
                    <span className="sr-only">{`, ${step.done ? t.checklist.done : t.checklist.todo}`}</span>
                  </span>
                </>
              )
              return (
                <li key={step.key}>
                  {step.href ? (
                    <Link
                      href={step.href}
                      className="hover:bg-muted/60 focus-visible:ring-ring flex min-h-12 items-center gap-3 rounded-md px-3 py-2 focus-visible:ring-2 focus-visible:outline-none"
                    >
                      {row}
                      <ChevronRightIcon
                        className="text-muted-foreground size-4 shrink-0"
                        aria-hidden="true"
                      />
                    </Link>
                  ) : (
                    // The page for this step ships with a later Part; no link
                    // until it exists, so nothing here can 404.
                    <div className="flex min-h-12 items-center gap-3 px-3 py-2">
                      {row}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>
    </section>
  )
}

function PlanCard({
  t,
  plan,
}: {
  t: Messages["dashboard"]
  plan: DashboardViewProps["plan"]
}) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="text-base">{t.plan.title}</CardTitle>
        <CardAction>
          <StatusChip tone={plan.readOnly ? "negative" : "positive"}>
            {plan.readOnly ? t.plan.readOnly : t.plan.active}
          </StatusChip>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-2xl font-medium tracking-tight capitalize">
          {plan.label}
        </p>
        {plan.trial ? (
          <p className="text-muted-foreground tabular text-sm">{plan.trial}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

const ROLE_ORDER: MemberRole[] = [
  "owner",
  "admin",
  "teacher",
  "staff",
  "parent",
]

function PeopleCard({
  t,
  membersByRole,
  staffRecordCount,
}: {
  t: Messages["dashboard"]
  membersByRole: Record<MemberRole, number>
  staffRecordCount: number
}) {
  const total = ROLE_ORDER.reduce((sum, r) => sum + membersByRole[r], 0)
  return (
    <section aria-labelledby="dash-people">
      <Card className="gap-4">
        <CardHeader>
          <p className="eyebrow">{t.eyebrowPeople}</p>
          <CardTitle id="dash-people" className="text-base">
            {t.people.title}
          </CardTitle>
          <CardAction>
            <span className="text-muted-foreground tabular text-sm">
              {fill(t.people.total, { count: total })}
            </span>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {ROLE_ORDER.map((role) => (
              <div key={role} className="flex items-baseline justify-between">
                <dt className="text-muted-foreground">
                  {t.people.roles[role]}
                </dt>
                <dd className="tabular font-medium">{membersByRole[role]}</dd>
              </div>
            ))}
          </dl>
          <div className="border-t pt-3 text-sm">
            <p className="font-medium">{t.staff.title}</p>
            <p className="text-muted-foreground tabular">
              {staffRecordCount > 0
                ? fill(t.staff.count, { count: staffRecordCount })
                : t.staff.empty}
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}

function ActivityCard({
  t,
  items,
}: {
  t: Messages["dashboard"]
  items: NonNullable<DashboardViewProps["activity"]>
}) {
  return (
    <section aria-labelledby="dash-activity">
      <Card className="gap-4">
        <CardHeader>
          <p className="eyebrow">{t.eyebrowActivity}</p>
          <CardTitle id="dash-activity" className="text-base">
            {t.activity.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t.activity.empty}</p>
          ) : (
            <ol className="space-y-3">
              {items.map((item) => (
                <li key={item.id} className="text-sm">
                  <p className="line-clamp-2">{item.sentence}</p>
                  <p className="text-muted-foreground tabular text-xs">
                    {item.when}
                  </p>
                </li>
              ))}
            </ol>
          )}
          <Link
            href="/app/audit"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
          >
            {t.activity.viewAll}
            <ChevronRightIcon className="size-4" aria-hidden="true" />
          </Link>
        </CardContent>
      </Card>
    </section>
  )
}
