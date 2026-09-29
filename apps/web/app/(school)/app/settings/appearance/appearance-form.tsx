"use client"

import * as React from "react"

import { useRouter } from "next/navigation"

import { useTheme } from "next-themes"

import { Card } from "@acadigma/ui/components/card"
import { Label } from "@acadigma/ui/components/label"
import { RadioGroup, RadioGroupItem } from "@acadigma/ui/components/radio-group"

import { updateLocale } from "@/app/(shared)/workspace/actions"
import { isLocale, setLocaleCookie, type Locale } from "@/lib/locale"

/**
 * D-408: theme and language, together, as one normal settings screen — not
 * a header control and not a big "we're bilingual too" button on the home
 * screen (removed from `(school)/app/home/essentials-row.tsx` and
 * `(shared)/workspace/user-menu.tsx` in this same Part). Both rows are the
 * a `RadioGroup` on a glass card: theme as three tiles, each with a small
 * preview of that theme's surface (D-408); language as full 44px rows.
 *
 * Theme: `next-themes`'s own `useTheme()` — already wired app-wide
 * (`apps/web/app/providers.tsx`: `attribute="class"`, `defaultTheme="system"`,
 * `enableSystem`). It already persists the choice (localStorage, per
 * device) and already drives every themed surface in the product; this form
 * is the first visible *control* for it, not new theme plumbing. No new
 * migration/column — `user_preferences` has no `theme` field yet, and one
 * device's localStorage choice is what "manual Light/Dark/System control"
 * asked for; a cross-device synced preference is a real, separate follow-up
 * (see DECISION-LOG D-408 "Consequences").
 *
 * Language: the same cookie + `updateLocale` mechanism `UserMenu`'s removed
 * radio group used (D-401) — moved, not rebuilt.
 *
 * Copy is inline, not `messages/{en,bn}.json` keys: those two files are
 * being edited by open PRs #82 and #105, which this Part does not touch
 * (see the file-level comment in `page.tsx`).
 */
export function AppearanceForm({ locale }: { locale: Locale }) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [, startTransition] = React.useTransition()
  const bn = locale === "bn"

  function handleLocaleChange(next: string) {
    if (!isLocale(next) || next === locale) return
    setLocaleCookie(next)
    startTransition(async () => {
      // Best-effort, same as the removed UserMenu switch (D-401): the
      // cookie already made the switch take effect on this device.
      await updateLocale(next).catch(() => undefined)
      router.refresh()
    })
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="appearance-theme" className="space-y-3">
        <div className="space-y-1">
          <h3 id="appearance-theme" className="text-base font-medium">
            {bn ? "থিম" : "Theme"}
          </h3>
          <p className="text-muted-foreground text-sm">
            {bn
              ? "ডিভাইসের সেটিং অনুসরণ করে, অথবা নিজে বেছে নিন।"
              : "Follows your device by default, or pick one."}
          </p>
        </div>
        <Card variant="glass" className="p-3">
          <RadioGroup
            value={theme ?? "system"}
            onValueChange={setTheme}
            className="grid grid-cols-3 gap-2"
          >
            {(
              [
                { value: "light", en: "Light", bnLabel: "লাইট" },
                { value: "dark", en: "Dark", bnLabel: "ডার্ক" },
                { value: "system", en: "System", bnLabel: "সিস্টেম" },
              ] as const
            ).map((option) => (
              <Label
                key={option.value}
                htmlFor={`theme-${option.value}`}
                className="has-[[data-state=checked]]:ring-foreground hover:bg-foreground/[0.04] flex cursor-pointer flex-col items-stretch gap-2.5 rounded-xl p-2 text-sm font-normal ring-1 ring-transparent transition-[box-shadow,background-color] has-[[data-state=checked]]:ring-2"
              >
                <ThemeSwatch theme={option.value} />
                <span className="flex min-h-6 items-center gap-2 px-1">
                  <RadioGroupItem
                    id={`theme-${option.value}`}
                    value={option.value}
                  />
                  {bn ? option.bnLabel : option.en}
                </span>
              </Label>
            ))}
          </RadioGroup>
        </Card>
      </section>

      <section aria-labelledby="appearance-language" className="space-y-3">
        <div className="space-y-1">
          <h3 id="appearance-language" className="text-base font-medium">
            {bn ? "ভাষা" : "Language"}
          </h3>
        </div>
        <Card variant="glass" className="py-1">
          <RadioGroup
            value={locale}
            onValueChange={handleLocaleChange}
            className="divide-foreground/[0.08] gap-0 divide-y"
          >
            {(
              [
                { value: "en" as const, label: "English" },
                { value: "bn" as const, label: "বাংলা" },
              ] as const
            ).map((option) => (
              <Label
                key={option.value}
                htmlFor={`locale-${option.value}`}
                className="flex min-h-12 cursor-pointer items-center gap-3 px-5 py-3 text-[0.9375rem] font-normal"
              >
                <RadioGroupItem
                  id={`locale-${option.value}`}
                  value={option.value}
                />
                {option.label}
              </Label>
            ))}
          </RadioGroup>
        </Card>
      </section>
    </div>
  )
}

/** A thumbnail of a theme: its ambient base, a glass card and an ink bar.
 * "system" shows both halves. Decorative — the label names the choice. */
function ThemeSwatch({ theme }: { theme: "light" | "dark" | "system" }) {
  const half = (mode: "light" | "dark") => (
    <span
      className={
        mode === "light"
          ? "flex flex-1 flex-col justify-end gap-1 bg-[var(--swatch-light)] p-2"
          : "flex flex-1 flex-col justify-end gap-1 bg-[var(--swatch-dark)] p-2"
      }
    >
      <span
        className={
          mode === "light"
            ? "h-2 w-3/4 rounded-full bg-black/80"
            : "h-2 w-3/4 rounded-full bg-white/85"
        }
      />
      <span
        className={
          mode === "light"
            ? "h-5 rounded-md border border-white/80 bg-white/70"
            : "h-5 rounded-md border border-white/10 bg-white/10"
        }
      />
    </span>
  )
  return (
    <span
      aria-hidden="true"
      className="border-foreground/10 flex h-20 overflow-hidden rounded-lg border"
    >
      {theme === "dark" ? half("dark") : half("light")}
      {theme === "system" ? half("dark") : null}
    </span>
  )
}
