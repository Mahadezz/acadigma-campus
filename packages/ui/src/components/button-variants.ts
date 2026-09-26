import { cva, type VariantProps } from "class-variance-authority"

/**
 * `buttonVariants`, split out of `ui/button.tsx` (review fix, PR #72): a
 * Server Component that imports anything from `ui/button.tsx` — even only
 * `buttonVariants`, never `Button` itself — pulls in that file's `radix-ui`
 * `Slot` import too, because Next's RSC client-reference handling does not
 * tree-shake past a barrel package's own `"use client"` file (D-405 item 8,
 * `(school)/app/home/essentials-row.tsx`'s docblock has the full writeup —
 * this is the third route that has hit it). This file has no `"use client"`
 * and no radix import, so a Server Component can compute the same classes
 * `Button` renders without paying for `Slot`. `ui/button.tsx` re-exports
 * this unchanged for every existing `import { buttonVariants } from
 * ".../components/button"` call site.
 */
export const buttonVariants = cva(
  // D-57: active:translate-y-px is the ink/paper "press" acadigma-website
  // uses on its own Button; kept alongside the existing focus/disabled
  // states rather than replacing DESIGN-SYSTEM §3.5's active:scale, which
  // stays on the higher-frequency tap targets (AttendanceToggle) that need
  // the stronger touch feedback.
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none active:not-aria-[haspopup]:translate-y-px focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-flat hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export type ButtonVariants = VariantProps<typeof buttonVariants>
