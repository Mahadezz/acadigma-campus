import withSerwistInit from "@serwist/next"

import type { NextConfig } from "next"

/**
 * Content Security Policy.
 *
 * Shipped as `Content-Security-Policy-Report-Only` for now: a wrong CSP breaks the
 * app silently in a way that is hard to notice in review, so the policy is
 * observed in production first and promoted to enforcing once the report stream is
 * clean (ARCHITECTURE §11).
 *
 * `'unsafe-inline'` on script-src is required by Next's inline bootstrap and RSC
 * flight payloads; nonces would need every response to be dynamic. `'unsafe-eval'`
 * is development-only, for React Refresh.
 */
function contentSecurityPolicy(): string {
  const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  const supabaseSocket = supabaseOrigin.replace(/^https:/, "wss:")
  const isDev = process.env.NODE_ENV === "development"

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${supabaseOrigin} ${supabaseSocket} https://*.sentry.io`,
    "frame-ancestors 'none'",
    "form-action 'self' https://sandbox.sslcommerz.com https://securepay.sslcommerz.com",
    "base-uri 'self'",
    "object-src 'none'",
    // `upgrade-insecure-requests` is ignored in a report-only policy and logs a
    // console error for it; it goes in when the policy is promoted to enforcing.
  ]
    .filter(Boolean)
    .join("; ")
}

const securityHeaders = [
  {
    key: "Content-Security-Policy-Report-Only",
    value: contentSecurityPolicy(),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // No feature in this product needs these; deny them by default.
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Workspace packages ship TypeScript source rather than a build step.
  transpilePackages: [
    "@acadigma/ui",
    "@acadigma/db",
    "@acadigma/domain",
    "@acadigma/contracts",
  ],

  images: {
    // Everything user-uploaded is served from Supabase Storage behind a signed URL.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "bvqzhrvcrxebawjusrxk.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },

  experimental: {
    // Import only the icons a file actually uses, instead of the whole barrel.
    optimizePackageImports: ["lucide-react", "@acadigma/ui"],
    // Enables `forbidden()` and its `forbidden.tsx` route file, so an authorisation
    // failure returns a real HTTP 403 instead of a 200 page that says "forbidden".
    authInterrupts: true,
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
}

/**
 * PWA (ARCHITECTURE §6). Disabled in development, where the service worker would
 * serve a stale shell over every hot reload.
 */
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // reloadOnOnline is deliberately off: reloading the page the moment connectivity
  // returns would throw away a half-finished attendance register.
  reloadOnOnline: false,
})

export default withSerwist(nextConfig)
