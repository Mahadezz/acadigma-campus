"use client"

import { useState, type ReactNode } from "react"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"

import { Toaster } from "@acadigma/ui/components/sonner"

/**
 * Server state lives in TanStack Query, keyed by workspace (ARCHITECTURE §6).
 * There is no global store: UI state stays local to the component that owns it.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Long enough that navigating back to a screen does not refetch, short
        // enough that a teacher's roll call is never a minute stale.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => {
          // Authorisation failures never succeed on retry.
          const status = (error as { status?: number }).status
          if (status === 401 || status === 403) return false
          return failureCount < 2
        },
        refetchOnWindowFocus: false,
      },
      mutations: { retry: 0 },
    },
  })
}

export function Providers({ children }: { children: ReactNode }) {
  // useState, not a module-level singleton: on the server a shared client would
  // leak one request's cache into the next user's response.
  const [queryClient] = useState(makeQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
        {/* aria-live region for toasts, per ARCHITECTURE §6. */}
        <Toaster position="top-center" richColors closeButton />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
