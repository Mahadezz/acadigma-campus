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

/**
 * Routes where the URL itself is a bearer credential.
 *
 * SECURITY.md §3 "Finding 6 — further hardening" requires `Referrer-Policy:
 * no-referrer` on exactly this route class, stricter than the site-wide
 * `strict-origin-when-cross-origin` above: `/reset?token_hash=…` and
 * `/api/auth/callback?token_hash=…` carry a single-use recovery/confirmation
 * token in the query string, and `strict-origin-when-cross-origin` still sends
 * the **full URL** on same-origin navigations and subresource requests. One
 * cross-origin asset or outbound link on those pages leaks the token.
 *
 * The header is the second line of defence, not the first — F-ID-01 §4.5 should
 * still be revisited to move the token out of the query string entirely.
 */
const TOKEN_BEARING_ROUTES = ["/reset", "/api/auth/callback", "/verify"]

const noReferrerHeaders = [
  ...securityHeaders.filter((h) => h.key !== "Referrer-Policy"),
  { key: "Referrer-Policy", value: "no-referrer" },
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
        hostname: "kekfmibwjejdhxjkmezo.supabase.co",
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

  /**
   * PDF hotfix (F-OP-03, D-204/D-205 render pipeline): `pdfkit` (via
   * `@react-pdf/renderer`) resolves its built-in Helvetica/Times/Courier
   * glyph data through Node's own package `imports` map
   * (`require('#standard-fonts/Helvetica')`, resolved against pdfkit's own
   * `package.json`). Webpack's default resolver does not honour that map
   * when it bundles the package into the Next.js server chunk — the require
   * survives as a literal string but loses pdfkit's package.json as its
   * resolution root once bundled, so it 404s at runtime with "Cannot find
   * module '#standard-fonts/Helvetica'" (production-only: `next dev`/`next
   * start` against an unbundled `.next` do not hit this bundling path the
   * same way `next build`'s Vercel output does).
   *
   * `serverExternalPackages` takes the whole `@react-pdf/renderer` ->
   * `pdfkit`/`fontkit` subtree out of the webpack graph entirely — Node
   * `require()`s it directly from `node_modules` at request time, where
   * pdfkit's own `package.json` is intact and `#standard-fonts/*` resolves
   * normally at runtime.
   *
   * Output file tracing (`@vercel/nft`) still has to know to COPY those
   * font files into the deployed function in the first place. Verified by
   * building and inspecting `route.js.nft.json`: nft follows the ordinary
   * `require`/`import` calls pdfkit makes (and includes `pdfkit.node.mjs`
   * itself) but does not walk the *dynamic* per-glyph `require('#standard-
   * fonts/Helvetica')` calls pdfkit issues through its own `createRequire`
   * — those come back as "cannot resolve" during nft's own trace, so they
   * never make it into the file list on their own. `outputFileTracingIncludes`
   * force-includes the directory those calls read from, for both places
   * this route in `@acadigma/pdf` renders a PDF (the download route and the
   * server actions that kick a render right after `createReportRun`).
   */
  serverExternalPackages: ["@react-pdf/renderer", "pdfkit", "fontkit"],
  outputFileTracingIncludes: {
    "/api/pdf/[runId]": ["./node_modules/pdfkit/js/standard-fonts/**"],
    "/app/reports": ["./node_modules/pdfkit/js/standard-fonts/**"],
  },

  async headers() {
    return [
      // More specific first: Next applies every matching entry, and the later
      // `Referrer-Policy` wins, so the token-bearing routes must come after the
      // catch-all to actually override it.
      { source: "/:path*", headers: securityHeaders },
      ...TOKEN_BEARING_ROUTES.map((source) => ({
        source,
        headers: noReferrerHeaders,
      })),
    ]
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
