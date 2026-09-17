"use client"

import { useState, useTransition } from "react"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"
import { useForm } from "react-hook-form"

import {
  passwordResetRequestInputSchema,
  type PasswordResetRequestInput,
} from "@acadigma/contracts"
import { Button } from "@acadigma/ui/components/button"
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

import { requestPasswordReset } from "../actions"

/** §4.5 / AC8: always the same success message, whether the address exists or
 * not — the request never distinguishes the two cases, in response or timing. */
export function ForgotForm({ t }: { t: Messages["auth"]["forgot"] }) {
  const [sent, setSent] = useState(false)
  const [isPending, startTransition] = useTransition()

  const form = useForm<PasswordResetRequestInput>({
    resolver: zodResolver(passwordResetRequestInputSchema),
    defaultValues: { email: "" },
  })

  function onSubmit(values: PasswordResetRequestInput) {
    startTransition(async () => {
      await requestPasswordReset(values)
      setSent(true)
    })
  }

  if (sent) {
    return <InlineAlert tone="success">{t.successMessage}</InlineAlert>
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-4"
        noValidate
      >
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
        <a
          href="/login"
          className="text-muted-foreground block text-center text-sm underline-offset-4 hover:underline"
        >
          {t.backToLogin}
        </a>
      </form>
    </Form>
  )
}
