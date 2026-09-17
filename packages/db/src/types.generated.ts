/**
 * PLACEHOLDER — regenerate with `pnpm db:types` once `supabase/migrations` has run
 * against the project. The generated file replaces this one wholesale and is
 * committed; CI fails when it is stale (ARCHITECTURE §4).
 *
 * Until then the schema is described loosely enough that `supabase-js` accepts any
 * table name while still giving us a single `Database` type to swap out. Code that
 * reads rows validates them with Zod at the boundary, so nothing here is trusted as
 * a type assertion.
 */

/** A row with columns we cannot name yet. */
type UnknownRow = Record<string, unknown>

type UnknownTable = {
  Row: UnknownRow
  Insert: UnknownRow
  Update: UnknownRow
  Relationships: []
}

type UnknownFunction = {
  Args: UnknownRow
  Returns: unknown
}

export type Database = {
  public: {
    Tables: { [tableName: string]: UnknownTable }
    Views: { [viewName: string]: UnknownTable }
    Functions: { [functionName: string]: UnknownFunction }
    Enums: { [enumName: string]: string }
    CompositeTypes: { [typeName: string]: UnknownRow }
  }
}

/** Convenience aliases that survive the swap to generated types. */
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"]

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"]

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"]
