import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

// `globals: true` is deliberately off for this project (see vitest.config.ts),
// so React Testing Library's automatic afterEach-cleanup never registers
// itself — do it explicitly here, or every test after the first `render()` in
// a file finds duplicate elements from the previous test. Same fix as
// packages/ui/vitest.setup.ts.
afterEach(() => {
  cleanup()
})

// jsdom has no matchMedia; GSAP's matchMedia (CountUp, D-408) calls it.
// Same stub as packages/ui/vitest.setup.ts: "no preference" everywhere.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
