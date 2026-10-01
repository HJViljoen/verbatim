'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'

import { acceptAdvice } from '@/lib/actions/accept-advice'
import { setRecommendationStatus } from '@/lib/actions/rec-status'
import { BTN_PRIMARY_SMALL, BTN_SECONDARY_SMALL } from './parts'

// A piece of advice's two answers (the artboard): Accept dates it as a move
// (`acceptAdvice`, keyed on the LINEAGE, which outlives the row), and "Not for
// us" files it as dismissed on the newest copy (`setRecommendationStatus`).
// Either way the page is re-read and the row leaves the list.

export function ConsiderActions({ lineageId, recommendationId, title }: { lineageId: string; recommendationId: string; title: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) => start(async () => {
    const r = await fn()
    setError(r.ok ? null : r.message)
  })
  return (
    <div className="flex flex-col items-end gap-1.5" data-print-hide>
      <div className="flex gap-2 pt-0.5">
        <button type="button" disabled={pending} onClick={() => run(() => acceptAdvice(lineageId, title))} className={BTN_PRIMARY_SMALL}>
          <Check className="size-[15px]" aria-hidden />
          Accept
        </button>
        <button type="button" disabled={pending} onClick={() => run(() => setRecommendationStatus(recommendationId, 'dismissed'))} className={BTN_SECONDARY_SMALL}>
          Not for us
        </button>
      </div>
      {error ? <p role="alert" className="m-0 max-w-[240px] text-right text-[11.5px] leading-[1.4] text-negative">{error}</p> : null}
    </div>
  )
}
