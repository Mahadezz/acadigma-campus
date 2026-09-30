// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

import { LEGAL_DOCUMENTS } from "@/lib/legal/documents"

/**
 * D-114 (legal audit item 4): registration used to throw the Terms/Privacy
 * agreement away (`void termsAccepted`). It now sends the server's current
 * versions in the sign-up metadata, where `app.tg_record_signup_legal`
 * records them with the user (pgTAP 39f A1-A5), and refuses a form without
 * the box ticked before anything reaches Supabase.
 */
const mockSignUp = vi.fn()

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ getAll: () => [], get: () => undefined })),
}))
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { signUp: mockSignUp } })),
}))
vi.mock("@/lib/throttle", () => ({
  throttleStatus: vi.fn(async () => ({ blocked: false, retryAfterSeconds: 0 })),
  throttleRecordFailure: vi.fn(),
  throttleReset: vi.fn(),
}))
vi.mock("@/lib/audit", () => ({ logAuthEvent: vi.fn() }))
vi.mock("@/lib/email-log", () => ({ logAuthEmail: vi.fn() }))
vi.mock("@/lib/site-url", () => ({
  getOrigin: vi.fn(async () => "https://campus.test"),
}))

const { registerWithPassword } = await import("./actions")

const FORM = {
  fullName: "Nasrin Akter",
  email: "nasrin@test.local",
  password: "a-long-unusual-passphrase-42",
  termsAccepted: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSignUp.mockResolvedValue({
    data: { user: { id: "u1", identities: [{ id: "i1" }] } },
    error: null,
  })
})

describe("registerWithPassword — legal acceptance (D-114)", () => {
  it("sends the current Terms and Privacy versions with the new user", async () => {
    const result = await registerWithPassword(FORM)

    expect(result.ok).toBe(true)
    expect(mockSignUp).toHaveBeenCalledTimes(1)
    expect(mockSignUp.mock.calls[0]?.[0].options.data).toEqual({
      full_name: "Nasrin Akter",
      legal: {
        terms: LEGAL_DOCUMENTS.terms.version,
        privacy: LEGAL_DOCUMENTS.privacy.version,
      },
    })
  })

  it("creates no account when the box is not ticked", async () => {
    const result = await registerWithPassword({
      ...FORM,
      termsAccepted: false,
    })

    expect(result.ok).toBe(false)
    expect(mockSignUp).not.toHaveBeenCalled()
  })
})
