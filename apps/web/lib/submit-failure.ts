/**
 * Distinguishing "you are offline" from "the server is unhappy" in a form.
 *
 * D-35 makes this an M0 exit criterion in so many words: _"no 'server down'
 * false positives (distinguish offline vs API error in UI)"_. It is the single
 * most-repeated complaint in VOICE-OF-CUSTOMER, and on a 2G school connection it
 * is the normal case, not the edge case.
 *
 * It also fixes a real bug: a Server Action invocation that never reaches the
 * server **rejects**. Without a catch, the `startTransition(async () => …)`
 * callback throws, React surfaces an unhandled rejection, and the form sits
 * there with a spinner and no message at all.
 *
 * `navigator.onLine` is only trustworthy in the negative — `false` means
 * definitely offline, `true` means "has a network interface", which is why a
 * true reading falls through to the generic API-error copy rather than claiming
 * the server is down.
 */
export type SubmitFailureTone = "offline" | "error"

export type SubmitFailure = {
  tone: SubmitFailureTone
  message: string
}

export type SubmitFailureCopy = {
  /** "You appear to be offline. Check your connection and try again." */
  offline: string
  /** "Something went wrong on our side. Try again in a moment." */
  unavailable: string
}

/** True only when the browser is certain there is no connection. */
function isDefinitelyOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false
}

export function describeSubmitFailure(copy: SubmitFailureCopy): SubmitFailure {
  return isDefinitelyOffline()
    ? { tone: "offline", message: copy.offline }
    : { tone: "error", message: copy.unavailable }
}
