"use client"

import { useSyncExternalStore } from "react"

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange)
  window.addEventListener("offline", onChange)
  return () => {
    window.removeEventListener("online", onChange)
    window.removeEventListener("offline", onChange)
  }
}

/**
 * `navigator.onLine`, live (F-ID-11 §4.1). `true` during server rendering, so
 * the online markup is what hydrates first. Part 1 trusts the browser's flag;
 * Part 2a adds "a failed request also counts as offline" with the outbox.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  )
}
