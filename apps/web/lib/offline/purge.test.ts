import { describe, expect, it } from "vitest"

import { decidePurge, type OfflineSnapshot } from "./purge"

const TEACHER: OfflineSnapshot = {
  userId: "u1",
  workspaceId: "w1",
  role: "teacher",
}

describe("decidePurge (F-ID-11 §4.8)", () => {
  it("keeps the cache when nothing changed", () => {
    expect(decidePurge(TEACHER, { kind: "signed_in", ...TEACHER })).toEqual({
      purge: false,
      next: TEACHER,
    })
  })

  it("changes nothing when the check could not reach the server", () => {
    expect(decidePurge(TEACHER, { kind: "unknown" })).toEqual({
      purge: false,
      next: undefined,
    })
  })

  it("purges and forgets on sign-out or a revoked session", () => {
    expect(decidePurge(TEACHER, { kind: "signed_out" })).toEqual({
      purge: true,
      next: null,
    })
    expect(decidePurge(null, { kind: "signed_out" }).purge).toBe(true)
  })

  it("remembers the user on the first check after a sign-in, without wiping what they just opened", () => {
    // /login's own check (signed out) already wiped the cache and the snapshot.
    expect(decidePurge(null, { kind: "signed_in", ...TEACHER })).toEqual({
      purge: false,
      next: TEACHER,
    })
  })

  it("purges when a different user signs in on the same phone", () => {
    const other = { ...TEACHER, userId: "u2" }
    expect(decidePurge(TEACHER, { kind: "signed_in", ...other })).toEqual({
      purge: true,
      next: other,
    })
  })

  it("purges on a workspace switch", () => {
    const d = decidePurge(TEACHER, {
      kind: "signed_in",
      ...TEACHER,
      workspaceId: "w2",
    })
    expect(d.purge).toBe(true)
    expect(d.next?.workspaceId).toBe("w2")
  })

  it("purges when the role changed (a demoted admin keeps nothing)", () => {
    const admin = { ...TEACHER, role: "admin" }
    expect(decidePurge(admin, { kind: "signed_in", ...TEACHER }).purge).toBe(
      true
    )
  })

  it("purges when the membership was removed or suspended", () => {
    const removed = { ...TEACHER, workspaceId: null, role: null }
    expect(decidePurge(TEACHER, { kind: "signed_in", ...removed })).toEqual({
      purge: true,
      next: removed,
    })
    // …and keeps purging while there is still no active membership.
    expect(decidePurge(removed, { kind: "signed_in", ...removed }).purge).toBe(
      true
    )
  })
})
