import type { ReactNode } from 'react'
import type { BlockContext } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { DirectionWord, overviewSubjects } from '@/components/pages/overview/subjects'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct } from '@/lib/format'
import type { OverviewData, SideReading, SubjectRow } from '@/lib/pages/overview'
import { sentLineFor } from '@/lib/pages/overview'
import { INDUSTRY_AUDIENCE } from '@/lib/rivals'
import { presentation, T } from './email-table'

/**
 * MR2 · Your subjects, in the EMAIL (Block D wave 2, E-monthly; the artboard's
 * section 2).
 *
 * WHY THIS FILE EXISTS AND WHAT IT IS NOT. The section is Overview's — the
 * block, the loader, the figures, the verdicts and the words are all
 * `components/pages/overview/subjects.tsx`, and this file imports its
 * `DirectionWord` rather than writing a second one. What it replaces is the
 * MARKUP of one mode. Overview's email arm stacks each subject into three
 * full-width lines ("you 31% 26 of 84 · Freitag 44% 62 of 142 · the category
 * 22% 305 of 1,388"), which is a sensible fallback for a PAGE whose real table
 * is three feet away and is the wrong shape for an artefact where the email IS
 * the document. The artboard draws four aligned columns and six rows, and the
 * alignment is the argument: a reader compares six subjects down a column, not
 * across three wrapped clauses.
 *
 * FOUR THINGS THE STACKED ARM LOST, all of them restored here:
 *   · the COLUMN HEADS, so a figure says whose side it is without a word
 *     beside it (they exist in the app table and in no email);
 *   · YOUR OWN SIDE'S VERDICT, which the email dropped altogether — the row
 *     printed only the category's. D2 is kept by the badge itself:
 *     `BlockMovement` prints points ONLY on `state === 'moved'`, so a side
 *     that reads "too few to compare" gets the words and no magnitude beside
 *     them, and the mock's "Aug 27%" next to a refusal never appears;
 *   · the figure TIER — `FigureCell size="lg"` is the artboard's mono 17, with
 *     the count under it at 10.5, so the share is read first and the evidence
 *     second;
 *   · the artboard's per-row hairline, which is what makes a stack of rows
 *     read as a table at all.
 *
 * WHAT IT DELIBERATELY KEEPS FROM THE BUILD. `AtLastMonth` — "at this point
 * last month 20.5% 264 of 1,290" — is the honest form of the mock's "Aug 19%"
 * (D2: a complete August beside 28 days of September is not a comparison), and
 * `SentLine` is the artefact's own loop back to what a dated report said. Both
 * sit under the category column, which is the only side with the n to carry
 * them. Neither is in the artboard and both stay.
 */
export function monthlySubjectsEmail(data: OverviewData, ctx: BlockContext): ReactNode {
  const s = data.subjects
  const href = `${ctx.appUrl}/dashboard/subjects`
  const frame = (children: ReactNode) => (
    <BlockFrame
      title={overviewSubjects.title}
      question={overviewSubjects.question}
      mode="email"
      meta={s.rows.length > 0 ? `${fmtInt(s.rows.length)} named` : undefined}
      footer={<a href={href} style={{ color: EMAIL.ink }}>Open Subjects →</a>}
      footerNote={s.rows.length > 0 ? 'share of videos where the subject came up' : undefined}
    >
      {children}
    </BlockFrame>
  )

  const empty = overviewSubjects.emptyState(data)
  if (empty) {
    return frame(
      <>
        <BlockEmpty mode="email">{empty}</BlockEmpty>
        {s.candidates.map((c) => (
          <div key={c.name} style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, marginTop: 4 }}>
            {c.name} — <span style={{ color: EMAIL.muted }}>{c.because}</span>
          </div>
        ))}
      </>,
    )
  }

  const heads: { label: string; colour: string }[] = [
    { label: 'You', colour: EMAIL.green },
    { label: s.rivalLabel ?? 'Lead rival', colour: EMAIL.comp },
    { label: s.categoryLabel, colour: EMAIL.cat },
  ]

  return frame(
    <div>
      {/* THE LEGEND ROW, with the artboard's own three dots. It is a table and
          not a flex row, and the dot is a 7px cell rather than a glyph: a
          bullet character in a client that has dropped the font is a box. */}
      <table width="100%" {...presentation} style={{ ...T, tableLayout: 'fixed', marginTop: 4 }}>
        <tbody>
          <tr>
            {heads.map((h) => (
              <td key={h.label} style={{ paddingBottom: 6, verticalAlign: 'bottom' }}>
                <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 7, background: h.colour, marginRight: 6 }} />
                <span style={{ fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: EMAIL.ink2 }}>{h.label}</span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      {s.rows.map((r) => (
        <SubjectBlock
          key={r.id}
          row={r}
          sentLine={sentLineFor(data.sent, INDUSTRY_AUDIENCE, 'subject', r.id, r.category.pct)}
        />
      ))}
      {s.note ? <div style={{ fontFamily: FONT.sans, fontSize: 12.5, lineHeight: '1.5', color: EMAIL.muted, marginTop: 10 }}>{s.note}</div> : null}
    </div>,
  )
}

/** One subject: the name and both change badges, then the three sides in
 *  three aligned columns. */
function SubjectBlock({ row, sentLine }: { row: SubjectRow; sentLine: string | null }) {
  return (
    <table width="100%" {...presentation} style={{ ...T, borderTop: `1px solid ${EMAIL.hairline}` }}>
      <tbody>
        <tr>
          <td style={{ padding: '12px 0 7px' }}>
            <table width="100%" {...presentation} style={T}>
              <tbody>
                <tr>
                  <td style={{ fontFamily: FONT.sans, fontSize: 15, fontWeight: 600, color: EMAIL.ink }}>{row.label}</td>
                  {/* BOTH SIDES' CHANGE, and each one says whose it is. The
                      artboard prints one badge and leaves the reader to assume
                      which column it is about; the caveat under the table then
                      says your own side is too thin to compare on any of the
                      six, which is only legible if your side's answer is on the
                      row. "you" / "the category" are the artboard's own column
                      words, not new vocabulary. */}
                  <td align="right" style={{ paddingLeft: 10, whiteSpace: 'nowrap', verticalAlign: 'baseline' }}>
                    <span style={{ fontFamily: FONT.sans, fontSize: 10.5, color: EMAIL.faint, marginRight: 4 }}>you</span>
                    <BlockMovement verdict={row.you.verdict} unit="pts" mode="email" />
                    <span style={{ fontFamily: FONT.sans, fontSize: 10.5, color: EMAIL.faint, margin: '0 4px 0 8px' }}>the category</span>
                    <BlockMovement verdict={row.category.verdict} unit="pts" mode="email" />{' '}
                    <DirectionWord direction={row.direction} mode="email" />
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
        <tr>
          <td style={{ paddingBottom: 12 }}>
            <table width="100%" {...presentation} style={{ ...T, tableLayout: 'fixed' }}>
              <tbody>
                <tr>
                  <td style={{ verticalAlign: 'top', paddingRight: 12 }}><Side side={row.you} /></td>
                  <td style={{ verticalAlign: 'top', paddingRight: 12 }}><Side side={row.rival} /></td>
                  <td style={{ verticalAlign: 'top' }}>
                    <Side side={row.category} />
                    {row.categoryAtLastMonth && row.categoryAtLastMonth.pct != null ? (
                      <div style={{ fontFamily: FONT.sans, fontSize: 10.5, lineHeight: '1.4', color: EMAIL.muted, marginTop: 4 }}>
                        at this point last month{' '}
                        <span data-copy="figure">
                          {fmtPct(row.categoryAtLastMonth.pct)} {fmtInt(row.categoryAtLastMonth.k)} of {fmtInt(row.categoryAtLastMonth.n)}
                        </span>
                      </div>
                    ) : null}
                    {sentLine ? <div style={{ fontFamily: FONT.sans, fontSize: 10.5, lineHeight: '1.4', color: EMAIL.faint, marginTop: 3 }}>{sentLine}</div> : null}
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

/** One side's level, in the artboard's cell: the share over its count.
 *
 *  NEVER A 0% FOR A SIDE NOTHING WAS READ FOR — Overview's own rule, and the
 *  reason this is `FigureCell` with no `of` rather than a share of zero. */
function Side({ side }: { side: SideReading | null }) {
  if (!side || !side.observed || side.pct == null) {
    return <span style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted }}>— not tracked</span>
  }
  return (
    <FigureCell
      mode="email"
      size="lg"
      value={fmtPct(side.pct)}
      of={`${fmtInt(side.k ?? 0)} of ${fmtInt(side.n ?? 0)}`}
    />
  )
}
