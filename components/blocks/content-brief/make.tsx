import type { ReactNode } from 'react'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { BlockQuote } from '@/components/blocks/quote'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, fmtPct, fullDate, longMonth } from '@/lib/format'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import type { AdviceRow, MarketSurfaceData } from '@/lib/pages/market-surface'
import { madeInMonth } from '@/lib/pages/market-surface'

// The content brief's page 2 — "Three things to make, and one to stop"
// (Block D wave 2, package E-content; artboard ContentBrief.dc.html slide 2).
//
// THE SAME ROWS, IN THE MOCK'S ANATOMY. `market.advice` draws the ledger as a
// four-column table — what it was · first made · repeated · what you decided —
// and the brief already borrows it. The artboard draws the SAME identities as
// three numbered cards: the advice, its provenance, the reading behind it, a
// quote in the speaker's own words, and what happened afterwards. So this block
// takes `MarketSurfaceData` — the surface the brief already loads, at no second
// read — and draws the cards. Nothing here recomputes a ledger row.
//
// WHAT THE ARTBOARD HAS THAT THIS DOES NOT, AND WHY:
//
//   · the share and its badge ("4.3% of 1,388 ▲ 1.4 pts"). `AdviceRow` carries
//     no month reading of its own — nothing joins a ledger row to a theme id at
//     the row level. What it DOES carry is `afterwards`, which is a banded
//     month-against-month reading of the identity the advice is about, taken
//     after the client decided. That is the reading printed here, with both
//     sides' k and n and the band beside the word, and it is labelled as what
//     it is rather than as "this month's share".
//
//   · the sparkline and the "Jul 5.1 · Aug 6.8 · Sep 9.4" trail. Same reason: a
//     ledger row carries two month readings, not a series. Drawing a line
//     through two points would be a direction claim (D3), which two points
//     cannot earn.
//
//   · "growing, 3rd month". `directionWordsFor('documents.trajectory')` is
//     false and `shownTrajectory` blanks a stored one at render (D1/D5). The
//     badge alone is what a brief may print.
//
//   · the confidence dots. `ConfidenceDots` is a finding page's field
//     (`page.meta.sure`); a ledger row has no confidence, and three dots with
//     nothing behind them is the score this product does not show.
//
//   · "8 answered last week · 4 ignored" and the reply rows. Nothing records
//     whether a reply was sent (D6), and the inbox those rows come from is
//     `lib/pages/content.ts`, which another package is moving this wave.

/** How many "things to make" a brief prints. The mock's three, and the reason
 *  is the mock's: a page of cards a reader acts on is three, and the ledger
 *  behind it is a table (`ct.advice`) that prints twelve. */
export const MAKE_SHOWN = 3

/**
 * The ledger rows a brief calls "things to make": STILL ON THE TABLE, oldest
 * first, which is the ledger's own order and the honest answer to "what has
 * been sitting here".
 *
 * TWO STATUSES ARE OUT, AND ONE OF THEM USED TO BE IN (design review 2, code
 * review 2). `dismissed` is the stop card. `acted_on` reads **"Done"**
 * (lib/calibration.ts REC_STATUS_LABEL) and the ledger is sorted oldest-first,
 * so the three oldest rows won regardless of status: on production's own shape
 * — two `acted_on`, one `new` — cards 01 and 02 were both chipped Done and the
 * only open item sat third. A client opening a page titled after things to make
 * read two items they had already made as their top two instructions.
 */
export function toMake(rows: readonly AdviceRow[], shown = MAKE_SHOWN): AdviceRow[] {
  return rows.filter((r) => r.status !== 'dismissed' && r.status !== 'acted_on').slice(0, shown)
}

/**
 * The one "what not to make" — the most recently dismissed piece of advice.
 *
 * NEWEST DECISION FIRST, not newest advice: the card is about a decision the
 * client made, so the decision's own date orders it. A dismissal with no date
 * (a status set before `rec_decisions` was applied) sorts last rather than
 * being dropped, because the row is still a dismissal.
 */
export function toStop(rows: readonly AdviceRow[]): AdviceRow | null {
  const dismissed = rows.filter((r) => r.status === 'dismissed')
  if (dismissed.length === 0) return null
  return [...dismissed].sort(
    (a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? '') || b.firstMade.localeCompare(a.firstMade),
  )[0]
}

/**
 * "First raised July · advised in 2 months · Dismissed 28 Jul · grounded in 3
 * videos" — the card's mono provenance line, every clause a field.
 *
 * THE GROUNDING IS A COUNT HERE AND A SENTENCE ONCE, UNDER THE ROW.
 * `Grounding.line` states its own basis in full ("counted over everything we
 * have read for you up to September, not over one month"), which is right on a
 * table with one row per line and is four lines of a card at 1123 × 631 —
 * printed four times, once per card, saying the same thing. `GROUNDING_BASIS`
 * is that sentence, said once; a row whose evidence was PRUNED still gets its
 * own words, because that is a fact about the row and not about the basis.
 */
export function provenance(row: AdviceRow): string {
  const parts = [`First raised ${madeInMonth(row.firstMade)}`]
  if (row.monthsRepeated > 1) parts.push(`advised in ${fmtInt(row.monthsRepeated)} months`)
  else if (row.repeatedWithinMonth) parts.push('advised twice, in one month')
  if (row.status !== 'new') parts.push(row.decidedAt ? `${row.statusLabel} ${fullDate(row.decidedAt)}` : row.statusLabel)
  if (row.grounded && !row.grounded.pruned) parts.push(`grounded in ${fmtInt(row.grounded.videos)} ${row.grounded.videos === 1 ? 'video' : 'videos'}`)
  return parts.join(' · ')
}

export const GROUNDING_BASIS =
  'A card’s grounding is counted over everything we have read for you, not over one month.'

function Chip({ tone, children }: { tone: 'new' | 'done' | 'plain' | 'stop'; children: ReactNode }) {
  const cls =
    tone === 'done' ? 'bg-accent text-accent-foreground'
    : tone === 'new' ? 'bg-warning/20 text-foreground'
    : tone === 'stop' ? 'bg-negative/15 text-negative'
    : 'bg-inner text-secondary-foreground'
  return <span className={`inline-flex flex-none items-center rounded-full px-2.5 py-[3px] font-mono text-[11px] leading-none ${cls}`}>{children}</span>
}

const toneOf = (row: AdviceRow): 'new' | 'done' | 'plain' | 'stop' =>
  row.status === 'dismissed' ? 'stop' : row.status === 'acted_on' ? 'done' : row.status === 'new' ? 'new' : 'plain'

const chipWord = (row: AdviceRow): string =>
  row.status === 'new' ? `new · raised ${madeInMonth(row.firstMade)}` : row.statusLabel

/** The reading behind a row: both sides' k and n, and the band beside the word.
 *  Null where the advice earned no comparison — the card then prints the
 *  sentence that says why, which `afterwards.line` always carries. */
function Reading({ verdict, mode }: { verdict: Verdict | null; mode: RenderMode }) {
  if (!verdict) return null
  const { k, n } = verdict.value
  return (
    <span className="flex flex-wrap items-baseline gap-2.5">
      <span className="flex-none">
        <FigureCell mode={mode} value={n > 0 ? fmtPct((k / n) * 100) : fmtInt(k)} of={`${fmtInt(k)} of ${fmtInt(n)} videos`} />
      </span>
      <BlockMovement verdict={verdict} unit="pts" mode={mode} />
    </span>
  )
}

/**
 * The stop card's headline, and why it is not the advice (design review 3).
 *
 * The card printed the stored title — "Lead with price comparisons against
 * Ottobock" — at 17px semibold, the largest type on the card, negated only by a
 * 10.5px mono eyebrow above it. Scanned at a glance, which is how a four-column
 * row is read, it was a fourth thing to MAKE. The artboard solved it in the
 * words ("Stop leading with price comparisons against Freitag"); we cannot,
 * because those words are `pass_d_b_recommendation`'s own and rewriting a
 * model's stored sentence is the one thing a render may never do.
 *
 * So the negation is carried by the card's STRUCTURE: the headline is code's
 * ("What not to make"), the advice sits under it at body size behind a label
 * that says what it is, and the largest, boldest thing on the card is the one
 * word a scanner needs.
 */
const STOP_HEAD = 'What not to make'
const STOP_LABEL = 'The advice you dismissed'

function Card({ row, n, mode }: { row: AdviceRow; n: number | null; mode: RenderMode }) {
  const stop = n == null
  return (
    <div className={`flex min-w-0 flex-col gap-1 rounded-md border px-4 py-3 ${stop ? 'border-negative/30 bg-negative/[0.04]' : 'border-border bg-tile'}`}>
      <div className="flex items-center justify-between gap-2">
        {stop
          ? <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-negative">Stop</span>
          : <span className="font-mono text-[13px] font-medium tabular-nums text-primary">{String(n).padStart(2, '0')}</span>}
        <Chip tone={toneOf(row)}>{chipWord(row)}</Chip>
      </div>
      {/* THE ADVICE'S OWN WORDS, WRITTEN BY PASS D-b AND READ BACK OUT OF A
          COLUMN — the `stored` kind, naming the slot that adjudicated them
          (lib/test/copy-contract.ts). On the stop card they are the SUBJECT of
          the headline rather than the headline. */}
      {stop ? (
        <>
          <h3 className="m-0 text-[17px] font-semibold leading-[1.2] tracking-[-0.01em] text-negative">{STOP_HEAD}</h3>
          <p className="m-0 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">{STOP_LABEL}</p>
          <p
            data-copy="stored"
            data-slot="pass_d_b_recommendation"
            className="m-0 text-[13px] font-normal leading-[1.3] text-secondary-foreground"
          >
            {row.title}
          </p>
        </>
      ) : (
        <h3
          data-copy="stored"
          data-slot="pass_d_b_recommendation"
          className="m-0 text-[17px] font-semibold leading-[1.2] tracking-[-0.01em] text-foreground"
        >
          {row.title}
        </h3>
      )}
      <p className="m-0 font-mono text-[10.5px] leading-[1.35] text-muted-foreground">{provenance(row)}</p>
      {row.grounded?.pruned ? <p className="m-0 text-[12px] leading-[1.4] text-muted-foreground">{row.grounded.line}</p> : null}
      <div className="flex flex-col gap-1 rounded-md bg-inner px-3 py-2.5">
        <p className="m-0 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">What the conversation did after</p>
        <Reading verdict={row.afterwards.verdict} mode={mode} />
        <p className="m-0 text-[11.5px] leading-[1.4] text-secondary-foreground">{row.afterwards.line}</p>
      </div>
      {/* THE QUOTE BEFORE THE ARGUMENT, WHICH IS THE ARTBOARD'S ORDER AND THE
          SAFER ONE. A card is a fixed box on a 1123 × 631 sheet and the last
          thing in it is what a long row clips; the model's argument is also on
          the ledger section two slides earlier, and a commenter's own words are
          on this page or nowhere. */}
      {row.quote ? <BlockQuote quote={row.quote} mode={mode} /> : null}
      {row.why ? (
        <p data-copy="stored" data-slot="pass_d_b_recommendation" className="m-0 text-[12px] leading-[1.4] text-secondary-foreground">
          {row.why}
        </p>
      ) : null}
    </div>
  )
}

function EmailCard({ row, n }: { row: AdviceRow; n: number | null }) {
  const stop = n == null
  return (
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${EMAIL.hairline}` }}>
      <div style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted }}>
        {stop ? 'Stop' : String(n).padStart(2, '0')} · {chipWord(row)}
      </div>
      {/* THE HEADLINE IS CODE'S ON THE STOP CARD (design review 3) — the same
          structural negation the app and print arms draw, because an email is
          scanned harder than a sheet. */}
      {stop ? (
        <div style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: EMAIL.ink, marginTop: 3 }}>{STOP_HEAD}</div>
      ) : null}
      {stop ? (
        <div style={{ fontFamily: FONT.mono, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.6px', color: EMAIL.muted, marginTop: 3 }}>{STOP_LABEL}</div>
      ) : null}
      <div
        data-copy="stored"
        data-slot="pass_d_b_recommendation"
        style={{ fontFamily: FONT.sans, fontSize: stop ? 12.5 : 14, fontWeight: stop ? 400 : 600, color: stop ? EMAIL.ink2 : EMAIL.ink, marginTop: 3 }}
      >
        {row.title}
      </div>
      <div style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted, marginTop: 3 }}>{provenance(row)}</div>
      <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink2, marginTop: 4 }}>{row.afterwards.line}</div>
      {row.quote ? <BlockQuote quote={row.quote} mode="email" /> : null}
    </div>
  )
}

export const contentMake: Block<MarketSurfaceData> = {
  key: 'content.make',
  title: 'Three things to make, and one to stop',
  question: 'What has the conversation asked for, and what did you decide about each one?',

  render(data, mode = 'app') {
    const empty = contentMake.emptyState(data)
    if (empty) {
      return (
        <BlockFrame title={contentMake.title} question={contentMake.question} mode={mode}>
          <BlockEmpty mode={mode}>{empty}</BlockEmpty>
        </BlockFrame>
      )
    }
    const make = toMake(data.advice.rows)
    const stop = toStop(data.advice.rows)
    const meta = `${fmtInt(data.advice.total)} in the ledger · oldest first`

    if (mode === 'email') {
      return (
        <BlockFrame title={contentMake.title} question={contentMake.question} mode={mode} meta={meta} footerNote={data.advice.actedLine}>
          <div>
            {make.map((r, i) => <EmailCard key={r.lineageId} row={r} n={i + 1} />)}
            {stop ? <EmailCard row={stop} n={null} /> : null}
          </div>
        </BlockFrame>
      )
    }

    return (
      <BlockFrame
        title={contentMake.title}
        question={contentMake.question}
        mode={mode}
        heading={mode !== 'print'}
        meta={meta}
        footer={data.advice.actedLine}
        footerNote={`${longMonth(data.month)} \u00b7 ${GROUNDING_BASIS}`}
      >
        <div className="flex min-w-0 flex-col gap-3">
          {/* ONE ROW, AND THE STOP CARD IS THE LAST COLUMN. The artboard puts
              the three make cards on page 2 and the one stop card in page 4's
              right pane; folded into one section they have to share a slide,
              and a full-width stop card under three columns runs off the
              sheet. Four columns keeps every card on the page at the mock's
              own density, and the stop card keeps its own eyebrow. */}
          <div className={`grid min-w-0 gap-[18px] ${stop ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
            {make.map((r, i) => <Card key={r.lineageId} row={r} n={i + 1} mode={mode} />)}
            {stop ? <Card key={stop.lineageId} row={stop} n={null} mode={mode} /> : null}
          </div>
          {!data.advice.recorded ? (
            <p className="m-0 text-[11.5px] leading-[1.4] text-muted-foreground">{data.advice.unlock}</p>
          ) : null}
        </div>
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = {}
    out.content_advice_total = { value: data.advice.total, unit: 'videos', label: `${fmtInt(data.advice.total)} pieces of advice` }
    out.content_advice_acted = { value: data.advice.acted, unit: 'videos', label: `${fmtInt(data.advice.acted)} acted on` }
    return out
  },

  verdicts(data): Verdict[] {
    const rows = [...toMake(data.advice.rows), ...(toStop(data.advice.rows) ? [toStop(data.advice.rows)!] : [])]
    return rows.map((r) => r.afterwards.verdict).filter((v): v is Verdict => v != null)
  },

  quotes(data) {
    const rows = [...toMake(data.advice.rows), ...(toStop(data.advice.rows) ? [toStop(data.advice.rows)!] : [])]
    return rows.map((r) => r.quote?.ref).filter((ref): ref is string => !!ref)
  },

  emptyState(data) {
    return data.advice.rows.length === 0 ? data.advice.empty ?? 'Advice lands with your next update.' : null
  },
}
