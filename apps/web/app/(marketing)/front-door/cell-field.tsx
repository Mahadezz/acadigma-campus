/**
 * The brand's texture from acadigma.com (`acadigma-website/src/components/site/cell-field.tsx`):
 * a field of rounded grid cells, faded out by a radial mask. Static here: the
 * website's pointer spotlight is dropped (D-410), so this is pure CSS and
 * renders on the server. Same geometry as the website at its default 44px cell.
 */
const CELL = 44
const GAP = Math.round(CELL * (32 / 152) * 1.6)
const SIZE = CELL + GAP
const RADIUS = Math.round(CELL * (24 / 152))

const tile = (fill: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${SIZE}' height='${SIZE}'><rect x='${GAP / 2}' y='${GAP / 2}' width='${CELL}' height='${CELL}' rx='${RADIUS}' fill='${fill}'/></svg>`
  )}")`

const MASK =
  "radial-gradient(ellipse 75% 60% at 70% 30%, black 10%, transparent 75%)"

const layer = (fill: string) => ({
  backgroundImage: tile(fill),
  backgroundSize: `${SIZE}px ${SIZE}px`,
  backgroundPosition: "center top",
  maskImage: MASK,
  WebkitMaskImage: MASK,
})

export function CellField() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10"
    >
      {/* The website's two literal fills: #eeeeeb on paper, #121212 on ink. */}
      <div className="absolute inset-0 dark:hidden" style={layer("#eeeeeb")} />
      <div
        className="absolute inset-0 hidden dark:block"
        style={layer("#121212")}
      />
    </div>
  )
}
