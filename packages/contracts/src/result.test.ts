import { describe, expect, it } from "vitest"

import { apiError } from "./errors"
import { err, isErr, isOk, mapResult, ok, unwrap } from "./result"

describe("ok / err", () => {
  it("wraps a value and a failure", () => {
    expect(ok(42)).toEqual({ ok: true, data: 42 })
    const failure = apiError("not_found", "No such student.")
    expect(err(failure)).toEqual({ ok: false, error: failure })
  })
})

describe("isOk / isErr", () => {
  it("narrows both ways", () => {
    const success = ok("value")
    const failure = err(apiError("forbidden", "Nope."))

    expect(isOk(success)).toBe(true)
    expect(isErr(success)).toBe(false)
    expect(isOk(failure)).toBe(false)
    expect(isErr(failure)).toBe(true)

    // The point of the guard is the narrowing, so exercise it.
    if (isOk(success)) expect(success.data).toBe("value")
    if (isErr(failure)) expect(failure.error.code).toBe("forbidden")
  })
})

describe("mapResult", () => {
  it("transforms a success", () => {
    expect(mapResult(ok(2), (n) => n * 3)).toEqual({ ok: true, data: 6 })
  })

  it("leaves a failure untouched and does not run the mapper", () => {
    let called = false
    const failure = err(apiError("internal", "Boom."))
    const result = mapResult(failure, () => {
      called = true
      return "mapped"
    })
    expect(result).toBe(failure)
    expect(called).toBe(false)
  })
})

describe("unwrap", () => {
  it("returns the value of a success", () => {
    expect(unwrap(ok("value"))).toBe("value")
  })

  it("throws on a failure, carrying the error in the message", () => {
    expect(() => unwrap(err(apiError("conflict", "Already saved.")))).toThrow(
      /conflict/
    )
  })
})
