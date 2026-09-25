"use client"

import * as React from "react"

import { useRouter } from "next/navigation"

import type { TextSize, UiMode } from "@acadigma/contracts"
import { Card } from "@acadigma/ui/components/card"
import { Label } from "@acadigma/ui/components/label"
import { RadioGroup, RadioGroupItem } from "@acadigma/ui/components/radio-group"
import { Switch } from "@acadigma/ui/components/switch"

import { updateUiPreferences } from "@/app/(shared)/workspace/actions"

import { SaveNotice, type Notice } from "../save-notice"

const TEXT_SIZES: { value: TextSize; sampleClassName: string }[] = [
  { value: "normal", sampleClassName: "text-base" },
  { value: "large", sampleClassName: "text-lg" },
  { value: "xlarge", sampleClassName: "text-xl" },
]

export type DisplaySettingsFormProps = {
  textSize: TextSize
  uiMode: UiMode
  /** Hidden for `staff` in the active workspace (F-ID-10 §2 note 4). */
  showBasicModeSwitch: boolean
  t: {
    textSizeLabel: string
    normal: string
    large: string
    xlarge: string
    sampleText: string
    basicModeLabel: string
    basicModeDescription: string
    basicModeComingSoon: string
    saved: string
    saveError: string
  }
}

/**
 * F-ID-10 §6 "Display settings" (Part 1). Text size applies immediately
 * (§7 `updateUiPreferences`, cookie mirror + `revalidatePath` re-render the
 * root layout's `<html data-text-size>`); turning basic mode on saves the
 * preference and navigates to `/app/home` (§4.1) — that page is a minimal
 * placeholder in this Part (Parts 2-3 build the real class-by-class home),
 * which `t.basicModeComingSoon` says outright rather than implying a
 * feature that is not built yet.
 */
export function DisplaySettingsForm({
  textSize,
  uiMode,
  showBasicModeSwitch,
  t,
}: DisplaySettingsFormProps) {
  const router = useRouter()
  const [, startTransition] = React.useTransition()
  const [notice, setNotice] = React.useState<Notice | null>(null)

  function handleTextSizeChange(next: string) {
    if (next === textSize) return
    startTransition(async () => {
      const result = await updateUiPreferences({ textSize: next })
      setNotice(
        result.ok
          ? { tone: "success", text: t.saved }
          : { tone: "error", text: t.saveError }
      )
    })
  }

  function handleBasicModeChange(checked: boolean) {
    const nextUiMode: UiMode = checked ? "basic" : "full"
    startTransition(async () => {
      const result = await updateUiPreferences({ uiMode: nextUiMode })
      if (!result.ok) {
        setNotice({ tone: "error", text: t.saveError })
        return
      }
      // F-ID-10 §4.1/§4.2: no confirmation either direction — reversible the
      // same way it was turned on.
      router.push(checked ? "/app/home" : "/app/dashboard")
    })
  }

  return (
    <div className="space-y-6">
      <SaveNotice notice={notice} reloadLabel="" />

      <div className="space-y-2">
        <Label id="text-size-label" className="text-sm font-medium">
          {t.textSizeLabel}
        </Label>
        <RadioGroup
          aria-labelledby="text-size-label"
          value={textSize}
          onValueChange={handleTextSizeChange}
          className="grid gap-3 sm:grid-cols-3"
        >
          {TEXT_SIZES.map((size) => (
            <Label
              key={size.value}
              htmlFor={`text-size-${size.value}`}
              className="flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-lg border p-4 has-[[data-state=checked]]:border-primary"
            >
              <span className="space-y-1">
                <span className="block font-medium">{t[size.value]}</span>
                <span
                  className={`text-muted-foreground block ${size.sampleClassName}`}
                >
                  {t.sampleText}
                </span>
              </span>
              <RadioGroupItem
                id={`text-size-${size.value}`}
                value={size.value}
              />
            </Label>
          ))}
        </RadioGroup>
      </div>

      {showBasicModeSwitch ? (
        <Card className="flex-row items-center justify-between gap-4 p-4">
          <div className="space-y-1">
            <Label htmlFor="basic-mode-switch" className="font-medium">
              {t.basicModeLabel}
            </Label>
            <p className="text-muted-foreground text-sm">
              {t.basicModeDescription}
            </p>
            <p className="text-muted-foreground text-xs">
              {t.basicModeComingSoon}
            </p>
          </div>
          <Switch
            id="basic-mode-switch"
            checked={uiMode === "basic"}
            onCheckedChange={handleBasicModeChange}
          />
        </Card>
      ) : null}
    </div>
  )
}
