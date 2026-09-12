'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { setRecommendationStatus } from '@/app/dashboard/market/actions'
import { REC_STATUSES, REC_STATUS_LABEL, type RecStatus } from '@/lib/calibration'

// The recommendation lifecycle control (WP7c). Quiet chrome, MASTER rule 1:
// a status that is still 'new' shows as a hairline word, not a filled badge —
// the tile's meaning is the recommendation, not its admin state. Only a status
// the client has actually set earns any colour.
//
// App only. On paper a status is a WORD (RecStatusWord below), never a button:
// an export must not render a control nobody can press.

const TONE: Record<RecStatus, string> = {
  new: 'text-muted-foreground',
  acknowledged: 'text-secondary-foreground',
  in_progress: 'text-you',
  acted_on: 'text-positive',
  dismissed: 'text-muted-foreground',
}

export function RecStatusMenu({ id, status, className }: { id: string; status: RecStatus; className?: string }) {
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-print-hide
        title={error || 'Move this recommendation through its lifecycle'}
        className={`inline-flex h-[18px] items-center gap-0.5 rounded-[4px] px-1 text-[10.5px] leading-none transition-colors hover:bg-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${error ? 'text-negative' : TONE[shown]} ${pending ? 'opacity-60' : ''} ${className ?? ''}`}
      >
        {error ? 'Not saved' : REC_STATUS_LABEL[shown]}
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
