import Link from 'next/link'
import type { Block } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { fmtInt } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { MarketSurfaceData } from '@/lib/pages/market-surface'

// MK4 · Declared moves, scored (design §3 MK4) — Phase 1's half of it.
//
// PHASE 1 SHIPS THE ROWS AND NAMES THE SCORING. The design's MK4 is one row and
// one chart per move, with the subject's monthly line in your audience, the
// same subject in the audiences you did not touch, the themes you are not
// working on as a rate per 100 videos, the tone, the quotes and one calibrated
// sentence. All of that needs two monthly readings AFTER the move's date, and
// no move in this product has one reading yet. So the block lists what has been
// dated, says the month each one's first score lands in, and says what is
// coming — which is the honest version of the same block, not a smaller one.
//
// THREE DIFFERENT SILENCES, THREE DIFFERENT SENTENCES. "Moves are not recorded
// for this workspace yet" (M4 unapplied) is not "nothing dated yet" (M4 applied,
// nobody has pressed Track this), and neither is "scoring has not started". The
// block says exactly one of the first two and always says the third.
//
// THE MASTHEAD IS CODE-WRITTEN AND IS THE PAGE'S, not this block's — it is
// printed once at the top of Market. What this block carries is the unlock.

export const marketMoves: Block<MarketSurfaceData> = {
  key: 'market.moves',
  title: 'Declared moves',
  question: 'What have we said we are doing, and is it working?',

  render(data, mode = 'app', ctx) {
    const m = data.moves
    const email = mode === 'email'
    const empty = marketMoves.emptyState(data)
    const href = `${ctx.appUrl}/dashboard/subjects`

    return (
      <BlockFrame
        title={marketMoves.title}
        question={marketMoves.question}
        mode={mode}
        meta={m.rows.length > 0 ? `${fmtInt(m.rows.length)} dated` : undefined}
        footer={email
          ? <a href={href} style={{ color: EMAIL.ink }}>Open Subjects →</a>
          : <Link href={href} className="hover:underline">Open Subjects →</Link>}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {m.rows.length > 0 ? (
          <div className={email ? undefined : 'flex flex-col gap-1'}>
            {m.rows.map((row) =>
              email
                ? <div key={row.id} style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '2px 0' }}>{row.line}</div>
                : <p key={row.id} className="m-0 text-[12.5px]">{row.line}</p>,
            )}
          </div>
        ) : null}
        <p
          className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'}
          style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 6 } : undefined}
        >
          {m.unlock}
        </p>
      </BlockFrame>
    )
  },

  // NO FIGURES. The one number in a move's line is a DATE, and a count of moves
  // is a count of things the client typed.
  figures(): FigureTable {
    return {}
  },

  emptyState(data) {
    return data.moves.empty
  },
}
