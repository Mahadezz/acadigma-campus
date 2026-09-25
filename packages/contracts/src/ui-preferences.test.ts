import { describe, expect, it } from "vitest"

import {
  textSizeSchema,
  uiModeSchema,
  uiPreferencesSchema,
  updateUiPreferencesInputSchema,
} from "./ui-preferences"

describe("uiModeSchema / textSizeSchema — enum parity with Postgres", () => {
  it("accepts exactly the two ui_mode labels", () => {
    expect(uiModeSchema.safeParse("full").success).toBe(true)
    expect(uiModeSchema.safeParse("basic").success).toBe(true)
    expect(uiModeSchema.safeParse("compact").success).toBe(false)
  })

  it("accepts exactly the three text_size labels", () => {
    expect(textSizeSchema.safeParse("normal").success).toBe(true)
    expect(textSizeSchema.safeParse("large").success).toBe(true)
    expect(textSizeSchema.safeParse("xlarge").success).toBe(true)
    expect(textSizeSchema.safeParse("huge").success).toBe(false)
  })
})

describe("uiPreferencesSchema", () => {
  it("accepts a resolved pair and rejects an unknown key", () => {
    expect(
      uiPreferencesSchema.safeParse({ uiMode: "full", textSize: "normal" })
        .success
    ).toBe(true)
    expect(
      uiPreferencesSchema.safeParse({
        uiMode: "full",
        textSize: "normal",
        theme: "dark",
      }).success
    ).toBe(false)
  })
})

describe("updateUiPreferencesInputSchema", () => {
  it("accepts either field alone", () => {
    expect(
      updateUiPreferencesInputSchema.safeParse({ uiMode: "basic" }).success
    ).toBe(true)
    expect(
      updateUiPreferencesInputSchema.safeParse({ textSize: "large" }).success
    ).toBe(true)
  })

  it("accepts both fields together", () => {
    expect(
      updateUiPreferencesInputSchema.safeParse({
        uiMode: "basic",
        textSize: "xlarge",
      }).success
    ).toBe(true)
  })

  it("rejects an empty patch", () => {
    expect(updateUiPreferencesInputSchema.safeParse({}).success).toBe(false)
  })

  it("rejects an unknown key and an out-of-range value", () => {
    expect(
      updateUiPreferencesInputSchema.safeParse({ uiMode: "compact" }).success
    ).toBe(false)
    expect(
      updateUiPreferencesInputSchema.safeParse({
        uiMode: "full",
        workspaceId: "x",
      }).success
    ).toBe(false)
  })
})
