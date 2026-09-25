/**
 * `@types/pdf-parse` only types the package root (`pdf-parse`). This
 * package's tests import `pdf-parse/lib/pdf-parse.js` directly instead —
 * see the comment in `golden.test.ts` for why — so this ambient module
 * re-exports the same shape for that subpath.
 */
declare module "pdf-parse/lib/pdf-parse.js" {
  import pdfParse from "pdf-parse"

  export default pdfParse
}
