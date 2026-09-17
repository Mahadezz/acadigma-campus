import type { ApiError } from "./errors"

/**
 * Explicit success/failure instead of exceptions, so every caller is forced by the
 * type system to handle the failure path (ARCHITECTURE §5). Server actions and route
 * handlers return `Result<T>`; only genuinely unexpected faults throw.
 */
export type Ok<T> = { ok: true; data: T }
export type Err<E = ApiError> = { ok: false; error: E }
export type Result<T, E = ApiError> = Ok<T> | Err<E>

export function ok<T>(data: T): Ok<T> {
  return { ok: true, data }
}

export function err<E = ApiError>(error: E): Err<E> {
  return { ok: false, error }
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok
}

/** Maps the success value, leaving a failure untouched. */
export function mapResult<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  return result.ok ? ok(fn(result.data)) : result
}

/**
 * Escape hatch for call sites that genuinely cannot continue without the value
 * (tests, scripts). Never use this in a request path — return the Err instead.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error(
      `Tried to unwrap a failed Result: ${JSON.stringify(result.error)}`
    )
  }
  return result.data
}
