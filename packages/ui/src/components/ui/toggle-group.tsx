"use client"

import * as React from "react"

import { type VariantProps } from "class-variance-authority"
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"

import { cn } from "../../lib/utils"

import { toggleVariants } from "./toggle"

/**
 * shadcn/ui `toggle-group` (new-york-v4 registry), copied for PR #34
 * follow-up (owner instruction: use shadcn primitives, not hand-rolled
 * ones) — replaces this app's own `SegmentedControl` (single-select) and
 * `DayPickerRow` (multi-select) primitives, both built on Radix's own
 * `ToggleGroup` underneath already had a real bug (the REACT HIGH finding
 * `SegmentedControl` carried: every option got `tabIndex=0` before a value
 * was chosen, instead of only the first) that Radix's roving-tabindex
 * implementation does not have. Adjusted only to this repo's `cn` helper,
 * relative import paths and dropping the upstream `spacing`/`data-spacing`
 * knob this app does not use (every caller here wants the default
 * touching-segment look) — the variant/size contract is otherwise
 * unchanged from upstream.
 */
const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants>
>({
  size: "default",
  variant: "default",
})

function ToggleGroup({
  className,
  variant,
  size,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      className={cn(
        "group/toggle-group flex w-fit items-center gap-1 rounded-md",
        className
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext)

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      className={cn(
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        "w-auto min-w-0 shrink-0 rounded-md border border-input px-3 focus:z-10 focus-visible:z-10",
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  )
}

export { ToggleGroup, ToggleGroupItem }
