"use client"

import { useEffect, useState, useTransition } from "react"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"
import { useForm } from "react-hook-form"

import {
  signInWithPasswordInputSchema,
  type SignInWithPasswordInput,
} from "@acadigma/contracts"
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

import type { Messages } from "@/lib/i18n"

import { signInWithPassword } from "../actions"

/** Pulls the numeric countdown out of a "... in 900s." message so the button can
 * tick it down live, without widening the shared `ApiError` shape for one screen. */
function extractSeconds(message: string): number | null {
  const match = /(\d+)s/.exec(message)
  return match?.[1] ? Number(match[1]) : null
}

/**
 * Email + password sign-in (F-ID-01 §6 `/login`).
 *
 * The Server Action owns the outcome: on success it redirects and this component
 * never re-renders; on failure it returns an ApiError that becomes the alert below.
 * A rate-limit error additionally drives a live countdown (§6 "throttle shows a
 * live countdown") and disables the submit button until it elapses — AC6: the
 * blocked attempt never re-runs the credential check.
 */
export function LoginForm({
  t,
  next,
}: {
  t: Messages["auth"]["login"]
  next?: string
}) {
  const [formError, setFormError] = useState<string | null>(null)
  const [retrySeconds, setRetrySeconds] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<SignInWithPasswordInput>({
    resolver: zodResolver(signInWithPasswordInputSchema),
    defaultValues: { email: "", password: "", remember: true, next },
  })

  useEffect(() => {
    if (retrySeconds === null || retrySeconds <= 0) return
    const id = setTimeout(
      () => setRetrySeconds((s) => (s === null ? null : s - 1)),
      1000
    )
    return () => clearTimeout(id)
  }, [retrySeconds])

  function onSubmit(values: SignInWithPasswordInput) {
    setFormError(null)
    startTransition(async () => {
      const result = await signInWithPassword(values)
      // Only a failure ever returns; success throws Next's redirect signal.
      if (!result.ok) {
        setFormError(result.error.message)
        if (result.error.code === "rate_limited") {
          setRetrySeconds(extractSeconds(result.error.message))
        }
      }
    })
  }

  const throttled = retrySeconds !== null && retrySeconds > 0

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-4"
        noValidate
      >
        {formError ? (
          <InlineAlert tone="error">
            {throttled
              ? t.throttled.replace("{seconds}", String(retrySeconds))
              : formError}
          </InlineAlert>
        ) : null}

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
                  autoComplete="username"
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
              <div className="flex items-center justify-between">
                <FormLabel>{t.passwordLabel}</FormLabel>
                <a
                  href="/forgot"
                  className="text-primary text-sm underline-offset-4 hover:underline"
                >
                  {t.forgotPasswordLink}
                </a>
              </div>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="current-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="remember"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <FormLabel className="font-normal">{t.rememberLabel}</FormLabel>
            </FormItem>
          )}
        />

        {/* h-12 = 48px, the sticky-footer submit target §6 requires on phone. */}
        <Button
          type="submit"
          className="h-12 w-full"
          disabled={isPending || throttled}
        >
          {isPending ? (
            <>
              <Loader2Icon className="animate-spin" aria-hidden="true" />
              {t.submittingButton}
            </>
          ) : throttled ? (
            t.throttled.replace("{seconds}", String(retrySeconds))
          ) : (
            t.submitButton
          )}
        </Button>
      </form>
    </Form>
  )
}
