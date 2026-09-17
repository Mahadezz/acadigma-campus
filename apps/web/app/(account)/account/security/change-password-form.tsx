"use client"

import { useMemo, useState, useTransition } from "react"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"
import { useForm } from "react-hook-form"

import {
  changePasswordInputSchema,
  type ChangePasswordInput,
} from "@acadigma/contracts"
import { scorePassword } from "@acadigma/domain/auth"
import { Button } from "@acadigma/ui/components/button"
import { Checkbox } from "@acadigma/ui/components/checkbox"
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

import { changePassword } from "@/app/(auth)/actions"
import type { Messages } from "@/lib/i18n"

/** F-ID-01 §4.6 "Change password while signed in": re-authentication with the
 * current password, then the new one twice; "Sign out of other devices"
 * defaults ON. Lives at /account/security per OQ-3's shell-local default. */
export function ChangePasswordForm({
  t,
  strengthLabels,
}: {
  t: Messages["auth"]["changePassword"]
  strengthLabels: Messages["auth"]["passwordStrength"]
}) {
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [confirmPassword, setConfirmPassword] = useState("")
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordInputSchema),
    defaultValues: { currentPassword: "", password: "", signOutOthers: true },
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

  function onSubmit(values: ChangePasswordInput) {
    setFormError(null)
    setConfirmError(null)
    setSuccess(false)
    if (values.password !== confirmPassword) {
      setConfirmError("Passwords do not match.")
      return
    }
    startTransition(async () => {
      const result = await changePassword(values)
      if (!result.ok) {
        setFormError(result.error.message)
        return
      }
      setSuccess(true)
      form.reset({ currentPassword: "", password: "", signOutOthers: true })
      setConfirmPassword("")
    })
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-4"
        noValidate
      >
        {formError ? <InlineAlert tone="error">{formError}</InlineAlert> : null}
        {success ? (
          <InlineAlert tone="success">{t.successMessage}</InlineAlert>
        ) : null}

        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.currentPasswordLabel}</FormLabel>
              <FormControl>
                <PasswordField autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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

        <FormField
          control={form.control}
          name="signOutOthers"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <FormLabel className="font-normal">
                {t.signOutOthersLabel}
              </FormLabel>
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="h-12 w-full sm:w-auto"
          disabled={isPending}
        >
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
