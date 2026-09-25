/**
 * Round half up (away from zero) at `places` decimals — F-AC-06 §5.13. The SQL
 * half is `app.round_half_up(numeric, int)`; both are pinned to the same table
 * in `supabase/tests/52_grade_scales.sql` (parity test in `round.test.ts`).
 *
 * Shifts by exponent *in the decimal string* rather than multiplying, so
 * `1.005` rounds to `1.01` (`1.005 * 100` is `100.49999…` in binary floating
 * point, which is exactly the drift §5.13 exists to prevent).
 */
export function roundHalfUp(value: number, places: number): number {
  const sign = value < 0 ? -1 : 1
  const rounded = Math.round(shift(Math.abs(value), places))
  return sign * shift(rounded, -places)
}

function shift(value: number, places: number): number {
  const [mantissa, exponent = "0"] = String(value).split("e")
  return Number(`${mantissa}e${Number(exponent) + places}`)
}
