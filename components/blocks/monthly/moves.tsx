import type { ReactNode } from 'react'
import type { BlockContext } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import { overviewMoves } from '@/components/pages/overview/moves'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import type { MoveRow, OverviewData } from '@/lib/pages/overview'
import { presentation, T } from './email-table'

/** One segment per piece of advice up to here; past it, a bar drawn to scale. */
const MAX_SEGMENTS = 12

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
 * picture of the artboard's number; this draws the ratio itself — one segment
 * per piece of advice while there are twelve or fewer of them, and a bar at
 * `decided / of` of its track past that, with nothing rounded either way. See
 * `Acted` below, and the finding that made it two shapes rather than one.
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
      {/* AN EMPTY SECTION SAYS ONE THING (the fix pass, review finding [Nit]).
          With nothing dated, this printed the empty state AND the masthead AND
          the unlock — three sentences of methodology about scoring moves that
          do not exist, more policy prose than the populated arm prints
          content. The masthead and the unlock are both about how a dated move
          is read; with no move, MASTER.md's rule for a tile with nothing in it
          is the one-line honest empty state. The whole-ledger tally still
          prints where there is one: it is a figure about the advice, not about
          the moves. */}
      {empty ? <BlockEmpty mode="email">{empty}</BlockEmpty> : (
        <>
          {/* THE MASTHEAD LEADS, as the artboard has it: it is the one sentence
              that keeps every line under it from reading as a causal claim, and
              the built block printed it LAST, below the unlock, where a reader
              has already read the rows. */}
          <div style={{ fontFamily: FONT.sans, fontSize: 12.5, lineHeight: '1.5', color: EMAIL.muted, marginTop: 4 }}>{m.masthead}</div>
          {m.rows.map((row) => <Row key={row.id} row={row} />)}
          <div style={{ fontFamily: FONT.sans, fontSize: 11.5, lineHeight: '1.5', color: EMAIL.muted, marginTop: 8 }}>{m.unlock}</div>
        </>
      )}
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

/**
 * The artboard's tallied panel: the figure, the sentence, and a meter that is
 * the ratio rather than a picture of one.
 *
 * WHAT WAS WRONG WITH THE FIRST ONE (the fix pass, review finding
 * [Important], found by both reviewers). It drew `min(of, 12)` segments and
 * filled `max(1, round(decided / of × segments))`, so the tally this section
 * exists to print — 1 of 64 — drew as 1 filled of 12: a picture saying 8.3%
 * beside a figure saying 1.6%, five times over. The `max(1, …)` argument was
 * sound (a decision that happened must not draw as none) and the conclusion
 * was wrong: twelve blocks cannot express one in sixty-four, so the drawing
 * must change shape, not round through its own subject.
 *
 * SO THERE ARE TWO SHAPES AND EACH IS EXACT.
 *   · Twelve or fewer pieces of advice: ONE SEGMENT EACH, `decided` of them
 *     filled. Nothing is rounded because nothing is divided — this is the
 *     artboard's own meter, and at its own scale ("2 of 5" is five segments).
 *   · More than twelve: a bar filled to `decided / of` of the track, drawn to
 *     scale with no floor under it. One of sixty-four is a sliver, which is
 *     what one of sixty-four looks like.
 * Where nothing has been recommended, `actedTally` says so and no meter is
 * drawn — a bar of zero segments reads as a score of zero.
 */
function Acted({ acted }: { acted: { decided: number; of: number; line: string } }) {
  const segmented = acted.of > 0 && acted.of <= MAX_SEGMENTS
  const share = acted.of > 0 ? Math.max(0, Math.min(100, (acted.decided / acted.of) * 100)) : 0
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
            {acted.of > 0 ? (
              <td align="right" style={{ verticalAlign: 'middle', paddingLeft: 18, width: '45%' }}>
                {segmented ? (
                  // AND THE SEGMENT ROW MAY WRAP. Held on one line, twelve
                  // segments were 204 unbreakable pixels inside a 273px card
                  // on a phone — which is the artefact's whole width. They are
                  // equal blocks, so a second line of them reads the same.
                  <span>
                    {Array.from({ length: acted.of }, (_, i) => (
                      <span
                        key={i}
                        style={{ display: 'inline-block', width: 14, height: 10, borderRadius: 2, marginLeft: i === 0 ? 0 : 3, background: i < acted.decided ? EMAIL.green : EMAIL.neutralSeg }}
                      />
                    ))}
                  </span>
                ) : (
                  <table width="100%" {...presentation} style={{ ...T, background: EMAIL.neutralSeg, borderRadius: 8 }}>
                    <tbody>
                      <tr>
                        <td style={{ height: 10, lineHeight: '10px', fontSize: 0 }}>
                          <span style={{ display: 'block', height: 10, width: `${share}%`, borderRadius: 8, background: EMAIL.green, fontSize: 0, lineHeight: 0 }} />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </td>
            ) : null}
          </tr>
        </tbody>
      </table>
      <div style={{ fontFamily: FONT.sans, fontSize: 12.5, lineHeight: '1.5', color: EMAIL.muted, marginTop: 8 }}>{acted.line}</div>
    </div>
  )
}
