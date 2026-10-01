"use client"

import { useEffect } from "react"

/**
 * Drives `.motion-reveal` (recipes.css §10, D-411): after hydration, every
 * `.motion-reveal` still entirely below the fold is marked pending (hidden,
 * off screen, so no flash) and shown once when it scrolls in. Anything
 * already on screen is left alone. Nothing happens under reduced motion or
 * without IntersectionObserver; the page is fully visible either way.
 */
export function RevealOnScroll() {
  useEffect(() => {
    if (
      !("IntersectionObserver" in window) ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          ;(e.target as HTMLElement).dataset.reveal = "shown"
          io.unobserve(e.target)
        }
      },
      { rootMargin: "0px 0px -12% 0px" }
    )
    for (const el of document.querySelectorAll<HTMLElement>(".motion-reveal")) {
      if (el.getBoundingClientRect().top < innerHeight) continue
      el.dataset.reveal = "pending"
      io.observe(el)
    }
    return () => io.disconnect()
  }, [])
  return null
}
