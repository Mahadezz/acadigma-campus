/**
 * Test-only stand-in for the `server-only` npm package.
 *
 * `server-only`'s real implementation throws when `window` is defined, which is
 * true in vitest's jsdom environment and would make every module under
 * `apps/web/lib`/`apps/web/app` (all of which start with `import "server-only"`)
 * unimportable from a test. The package is also not an installed dependency of
 * this repo at all — Next.js resolves the literal string via its own
 * webpack/Turbopack alias at build time, which vitest does not go through.
 *
 * `vitest.config.ts` (`test.projects`) aliases `"server-only"` to this file
 * for the `web` project only; it never touches the real Next.js build.
 */
export {}
