import { notFound } from "next/navigation"

// Dev-only, like /design: a deliberately slow server page, so the Polish
// journey can watch its sibling loading.tsx render (D-409).
export default async function SlowPage() {
  if (process.env.VERCEL_ENV === "production") notFound()
  await new Promise((r) => setTimeout(r, 1500))
  return <h1 className="p-4 text-2xl font-semibold">Slow page loaded</h1>
}
