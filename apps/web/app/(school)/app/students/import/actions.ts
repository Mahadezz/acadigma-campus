"use server"

/**
 * F-AC-02 §4.7 bulk import, demo cut (D-106). Shape, twice: parse →
 * workspace context → `can("students.import")` → `requireWritable` (D-300)
 * → repository. Nothing is admitted at preview; `commitStudentImport`
 * admits the valid rows through `public.admit_student`.
 */

import { revalidatePath } from "next/cache"

import {
  apiError,
  apiErrorFromZod,
  commitStudentImportInputSchema,
  err,
  planReadOnlyApiError,
  type ApiError,
  type Result,
} from "@acadigma/contracts"
import {
  createImportBatch,
  getClassesOverview,
  listImportExistingStudents,
  requireWritable,
  runImportBatch,
} from "@acadigma/db"
import { can } from "@acadigma/domain"
import { validateStudentImport } from "@acadigma/domain/academic"
import { todayIn } from "@acadigma/domain/time"

import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"

import { readSheetFile } from "./read-sheet"

const FORBIDDEN = apiError(
  "forbidden",
  "Only an owner or admin can import students."
)

/** A whole-file problem travels as `fieldErrors.file = [code]`, plus the
 * missing column keys in `fieldErrors.columns`. */
function fileError(code: string, columns?: string[]): ApiError {
  return apiError("validation_failed", "This file cannot be imported.", {
    fieldErrors: { file: [code], ...(columns ? { columns } : {}) },
  })
}

export async function previewStudentImport(
  formData: FormData
): Promise<Result<{ batchId: string }, ApiError>> {
  const ctx = await requireWorkspace()
  if (!can(ctx.role, "students.import")) return err(FORBIDDEN)
  const supabase = await createClient()
  const writable = await requireWritable(ctx, supabase)
  if (!writable.ok) return err(planReadOnlyApiError(writable.error))

  const file = formData.get("file")
  const table = await readSheetFile(file instanceof File ? file : null)
  if (!Array.isArray(table)) return err(fileError(table.fileError))

  const [overview, existing] = await Promise.all([
    getClassesOverview(supabase, ctx),
    listImportExistingStudents(supabase, ctx),
  ])
  if (!overview.ok) return overview
  if (!existing.ok) return existing
  const sections = overview.data.grades.flatMap((g) =>
    g.sections.map((s) => ({
      id: s.id,
      gradeName: g.name,
      gradeNameBn: g.nameBn,
      levelNumber: g.levelNumber,
      sectionName: s.name,
    }))
  )

  const checked = validateStudentImport(
    table,
    sections,
    todayIn(),
    existing.data
  )
  if (!checked.ok) {
    return err(fileError(checked.fileError, checked.missingColumns))
  }
  return createImportBatch(supabase, ctx, {
    filename: (file as File).name.slice(0, 200),
    report: checked.report,
    totals: checked.totals,
  })
}

export async function commitStudentImport(
  input: unknown
): Promise<Result<{ createdCount: number }, ApiError>> {
  const parsed = commitStudentImportInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const ctx = await requireWorkspace()
  if (!can(ctx.role, "students.import")) return err(FORBIDDEN)
  const supabase = await createClient()
  const writable = await requireWritable(ctx, supabase)
  if (!writable.ok) return err(planReadOnlyApiError(writable.error))

  const result = await runImportBatch(supabase, ctx, parsed.data.batchId)
  revalidatePath("/app/students")
  revalidatePath("/app/students/import")
  return result
}
