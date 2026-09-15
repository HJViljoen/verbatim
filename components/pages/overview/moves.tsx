import Link from 'next/link'
import type { Block } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { fmtInt } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { OverviewData } from '@/lib/pages/overview'

// OV5 · What we are doing, and whether it is working (design §3 OV5).
//
// HONEST RATHER THAN EMPTY. Phase 2 brings the pre-filled monthly card and the
// scoring; Phase 1 ships the block with what it actually has — every move the
// client has dated, each on one line, with the month its first score will land
// in. Nothing is scored and nothing is ticked, and the unlock is NAMED on the
// block rather than left for the reader to wonder about.
//
// The masthead is code-written and never a model's: "We report what the
// conversation did after you acted. We never claim you caused it." It is the
// one sentence that keeps every line under it from reading as a causal claim.

export const overviewMoves: Block<OverviewData> = {
  key: 'overview.moves',
  title: 'Your moves',
  question: 'What have we said we are doing about it?',

  render(data, mode = 'app', ctx) {
    const m = data.moves
    const email = mode === 'email'
    const href = `${ctx.appUrl}/dashboard/market`
    const empty = overviewMoves.emptyState(data)

    return (
      <BlockFrame
        title={overviewMoves.title}
        question={overviewMoves.question}
        mode={mode}
        meta={m.rows.length > 0 ? `${fmtInt(m.rows.length)} dated` : undefined}
        footer={email ? <a href={href} style={{ color: EMAIL.ink }}>Open Market →</a> : <Link href={href} className="hover:underline">Open Market →</Link>}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {m.rows.length > 0 ? (
          <div className={email ? undefined : 'flex flex-col gap-1'}>
            {m.rows.map((row) =>
              email ? (
                <div key={row.id} style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '2px 0' }}>{row.line}</div>
              ) : (
                <p key={row.id} className="m-0 text-[12.5px]">{row.line}</p>
              ),
            )}
          </div>
        ) : null}
        <p
          className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'}
          style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 6 } : undefined}
        >
          {m.unlock}
        </p>
        <p
          className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'}
          style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 } : undefined}
        >
          {m.masthead}
        </p>
      </BlockFrame>
    )
  },

  // NO FIGURES. Nothing on this block is a reading: a count of moves is a count
  // of things the client typed, and the one number in a move's line is a DATE.
  // The budget counts readings, and a block with none declares none.
  figures(): FigureTable {
    return {}
  },

  emptyState(data) {
    return data.moves.rows.length === 0 ? data.moves.empty : null
  },
}
