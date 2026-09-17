import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

import "@testing-library/jest-dom/vitest"

// `globals: true` is deliberately off (matches the `web` project), so RTL's
// automatic afterEach-cleanup never registers itself — do it explicitly, or
// every test after the first in a file finds duplicate elements.
afterEach(() => {
  cleanup()
})

// jsdom has no ResizeObserver; several primitives (DataList's virtualiser,
// Radix components) probe for it. A no-op is enough for unit tests, which
// never depend on actual measured sizes.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// jsdom does not implement matchMedia; useIsMobile and the reduced-motion
// hook both call it.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}
