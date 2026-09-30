export const DEVICES = ["web", "android", "iphone", "windows", "mac"] as const
export type Device = (typeof DEVICES)[number]

/**
 * Which "Get the app" tab to preselect. `maxTouchPoints` tells iPadOS (which
 * sends a desktop Mac user agent) apart from a real Mac; iPad gets the
 * iPhone steps, which are the same Safari steps.
 */
export function detectDevice(userAgent: string, maxTouchPoints = 0): Device {
  if (/android/i.test(userAgent)) return "android"
  if (/iphone|ipad|ipod/i.test(userAgent)) return "iphone"
  if (/macintosh/i.test(userAgent)) return maxTouchPoints > 1 ? "iphone" : "mac"
  if (/windows/i.test(userAgent)) return "windows"
  return "web"
}
