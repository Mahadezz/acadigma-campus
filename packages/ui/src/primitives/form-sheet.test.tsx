import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { FormSheet } from "./form-sheet"

/**
 * FormSheet defaults to the desktop Dialog: `useIsMobile` reports `false`
 * until after mount, and jsdom's default `window.innerWidth` (1024) is not
 * below `MOBILE_BREAKPOINT` (1024) either, so these tests exercise the
 * Dialog path. Escape/overlay-close/drag-dismiss all route through the same
 * `guardedOnOpenChange`, which is what is under test here — not which shell
 * renders it.
 */
function renderFormSheet(
  props: Partial<React.ComponentProps<typeof FormSheet>> = {}
) {
  const onOpenChange = vi.fn()
  const utils = render(
    <FormSheet open onOpenChange={onOpenChange} title="Add student" {...props}>
      <p>Form fields go here.</p>
    </FormSheet>
  )
  return { onOpenChange, ...utils }
}

describe("FormSheet — dirty-close guard", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("closes immediately on Escape when not dirty", async () => {
    const user = userEvent.setup()
    const { onOpenChange } = renderFormSheet({ isDirty: false })
    await user.keyboard("{Escape}")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("does NOT close on Escape when dirty and the native confirm is declined", async () => {
    const user = userEvent.setup()
    vi.spyOn(window, "confirm").mockReturnValue(false)
    const { onOpenChange } = renderFormSheet({ isDirty: true })

    await user.keyboard("{Escape}")

    expect(window.confirm).toHaveBeenCalledWith("Discard unsaved changes?")
    expect(onOpenChange).not.toHaveBeenCalled()
    // The sheet is still open.
    expect(screen.getByText("Add student")).toBeInTheDocument()
  })

  it("closes on Escape when dirty and the native confirm is accepted", async () => {
    const user = userEvent.setup()
    vi.spyOn(window, "confirm").mockReturnValue(true)
    const { onOpenChange } = renderFormSheet({ isDirty: true })

    await user.keyboard("{Escape}")

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("does NOT close on overlay click when dirty and confirm is declined", async () => {
    const user = userEvent.setup()
    vi.spyOn(window, "confirm").mockReturnValue(false)
    const { onOpenChange } = renderFormSheet({ isDirty: true })

    // Radix renders the overlay through a Portal, directly under
    // document.body — not under RTL's `container`.
    const overlay = document.querySelector('[data-slot="dialog-overlay"]')
    expect(overlay).not.toBeNull()
    await user.click(overlay as Element)

    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it("closes on overlay click when dirty and confirm is accepted", async () => {
    const user = userEvent.setup()
    vi.spyOn(window, "confirm").mockReturnValue(true)
    const { onOpenChange } = renderFormSheet({ isDirty: true })

    const overlay = document.querySelector('[data-slot="dialog-overlay"]')
    expect(overlay).not.toBeNull()
    await user.click(overlay as Element)

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("calls onAttemptClose instead of window.confirm when supplied, and stays open until it confirms", async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, "confirm")
    const onAttemptClose = vi.fn()
    const { onOpenChange } = renderFormSheet({
      isDirty: true,
      onAttemptClose,
    })

    await user.keyboard("{Escape}")

    expect(onAttemptClose).toHaveBeenCalledTimes(1)
    expect(confirmSpy).not.toHaveBeenCalled()
    // onAttemptClose owns the confirmation UI; FormSheet does not close on
    // its own until the caller calls onOpenChange(false) itself.
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it("does not guard the open transition, or a close when not dirty", async () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(
      <FormSheet
        open={false}
        onOpenChange={onOpenChange}
        title="Add student"
        isDirty
      >
        <p>Form fields go here.</p>
      </FormSheet>
    )
    // Opening never goes through the guard (guardedOnOpenChange only guards
    // `next === false`), so this should render without prompting anything.
    rerender(
      <FormSheet open onOpenChange={onOpenChange} title="Add student" isDirty>
        <p>Form fields go here.</p>
      </FormSheet>
    )
    expect(screen.getByText("Add student")).toBeInTheDocument()
  })
})
