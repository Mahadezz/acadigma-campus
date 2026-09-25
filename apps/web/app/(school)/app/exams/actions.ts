"use server"

/**
 * F-AC-06 Part 2 (demo cut, D-303) — `createExam`, `setExamStatus` and
 * `updateExamSubject` (§7). parse -> context -> policy (`exams.write`) ->
 * requireWritable -> domain (status chain) -> repository -> revalidate.
 */

import { revalidatePath } from "next/cache"

import {
  apiError,
  apiErrorFromZod,
  createExamInputSchema,
  err,
  planReadOnlyApiError,
  setExamStatusInputSchema,
  updateExamSubjectInputSchema,
  type ApiError,
  type Result,
} from "@acadigma/contracts"
import { requireWritable, type WorkspaceContext } from "@acadigma/db"
import {
  createExam as createExamRepo,
  getExam,
  setExamStatus as setExamStatusRepo,
  updateExamSubject as updateExamSubjectRepo,
} from "@acadigma/db/repositories/exams"
import { can } from "@acadigma/domain"
import { checkExamTransition } from "@acadigma/domain/academic"

import { createClient } from "@/lib/supabase/server"
import { requireWorkspace } from "@/lib/workspace"

const EXAMS_PATH = "/app/exams"

type Gate = Result<
  { ctx: WorkspaceContext; supabase: Awaited<ReturnType<typeof createClient>> },
  ApiError
>

async function gateWrite(): Promise<Gate> {
  const ctx = await requireWorkspace()
  if (!can(ctx.role, "exams.write")) {
    return err(
      apiError("forbidden", "Only an owner or admin can change exams.")
    )
  }
  const supabase = await createClient()
  const writable = await requireWritable(ctx, supabase)
  if (!writable.ok) return err(planReadOnlyApiError(writable.error))
  return { ok: true, data: { ctx, supabase } }
}

export async function createExam(
  input: unknown
): Promise<Result<{ examId: string }, ApiError>> {
  const parsed = createExamInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const gate = await gateWrite()
  if (!gate.ok) return gate

  const result = await createExamRepo(
    gate.data.ctx,
    gate.data.supabase,
    parsed.data
  )
  if (result.ok) revalidatePath(EXAMS_PATH)
  return result
}

export async function setExamStatus(
  input: unknown
): Promise<Result<void, ApiError>> {
  const parsed = setExamStatusInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const gate = await gateWrite()
  if (!gate.ok) return gate
  const { ctx, supabase } = gate.data

  const exam = await getExam(ctx, supabase, parsed.data.examId)
  if (!exam.ok) return exam
  const check = checkExamTransition(
    exam.data.status,
    parsed.data.status,
    parsed.data.reason
  )
  if (!check.ok) {
    return err(
      check.code === "REASON_REQUIRED"
        ? apiError(
            "validation_failed",
            "Give a reason for going back a step.",
            {
              fieldErrors: { reason: ["REASON_REQUIRED"] },
            }
          )
        : apiError(
            "conflict",
            "That status change is not allowed from the exam's current status."
          )
    )
  }

  const result = await setExamStatusRepo(ctx, supabase, parsed.data)
  if (result.ok) revalidatePath(`${EXAMS_PATH}/${parsed.data.examId}`)
  return result
}

export async function updateExamSubject(
  input: unknown
): Promise<Result<void, ApiError>> {
  const parsed = updateExamSubjectInputSchema.safeParse(input)
  if (!parsed.success) return err(apiErrorFromZod(parsed.error))

  const gate = await gateWrite()
  if (!gate.ok) return gate

  const result = await updateExamSubjectRepo(
    gate.data.ctx,
    gate.data.supabase,
    parsed.data
  )
  if (result.ok) revalidatePath(EXAMS_PATH, "layout")
  return result
}
