import type { ReactNode } from 'react'
import type { BlockContext } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import { overviewMoves } from '@/components/pages/overview/moves'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import type { MoveRow, OverviewData } from '@/lib/pages/overview'
import { presentation, T } from './email-table'

/**
 * MR5 · Your moves, in the EMAIL (Block D wave 2, E-monthly; the artboard's
 * section 5).
 *
 * THE ONE MISSING FIGURE, AND IT IS THE WHOLE LEDGER'S. `MovesBlock.acted` is
 * `actedTally` (wave 1) and nothing on this artefact printed it. The artboard
 * asks for "You acted on 2 of 5 this quarter" with a five-segment meter beside
 * it; D12 refuses the quarter — the ratio this product holds is over EVERY
 * piece of advice it has ever given, and slicing it by quarter would need a
 * per-quarter denominator that `rec_decisions` does not carry. So the artboard's
 * layout is kept, the meter with it, and the figure inside is the tally's own:
 * "1 of 64", with `actedTally`'s sentence under it saying what the 64 is.
 *
 * THE METER IS THE TALLY AND NOT A DECORATION. Five fixed segments would be a
 * picture of the artboard's number; this draws `decided` of `of`, capped at the
 * width of the row, so it can never disagree with the figure beside it. Where
 * nothing has been recommended, `actedTally` says so and no meter is drawn — a
 * bar of zero segments reads as a score of zero.
 *
 * THE ROWS ARE THE PAGE'S, said the artefact's way (`artefactMoves`, the
 * projection this arm is handed). D14 stands: no per-move "next reading 4 Oct",
 * because the product dates a reading by the month its comments fall in and
 * `firstScoringMonth` already carries that in the line.
 */
export function monthlyMovesEmail(data: OverviewData, ctx: BlockContext): ReactNode {
  const m = data.moves
  const href = `${ctx.appUrl}/dashboard/market`
  const empty = overviewMoves.emptyState(data)
  return (
    <BlockFrame
      title={overviewMoves.title}
      question={overviewMoves.question}
      mode="email"
      accent
      meta={m.rows.length > 0 ? `${fmtInt(m.rows.length)} dated` : undefined}
      footer={<a href={href} style={{ color: EMAIL.ink }}>Open Market →</a>}
    >
      {empty ? <BlockEmpty mode="email">{empty}</BlockEmpty> : null}
      {/* THE MASTHEAD LEADS, as the artboard has it: it is the one sentence
          that keeps every line under it from reading as a causal claim, and the
          built block printed it LAST, below the unlock, where a reader has
          already read the rows. */}
      <div style={{ fontFamily: FONT.sans, fontSize: 12.5, lineHeight: '1.5', color: EMAIL.muted, marginTop: 4 }}>{m.masthead}</div>
      {m.rows.map((row) => <Row key={row.id} row={row} />)}
      <div style={{ fontFamily: FONT.sans, fontSize: 11.5, lineHeight: '1.5', color: EMAIL.muted, marginTop: 8 }}>{m.unlock}</div>
      {m.acted ? <Acted acted={m.acted} /> : null}
    </BlockFrame>
  )
}

/**
 * One move, in the artboard's row: the title, then what the line says about it.
 *
 * THE TITLE IS NOT PRINTED TWICE. `moveLine` composes "{title} · tracked 14 Sep
 * · first scoring lands with the October reading", so a bold title above the
 * whole line said the name twice in two type sizes. The line is the loader's to
 * word and this does not re-word it: it takes off the leading name where the
 * line starts with it, and prints the line whole where it does not.
 */
function Row({ row }: { row: MoveRow }) {
  const prefix = `${row.title} · `
  const rest = row.line.startsWith(prefix) ? row.line.slice(prefix.length) : row.line
  return (
    <div style={{ borderTop: `1px solid ${EMAIL.hairline}`, padding: '12px 0', marginTop: 8 }}>
      <div style={{ fontFamily: FONT.sans, fontSize: 15, fontWeight: 600, color: EMAIL.ink }}>{row.title}</div>
      <div style={{ fontFamily: FONT.sans, fontSize: 13, lineHeight: '1.5', color: EMAIL.ink2, marginTop: 3 }}>{rest}</div>
    </div>
  )
}

/** The artboard's tallied panel: the figure, the sentence, and a meter that is
 *  the figure rather than a picture of one. */
function Acted({ acted }: { acted: { decided: number; of: number; line: string } }) {
  const segments = acted.of > 0 ? Math.min(acted.of, 12) : 0
  // A DECISION THAT HAPPENED IS NEVER DRAWN AS NONE. 1 of 64 rounds to zero
  // segments of twelve, and twelve grey blocks beside the figure "1" say the
  // opposite of the figure. The meter is a reading of the ratio and it is
  // coarse; it may round down, but not through the only thing it is about.
  const filled = acted.decided > 0 ? Math.max(1, Math.round((acted.decided / acted.of) * segments)) : 0
  return (
    <div style={{ background: EMAIL.inner, borderRadius: 6, padding: '15px 18px', marginTop: 12 }}>
      <table width="100%" {...presentation} style={T}>
        <tbody>
          <tr>
            <td style={{ verticalAlign: 'middle' }}>
              <FigureCell
                mode="email"
                size="lg"
                value={fmtInt(acted.decided)}
                of={`of ${fmtInt(acted.of)} acted on`}
              />
            </td>
            {segments > 0 ? (
              <td align="right" style={{ verticalAlign: 'middle', paddingLeft: 18, whiteSpace: 'nowrap' }}>
                {Array.from({ length: segments }, (_, i) => (
                  <span
                    key={i}
                    style={{ display: 'inline-block', width: 14, height: 10, borderRadius: 2, marginLeft: i === 0 ? 0 : 3, background: i < filled ? EMAIL.green : EMAIL.neutralSeg }}
                  />
                ))}
              </td>
            ) : null}
          </tr>
        </tbody>
      </table>
      <div style={{ fontFamily: FONT.sans, fontSize: 12.5, lineHeight: '1.5', color: EMAIL.muted, marginTop: 8 }}>{acted.line}</div>
    </div>
  )
}
