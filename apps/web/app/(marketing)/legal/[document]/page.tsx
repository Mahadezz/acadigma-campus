import Link from "next/link"
import { notFound } from "next/navigation"

import {
  LEGAL_DOCUMENTS,
  isLegalDocumentKey,
  type LegalDocumentKey,
} from "@/lib/legal/documents"
import { LegalText } from "@/lib/legal/legal-text"

import type { Metadata } from "next"

type Params = Promise<{ document: string }>

const TITLES: Record<LegalDocumentKey, string> = {
  terms: "Terms of Use",
  privacy: "Privacy Notice",
  dpa: "Data Processing Agreement",
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
  const { document } = await params
  return isLegalDocumentKey(document)
    ? { title: `${TITLES[document]} — Acadigma Campus` }
    : {}
}

export default async function LegalPage({ params }: { params: Params }) {
  const { document } = await params
  if (!isLegalDocumentKey(document)) notFound()

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
        {(Object.keys(TITLES) as LegalDocumentKey[])
          .filter((key) => key !== document)
          .map((key) => (
            <Link
              key={key}
              href={`/legal/${key}`}
              className="inline-flex min-h-11 items-center underline underline-offset-4"
            >
              {TITLES[key]}
            </Link>
          ))}
      </nav>
    </main>
  )
}
