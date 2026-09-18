import type { ReactNode } from 'react'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockCalendar } from '@/components/blocks/calendar'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct, fullDate, monthName } from '@/lib/format'
import type { CalendarSeries } from '@/lib/charts/calendar'
import type { MoveReading } from '@/lib/reading/moves'
import { moveTail, type QuarterlyData } from '@/lib/pages/quarterly'
import type { MoveRow } from '@/lib/pages/market-surface'
import { QUARTER_PAGE_QUESTION, QUARTER_PAGE_TITLE, quarterLabel } from '@/lib/reports/quarterly'
import { Card, Chip, Column, Columns, Eyebrow, Line, Note, Stored } from './parts'

// QR6 · Your moves, and what happened after (mock page 6).
//
// THE RULE IS THE PAGE. "We report what the conversation did after you acted.
// We never claim you caused it." A page that puts a declared move beside a
// reading of the months after it invites the arrow, and the only honest thing
// to do is to say we are not drawing it — on the page, not in a footnote and
// not in a comment. `qr.p6.masthead`: it is ABOVE the moves now, where the
// artboard puts it, instead of an italic rule at the foot where a reader
// reaches it after making the inference.
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
// THE ACTED LINE IS NOT QUARTER-SCOPED, AND SAYS SO ON THE PAGE (D12,
// deliberate). It once read "You acted on N of 12 this quarter", which was
// quarter-scoped on neither side: the numerator counted decisions dated inside
// the quarter, and the denominator was the twelve OLDEST rows this page happens
// to DRAW out of a ledger that runs to 56 and 64. The ledger has no quarter —
// every identity ever recommended is in it — so the page takes the Market
// page's own sentence, over the real total, composed once in
// lib/pages/market-surface.ts. The MOVES above it are genuinely quarter-scoped:
// a move carries the day it was declared.
//
// ---- the port (Block D wave 2) -------------------------------------------------
//
// `qr.p6.move1` · the reading behind a move, which the deck never drew. It is
// Market's own `readMove` output — the ONE banded movement claim a move earns,
// the control audiences beside it, and `chartNote`, which is the refusal the
// line gets below three readings. A chart is a direction claim too, so below
// that the months are named and nothing is drawn.
//
// `qr.p6.ledger` · the artboard's `#` column is `AdviceRow.number`, which is
// the identity's place in the ledger's own oldest-first order and not a rank;
// "Grounded in N videos. Afterwards: …" is `AdviceRow.grounded` /
// `.afterwards`, both carried since wave 1 and both dropped here. `Afterwards`
// is never blank and never a dash — its four states each carry a sentence, and
// the clustering caveat rides on the verdict beside it.
//
// `qr.p6.sayhear` · the mock's "echoed 14 · pushed back 3" has NO FIELD:
// `ClaimRow.gap` is stored prose, not a pair of integers. The verdict word
// prints and the page says the counts are not recorded, which is the honest
// form of an absence a reader would otherwise read as a zero.
//
// `qr.p6.plan` · `MovesPage.plan` is `PlanCheckCard` — one plan, the most
// recent, because the plan a reader is steering by is the one they last
// uploaded. Every claim count carries the population it is a count of
// (`card.basis`), the floor prints from its constant, and `moved` rows carry
// the date a verdict last changed rather than "held N updates".

/** A move's own months, as the calendar draws them. */
function moveSeries(reading: MoveReading): CalendarSeries[] {
  return reading.series
    .filter((s) => s.points.some((p) => p.pct != null))
    .slice(0, 3)
    .map((s, i) => ({
      label: s.label,
      color: s.touched ? 'var(--you)' : i === 1 ? 'var(--cat)' : 'var(--comp)',
      points: reading.months.map((month) => {
        const point = s.points.find((p) => p.month === month)
        return {
          month,
          value: point?.pct ?? null,
          state: point?.pct == null ? ('hollow' as const) : ('read' as const),
          k: point?.k ?? null,
          n: point?.n ?? null,
        }
      }),
    }))
}

function MoveCard({ move, reading, sideOf, mode }: { move: MoveRow; reading: MoveReading | null; sideOf: Record<string, string>; mode: RenderMode }) {
  const email = mode === 'email'
  const series = reading ? moveSeries(reading) : []
  const drawable = reading != null && reading.chartNote == null && series.length > 0
  return (
    <div className={email ? undefined : 'flex flex-col gap-2'}>
      <Eyebrow mode={mode}>{move.title}</Eyebrow>
      <p
        className={email ? undefined : 'm-0 flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-muted-foreground'}
        style={email ? { fontFamily: FONT.mono, fontSize: 10.5, color: EMAIL.muted } : undefined}
      >
        <span>declared {fullDate(move.declaredAt)}</span>
        <span>·</span>
        <span>{move.on}</span>
      </p>
      {drawable ? (
        <BlockCalendar
          blockKey={`quarterly.moves.${move.id}`}
          axis={reading!.months}
          series={series}
          mode={mode}
          height={124}
          width={330}
          padL={34}
          padR={92}
          format={(v) => fmtPct(v)}
          label={`${move.title}, month by month`}
        />
      ) : reading?.chartNote ? (
        <Note mode={mode}>{reading.chartNote}</Note>
      ) : null}
      {reading ? (
        <>
          <div className={email ? undefined : 'flex flex-wrap items-center gap-2'}>
            <BlockMovement verdict={reading.verdict} unit="pts" mode={mode} />
            {reading.unread ? <Note mode={mode}>{reading.unread}</Note> : null}
          </div>
          {/* THE CONTROL AUDIENCES — what moved on the sides you did not touch.
              They are the reason this page may report what happened after a
              move without claiming the move caused it. */}
          {reading.control.map((v) => (
            <Line
              key={`${v.objectKind}:${v.objectId}:${v.audience}`}
              mode={mode}
              // THE SIDE IS NAMED. One object is read on several audiences, so
              // the label alone put "Repair & warranty · 153 of 1,388" above
              // "Repair & warranty · 41 of 142" with nothing between them. A
              // side this workspace does not name is absent from `sideOf` and
              // the row keeps its label rather than inventing one.
              label={sideOf[v.audience] ? `${v.objectLabel} · ${sideOf[v.audience]}` : v.objectLabel}
              figure={<FigureCell mode={mode} value={fmtInt(v.value.k)} of={`of ${fmtInt(v.value.n)}`} align="right" />}
              badge={<BlockMovement verdict={v} unit="pts" mode={mode} />}
            />
          ))}
          <Note mode={mode}>{reading.line}</Note>
        </>
      ) : (
        <Note mode={mode}>{moveTail(move)}</Note>
      )}
    </div>
  )
}

export const quarterlyMoves: Block<QuarterlyData> = {
  key: 'quarterly.moves',
  title: QUARTER_PAGE_TITLE.moves,
  question: QUARTER_PAGE_QUESTION.moves,

  render(data, mode = 'app') {
    const m = data.moves
    const email = mode === 'email'
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

    const readingFor = (id: string) => m.readings.find((r) => r.moveId === id) ?? null

    const moves = (
      <Column mode={mode} gap={14}>
        {m.moves.length > 0 ? (
          m.moves.map((move) => <MoveCard key={move.id} move={move} reading={readingFor(move.id)} sideOf={m.sideOf} mode={mode} />)
        ) : (
          <Note mode={mode}>{m.movesNote ?? 'No move was declared this quarter.'}</Note>
        )}
      </Column>
    )

    const ledger = (
      <Column mode={mode} gap={6}>
        <Eyebrow mode={mode}>The advice, and what you decided</Eyebrow>
        {m.advice.length > 0 ? (
          <>
            {m.advice.map((a) => (
              <div
                key={a.lineageId}
                className={email ? undefined : 'flex gap-2 border-b border-border/70 py-1.5'}
                style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '5px 0', borderTop: `1px solid ${EMAIL.hairline}` } : undefined}
              >
                {/* THE `#` IS THE LEDGER'S OWN ORDER, NOT A RANK AND NOT A ROW
                    ID — `AdviceRow.number`, counted over every identity ever
                    recommended, so "number 3" names the same row for as long as
                    the order holds. */}
                <span
                  className={email ? undefined : 'w-5 shrink-0 font-mono text-[12px] tabular-nums text-primary'}
                  style={email ? { fontFamily: FONT.mono, color: EMAIL.green } : undefined}
                >
                  {a.number}
                </span>
                <span className={email ? undefined : 'flex min-w-0 flex-col'}>
                  <Stored slot="pass_d_b_recommendation">{a.title}</Stored>
                  <span className={email ? undefined : 'flex flex-wrap items-center gap-1.5'}>
                    <Chip tone="plain" mode={mode}>{a.statusLabel}{a.decidedAt ? ` · ${fullDate(a.decidedAt)}` : ''}</Chip>
                    <span className={email ? undefined : 'font-mono text-[9.5px] text-muted-foreground'}>
                      {monthName(`${a.firstMade.slice(0, 7)}-01`)} · {a.monthsRepeated === 1 ? '1 month' : `${a.monthsRepeated} months`} ·{' '}
                      {a.timesMade === 1 ? '1 update' : `${a.timesMade} updates`}
                    </span>
                  </span>
                  <Note mode={mode}>
                    {a.grounded ? <span data-copy="figure">{a.grounded.line}</span> : 'Nothing was recorded as the evidence behind this.'}
                    {' '}Afterwards: {a.afterwards.line}
                  </Note>
                </span>
              </div>
            ))}
            <Note mode={mode} tone="body">{m.actedLine}</Note>
          </>
        ) : (
          <Note mode={mode}>{m.adviceNote ?? 'No advice stands on this workspace yet.'}</Note>
        )}
      </Column>
    )

    const claims = (
      <Column mode={mode} gap={10}>
        <div className={email ? undefined : 'flex flex-col gap-1'}>
          <Eyebrow mode={mode}>What you say, and what comes back</Eyebrow>
          {m.claims.length > 0 ? (
            <>
              {m.claims.map((c) => (
                <Line
                  key={c.id}
                  mode={mode}
                  label={<Stored slot="pass_d_a_say_vs_hear">{c.youSay}</Stored>}
                  badge={<Chip tone="plain" mode={mode}>{c.verdictLabel}</Chip>}
                  note={<Stored slot="pass_d_a_say_vs_hear">{c.gap}</Stored>}
                />
              ))}
              {/* THE MOCK'S "echoed 14 · pushed back 3" HAS NO FIELD.
                  `ClaimRow.gap` is the model's sentence about what came back,
                  not a pair of integers, and inventing the pair at render is
                  the class of claim this whole layer refuses. Said once, under
                  the rows, so a reader does not take the silence for a zero. */}
              <Note mode={mode}>
                How many videos echoed a claim and how many pushed back is not counted yet, so each row carries the
                verdict word alone. {m.claimsLine} {m.claimsCaveat}
              </Note>
            </>
          ) : (
            <Note mode={mode}>{m.claimsLine}</Note>
          )}
        </div>

        <div className={email ? undefined : 'flex flex-col gap-1'}>
          <Eyebrow mode={mode}>The plan, re-checked</Eyebrow>
          {m.plan ? (
            <Card mode={mode}>
              <span className={email ? undefined : 'text-[12.5px] font-medium'}>{m.plan.title}</span>
              <Note mode={mode}>
                uploaded {fullDate(m.plan.uploadedOn)}
                {m.plan.checkedOn ? ` · re-checked ${fullDate(m.plan.checkedOn)}` : ' · not re-checked since it was uploaded'}
              </Note>
              {m.plan.claims.map((claim, i) => (
                // A PLAN'S CLAIM IS THE READER'S OWN DOCUMENT, quoted back —
                // not a model's prose about it — so it carries no slot and is
                // swept by rule (c) like any other unmarked copy.
                <Line
                  key={i}
                  mode={mode}
                  label={claim.claim}
                  figure={
                    claim.value.n > 0
                      ? <FigureCell mode={mode} value={fmtInt(claim.value.k)} of={`of ${fmtInt(claim.value.n)}`} align="right" />
                      : <FigureCell mode={mode} value={fmtInt(claim.value.k)} align="right" />
                  }
                  badge={<Chip tone="plain" mode={mode}>{claim.verdictLabel}</Chip>}
                />
              ))}
              {m.plan.moved.slice(0, 2).map((row, i) => (
                <Note key={`moved-${i}`} mode={mode}>{row.claim} — {row.from} → {row.to} · {row.on}</Note>
              ))}
              {/* THE THREE SENTENCES THAT MUST TRAVEL WITH THESE COUNTS, as one
                  note rather than three: what the counts are of (D15), the floor
                  a verdict is drawn at, and the hold this card does not have. */}
              <Note mode={mode}>{m.plan.basis} {m.plan.floorLine} {m.plan.caveat}</Note>
              {m.plan.notice ? <Note mode={mode}>{m.plan.notice}</Note> : null}
            </Card>
          ) : (
            <Note mode={mode}>
              No plan has been uploaded for this workspace, so there is nothing to re-check against what was read.
            </Note>
          )}
        </div>
      </Column>
    )

    return frame(
      <div className={email ? undefined : 'flex min-h-0 flex-1 flex-col gap-2'}>
        {/* `qr.p6.masthead` · ABOVE the moves, not an italic rule at the foot. */}
        <p
          className={email ? undefined : 'm-0 font-serif text-[12.5px] italic leading-[18px] text-secondary-foreground'}
          style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2, marginBottom: 6 } : undefined}
        >
          {m.rule}
        </p>
        <Columns weights={[4, 4, 4]} gap={28} mode={mode}>
          {moves}
          {ledger}
          {claims}
        </Columns>
      </div>,
    )
  },

  verdicts(data) {
    return data.moves.readings.flatMap((r) => [r.verdict, ...r.control]).filter((v): v is NonNullable<typeof v> => v != null)
  },

  emptyState(data) {
    const m = data.moves
    if (m.moves.length === 0 && m.advice.length === 0 && m.claims.length === 0) {
      return 'Nothing was declared, decided or claimed on this workspace this quarter, so there is nothing to read after it.'
    }
    return null
  },
}
