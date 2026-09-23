export * from "./ai/redact"
export * from "./audit"
export * from "./auth"
export * from "./ids"
export * from "./money"
export * from "./nav"
export * from "./notifications"
export * from "./permissions"
export * from "./settings"
export * from "./plans"
export * from "./time"
export * from "./workspace"

// Both catalogues export a `catalogEntry()`, so the two star re-exports above
// are ambiguous for that one name (TS2308). Keep the notification one under its
// original root name and expose the audit one under an explicit alias; the
// `@acadigma/domain/audit` subpath still exports it unaliased.
export { catalogEntry } from "./notifications"
export { catalogEntry as auditCatalogEntry } from "./audit"
