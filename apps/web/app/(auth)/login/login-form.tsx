"use client"

import { useState, useTransition } from "react"

import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"
import { useForm } from "react-hook-form"

import { Alert, AlertDescription } from "@acadigma/ui/components/alert"
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

import { signInWithPassword } from "./actions"
import { loginSchema, type LoginInput } from "./schema"

/**
 * Email + password sign-in.
 *
 * The Server Action owns the outcome: on success it redirects and this component
 * never re-renders; on failure it returns an ApiError that becomes the alert below.
 * `useTransition` keeps the button honest while the action is in flight.
 */
export function LoginForm({ next }: { next?: string }) {
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", next },
  })

  function onSubmit(values: LoginInput) {
    setFormError(null)
    startTransition(async () => {
      const result = await signInWithPassword(values)
      // Only a failure ever returns; success throws Next's redirect signal.
      if (!result.ok) setFormError(result.error.message)
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
          // Announced to screen readers the moment it appears.
          <Alert variant="destructive" role="alert">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="you@school.edu.bd"
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
              <FormLabel>Password</FormLabel>
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

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2Icon className="animate-spin" aria-hidden="true" />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>
    </Form>
  )
}
