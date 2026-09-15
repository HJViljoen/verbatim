import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { RecStatusMenu, RecStatusWord } from '@/components/rec-status'
import { fmtInt, shortDate } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable } from '@/lib/reading/verdicts'
import { ADVICE_UNRECORDED, LEDGER_SHOWN, madeInMonth, type AdviceRow, type MarketSurfaceData } from '@/lib/pages/market-surface'

// MK2 · The advice, and what you decided — the ledger (design §3 MK2).
//
// ONE ROW PER IDENTITY, SORTED BY AGE. The loader's header says why that is a
// different read from the parked page's; this is what it looks like: what it
// was · first made · months repeated · the status you set and the date you set
// it. The after-line ("what the conversation did afterwards") is explicitly out
// of Phase 1 — it needs two monthly readings of the thing the advice was
// grounded in — and the block NAMES that rather than leaving a column blank.
//
// THE STATUS IS A CONTROL IN THE APP AND A WORD EVERYWHERE ELSE. An export must
// not render a button nobody can press, and `RecStatusWord` is the same fact
// with no affordance. One difference from the parked page, and it is deliberate:
// that page's word renders NOTHING while the status is `new`, which is 119 of
// 121 rows in production — a ledger whose subject is what you did about each
// row cannot have a blank column, so this one prints "New" itself.
//
// NO AGE IN MONTHS ON THE ROW, AND NO DIRECTION WORD ANYWHERE. "First made" is
// a date this table can prove: every update's recommendations are retained
// (Pass D-b deletes only its own run's rows), so the oldest copy of a lineage
// is genuinely when the advice was first given.

function StatusCell({ row, mode }: { row: AdviceRow; mode: RenderMode }) {
  const decided = row.decidedAt ? ` · ${shortDate(row.decidedAt)}` : ''
  if (mode === 'app') {
    return (
      <span className="inline-flex items-center gap-1">
        <RecStatusMenu id={row.recommendationId} status={row.status} />
        {row.decidedAt ? <span className="text-[10.5px] text-muted-foreground">{shortDate(row.decidedAt)}</span> : null}
      </span>
    )
  }
  if (mode === 'email') {
    return <span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.ink2 }}>{row.statusLabel}{decided}</span>
  }
  // Print: the word, and "New" spelled out rather than an empty cell.
  return (
    <span className="text-[11px] text-secondary-foreground">
      {row.status === 'new' ? 'New' : <RecStatusWord status={row.status} />}{decided}
    </span>
  )
}

/** How many months this identity has been repeated in — the design's column.
 *  One month is the honest answer for a lineage said twice in one month, and
 *  the block's own sentence explains that rather than the cell pretending. */
function RepeatCell({ row, mode }: { row: AdviceRow; mode: RenderMode }) {
  const text = row.monthsRepeated <= 1
    ? row.repeatedWithinMonth ? 'twice, in one month' : '—'
    : `${fmtInt(row.monthsRepeated)} months`
  return mode === 'email'
    ? <span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted }}>{text}</span>
    : <span className="text-[11.5px] text-muted-foreground">{text}</span>
}

export const marketAdvice: Block<MarketSurfaceData> = {
  key: 'market.advice',
  title: 'The advice, and what you decided',
  question: 'What were we told to do, and what did we do about it?',

  render(data, mode = 'app') {
    const a = data.advice
    const email = mode === 'email'
    const empty = marketAdvice.emptyState(data)
    const more = a.total - a.rows.length

    const notes = (
      <div className={email ? undefined : 'flex min-w-0 flex-col gap-1'}>
        <p
          className={email ? undefined : 'm-0 text-[12px]'}
          style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink, marginTop: 6 } : undefined}
        >
          {a.actedLine}
        </p>
        <p
          className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'}
          style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 } : undefined}
        >
          {a.repeatLine}
        </p>
        {!a.recorded ? (
          <p
            className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 } : undefined}
          >
            {ADVICE_UNRECORDED}
          </p>
        ) : null}
        <p
          className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'}
          style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 } : undefined}
        >
          {a.unlock}
        </p>
      </div>
    )

    return (
      <BlockFrame
        title={marketAdvice.title}
        question={marketAdvice.question}
        mode={mode}
        meta={a.total > 0 ? `${fmtInt(a.total)} in the ledger · oldest first` : undefined}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {email ? (
          <div>
            {a.rows.map((row) => (
              <div key={row.lineageId} style={{ padding: '5px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
                <div data-copy="prose" style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink }}>{row.title}</div>
                <div style={{ marginTop: 2 }}>
                  <span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted }}>first made {madeInMonth(row.firstMade)} · </span>
                  <RepeatCell row={row} mode={mode} />
                  <span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted }}> · </span>
                  <StatusCell row={row} mode={mode} />
                </div>
              </div>
            ))}
            {notes}
          </div>
        ) : (
          <>
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    <th className="py-1 pr-3 font-semibold">What it was</th>
                    <th className="py-1 pr-3 font-semibold">First made</th>
                    <th className="py-1 pr-3 font-semibold">Repeated</th>
                    <th className="py-1 font-semibold">What you decided</th>
                  </tr>
                </thead>
                <tbody className="align-top">
                  {a.rows.map((row) => (
                    <tr key={row.lineageId}>
                      <td data-copy="prose" className="py-1.5 pr-3 text-[12.5px]">{row.title}</td>
                      <td className="py-1.5 pr-3 font-mono text-[11.5px] tabular-nums text-muted-foreground">{shortDate(row.firstMade)}</td>
                      <td className="py-1.5 pr-3"><RepeatCell row={row} mode={mode} /></td>
                      <td className="py-1.5"><StatusCell row={row} mode={mode} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {more > 0 ? (
              <p className="m-0 text-[11.5px] text-muted-foreground">
                The <span data-copy="figure">{fmtInt(LEDGER_SHOWN)}</span> oldest are shown; <span data-copy="figure">{fmtInt(more)}</span> newer pieces of advice are in the ledger behind them.
              </p>
            ) : null}
            {notes}
          </>
        )}
      </BlockFrame>
    )
  },

  // NO FIGURES. Everything counted here is a count of advice and of decisions —
  // things the product and the client typed — and the dates are dates. The
  // budget counts readings of the conversation.
  figures(): FigureTable {
    return {}
  },

  emptyState(data) {
    return data.advice.empty
  },
}
