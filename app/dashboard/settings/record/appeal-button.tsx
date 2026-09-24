'use client'

import { useActionState } from 'react'
import { fileGateAppeal, type AppealState } from './actions'
import { AppealControl } from './appeal-control'
import { APPEAL_FILED } from './appeal-copy'

// "This should have been kept" — one button per discarded candidate.
//
// The button is a STATEMENT, and a statement made twice is the same statement:
// gate_appeals is unique on the verdict's own key, so a second click reads
// "Already filed". The row that has one says so rather than offering the
// button again.
//
// THE MARKUP IS `AppealControl` AND THE COPY IS `appeal-copy.ts`. This file
// holds the action and the state and nothing else, so the render tier can
// assert the control a reader actually gets rather than a stand-in (design
// review finding 2, code review finding 7) — and so one state cannot be
// described by two different sentences (finding 10).

const initial: AppealState = { ok: false, message: '' }

export function AppealButton({
  runId, platform, videoId, filed,
}: { runId: string | null; platform: string; videoId: string; filed: boolean }) {
  const [state, action, pending] = useActionState(fileGateAppeal, initial)

  if (filed || state.ok) {
    return <AppealControl filed={state.message || APPEAL_FILED} />
  }

  return (
    <form action={action}>
      <input type="hidden" name="runId" value={runId ?? ''} />
      <input type="hidden" name="platform" value={platform} />
      <input type="hidden" name="videoId" value={videoId} />
      <AppealControl pending={pending} error={state.message || null} />
    </form>
  )
}
