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

// jsdom has no IntersectionObserver; DataList's infinite-scroll sentinel
// depends on it. This mock records every observed target against the
// callback that observed it, so a test can simulate a real intersection via
// `triggerIntersection` below instead of only exercising the manual "Load
// more" button.
type ObservedTarget = {
  observer: IntersectionObserverMock
  callback: IntersectionObserverCallback
  target: Element
}

const observedTargets: ObservedTarget[] = []

class IntersectionObserverMock implements IntersectionObserver {
  readonly root: Element | Document | null = null
  readonly rootMargin: string = ""
  readonly thresholds: ReadonlyArray<number> = []
  private readonly callback: IntersectionObserverCallback

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
  }

  observe(target: Element) {
    observedTargets.push({ observer: this, callback: this.callback, target })
  }

  unobserve(target: Element) {
    for (let index = observedTargets.length - 1; index >= 0; index -= 1) {
      const entry = observedTargets[index]
      if (entry && entry.observer === this && entry.target === target) {
        observedTargets.splice(index, 1)
      }
    }
  }

  disconnect() {
    for (let index = observedTargets.length - 1; index >= 0; index -= 1) {
      if (observedTargets[index]?.observer === this) {
        observedTargets.splice(index, 1)
      }
    }
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver =
    IntersectionObserverMock as unknown as typeof IntersectionObserver
}

afterEach(() => {
  observedTargets.length = 0
})

/**
 * Test helper: fires an intersecting entry for every currently-observed
 * target, or only for `target` when given, so a test can single out (e.g.)
 * the phone sentinel from the desktop one.
 */
export function triggerIntersection(target?: Element) {
  for (const entry of [...observedTargets]) {
    if (target && entry.target !== target) continue
    entry.callback(
      [
        {
          isIntersecting: true,
          target: entry.target,
        } as IntersectionObserverEntry,
      ],
      entry.observer
    )
  }
}
