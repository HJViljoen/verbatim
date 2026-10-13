import { Send } from 'lucide-react'

import { CARD, CardHead } from '@/components/v2'
import { AddStatement } from '@/components/pages/moves/add-statement'
import { StatementMenu } from '@/components/pages/moves/statement-menu'
import { fmtInt, longMonth } from '@/lib/format'
import { STATEMENTS_TITLE, largestStance } from '@/lib/pages/v2/moves'
import type { StatementReading, StatementsBlockData } from '@/lib/statements/types'
import { cn } from '@/lib/utils'
import { MONO } from './parts'

// "What you say, and what comes back" (board E6-Moves): each statement the
// client added, the market's videos that carry it in the page's month, how
// those videos treat it (backs, doubts, asks, one stacked bar), and the
// largest of the three as a level ("11 of 20 back it up").
//
// HELD FROM TENANTS (lib/statements/visibility.ts): the route reads no
// statement for a tenant's session, and this card is drawn only where rows
// exist and the reader may see them. The board's verdict words ("Backed up",
// "Mostly asked about", "Doubted") have no rule behind them yet (the depth
// plan's follow-ups); the largest stance prints as a level instead.
//
// THE STATEMENT IS THE CLIENT'S OWN WORDS (`quote`: rule (c) does not police
// what a person typed). The counts are code's figures.

/** Four columns from 640px; below, the statement over its count and bar, and
 *  how it lands under them. */
const COLS = 'grid grid-cols-[48px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2 sm:grid-cols-[minmax(0,1.5fr)_48px_minmax(0,1fr)_minmax(0,1.1fr)]'

const SEG = [
  { key: 'backs', label: 'backs it up', fill: 'bg-you' },
  { key: 'doubts', label: 'doubts it', fill: 'bg-negative' },
  { key: 'asks', label: 'asks about it', fill: 'bg-brand' },
] as const

function Stance({ s }: { s: NonNullable<StatementReading['stance']> }) {
  const total = s.backs + s.doubts + s.asks
  if (total === 0) return <div className="h-2.5 rounded-[5px] bg-track" aria-hidden />
  return (
    <div
      role="img"
      aria-label={`backs it up ${fmtInt(s.backs)}, doubts it ${fmtInt(s.doubts)}, asks about it ${fmtInt(s.asks)}`}
      className="flex h-2.5 gap-0.5 overflow-hidden rounded-[5px] bg-track"
    >
      {SEG.map((x) => (s[x.key] > 0 ? <div key={x.key} className={x.fill} style={{ width: `${(100 * s[x.key]) / total}%` }} /> : null))}
    </div>
  )
}

function SoFar({ r }: { r: StatementReading | null }) {
  if (!r) return <span className="text-[12.5px] text-muted-foreground">not read yet</span>
  const top = largestStance(r.stance)
  if (!top) return <span className="text-[12.5px] font-medium text-muted-foreground">Nobody raises it</span>
  return (
    <span data-copy="level" className="text-[12.5px] font-semibold text-foreground">
      <span className={MONO}>{fmtInt(top.k)}</span> of {fmtInt(top.n)} {top.words}
    </span>
  )
}

export function WhatYouSay({ data, className }: { data: StatementsBlockData; className?: string }) {
  if (data.statements.length === 0) return null
  const month = data.month ? `${longMonth(data.month)}${data.complete ? '' : ' so far'}` : null
  return (
    <section aria-labelledby="say-title" className={cn(CARD, className)}>
      <CardHead
        icon={Send}
        id="say-title"
        title={STATEMENTS_TITLE}
        sub={month ? `Your own claims, against what your market says about them in ${month}` : 'Your own claims, against what your market says about them'}
      />
      {data.canEdit ? <AddStatement /> : null}
      <div className="flex flex-col">
        <div className={cn(COLS, 'hidden border-b border-border pb-2 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground sm:grid')}>
          <span>You say</span><span>Videos</span><span>How it lands</span><span>So far</span>
        </div>
        {data.statements.map((s, i) => (
          <div key={s.id} className={cn(COLS, 'py-3 text-[13.5px]', i > 0 ? 'border-t border-track' : null)}>
            <span className="col-span-2 flex min-w-0 items-start gap-2 sm:col-span-1">
              <span data-copy="quote" className="min-w-0 text-foreground">“{s.text}”</span>
              {data.canEdit ? <StatementMenu id={s.id} text={s.text} /> : null}
            </span>
            <span data-copy="figure" className={cn(MONO, 'text-foreground')}>{s.reading ? fmtInt(s.reading.market.videos) : ''}</span>
            {s.reading?.stance ? <Stance s={s.reading.stance} /> : <div className="h-2.5 rounded-[5px] bg-track" aria-hidden />}
            <span className="col-span-2 min-w-0 sm:col-span-1"><SoFar r={s.reading} /></span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3.5 text-[12px] text-muted-foreground">
        {SEG.map((x) => (
          <span key={x.key} className="inline-flex items-center gap-1.5"><span aria-hidden className={cn('inline-block h-2 w-2.5 rounded-[2px]', x.fill)} />{x.label}</span>
        ))}
      </div>
    </section>
  )
}
