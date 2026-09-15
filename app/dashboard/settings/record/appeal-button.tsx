'use client'

import { useActionState } from 'react'
import { fileGateAppeal, type AppealState } from './actions'

// "This should have been kept" — one button per discarded candidate.
//
// The button is a STATEMENT, and a statement made twice is the same statement:
// gate_appeals is unique on the verdict's own key, so a second click reads
// "Already filed". The row that has one says so rather than offering the
// button again.

const initial: AppealState = { ok: false, message: '' }

export function AppealButton({
  runId, platform, videoId, filed,
}: { runId: string | null; platform: string; videoId: string; filed: boolean }) {
  const [state, action, pending] = useActionState(fileGateAppeal, initial)

  if (filed || state.ok) {
    return <span className="text-[11.5px] text-muted-foreground">{state.message || 'Filed — we will look at this one.'}</span>
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="runId" value={runId ?? ''} />
      <input type="hidden" name="platform" value={platform} />
      <input type="hidden" name="videoId" value={videoId} />
      <button
        type="submit"
        disabled={pending}
        className="shrink-0 rounded-[3px] text-[11.5px] font-medium text-secondary-foreground transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
      >
        {pending ? 'Filing…' : 'This should have been kept'}
      </button>
      {state.message && !state.ok && <span className="text-[11.5px] text-negative">{state.message}</span>}
    </form>
  )
}
