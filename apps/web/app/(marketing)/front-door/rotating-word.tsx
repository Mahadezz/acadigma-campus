"use client"

import { useEffect, useState } from "react"

import { cn } from "@acadigma/ui/lib/utils"

/**
 * The hero's rotating device word (D-411, acadigma.com's `FlipWords`, in
 * CSS). `template` holds `{device}`; every word is stacked in one grid cell
 * with the text after it, so the line keeps the widest word's width and
 * nothing moves when the word changes (no layout shift). The server renders
 * the first word; screen readers read that one stable sentence. No cycling
 * under reduced motion.
 */
export function RotatingWord({
  template,
  words,
}: {
  template: string
  words: readonly string[]
}) {
  const [before = "", after = ""] = template.split("{device}")
  const [index, setIndex] = useState(0)
  const [cycled, setCycled] = useState(false)

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const id = setInterval(() => {
      setCycled(true)
      setIndex((i) => (i + 1) % words.length)
    }, 2600)
    return () => clearInterval(id)
  }, [words.length])

  return (
    <>
      <span className="sr-only">{`${before}${words[0]}${after}`}</span>
      <span aria-hidden="true">
        {before}
        <span className="inline-grid">
          {words.map((word, i) => (
            <span
              key={word}
              className={cn(
                "[grid-area:1/1] whitespace-nowrap",
                i !== index && "invisible",
                i === index && cycled && "motion-word-in"
              )}
            >
              {word}
              {after}
            </span>
          ))}
        </span>
      </span>
    </>
  )
}
