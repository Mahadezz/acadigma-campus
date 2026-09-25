// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  getClientLocale,
  isLocale,
  setLocaleCookie,
  toIntlLocale,
} from "./locale"

beforeEach(() => {
  document.cookie = `${LOCALE_COOKIE}=; path=/; max-age=0`
})

describe("isLocale", () => {
  it("accepts en and bn only", () => {
    expect(isLocale("en")).toBe(true)
    expect(isLocale("bn")).toBe(true)
    expect(isLocale("fr")).toBe(false)
    expect(isLocale(undefined)).toBe(false)
    expect(isLocale(null)).toBe(false)
  })
})

describe("toIntlLocale", () => {
  it("pins Western digits on bn (-u-nu-latn), per DESIGN-SYSTEM §1.6", () => {
    expect(toIntlLocale("bn")).toBe("bn-BD-u-nu-latn")
    expect(new Intl.NumberFormat(toIntlLocale("bn")).format(1234)).toBe("1,234")
  })

  it("uses en-GB for en", () => {
    expect(toIntlLocale("en")).toBe("en-GB")
  })
})

describe("setLocaleCookie / getClientLocale", () => {
  it("round-trips through document.cookie", () => {
    expect(getClientLocale()).toBe(DEFAULT_LOCALE)
    setLocaleCookie("bn")
    expect(getClientLocale()).toBe("bn")
    setLocaleCookie("en")
    expect(getClientLocale()).toBe("en")
  })

  it("falls back to the default locale for a tampered cookie value", () => {
    document.cookie = `${LOCALE_COOKIE}=fr; path=/`
    expect(getClientLocale()).toBe(DEFAULT_LOCALE)
  })
})
