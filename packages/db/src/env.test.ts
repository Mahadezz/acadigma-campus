import { afterEach, describe, expect, it, vi } from "vitest"

import { publicSupabaseConfig, serviceRoleKey } from "./env"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("publicSupabaseConfig", () => {
  it("returns the browser-safe pair", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")

    expect(publicSupabaseConfig()).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_test",
    })
  })

  it("names what is missing rather than failing later at a fetch", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
    expect(publicSupabaseConfig).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })
})

describe("serviceRoleKey", () => {
  it("returns the key when it is set", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key")
    expect(serviceRoleKey()).toBe("service-role-test-key")
  })

  it("points at .env.example when it is not", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
    expect(serviceRoleKey).toThrow(/\.env\.local/)
  })

  // Last line of defence before a key reaches a browser bundle.
  it("refuses outright in an environment that has a window", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key")
    vi.stubGlobal("window", {})
    try {
      expect(serviceRoleKey).toThrow(/never be read in the browser/)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
