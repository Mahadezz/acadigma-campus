/**
 * Rate-limit copy shared by the server actions (the error message) and the
 * forms (the live banner). Waits are shown in whole minutes, rounded up —
 * "900s" means nothing to a principal on a phone (D-101).
 */
export function retryMinutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60))
}

/** `template` carries a `{minutes}` placeholder (`auth.login.throttled`). */
export function throttledMessage(template: string, seconds: number): string {
  return template.replace("{minutes}", String(retryMinutes(seconds)))
}
