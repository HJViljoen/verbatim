'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { Check, ChevronDown } from 'lucide-react'

import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { setRecommendationStatus } from '@/lib/actions/rec-status'
import { REC_STATUSES, REC_STATUS_LABEL, type RecStatus } from '@/lib/calibration'
import { LEAD_SQUARE, LEAD_UNDECIDED } from './lead-words'

// What you decided about the current recommendation, and "Mark done" (the
// approved preview's lead card, right-hand column; WP3.6 wave 2).
//
// THE PREVIEW'S COLUMN: the decision as a word behind its square, the day you
// marked it in the mono under it, and "Mark done" as the one press. Done is
// `acted_on`, written the way every status is written (`setRecommendationStatus`:
// the `rec_decisions` row first, then the column copy), so it is the same
// decision the ledger's pill would record, and no stored key is new.
//
// THE WORD STAYS A CONTROL. The preview draws it as a still word; here it
// opens the same five statuses the ledger's pill does, behind a quiet chevron,
// because this row is not in the table under the card and a mistaken "Mark
// done" would otherwise have no way back from the page.
//
// APP ONLY. Print draws the same word and day (advice.tsx `LeadWord`), the
// email the word in the card's line, and an export never draws a button
// nobody can press.

const wordOf = (s: RecStatus): string => (s === 'new' ? LEAD_UNDECIDED : REC_STATUS_LABEL[s])

const BUTTON =
  'inline-flex h-11 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md bg-tile px-[18px] text-[14px] font-medium text-secondary-foreground ring-1 ring-border transition-colors hover:bg-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-60'

export function LeadDecision({
  id, status, stamp,
}: {
  /** The newest copy of the recommendation: the row a status is written to. */
  id: string
  status: RecStatus
  /** "you marked it on 15 Sep" for the status the page was read with, or
   *  null (`leadStamp`, formatted on the server). */
  stamp: string | null
}) {
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(status)
  const [shown, setShown] = useOptimistic(saved)
  const [error, setError] = useState('')

  const choose = (next: RecStatus) => {
    if (next === shown) return
    setError('')
    start(async () => {
      setShown(next)
      const res = await setRecommendationStatus(id, next)
      if (res.ok) setSaved(next)
      else setError(res.message)
    })
  }

  // THE DAY IS THE SERVER'S. Once a press lands, the page is re-read (the
  // action revalidates it) and the new day arrives with the new status; until
  // then the old day would sit under the new word, so no day is shown.
  const day = shown === status ? stamp : null

  return (
    <div className="flex min-w-0 flex-col gap-4" data-print-hide>
      <div className="flex flex-col gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger
            title="Change what you decided"
            className={`inline-flex w-fit cursor-pointer items-center gap-2.5 rounded-sm text-[15px] font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${pending ? 'opacity-60' : ''}`}
          >
            <span aria-hidden className={`inline-block size-2 flex-none rounded-[2px] ${LEAD_SQUARE[shown]}`} />
            {wordOf(shown)}
            <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[180px]">
            {REC_STATUSES.map((s) => (
              <DropdownMenuItem key={s} onSelect={() => choose(s)} className="text-[12px]">
                <Check className={`size-3 ${s === shown ? 'opacity-100' : 'opacity-0'}`} aria-hidden />
                {REC_STATUS_LABEL[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {day ? <span className="pl-[18px] font-mono text-[13px] text-muted-foreground">{day}</span> : null}
      </div>
      {shown !== 'acted_on' ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => choose('acted_on')} className={BUTTON}>
            <Check className="size-4 text-muted-foreground" aria-hidden />
            {pending ? 'Saving…' : 'Mark done'}
          </button>
        </div>
      ) : null}
      {/* A FAILED WRITE LOOKS LIKE ONE (the accept button's rule). */}
      {error ? <span role="alert" className="text-[12px] font-medium text-negative">{error}</span> : null}
    </div>
  )
}
