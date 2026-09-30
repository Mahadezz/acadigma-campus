/**
 * The brand's texture from acadigma.com (`acadigma-website/src/components/site/cell-field.tsx`):
 * a field of rounded grid cells, faded out by a radial mask. Static here: the
 * website's pointer spotlight is dropped (D-410). Drawn as an inline SVG
 * pattern, not a `data:` background image, so it adds no request for
 * Lighthouse to put in front of the first paint. Same geometry as the
 * website at its default 44px cell; one per page (the pattern id is fixed).
 */
const CELL = 44
const GAP = Math.round(CELL * (32 / 152) * 1.6)
const SIZE = CELL + GAP
const RADIUS = Math.round(CELL * (24 / 152))

const MASK =
  "radial-gradient(ellipse 75% 60% at 70% 30%, black 10%, transparent 75%)"

export function CellField() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      // The website's two literal fills: #eeeeeb on paper, #121212 on ink.
      className="pointer-events-none absolute inset-0 -z-10 size-full text-[#eeeeeb] dark:text-[#121212]"
      style={{ maskImage: MASK, WebkitMaskImage: MASK }}
    >
      <defs>
        <pattern
          id="acadigma-cells"
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
      <rect width="100%" height="100%" fill="url(#acadigma-cells)" />
    </svg>
  )
}
