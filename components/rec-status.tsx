'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { setRecommendationStatus } from '@/lib/actions/rec-status'
import { REC_STATUSES, REC_STATUS_LABEL, type RecStatus } from '@/lib/calibration'

// The recommendation lifecycle control (WP7c). Quiet chrome, MASTER rule 1:
// a status that is still 'new' shows as a hairline word, not a filled badge —
// the tile's meaning is the recommendation, not its admin state. Only a status
// the client has actually set earns any colour.
//
// App only. On paper a status is a WORD (RecStatusWord below), never a button:
// an export must not render a control nobody can press.
//
// TWO SHAPES, ADDITIVE (Block D wave 2). `inline` is the hairline word this has
// always been, and every caller that had one keeps it. `pill` is the artboard's
// ledger cell: a 30px ring-bounded pill carrying the word, the date the client
// set it and a chevron, wide enough to read as the one control on a row of
// seven columns. The TONE table is shared by both, so a status still earns its
// colour the same way in either shape.

const TONE: Record<RecStatus, string> = {
  new: 'text-muted-foreground',
  acknowledged: 'text-secondary-foreground',
  in_progress: 'text-you',
  acted_on: 'text-positive',
  dismissed: 'text-muted-foreground',
}

export function RecStatusMenu({
  id, status, className, variant = 'inline', decidedAt,
}: {
  id: string
  status: RecStatus
  className?: string
  variant?: 'inline' | 'pill'
  /** Printed inside the pill, already formatted by the caller — the ledger's
   *  "Working on it · 2 Sep". Nothing invents it and `inline` ignores it. */
  decidedAt?: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(status)
  const [shown, setShown] = useOptimistic(saved)
  const [error, setError] = useState('')

  const choose = (next: RecStatus) => {
    if (next === shown) return
    startTransition(async () => {
      setShown(next)
      const res = await setRecommendationStatus(id, next)
      if (res.ok) setSaved(next)
      else setError(res.message)
    })
  }

  const pill = variant === 'pill'
  const shape = pill
    ? 'inline-flex h-[30px] w-fit items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium ring-1 ring-border transition-colors hover:bg-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
    : 'inline-flex h-[18px] items-center gap-0.5 rounded-[4px] px-1 text-[10.5px] leading-none transition-colors hover:bg-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-print-hide
        title={error || 'Move this recommendation through its lifecycle'}
        className={`${shape} ${error ? 'text-negative' : TONE[shown]} ${pending ? 'opacity-60' : ''} ${className ?? ''}`}
      >
        {error ? 'Not saved' : REC_STATUS_LABEL[shown]}
        {pill && decidedAt && !error ? <span className="font-normal text-muted-foreground">· {decidedAt}</span> : null}
        <ChevronDown className="size-3 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[160px]">
        {REC_STATUSES.map((s) => (
          <DropdownMenuItem key={s} onSelect={() => choose(s)} className="text-[12px]">
            <Check className={`size-3 ${s === shown ? 'opacity-100' : 'opacity-0'}`} aria-hidden />
            {REC_STATUS_LABEL[s]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The same fact with no control — print, and any surface that only reports. */
export function RecStatusWord({ status }: { status: RecStatus }) {
  if (status === 'new') return null
  return <span className={`text-[10.5px] leading-none ${TONE[status]}`}>{REC_STATUS_LABEL[status]}</span>
}
