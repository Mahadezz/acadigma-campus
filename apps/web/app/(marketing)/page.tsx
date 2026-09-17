import Link from "next/link"

import {
  CalendarCheckIcon,
  MessagesSquareIcon,
  ReceiptTextIcon,
} from "lucide-react"

import { Button } from "@acadigma/ui/components/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@acadigma/ui/components/card"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Acadigma Campus — school operations, built for the phone",
  description:
    "Attendance, timetables, marks, billing and messaging for Bangladeshi schools. Works on the phone in a teacher's hand.",
}

const FEATURES = [
  {
    icon: CalendarCheckIcon,
    title: "Attendance in seconds",
    body: "Roll call on a phone, even on a weak connection. Saves are queued and replayed, never duplicated.",
  },
  {
    icon: ReceiptTextIcon,
    title: "Fees that add up",
    body: "Invoices, receipts and online payment through bKash, Nagad, Rocket and cards, computed on the server.",
  },
  {
    icon: MessagesSquareIcon,
    title: "One thread per family",
    body: "Notices, results and reminders reach guardians where they already are, with a record of who saw what.",
  },
] as const

export default function HomePage() {
  return (
    <main
      id="main"
      className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 lg:py-20"
    >
      <section className="mx-auto max-w-2xl text-center">
        <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Acadigma Campus
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
          Run your school from the phone in your hand
        </h1>
        <p className="text-muted-foreground mt-4 text-base text-pretty sm:text-lg">
          Attendance, timetables, marks, fees and messaging in one place —
          designed for Bangladeshi schools and the networks they actually have.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="#features">What you get</a>
          </Button>
        </div>
      </section>

      <section
        id="features"
        aria-label="What Acadigma Campus does"
        className="mt-16 grid gap-4 scroll-mt-8 sm:grid-cols-2 lg:mt-24 lg:grid-cols-3"
      >
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <Card key={title}>
            <CardHeader>
              <Icon
                className="text-muted-foreground size-5"
                aria-hidden="true"
              />
              <CardTitle className="mt-2">{title}</CardTitle>
              <CardDescription>{body}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>
    </main>
  )
}
