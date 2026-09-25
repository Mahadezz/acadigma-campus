import assert from "node:assert/strict"
import { test } from "node:test"

import { findViolations } from "./check-require-writable.mjs"

const FILE = "apps/web/app/(school)/app/x/actions.ts"
const check = (source, exempt) =>
  findViolations([{ file: FILE, source: `"use server"\n${source}` }], exempt)

test("direct call passes", () => {
  assert.deepEqual(
    check(`export async function saveX() {
  const ctx = await requireWorkspace()
  const w = await requireWritable(ctx, c)
}`),
    []
  )
})

test("missing call fails", () => {
  assert.equal(
    check(`export async function saveX() {
  const ctx = await requireWorkspace()
}`).length,
    1
  )
})

test("helper pattern (PR #39): context resolved in a private helper", () => {
  const helper = `async function gateWrite() {
  const ctx = await requireWorkspace()
  const w = await requireWritable(ctx, c)
}
`
  // Guarded through the helper: passes.
  assert.deepEqual(
    check(`${helper}export async function saveX() {
  const g = await gateWrite()
}`),
    []
  )
  // Same file, an action that skips the helper: fails (fail-closed).
  assert.equal(
    check(`${helper}export async function saveY() {
  await repo.save()
}`).length,
    1
  )
})

test("helper without requireWritable does not count", () => {
  assert.equal(
    check(`async function ctxOnly() { return requireWorkspace() }
export async function saveX() { await ctxOnly() }`).length,
    1
  )
})

test("read-verb names are reads; EXEMPT is honoured", () => {
  assert.deepEqual(
    check(`export async function getX() { await requireWorkspace() }`),
    []
  )
  assert.deepEqual(
    check(`export async function doX() { await requireWorkspace() }`, {
      [`${FILE}#doX`]: "reason",
    }),
    []
  )
})

test("files without a workspace context are ignored", () => {
  assert.deepEqual(check(`export async function saveX() {}`), [])
})
