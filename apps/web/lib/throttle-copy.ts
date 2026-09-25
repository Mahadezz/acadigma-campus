/**
 * Rate-limit copy shared by the server actions (the error message) and the
 * forms (the live banner). Waits are shown in whole minutes, rounded up —
 * "900s" means nothing to a principal on a phone (D-101). Digits stay Western
 * in both languages (DESIGN-SYSTEM §1.6: "15 মিনিট").
 */
export function retryMinutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60))
}

/** `template` carries a `{minutes}` placeholder (`auth.login.throttled`). */
export function throttledMessage(
  template: string,
  seconds: number,
  locale: string
): string {
  // `locale-u-nu-latn`: localised grouping, Western digits (DESIGN-SYSTEM §1.6).
  return template.replace(
    "{minutes}",
    new Intl.NumberFormat(`${locale}-u-nu-latn`).format(retryMinutes(seconds))
  )
}
