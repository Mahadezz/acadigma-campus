/**
 * F-ID-01 §4.8 (D-116): "Chrome on Android" from a session's user agent.
 * Only for display on the owner's own Security page; the user agent is
 * never logged. Order matters: Edge and Opera also say "Chrome", Chrome
 * also says "Safari", Android also says "Linux".
 */
const BROWSERS: readonly [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
]

const SYSTEMS: readonly [RegExp, string][] = [
  [/Android/, "Android"],
  [/iPhone|iPad|iPod/, "iOS"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
]

function first(ua: string, table: readonly [RegExp, string][]): string | null {
  return table.find(([pattern]) => pattern.test(ua))?.[1] ?? null
}

export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? ""
  const browser = first(ua, BROWSERS)
  const system = first(ua, SYSTEMS)
  if (browser && system) return `${browser} on ${system}`
  return browser ?? system ?? "Unknown device"
}
