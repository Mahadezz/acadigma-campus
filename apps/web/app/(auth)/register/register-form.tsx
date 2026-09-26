"use client"

import { useMemo, useState, useTransition } from "react"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"
import { useForm } from "react-hook-form"

import {
  registerWithPasswordInputSchema,
  type RegisterWithPasswordInput,
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
import { Input } from "@acadigma/ui/components/input"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"
import { PasswordField } from "@acadigma/ui/primitives/password-field"

import type { Messages } from "@/lib/i18n"
import {
  describeSubmitFailure,
  type SubmitFailureTone,
} from "@/lib/submit-failure"

import { registerWithPassword } from "../actions"

/**
 * F-ID-01 §6 `/register`: full name, email, password (+strength meter),
 * password confirm, a single Terms checkbox — "one screen, not three" (§4.1).
 */
export function RegisterForm({
  t,
  network,
  next,
}: {
  t: Messages["auth"]["register"] & {
    strength: Messages["auth"]["passwordStrength"]
  }
  network: Messages["auth"]["network"]
  /** D-108: "/invite" when a guardian is signing up from their link. */
  next?: "/invite"
}) {
  const [formError, setFormError] = useState<string | null>(null)
  const [errorTone, setErrorTone] = useState<SubmitFailureTone>("error")
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<RegisterWithPasswordInput>({
    resolver: zodResolver(registerWithPasswordInputSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      // z.literal(true) types this field as exactly `true`; the real default is an
      // unchecked box, which is `false` at runtime. safeParse rejects it either way
      // until the user actually ticks it, so this cast changes no behaviour.
      termsAccepted: false as unknown as true,
      next,
    },
  })

  const [confirmPassword, setConfirmPassword] = useState("")
  const password = form.watch("password")
  const strength = useMemo(() => {
    if (!password) return undefined
    const score = scorePassword(password, {
      email: form.getValues("email"),
      fullName: form.getValues("fullName"),
    })
    return {
      score,
      label: t.strength[String(score) as "0" | "1" | "2" | "3" | "4"],
    }
  }, [password, form, t.strength])

  function onSubmit(values: RegisterWithPasswordInput) {
    setFormError(null)
    setConfirmError(null)
    if (values.password !== confirmPassword) {
      setConfirmError(t.confirmPasswordMismatch)
      return
    }
    setErrorTone("error")
    startTransition(async () => {
      try {
        const result = await registerWithPassword(values)
        if (!result.ok) {
          setFormError(result.error.message)
          return
        }
        window.location.assign(
          `/verify?email=${encodeURIComponent(values.email)}${next ? `&next=${next}` : ""}`
        )
      } catch {
        // D-35: offline is not "the server is down".
        const failure = describeSubmitFailure(network)
        setErrorTone(failure.tone)
        setFormError(failure.message)
      }
    })
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-4"
        noValidate
      >
        {formError ? (
          <InlineAlert tone={errorTone}>
            {formError}{" "}
            {formError === t.errorEmailTaken ? (
              <a href="/login" className="underline underline-offset-4">
                {t.errorEmailTakenLoginLink}
              </a>
            ) : null}
          </InlineAlert>
        ) : null}

        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.fullNameLabel}</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.emailLabel}</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  {...field}
                />
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
              <FormLabel>{t.passwordLabel}</FormLabel>
              <FormControl>
                <PasswordField
                  autoComplete="new-password"
                  strength={strength}
                  strengthMeterLabel={t.strength.label}
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
          name="termsAccepted"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start gap-2 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(checked) =>
                    field.onChange(checked === true)
                  }
                />
              </FormControl>
              <FormLabel className="font-normal">{t.termsLabel}</FormLabel>
              <FormMessage />
            </FormItem>
          )}
        />

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
