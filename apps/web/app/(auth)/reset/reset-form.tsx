"use client"

import { useMemo, useState, useTransition } from "react"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"
import { useForm } from "react-hook-form"

import {
  passwordResetInputSchema,
  type PasswordResetInput,
} from "@acadigma/contracts"
import { scorePassword } from "@acadigma/domain/auth"
import { Button } from "@acadigma/ui/components/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@acadigma/ui/components/form"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"
import { PasswordField } from "@acadigma/ui/primitives/password-field"

import type { Messages } from "@/lib/i18n"
import {
  describeSubmitFailure,
  type SubmitFailureTone,
} from "@/lib/submit-failure"

import { resetPassword } from "../actions"

export function ResetForm({
  tokenHash,
  t,
  strengthLabels,
  network,
}: {
  tokenHash: string
  t: Messages["auth"]["reset"]
  strengthLabels: Messages["auth"]["passwordStrength"]
  network: Messages["auth"]["network"]
}) {
  const [formError, setFormError] = useState<string | null>(null)
  const [errorTone, setErrorTone] = useState<SubmitFailureTone>("error")
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [confirmPassword, setConfirmPassword] = useState("")
  const [done, setDone] = useState(false)
  const [isPending, startTransition] = useTransition()

  const form = useForm<PasswordResetInput>({
    resolver: zodResolver(passwordResetInputSchema),
    defaultValues: { tokenHash, password: "" },
  })

  const password = form.watch("password")
  const strength = useMemo(() => {
    if (!password) return undefined
    const score = scorePassword(password)
    return {
      score,
      label: strengthLabels[String(score) as "0" | "1" | "2" | "3" | "4"],
    }
  }, [password, strengthLabels])

  function onSubmit(values: PasswordResetInput) {
    setFormError(null)
    setConfirmError(null)
    if (values.password !== confirmPassword) {
      setConfirmError("Passwords do not match.")
      return
    }
    setErrorTone("error")
    startTransition(async () => {
      try {
        const result = await resetPassword(values)
        if (!result.ok) {
          setFormError(result.error.message)
          return
        }
        setDone(true)
      } catch {
        // D-35, and it matters most here: the reset token is single-use, so a
        // user told "something went wrong" when they were merely offline will
        // request a second link and burn the first one.
        const failure = describeSubmitFailure(network)
        setErrorTone(failure.tone)
        setFormError(failure.message)
      }
    })
  }

  if (done) {
    return (
      <div className="space-y-4">
        <InlineAlert tone="success">{t.successMessage}</InlineAlert>
        <Button asChild className="h-12 w-full">
          <a href="/app/dashboard">Continue</a>
        </Button>
      </div>
    )
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-4"
        noValidate
      >
        {formError ? (
          <InlineAlert tone={errorTone}>{formError}</InlineAlert>
        ) : null}

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.newPasswordLabel}</FormLabel>
              <FormControl>
                <PasswordField
                  autoComplete="new-password"
                  strength={strength}
                  strengthMeterLabel={strengthLabels.label}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormItem>
          <FormLabel>{t.confirmPasswordLabel}</FormLabel>
          <FormControl>
            <PasswordField
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </FormControl>
          {confirmError ? (
            <p role="alert" className="text-destructive text-sm">
              {confirmError}
            </p>
          ) : null}
        </FormItem>

        <Button type="submit" className="h-12 w-full" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2Icon className="animate-spin" aria-hidden="true" />
              {t.submittingButton}
            </>
          ) : (
            t.submitButton
          )}
        </Button>
      </form>
    </Form>
  )
}
