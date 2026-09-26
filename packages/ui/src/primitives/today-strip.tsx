import { cn } from "../lib/utils"

import type { SimpleLinkRenderer } from "./link-renderer"

/** F-ID-10 §4.1 — one big tappable row that opens the job it names. */
export type TodayStripTodo = {
  key: string
  label: string
  href: string
}

export type TodayStripProps = {
  greeting: string
  dateLabel: string
  /** "Next: Class 7 – খ · Maths · 10:40" — absent until a timetable exists
   * (F-AC-05), not this Part; never rendered as an empty slot (§4.4/AC5). */
  nextPeriodLabel?: string
  todos: TodayStripTodo[]
  /** "Nothing waiting. Well done." when `todos` is empty. */
  allDoneLabel: string
  /** This package never depends on `next` — see `link-renderer.ts`. */
  renderLink: SimpleLinkRenderer
  className?: string
}

export function TodayStrip({
  greeting,
  dateLabel,
  nextPeriodLabel,
  todos,
  allDoneLabel,
  renderLink,
  className,
}: TodayStripProps) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div>
        {/* The basic shell's top bar owns the page's <h1> (a fixed brand
            wordmark, not a page title, in basic mode); this is the page's
            own heading, same "shell = h1, page = h2" rule every full-app
            page follows (e.g. dashboard-view.tsx). */}
        <h2 className="text-lg font-semibold tracking-tight">
          {greeting}{" "}
          <span className="text-muted-foreground">· {dateLabel}</span>
        </h2>
        {nextPeriodLabel ? (
          <p className="text-muted-foreground mt-1 text-base">
            {nextPeriodLabel}
          </p>
        ) : null}
      </div>

      {todos.length === 0 ? (
        <p className="text-muted-foreground text-base">{allDoneLabel}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {todos.map((todo) => (
            <li key={todo.key}>
              {renderLink({
                href: todo.href,
                className:
                  "border-border bg-muted/40 focus-visible:ring-ring flex min-h-14 w-full items-center rounded-lg border px-4 text-base font-medium transition-colors focus-visible:ring-2 focus-visible:outline-hidden active:opacity-90",
                children: todo.label,
              })}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
