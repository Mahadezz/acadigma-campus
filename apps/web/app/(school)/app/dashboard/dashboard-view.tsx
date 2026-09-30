import Link from "next/link"

import {
  BookOpenCheckIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleIcon,
  ClipboardCheckIcon,
  HistoryIcon,
  ListChecksIcon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react"

import { MEMBER_ROLES, type MemberRole } from "@acadigma/db/repositories"
import type { SetupStep } from "@acadigma/domain/dashboard"
import { buttonVariants } from "@acadigma/ui/components/button-variants"
import { Card, CardAction, CardHeader } from "@acadigma/ui/components/card"
import { Progress } from "@acadigma/ui/components/progress"
import { cn } from "@acadigma/ui/lib/utils"
import { CountUp } from "@acadigma/ui/primitives/count-up"
import { StatusChip } from "@acadigma/ui/primitives/status-chip"

import type { Messages } from "@/lib/i18n"

/**
 * The school dashboard (D-400), presentational only: `page.tsx` reads the
 * data and hands over finished values, so this renders the same for a test
 * fixture as for the live school. Owners and admins get the full "today"
 * view; teachers and office staff get the lighter one (no plan, no setup
 * checklist, no activity feed). Attendance and results are real empty slots
 * — the Parts that record them fill them; nothing here is a sample number.
 *
 * D-408 layout: every card is glass on the ambient mesh; one big number per
 * card; one primary action (open attendance) — in the thumb zone on a phone
 * (sticky above the tab bar), top-right on desktop.
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
  /** Today's register (F-AC-03, D-104): finished strings plus the counts
   * behind them, or null while no class has been marked today. */
  attendance?: {
    rate: string
    marked: string
    /** The rate alone, e.g. "94%". */
    percent: string
    done: number
    total: number
  } | null
  /** The screen's primary action; absent when the caller cannot take
   * attendance. */
  attendanceHref?: string
}

type ChecklistRow = Omit<SetupStep, "href"> & { href: string | null }

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""))

/** Card titles are real headings (h3 under the page's h2). */
const TITLE = "text-base leading-tight font-medium"

export function DashboardView(props: DashboardViewProps) {
  const { t, isManager } = props
  const primary = props.attendanceHref ? (
    <Link
      href={props.attendanceHref}
      className={cn(
        buttonVariants({ size: "lg" }),
        "h-12 rounded-2xl px-5 text-base shadow-[0_12px_28px_-12px_rgb(0_0_0/0.45)]"
      )}
    >
      <ClipboardCheckIcon className="size-5" aria-hidden="true" />
      {t.attendance.open}
    </Link>
  ) : null

  return (
    <div className="space-y-5 lg:space-y-6">
      <header className="flex items-end justify-between gap-4 pt-1">
        <div className="min-w-0">
          <h2 className="text-2xl leading-tight font-semibold tracking-tight lg:text-3xl">
            {props.schoolName}
          </h2>
          <div className="text-muted-foreground mt-1.5 text-sm leading-snug">
            <p>{props.dateLabel}</p>
            {props.subtitle ? <p>{props.subtitle}</p> : null}
          </div>
        </div>
        {primary ? (
          <div className="hidden shrink-0 lg:block">{primary}</div>
        ) : null}
      </header>

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
        <div className="space-y-4 lg:col-span-2 lg:space-y-5">
          <section aria-labelledby="dash-today" className="space-y-3">
            <h3 id="dash-today" className="sr-only">
              {t.sectionToday}
            </h3>
            <div className="grid gap-4 md:grid-cols-2 lg:gap-5">
              <AttendanceCard t={t} attendance={props.attendance ?? null} />
              <SlotCard
                title={t.results.title}
                icon={<BookOpenCheckIcon />}
                tone="info"
                emptyTitle={t.results.emptyTitle}
                emptyDescription={t.results.emptyDescription}
              />
            </div>
          </section>

          {isManager ? <Checklist t={t} steps={props.checklist} /> : null}
        </div>

        <div className="grid content-start items-start gap-4 md:grid-cols-2 lg:grid-cols-1 lg:gap-5">
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

      {primary ? (
        // Phone: the one primary action rides in the thumb zone, just above
        // the floating tab bar (AppShell leaves 6rem for it).
        <div className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-10 md:mx-auto md:max-w-[28rem] lg:hidden [&>a]:w-full">
          {primary}
        </div>
      ) : null}
    </div>
  )
}

const TONES = {
  success: "bg-success/15 text-success-ink",
  info: "bg-info/15 text-info-ink",
  warning: "bg-warning/20 text-warning-ink",
  neutral: "bg-foreground/[0.07] text-foreground",
} as const

/** A small tinted square holding a card's icon. */
function IconChip({
  tone,
  children,
}: {
  tone: keyof typeof TONES
  children: React.ReactNode
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-[1.125rem]",
        TONES[tone]
      )}
    >
      {children}
    </span>
  )
}

/** Icon chip + title row shared by every card. */
function CardTop({
  icon,
  tone,
  title,
  id,
  action,
}: {
  icon: React.ReactNode
  tone: keyof typeof TONES
  title: string
  id?: string
  action?: React.ReactNode
}) {
  return (
    <CardHeader className="flex items-center gap-3 px-5">
      <IconChip tone={tone}>{icon}</IconChip>
      <h3 id={id} className={cn(TITLE, "flex-1")}>
        {title}
      </h3>
      {action ? (
        <CardAction className="self-center">{action}</CardAction>
      ) : null}
    </CardHeader>
  )
}

function AttendanceCard({
  t,
  attendance,
}: {
  t: Messages["dashboard"]
  attendance: DashboardViewProps["attendance"] | null
}) {
  if (!attendance) {
    return (
      <SlotCard
        title={t.attendance.title}
        icon={<ClipboardCheckIcon />}
        tone="success"
        emptyTitle={t.attendance.emptyTitle}
        emptyDescription={t.attendance.emptyDescription}
      />
    )
  }
  return (
    <Card variant="glass" className="gap-4 py-5">
      <CardTop
        icon={<ClipboardCheckIcon />}
        tone="success"
        title={t.attendance.title}
      />
      <div className="space-y-3 px-5">
        <p className="leading-none">
          <span className="sr-only">{attendance.rate}</span>
          <span
            aria-hidden="true"
            className="text-4xl font-semibold tracking-tight tabular-nums"
          >
            <CountUp text={attendance.percent} />
          </span>
        </p>
        <Progress
          value={
            attendance.total ? (attendance.done / attendance.total) * 100 : 0
          }
          aria-label={attendance.marked}
          className="bg-success/15 h-1.5 [&>[data-slot=progress-indicator]]:bg-success"
        />
        <p className="text-muted-foreground text-sm tabular-nums">
          {attendance.marked}
        </p>
      </div>
    </Card>
  )
}

function SlotCard(props: {
  title: string
  icon: React.ReactNode
  tone: keyof typeof TONES
  emptyTitle: string
  emptyDescription: string
}) {
  return (
    <Card variant="glass" className="gap-4 py-5">
      <CardTop icon={props.icon} tone={props.tone} title={props.title} />
      <div className="space-y-1 px-5">
        <p className="text-lg leading-snug font-semibold">{props.emptyTitle}</p>
        <p className="text-muted-foreground text-sm">
          {props.emptyDescription}
        </p>
      </div>
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
  const progress = fill(t.checklist.progress, { done, total: steps.length })
  return (
    <section aria-labelledby="dash-setup">
      <Card variant="glass" className="gap-4 py-5">
        <CardTop
          icon={<ListChecksIcon />}
          tone="neutral"
          title={t.checklist.title}
          id="dash-setup"
        />
        <div className="space-y-2 px-5">
          <Progress
            value={(done / steps.length) * 100}
            aria-label={progress}
            className="bg-foreground/10 h-1.5"
          />
          <p className="text-muted-foreground text-sm tabular-nums">
            {progress}
          </p>
        </div>
        <ul className="divide-foreground/[0.08] divide-y px-2">
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
                      ? "text-muted-foreground flex-1 text-sm line-through decoration-1"
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
                    className="hover:bg-foreground/[0.05] focus-visible:ring-ring flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 transition-colors focus-visible:ring-2 focus-visible:outline-none active:scale-[0.99]"
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
    <Card variant="glass" className="gap-3 py-5">
      <CardTop
        icon={<SparklesIcon />}
        tone="warning"
        title={t.plan.title}
        action={
          <StatusChip tone={plan.readOnly ? "negative" : "positive"}>
            {plan.readOnly ? t.plan.readOnly : t.plan.active}
          </StatusChip>
        }
      />
      <div className="space-y-0.5 px-5">
        <p className="text-2xl leading-tight font-semibold tracking-tight capitalize">
          {plan.label}
        </p>
        {plan.trial ? (
          <p className="text-muted-foreground text-sm tabular-nums">
            {plan.trial}
          </p>
        ) : null}
      </div>
    </Card>
  )
}

function PeopleCard({
  t,
  membersByRole,
  staffRecordCount,
}: {
  t: Messages["dashboard"]
  membersByRole: Record<MemberRole, number>
  staffRecordCount: number
}) {
  const total = MEMBER_ROLES.reduce((sum, r) => sum + membersByRole[r], 0)
  return (
    <section aria-labelledby="dash-people">
      <Card variant="glass" className="gap-4 py-5">
        <CardTop
          icon={<UsersIcon />}
          tone="neutral"
          title={t.people.title}
          id="dash-people"
          action={
            <span className="text-muted-foreground text-sm tabular-nums">
              {fill(t.people.total, { count: total })}
            </span>
          }
        />
        <dl className="grid grid-cols-2 gap-2 px-5">
          {MEMBER_ROLES.map((role) => (
            <div
              key={role}
              className="bg-foreground/[0.04] flex flex-col-reverse rounded-xl px-3 py-2.5"
            >
              <dt className="text-muted-foreground text-xs">
                {t.people.roles[role]}
              </dt>
              <dd className="text-xl leading-tight font-semibold tabular-nums">
                {membersByRole[role]}
              </dd>
            </div>
          ))}
        </dl>
        <div className="border-foreground/[0.08] mx-5 border-t pt-3 text-sm">
          <p className="font-medium">{t.staff.title}</p>
          <p className="text-muted-foreground tabular-nums">
            {staffRecordCount > 0
              ? fill(t.staff.count, { count: staffRecordCount })
              : t.staff.empty}
          </p>
        </div>
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
      <Card variant="glass" className="gap-3 py-5">
        <CardTop
          icon={<HistoryIcon />}
          tone="neutral"
          title={t.activity.title}
          id="dash-activity"
        />
        <div className="space-y-2 px-5">
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t.activity.empty}</p>
          ) : (
            <ol className="space-y-3">
              {items.map((item) => (
                <li key={item.id} className="text-sm">
                  <p className="line-clamp-2">{item.sentence}</p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {item.when}
                  </p>
                </li>
              ))}
            </ol>
          )}
          <Link
            href="/app/audit"
            className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center gap-1 text-sm font-medium transition-colors"
          >
            {t.activity.viewAll}
            <ChevronRightIcon className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </Card>
    </section>
  )
}
