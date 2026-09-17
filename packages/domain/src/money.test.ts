import { describe, expect, it } from "vitest"

import {
  BASIS_POINTS_SCALE,
  MoneyError,
  PAISA_PER_TAKA,
  TAKA_SIGN,
  addPaisa,
  allocatePaisa,
  applyBasisPoints,
  formatTaka,
  multiplyPaisa,
  paisaToTaka,
  splitCommission,
  subtractPaisa,
  takaToPaisa,
} from "./money"

describe("takaToPaisa", () => {
  it("scales by 100", () => {
    expect(takaToPaisa(12.34)).toBe(1234)
    expect(takaToPaisa(0)).toBe(0)
    expect(takaToPaisa(1)).toBe(PAISA_PER_TAKA)
  })

  it("rounds half away from zero", () => {
    expect(takaToPaisa(0.005)).toBe(1)
    expect(takaToPaisa(-0.005)).toBe(-1)
    expect(takaToPaisa(0.004)).toBe(0)
  })

  it("survives the classic float trap", () => {
    expect(takaToPaisa(0.1 + 0.2)).toBe(30)
  })

  it("rejects values that are not finite", () => {
    expect(() => takaToPaisa(Number.NaN)).toThrow(MoneyError)
    expect(() => takaToPaisa(Number.POSITIVE_INFINITY)).toThrow(MoneyError)
  })
})

describe("paisaToTaka", () => {
  it("divides by 100", () => {
    expect(paisaToTaka(1234)).toBeCloseTo(12.34)
  })

  it("rejects fractional paisa", () => {
    expect(() => paisaToTaka(12.5)).toThrow(MoneyError)
  })
})

describe("addPaisa / subtractPaisa", () => {
  it("sums any number of amounts", () => {
    expect(addPaisa()).toBe(0)
    expect(addPaisa(100, 250, 3)).toBe(353)
  })

  it("subtracts, allowing a negative result for refunds", () => {
    expect(subtractPaisa(500, 200)).toBe(300)
    expect(subtractPaisa(200, 500)).toBe(-300)
  })

  it("rejects fractional inputs on both sides", () => {
    expect(() => addPaisa(1.5)).toThrow(MoneyError)
    expect(() => subtractPaisa(1.5, 1)).toThrow(MoneyError)
    expect(() => subtractPaisa(1, 1.5)).toThrow(MoneyError)
  })

  it("rejects a sum that leaves the safe integer range", () => {
    expect(() =>
      addPaisa(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
    ).toThrow(MoneyError)
  })
})

describe("multiplyPaisa", () => {
  it("computes a line total", () => {
    expect(multiplyPaisa(2500, 3)).toBe(7500)
    expect(multiplyPaisa(2500, 0)).toBe(0)
  })

  it("rejects fractional or negative quantities", () => {
    expect(() => multiplyPaisa(100, 1.5)).toThrow(MoneyError)
    expect(() => multiplyPaisa(100, -1)).toThrow(MoneyError)
  })

  it("rejects an amount that is not whole paisa", () => {
    expect(() => multiplyPaisa(1.5, 2)).toThrow(MoneyError)
  })

  it("rejects a total that leaves the safe integer range", () => {
    expect(() => multiplyPaisa(Number.MAX_SAFE_INTEGER, 2)).toThrow(MoneyError)
  })
})

describe("applyBasisPoints", () => {
  it("applies a rate", () => {
    expect(applyBasisPoints(10_000, 3000)).toBe(3000)
    expect(applyBasisPoints(10_000, 0)).toBe(0)
    expect(applyBasisPoints(10_000, BASIS_POINTS_SCALE)).toBe(10_000)
  })

  it("rounds half up", () => {
    // 15 paisa at 50 % is 7.5, which becomes 8.
    expect(applyBasisPoints(15, 5000)).toBe(8)
  })

  it("rejects rates outside 0..10000 and non-integers", () => {
    expect(() => applyBasisPoints(100, -1)).toThrow(MoneyError)
    expect(() => applyBasisPoints(100, BASIS_POINTS_SCALE + 1)).toThrow(
      MoneyError
    )
    expect(() => applyBasisPoints(100, 12.5)).toThrow(MoneyError)
  })

  it("rejects a fractional amount", () => {
    expect(() => applyBasisPoints(10.5, 3000)).toThrow(MoneyError)
  })
})

describe("splitCommission", () => {
  it("splits 30/70 as the platform rate says (D-15)", () => {
    expect(splitCommission(100_000, 3000)).toEqual({
      platform: 30_000,
      seller: 70_000,
    })
  })

  it("always adds back up to the gross, whatever the rounding", () => {
    for (const gross of [1, 7, 99, 333, 1001, 123_457]) {
      const { platform, seller } = splitCommission(gross, 3000)
      expect(platform + seller).toBe(gross)
    }
  })
})

describe("allocatePaisa", () => {
  it("spreads leftovers over the earliest shares", () => {
    expect(allocatePaisa(1000, 3)).toEqual([334, 333, 333])
    expect(allocatePaisa(1000, 4)).toEqual([250, 250, 250, 250])
  })

  it("always sums back to the original", () => {
    for (const parts of [1, 2, 3, 7, 12]) {
      expect(allocatePaisa(9871, parts).reduce((a, b) => a + b, 0)).toBe(9871)
    }
  })

  it("handles negative amounts, e.g. a refund schedule", () => {
    expect(allocatePaisa(-1000, 3)).toEqual([-334, -333, -333])
  })

  it("rejects a non-positive or fractional part count", () => {
    expect(() => allocatePaisa(100, 0)).toThrow(MoneyError)
    expect(() => allocatePaisa(100, 2.5)).toThrow(MoneyError)
  })

  it("rejects a fractional amount", () => {
    expect(() => allocatePaisa(100.5, 2)).toThrow(MoneyError)
  })
})

describe("formatTaka", () => {
  it("renders the taka sign and two decimals", () => {
    expect(formatTaka(123_456)).toBe(`${TAKA_SIGN}1,234.56`)
    expect(formatTaka(0)).toBe(`${TAKA_SIGN}0.00`)
  })

  it("drops the decimals on whole taka when asked", () => {
    expect(formatTaka(100_000, { compactWholeTaka: true })).toBe(
      `${TAKA_SIGN}1,000`
    )
    expect(formatTaka(100_050, { compactWholeTaka: true })).toBe(
      `${TAKA_SIGN}1,000.50`
    )
  })

  it("can omit the sign for columns that already carry it", () => {
    expect(formatTaka(123_456, { omitSign: true })).toBe("1,234.56")
  })

  it("puts the minus in front of the sign", () => {
    expect(formatTaka(-50_000)).toBe(`-${TAKA_SIGN}500.00`)
  })

  it("accepts an explicit locale", () => {
    expect(formatTaka(123_456, { locale: "en-US" })).toBe(
      `${TAKA_SIGN}1,234.56`
    )
  })

  it("rejects a fractional amount", () => {
    expect(() => formatTaka(1.5)).toThrow(MoneyError)
  })
})
