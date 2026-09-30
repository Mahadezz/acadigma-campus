/**
 * The brand's texture from acadigma.com (`acadigma-website/src/components/site/cell-field.tsx`):
 * a field of rounded grid cells under a radial fade, with a darker field in a
 * soft spotlight. The website moves the spotlight with the pointer; here it
 * stays at the website's resting spot (50% 30%), so this is static and
 * server-rendered (D-410). Drawn as inline SVG patterns, not `data:` images,
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
    mask: "radial-gradient(circle 260px at 50% 30%, black 0%, transparent 100%)",
  },
] as const

export function CellField() {
  return (
    <div
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
