import { Fragment, type ReactNode } from "react"

/**
 * Renders a text from `texts.ts` exactly as written: `# ` title, `## `
 * heading, `- ` list item, blank line between blocks. The words on screen
 * are the words that were hashed (D-114), so nothing here rewrites them.
 */
export function LegalText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/)
  return (
    <div className="space-y-4 text-sm leading-relaxed sm:text-base">
      {blocks.map((block, i) => {
        if (block.startsWith("# ")) {
          return (
            <h1 key={i} className="text-2xl font-semibold tracking-tight">
              {block.slice(2)}
            </h1>
          )
        }
        if (block.startsWith("## ")) {
          return (
            <h2 key={i} className="pt-2 text-lg font-semibold">
              {block.slice(3)}
            </h2>
          )
        }
        if (block.startsWith("- ")) {
          return (
            <ul key={i} className="list-disc space-y-1 ps-5">
              {block.split("\n").map((line, j) => (
                <li key={j}>{line.replace(/^- /, "")}</li>
              ))}
            </ul>
          )
        }
        return <p key={i}>{block}</p>
      })}
    </div>
  )
}

/** `"… {terms} and {privacy}"` with each `{key}` replaced by a node
 * (the template is our own message, never user input). */
export function fillNodes(
  template: string,
  nodes: Record<string, ReactNode>
): ReactNode {
  return template
    .split(/\{(\w+)\}/)
    .map((part, i) => <Fragment key={i}>{i % 2 ? nodes[part] : part}</Fragment>)
}

/** A legal document, opened beside the form so what was typed is kept. */
export function LegalLink({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-4"
    >
      {children}
    </a>
  )
}
