"use client"

import { useEffect, useRef } from "react"

/**
 * The brand's texture from acadigma.com (`acadigma-website/src/components/site/cell-field.tsx`):
 * a field of rounded grid cells under a radial fade, with a darker field in a
 * soft spotlight that trails a mouse pointer, as on the website (D-411). On
 * touch, under reduced motion and before hydration it rests at the website's
 * spot (50% 30%); the SVG itself is server-rendered. Drawn as inline SVG patterns, not `data:` images,
 * so it adds no request in front of the first paint. Same geometry as the
 * website at its default 44px cell. One per page (the pattern ids are fixed).
 */
const CELL = 44
const GAP = Math.round(CELL * (32 / 152) * 1.6)
const SIZE = CELL + GAP
const RADIUS = Math.round(CELL * (24 / 152))

const LAYERS = [
  {
    id: "acadigma-cells",
    // The website's literal fills: #eeeeeb on paper, #121212 on ink.
    colour: "text-[#eeeeeb] dark:text-[#121212]",
    mask: "radial-gradient(ellipse 75% 60% at 70% 30%, black 10%, transparent 75%)",
  },
  {
    id: "acadigma-cells-lit",
    colour: "text-[#dcdcd7] dark:text-[#232323]",
    mask: "radial-gradient(circle 260px at var(--mx, 50%) var(--my, 30%), black 0%, transparent 100%)",
  },
] as const

export function CellField() {
  const ref = useRef<HTMLDivElement>(null)

  // The website's pointer spotlight (acadigma-website cell-field.tsx): the lit
  // field eases 12% of the way to the pointer each frame, then stops.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let raf = 0
    let tx = 50,
      ty = 30,
      x = 50,
      y = 30
    const tick = () => {
      x += (tx - x) * 0.12
      y += (ty - y) * 0.12
      el.style.setProperty("--mx", `${x}%`)
      el.style.setProperty("--my", `${y}%`)
      raf =
        Math.abs(tx - x) + Math.abs(ty - y) > 0.05
          ? requestAnimationFrame(tick)
          : 0
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      const r = el.getBoundingClientRect()
      tx = ((e.clientX - r.left) / r.width) * 100
      ty = ((e.clientY - r.top) / r.height) * 100
      if (!raf) raf = requestAnimationFrame(tick)
    }
    // On window: the field sits behind the content, which takes the events.
    window.addEventListener("pointermove", onMove, { passive: true })
    return () => {
      window.removeEventListener("pointermove", onMove)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10"
    >
      {LAYERS.map((l) => (
        <svg
          key={l.id}
          focusable="false"
          className={`absolute inset-0 size-full ${l.colour}`}
          style={{ maskImage: l.mask, WebkitMaskImage: l.mask }}
        >
          <defs>
            <pattern
              id={l.id}
              width={SIZE}
              height={SIZE}
              patternUnits="userSpaceOnUse"
            >
              <rect
                x={GAP / 2}
                y={GAP / 2}
                width={CELL}
                height={CELL}
                rx={RADIUS}
                fill="currentColor"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${l.id})`} />
        </svg>
      ))}
    </div>
  )
}
