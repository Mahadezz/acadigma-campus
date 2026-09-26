import { fill } from "../../home/format"

export { fill }

/** English "1 student" / "40 students"; Bangla has one form for any count. */
export function pluralize(count: number, one: string, other: string): string {
  return fill(count === 1 ? one : other, { count })
}
