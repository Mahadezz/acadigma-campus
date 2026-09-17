"use client"

import { useEffect, useState } from "react"

import { useGSAP } from "@gsap/react"
import { gsap } from "gsap"
import { CustomBounce } from "gsap/CustomBounce"
import { CustomEase } from "gsap/CustomEase"
import { CustomWiggle } from "gsap/CustomWiggle"
import { Draggable } from "gsap/Draggable"
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin"
import { ExpoScaleEase, RoughEase, SlowMo } from "gsap/EasePack"
import { Flip } from "gsap/Flip"
import { MotionPathPlugin } from "gsap/MotionPathPlugin"
import { Observer } from "gsap/Observer"
import { ScrollToPlugin } from "gsap/ScrollToPlugin"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { SplitText } from "gsap/SplitText"
import { TextPlugin } from "gsap/TextPlugin"

import { DURATION, EASE } from "./motion"

/**
 * GSAP setup for Acadigma.
 *
 * **Client only.** GSAP touches `window` and `document` at import time, so this
 * module must never be reached from a Server Component — import it from a file that
 * carries `"use client"`, or from inside `useGSAP`.
 *
 * Registration is explicit rather than a side effect of importing, so a route that
 * does not animate ships none of this. Call `registerGsap()` once, at the top of the
 * client component that needs it.
 *
 * Deliberately **not** registered: PixiPlugin and EaselPlugin (canvas libraries we do
 * not use), Physics2D/PhysicsProps and MorphSVG (payload we cannot justify), and
 * ScrollSmoother — smooth scrolling hijacks the native scroller, which on a phone
 * costs the thing a teacher does most.
 */

let registered = false

export function registerGsap(): typeof gsap {
  if (registered) return gsap
  registered = true

  gsap.registerPlugin(
    useGSAP,
    ScrollTrigger,
    Flip,
    Observer,
    Draggable,
    SplitText,
    TextPlugin,
    ScrollToPlugin,
    MotionPathPlugin,
    DrawSVGPlugin,
    CustomEase,
    CustomBounce,
    CustomWiggle,
    RoughEase,
    ExpoScaleEase,
    SlowMo
  )

  // The design system's curves, available by name to every tween.
  for (const [name, points] of Object.entries(EASE)) {
    CustomEase.create(
      `acadigma-${name}`,
      `M0,0 C${points.split(", ").join(",")} 1,1`
    )
  }

  // An un-tuned tween defaults to the design system's base motion, not GSAP's.
  gsap.defaults({ duration: DURATION.base, ease: "power2.out" })

  // Development-only tooling. Both are inspectors: useful while building a
  // sequence, dead weight in a production bundle.
  if (process.env.NODE_ENV !== "production") {
    void Promise.all([
      import("gsap/GSDevTools"),
      import("gsap/MotionPathHelper"),
    ]).then(([devTools, motionPathHelper]) => {
      gsap.registerPlugin(
        devTools.GSDevTools,
        motionPathHelper.MotionPathHelper
      )
    })
  }

  return gsap
}

/**
 * True when the viewer has asked their system for less motion.
 *
 * Honouring this is not optional: for some people animation is nausea, not delight.
 * `tokens.css` already collapses every *CSS* transition through the `--motion`
 * multiplier; GSAP runs in JavaScript and cannot see it, so a tween has to check.
 *
 * Returns false during SSR and on the first client render, then corrects after
 * mount — so never gate content on it, only motion.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const onChange = () => setReduced(query.matches)
    onChange()
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])

  return reduced
}

export { gsap, useGSAP }
export { DURATION, DURATION_MS, EASE, cubicBezier } from "./motion"
export type { DurationToken, EaseToken } from "./motion"
