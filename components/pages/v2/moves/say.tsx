import { CARD, CardHead, TBL, TD, TH } from '@/components/v2'
import { AddStatement } from '@/components/pages/moves/add-statement'
import { StatementMenu } from '@/components/pages/moves/statement-menu'
import { fmtInt, longMonth } from '@/lib/format'
import { STATEMENTS_TITLE, largestStance } from '@/lib/pages/v2/moves'
import type { StatementReading, StatementsBlockData } from '@/lib/statements/types'
import { cn } from '@/lib/utils'

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

const SEG = [
  { key: 'backs', label: 'Backs it up', fill: 'bg-you' },
  { key: 'doubts', label: 'Doubts it', fill: 'bg-caution' },
  { key: 'asks', label: 'Asks about it', fill: 'bg-brand' },
] as const

function Stance({ s }: { s: NonNullable<StatementReading['stance']> }) {
  const total = s.backs + s.doubts + s.asks
  if (total === 0) return <div className="h-2.5 rounded-[5px] bg-track" aria-hidden />
  return (
    <div
      role="img"
      aria-label={`Backs it up ${fmtInt(s.backs)}, doubts it ${fmtInt(s.doubts)}, asks about it ${fmtInt(s.asks)}`}
      className="flex h-2.5 gap-0.5 overflow-hidden rounded-[5px] bg-track"
    >
      {SEG.map((x) => (s[x.key] > 0 ? <div key={x.key} className={x.fill} style={{ width: `${(100 * s[x.key]) / total}%` }} /> : null))}
    </div>
  )
}

function SoFar({ r }: { r: StatementReading | null }) {
  if (!r) return <span className="text-muted-foreground">Not read yet</span>
  const top = largestStance(r.stance)
  if (!top) return <span className="text-muted-foreground">Nobody raises it</span>
  return (
    <span data-copy="level" className="font-semibold text-foreground">
      <span className="tabular-nums">{fmtInt(top.k)}</span> of {fmtInt(top.n)} {top.words}
    </span>
  )
}

/** What the card says where the operator has added no statement yet. */
export const SAY_FIRST = 'Add something you say about yourself, and each update reads how your market treats it.'

export function WhatYouSay({ data, className }: { data: StatementsBlockData; className?: string }) {
  // NO ROWS: the add form alone, for a reader who may add one (the operator,
  // while statements are held from tenants); nothing for anyone else.
  if (data.statements.length === 0 && !data.canEdit) return null
  const month = data.month ? `${longMonth(data.month)}${data.complete ? '' : ' so far'}` : null
  return (
    <section aria-labelledby="say-title" className={cn(CARD, className)}>
      <CardHead
        id="say-title"
        size="lg"
        title={STATEMENTS_TITLE}
        sub={month ? `Your own claims, against what your market says about them in ${month}` : 'Your own claims, against what your market says about them'}
      />
      {data.canEdit ? <AddStatement /> : null}
      {data.statements.length === 0 ? <p className="m-0 text-[14.5px] leading-[1.55] text-secondary-foreground">{SAY_FIRST}</p> : null}
      {data.statements.length > 0 ? (<>
      <div className="min-w-0 overflow-x-auto">
        <table className={cn(TBL, 'min-w-[440px] text-[14.5px]')}>
          <thead>
            <tr>
              <th scope="col" className={TH}>You say</th>
              <th scope="col" className={cn(TH, 'text-right')}>Videos</th>
              <th scope="col" className={cn(TH, 'w-[28%]')}>How it lands</th>
              <th scope="col" className={cn(TH, 'pr-0')}>So far</th>
            </tr>
          </thead>
          <tbody>
            {data.statements.map((s) => (
              <tr key={s.id}>
                <td className={TD}>
                  <span className="flex min-w-0 items-start gap-2">
                    <span data-copy="quote" className="min-w-0 text-foreground">“{s.text}”</span>
                    {data.canEdit ? <StatementMenu id={s.id} text={s.text} /> : null}
                  </span>
                </td>
                <td className={cn(TD, 'text-right tabular-nums')}><span data-copy="figure">{s.reading ? fmtInt(s.reading.market.videos) : ''}</span></td>
                <td className={cn(TD, 'align-middle')}>{s.reading?.stance ? <Stance s={s.reading.stance} /> : <div className="h-2.5 rounded-[5px] bg-track" aria-hidden />}</td>
                <td className={cn(TD, 'pr-0')}><SoFar r={s.reading} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-[22px] gap-y-1.5 text-[14px]">
        {SEG.map((x) => (
          <span key={x.key} className="inline-flex items-center gap-1.5"><span aria-hidden className={cn('inline-block size-2.5 rounded-[2px]', x.fill)} />{x.label}</span>
        ))}
      </div>
      </>) : null}
    </section>
  )
}
