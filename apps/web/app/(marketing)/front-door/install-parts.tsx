import Link from "next/link"

import { ArrowRightIcon } from "lucide-react"

import { buttonVariants } from "@acadigma/ui/components/button-variants"
import { cn } from "@acadigma/ui/lib/utils"

export const PILL = "h-13 rounded-full px-6 text-[15px]"

/** The chooser's one filled action (Von Restorff). */
export function OpenCampusLink({ label }: { label: string }) {
  return (
    <Link href="/login" className={cn(buttonVariants({ size: "lg" }), PILL)}>
      {label}
      <ArrowRightIcon aria-hidden="true" />
    </Link>
  )
}

/** One device's install steps; the numbers are a real sequence. */
export function InstallSteps({ steps }: { steps: readonly string[] }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-3">
      {steps.map((step, i) => (
        <li
          key={step}
          className="flex gap-4 rounded-2xl bg-card p-5 shadow-flat sm:flex-col sm:gap-6"
        >
          <span
            aria-hidden="true"
            className="font-mono text-xs text-muted-foreground tabular-nums"
          >
            0{i + 1}
          </span>
          <span className="text-[15px] leading-relaxed">{step}</span>
        </li>
      ))}
    </ol>
  )
}
