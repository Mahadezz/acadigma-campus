import Link from "next/link"
import { notFound } from "next/navigation"

import { LEGAL_DOCUMENTS, type LegalDocumentKey } from "@/lib/legal/documents"
import { LegalText } from "@/lib/legal/legal-text"

import type { Metadata } from "next"

type Params = Promise<{ document: string }>

/** `dynamicParams = false` alone still rendered an unknown slug (and threw)
 * in the production build, so the page checks too. */
function documentKey(slug: string): LegalDocumentKey {
  if (!Object.hasOwn(LEGAL_DOCUMENTS, slug)) notFound()
  return slug as LegalDocumentKey
}

/** D-114: `/legal/terms`, `/legal/privacy`, `/legal/dpa` — public, the
 * current version of each text a person agrees to. English only until the
 * reviewed Bengali versions exist. */
export const dynamicParams = false

export function generateStaticParams() {
  return Object.keys(LEGAL_DOCUMENTS).map((document) => ({ document }))
}

export async function generateMetadata({
  params,
}: {
  params: Params
}): Promise<Metadata> {
  const document = documentKey((await params).document)
  return { title: `${LEGAL_DOCUMENTS[document].title} — Acadigma Campus` }
}

export default async function LegalPage({ params }: { params: Params }) {
  const document = documentKey((await params).document)

  return (
    <main
      id="main"
      lang="en"
      className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6"
    >
      <LegalText text={LEGAL_DOCUMENTS[document].text} />
      <nav
        aria-label="Legal documents"
        className="mt-10 flex flex-wrap gap-x-4 border-t pt-4 text-sm"
      >
        {Object.entries(LEGAL_DOCUMENTS)
          .filter(([key]) => key !== document)
          .map(([key, d]) => (
            <Link
              key={key}
              href={`/legal/${key}`}
              className="inline-flex min-h-11 items-center underline underline-offset-4"
            >
              {d.title}
            </Link>
          ))}
      </nav>
    </main>
  )
}
