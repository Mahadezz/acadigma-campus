"use client"

import * as React from "react"

import { useGSAP } from "@gsap/react"
import { gsap } from "gsap"

// Core + the React hook only (D-408): no plugins, so this adds GSAP's core
// and nothing else, to the one route that uses it.
gsap.registerPlugin(useGSAP)

/**
 * A formatted number that counts up from zero once, on mount (D-408, the
 * dashboard's hero number). `text` is the finished string ("94%", "92.5%");
 * the number inside it is animated and the rest kept as is, so formatting
 * stays the server's job. The server HTML already holds the final value —
 * nothing is hidden without JS — and under `prefers-reduced-motion` it
 * simply stays put. Short (0.6s) and one-shot: it is a greeting, not a loop.
 * Text it cannot parse is shown unanimated.
 */
export function CountUp({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  const ref = React.useRef<HTMLSpanElement>(null)

  useGSAP(
    () => {
      const match = /^(\D*)(\d+(?:\.(\d+))?)(.*)$/.exec(text)
      const el = ref.current
      if (!match || !el) return
      const [, prefix, number, fraction = "", suffix] = match
      const target = Number(number)
      const mm = gsap.matchMedia()
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const state = { value: 0 }
        gsap.to(state, {
          value: target,
          duration: 0.6,
          ease: "power2.out",
          onUpdate: () => {
            el.textContent = `${prefix}${state.value.toFixed(fraction.length)}${suffix}`
          },
          onComplete: () => {
            el.textContent = text
          },
        })
        return () => {
          el.textContent = text
        }
      })
      return () => mm.revert()
    },
    { dependencies: [text], scope: ref }
  )

  return (
    <span ref={ref} className={className}>
      {text}
    </span>
  )
}
