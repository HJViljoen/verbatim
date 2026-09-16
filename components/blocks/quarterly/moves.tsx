import type { ReactNode } from 'react'
import type { Block } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { fullDate } from '@/lib/format'
import type { QuarterlyData } from '@/lib/pages/quarterly'
import { QUARTER_PAGE_QUESTION, QUARTER_PAGE_TITLE, quarterLabel } from '@/lib/reports/quarterly'
import { Note, Row, Rule, Stored } from './parts'

// QR6 · Your moves, and what happened after (mock page 6).
//
// THE RULE IS THE PAGE. "We report what the conversation did after you acted.
// We never claim you caused it." A page that puts a declared move beside a
// reading of the months after it invites the arrow, and the only honest thing
// to do is to say we are not drawing it — on the page, not in a footnote and
// not in a comment.
//
// WHOSE WORDS ARE WHOSE. An advice title and a say-vs-hear claim were written
// by a model and are read back out of a column, so each names its prose slot
// (`pass_d_b_recommendation`, `pass_d_a_say_vs_hear`) — that is what buys the
// rule-(c) exemption, and it is why "Increase Content Volume to Improve Share
// of Voice" does not fail the contract on the Market page either. A status
// word and a move's own title are NOT marked: the status vocabulary is code's
// and the title is the operator's, and marking either would claim a
// provenance it does not have.
//
// "ACTED ON 2 OF 5" COUNTS DECISIONS MADE INSIDE THE QUARTER, not decisions
// standing. A ledger row decided in June is not something you did this quarter,
// and a quarterly review that counted it would be flattering itself.

export const quarterlyMoves: Block<QuarterlyData> = {
  key: 'quarterly.moves',
  title: QUARTER_PAGE_TITLE.moves,
  question: QUARTER_PAGE_QUESTION.moves,

  render(data, mode = 'app') {
    const m = data.moves
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={quarterlyMoves.title}
        question={quarterlyMoves.question}
        mode={mode}
        meta={quarterLabel(data.quarter, false)}
      >
        {children}
      </BlockFrame>
    )
    const empty = quarterlyMoves.emptyState(data)
    if (empty) return frame(<BlockEmpty mode={mode}>{empty}</BlockEmpty>)

    return frame(
      <div>
        {m.moves.length > 0 ? (
          <div>
            <Note mode={mode} tone="body">What you declared this quarter</Note>
            {m.moves.map((move) => (
              <Row key={move.id} mode={mode} label={move.title}>
                {move.on} · declared {fullDate(move.declaredAt)}
                <br />
                {move.line}
              </Row>
            ))}
          </div>
        ) : (
          <Note mode={mode}>{m.movesNote ?? 'No move was declared this quarter.'}</Note>
        )}

        {m.advice.length > 0 ? (
          <div className={mode === 'email' ? undefined : 'mt-3'}>
            <Note mode={mode} tone="body">The advice, and what you decided</Note>
            {m.advice.map((a) => (
              <Row
                key={a.lineageId}
                mode={mode}
                label={<Stored slot="pass_d_b_recommendation">{a.title}</Stored>}
                aside={<Note mode={mode}>{a.statusLabel} · {a.decidedAt ? `you decided ${fullDate(a.decidedAt)}` : 'no decision yet'}</Note>}
              >
                first made {fullDate(a.firstMade)} · carried by {a.timesMade === 1 ? 'one update' : `${a.timesMade} updates`}
              </Row>
            ))}
            <Note mode={mode} tone="body">{m.actedLine}</Note>
          </div>
        ) : (
          <Note mode={mode}>{m.adviceNote ?? 'No advice stands on this workspace yet.'}</Note>
        )}

        {m.claims.length > 0 ? (
          <div className={mode === 'email' ? undefined : 'mt-3'}>
            <Note mode={mode} tone="body">What you say, and what comes back</Note>
            {m.claims.map((c) => (
              <Row
                key={c.id}
                mode={mode}
                label={<Stored slot="pass_d_a_say_vs_hear">{c.youSay}</Stored>}
                aside={<Note mode={mode}>{c.verdictLabel} · {c.audience}</Note>}
              >
                <Stored slot="pass_d_a_say_vs_hear">{c.gap}</Stored>
              </Row>
            ))}
            <Note mode={mode}>{m.claimsLine} {m.claimsCaveat}</Note>
          </div>
        ) : (
          <Note mode={mode}>{m.claimsLine}</Note>
        )}

        <Rule mode={mode}>{m.rule}</Rule>
      </div>,
    )
  },

  emptyState(data) {
    const m = data.moves
    if (m.moves.length === 0 && m.advice.length === 0 && m.claims.length === 0) {
      return 'Nothing was declared, decided or claimed on this workspace this quarter, so there is nothing to read after it.'
    }
    return null
  },
}
