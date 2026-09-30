import Link from "next/link"

import { LEGAL_DOCUMENTS, type LegalDocumentKey } from "@/lib/legal/documents"
import { LegalText } from "@/lib/legal/legal-text"

import type { Metadata } from "next"

// `dynamicParams = false`: any other slug is a 404 before this code runs.
type Params = Promise<{ document: LegalDocumentKey }>

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
  const { document } = await params
  return { title: `${LEGAL_DOCUMENTS[document].title} — Acadigma Campus` }
}

export default async function LegalPage({ params }: { params: Params }) {
  const { document } = await params

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
