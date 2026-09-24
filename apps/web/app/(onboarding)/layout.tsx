/**
 * F-ID-05 Part 2 — the `/onboarding` route group's chrome. Deliberately thin:
 * `OnboardingShell` (`@acadigma/ui/primitives/onboarding-shell`) owns the
 * actual header/back-link/progress-bar frame every screen renders inside, so
 * this layout is only the `<main id="main">` landmark every route group in
 * this app provides for the skip link (matches `(auth)/layout.tsx`).
 */
export default function OnboardingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh">
      <main id="main">{children}</main>
    </div>
  )
}
