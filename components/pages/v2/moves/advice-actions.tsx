'use client'

import { useState, useTransition } from 'react'

import { acceptAdvice } from '@/lib/actions/accept-advice'
import { setRecommendationStatus } from '@/lib/actions/rec-status'
import { BTN, BTN_INK } from './parts'

// A piece of advice's answers (boards E6-Moves and E6-Moves-Open). Accept
// dates it as a move on its LINEAGE (`acceptAdvice`), Not for us files it
// dismissed on the newest copy (`setRecommendationStatus`). Both are an
// owner's or an admin's (lib/moves-access.ts): the page draws neither for
// anyone else, and the actions refuse anyone else anyway.
//
// IN THE OPEN PANEL, "Accept and date it as a move" takes the day the change
// was made, where MF5 is applied here (`datable`): a day from the window's
// first to today, today by default. On a card, Accept dates it today.

type Run = () => Promise<{ ok: boolean; message: string }>

function useAnswer() {
  const [pending, start] = useTransition()
  const [said, setSaid] = useState<{ ok: boolean; message: string } | null>(null)
  const run = (fn: Run) => start(async () => setSaid(await fn()))
  return { pending, said, run }
}

function Said({ said }: { said: { ok: boolean; message: string } | null }) {
  if (!said?.message) return null
  return (
    <p role={said.ok ? 'status' : 'alert'} className={`m-0 w-full text-[12px] leading-[1.4] ${said.ok ? 'text-muted-foreground' : 'text-negative'}`}>
      {said.message}
    </p>
  )
}

/** The card's Accept and Not for us. */
export function AdviceAnswers({ lineageId, recommendationId, title }: { lineageId: string; recommendationId: string; title: string }) {
  const { pending, said, run } = useAnswer()
  return (
    <>
      <button type="button" disabled={pending} className={BTN_INK} onClick={() => run(() => acceptAdvice(lineageId, title.slice(0, 120)))}>
        Accept
      </button>
      <button type="button" disabled={pending} className={BTN} onClick={() => run(() => setRecommendationStatus(recommendationId, 'dismissed'))}>
        Not for us
      </button>
      <Said said={said} />
    </>
  )
}

/** The open panel's "Accept and date it as a move" and Not for us. */
export function AcceptDated({
  lineageId, recommendationId, title, dating,
}: {
  lineageId: string
  recommendationId: string
  title: string
  /** The day's window, where MF5 is applied; null dates it today. */
  dating: { today: string; earliest: string } | null
}) {
  const { pending, said, run } = useAnswer()
  const [day, setDay] = useState(dating?.today ?? '')
  return (
    <>
      {dating ? (
        <label className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
          <span>Made on</span>
          <input
            type="date"
            value={day}
            min={dating.earliest}
            max={dating.today}
            onChange={(e) => setDay(e.target.value)}
            className="h-[38px] rounded-lg border border-border bg-card px-2.5 text-[13.5px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      ) : null}
      <button type="button" disabled={pending} className={BTN_INK} onClick={() => run(() => acceptAdvice(lineageId, title.slice(0, 120), dating ? day || null : null))}>
        Accept and date it as a move
      </button>
      <button type="button" disabled={pending} className={BTN} onClick={() => run(() => setRecommendationStatus(recommendationId, 'dismissed'))}>
        Not for us
      </button>
      <Said said={said} />
    </>
  )
}
