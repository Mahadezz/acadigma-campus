# Investigation — loading.tsx on exams and marks (D-409 follow-up)

|        |                                                                           |
| ------ | ------------------------------------------------------------------------- |
| Status | **OPEN** — root cause not found; no fix shipped; exemption still in place |
| PR     | #135 (draft)                                                              |
| Date   | 2026-10-01                                                                |

## What happens

With `loading.tsx` on `exams/`, `exams/[id]/` and `marks/[examSubjectId]/`, the e2e-live journeys that act on the exam detail page (`Schedule`, `Start exam`, `Open marks entry`, `Lock marks`, `Compute results`, `Publish`) intermittently never see the page update after the action. The button stays disabled (`pending` stuck true) or the old status stays. About 10 % of actions. Without the `loading.tsx` files the same journeys are green on `main`.

## Evidence (CI traces and a replay)

- Both the action POST and the `router.refresh()` GET complete with HTTP 200 and full bodies, in the failing steps too (resource timing, and a tee of every `_rsc` and action response into the console).
- The bodies of a failing step were replayed offline through Next's compiled Flight client with the recorded chunk boundaries: parse resolves in ms, every lazy row `resolved_model` or `resolved_module`, same as for the passing steps. So the stream is not malformed and not split badly.
- Server side is fine: per-request logs show layout, template and page renders all complete after each action; no errors in the server output.
- In a passing step the UI commits (`pending=false`, new status) about 10 ms after the refresh GET ends. In a failing step no render happens after both responses are fully received. The stall is in the client router or React, after the data has arrived.
- The failing steps are always the ones where the page's own server component tree is re-fetched after an action (the action response with `revalidatePath` of the current page, or `router.refresh()`). The marks-entry save and submit steps do not fail, but they do not depend on the refreshed tree (the component sets its own state).
- No "Failed to fetch RSC payload" or hard-navigation fallback in the control traces.

## Ruled out (CI, 4 shards x repeat-each=3, exam journeys only; failure counts are noisy)

| Variant                                                                                            | Result                                              |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| control: `loading.tsx` only                                                                        | 6 failed, 10 flaky of 48                            |
| action awaited outside a transition, `router.refresh()` in its own `startTransition` (hook)        | 4 failed, 9 flaky                                   |
| `router.refresh()` removed, rely on `revalidatePath`                                               | 3 failed, 3 flaky (two shards clean)                |
| `revalidatePath` removed, `router.refresh()` only                                                  | 7 failed, 3 flaky                                   |
| `revalidatePath` with the route pattern (`/app/exams/[id]`) instead of the concrete path           | not better (one run)                                |
| Lab route (loading.tsx + action + revalidatePath + `router.refresh()` in `startTransition(async)`) | 200 iterations at 6x CPU, 0 failures                |
| Next 15.5.26 / 15.5.27                                                                             | not installable (pnpm trust and release-age checks) |

So it is not `router.refresh()` inside an async transition, not the revalidation path form, not the stream, not the server.

## Leading theory

A client-side stall of the router's transition when the re-fetched tree sits under a `loading.tsx` Suspense boundary on a route with this shell (React transitions entangle: a pending suspended update keeps the whole batch, including `isPending`, from committing). Something in the real shell is needed on top of what the lab has. Candidates: the service worker, `template.tsx` (async server template above the boundary), the offline provider and its page copy fetch, large `exam` props.

## Next experiments

1. #147 (service workers blocked in Playwright) and #149 (`template.tsx` replaced by a pass-through), same repeat-each=3 harness. Both open at the time of writing.
2. Replay harness: serve the CI `build` artifact with a tiny Node server that streams the recorded HTML, RSC and action responses with the recorded chunk timing; run the real client in Chromium with CPU throttling and loop the Schedule click. That gives a fast local loop for bisecting shell components.
3. If nothing isolates it: ship skeletons only where no refresh of the page's own tree happens (exams list via a route group, exam results, marks entry) and keep the exam detail page exempt, with this document as the reason.

## How to reproduce a run

Temporary branch edits (never merge): in `.github/workflows/ci.yml` append `e2e/journeys/enter-marks.spec.ts e2e/journeys/guardian-invite.spec.ts e2e/journeys/exams.spec.ts e2e/journeys/compute-results.spec.ts e2e/journeys/publish-results.spec.ts --pass-with-no-tests --repeat-each=3` to the Playwright line of the e2e-live job, open a non-draft PR (drafts skip e2e-live). Traces of the retry are in the `playwright-report-live-N` artifacts.
