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

/**
 * THE DISMISSED CHIP READS IN INK, NOT IN RED (design review 8, code review 12).
 * `text-negative` on `bg-negative/15` measured 3.64:1 at 11px — the app-wide
 * chip pattern, and under the line wherever it is used. The tint stays, so the
 * chip still reads as the negative one; the WORD is `text-foreground` on it,
 * which is above 10:1. The card around it carries the rest of the signal — a
 * negative border and a negative headline, both on the card's own background.
 */
function Chip({ tone, children }: { tone: 'new' | 'done' | 'plain' | 'stop'; children: ReactNode }) {
  const cls =
    tone === 'done' ? 'bg-accent text-accent-foreground'
    : tone === 'new' ? 'bg-warning/20 text-foreground'
    : tone === 'stop' ? 'bg-negative/15 text-foreground'
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
/** The eyebrow, in the numeral's slot. Short because the chip beside it already
 *  says "Dismissed" and the provenance line under it says when. */
const STOP_LABEL = 'Stop'

/**
 * AND THE NEGATION IS NOT PAINTED IN RED (design review 9).
 *
 * The card carried `border-negative/40`, a `text-negative` mono eyebrow and a
 * `text-negative` 17px/600 headline. `design-system/verbatim/MASTER.md:43`
 * lists Negative `#DB3B2E` as **"data only"** and rule 2 at `:49` is "Colour =
 * meaning, in data only" — a card border, a label and a headline are chrome,
 * and spending the palette's one alarm colour on them leaves it meaning
 * nothing where a measurement needs it. Measured on the tile, the headline was
 * **4.49:1**, under AA for 17px/600, which is not large text.
 *
 * The artboard makes the same point with a neutral mono eyebrow and an
 * all-black headline and gets the negation from the WORDS and the position.
 * So do we: the words are `STOP_HEAD` and `STOP_LABEL`, the position is the
 * band under the row rather than a fourth column in it, and the one place the
 * negative tint survives is the `Chip` — which is a datum (the status the
 * client set) and is the app-wide chip pattern.
 */

/**
 * A CARD IS A FIXED BOX, SO ITS VARIABLE PROSE IS BOUNDED — BUT NEVER BY A
 * CSS CLAMP, AND NEVER THE QUOTE (design review 1).
 *
 * The slide body is a fixed height with `overflow: hidden` (app/globals.css
 * `.vb-slide-body`) and three of a row's strings are model-written and
 * length-checked nowhere in the product: the advice's title, the commenter's
 * quote and Pass D-b's argument. That much was right. What was drawn was
 * `line-clamp-2` / `line-clamp-3`, and the comment defending it claimed the
 * full string was in the element's `title` and printed in full on the ledger
 * section two slides earlier. BOTH ARE FALSE ON PAPER. A `title` does not
 * exist in a PDF, and `market.advice` expands exactly ONE row
 * (components/pages/market-surface/advice.tsx `expandedLineage`) — a row
 * `toMake` does not draw. Rendered and diffed on the shipped fixture, every
 * truncated argument and every truncated quote on this sheet appeared nowhere
 * else in the brief, which breaks the rule written three lines away: a
 * commenter's own words are on this page or nowhere.
 *
 * Measured on the shipped fixture, FOUR nodes were actually cut — mid-word
 * every time, because a CSS clamp cuts at whatever glyph the line box ends on:
 * "…and nobody in the c…", "…never on the ones that…", "…the half of that
 * argument you ca…", and a refusal sentence at "…we do not compare until 2
 * have been read. Sep 20…" — two characters into a year, so the sheet printed
 * a fragment that reads as a date and lost the half that explains the refusal.
 *
 * So the rule is now by KIND, and two of the four are never cut at all:
 *
 *   · THE QUOTE is printed whole or not at all. It is the one string on the
 *     card that exists nowhere else, and it is the speaker's.
 *   · `afterwards.line` is printed whole. It is composed IN CODE
 *     (lib/reading/afterwards.ts) from a bounded set of clauses, so it has a
 *     ceiling already — and it is the sentence that says why a comparison was
 *     refused, which is worth less than nothing in halves.
 *   · THE ADVICE'S TITLE and PASS D-b's ARGUMENT are bounded by `bound`, in
 *     code, at a WORD boundary. `recommendationSchema` puts no length on
 *     either (lib/pipeline/schemas.ts), so something must; what changes is
 *     that the cut lands between words, never inside one and never inside a
 *     number or a date, and the ellipsis is real text that survives into a PDF.
 *
 * The budgets are set so that the SHIPPED reading is untouched — the longest
 * title and the longest argument on it are well inside them, and
 * `index.test.tsx` pins that — and only a genuinely long string is bounded.
 * That is the bar the review set: nothing a client can read today is cut.
 */

/** Characters of Pass D-b's `title` a card prints before it bounds it. */
export const TITLE_CHARS = 96
/** Characters of Pass D-b's `reasoning` a card prints before it bounds it. */
export const ARGUMENT_CHARS = 180

/**
 * A model string, cut between WORDS, with the cut on the page.
 *
 * Never inside a word, so a cut can never make a fragment that reads as
 * something else — "Sep 20" out of "Sep 2026" is the case this was written
 * for. The trailing punctuation of the surviving word goes with it, so the
 * ellipsis is not "…word, …". Text at or under `max` comes back untouched and
 * carries no ellipsis, which is what makes "was anything cut?" answerable by
 * looking at the page.
 */
export function bound(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max + 1)
  const at = cut.lastIndexOf(' ')
  const kept = at > 0 ? cut.slice(0, at) : text.slice(0, max)
  return `${kept.replace(/[\s,;:.\u2014\u2013-]+$/u, '')}\u2026`
}

function Card({ row, n, mode }: { row: AdviceRow; n: number | null; mode: RenderMode }) {
  const stop = n == null
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-tile px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        {stop
          ? <span className="font-mono text-[13px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{STOP_LABEL}</span>
          : <span className="font-mono text-[13px] font-medium tabular-nums text-primary">{String(n).padStart(2, '0')}</span>}
        <Chip tone={toneOf(row)}>{chipWord(row)}</Chip>
      </div>
      {/* THE ADVICE'S OWN WORDS, WRITTEN BY PASS D-b AND READ BACK OUT OF A
          COLUMN — the `stored` kind, naming the slot that adjudicated them
          (lib/test/copy-contract.ts). On the stop card they are the SUBJECT of
          the headline rather than the headline.
          AND THE STOP HEADLINE IS 15px AGAINST THE CARDS' 17px (design review
          5). The card is subordinate by design — it is what NOT to make on a
          sheet about what to make — and after the colour came off it (design
          review 9) type is what is left to say so. */}
      {stop ? (
        <>
          <h3 className="m-0 text-[15px] font-semibold leading-[1.2] tracking-[-0.01em] text-foreground">{STOP_HEAD}</h3>
          <p
            data-copy="stored"
            data-slot="pass_d_b_recommendation"
            title={row.title}
            className="m-0 text-[13px] font-normal leading-[1.3] text-secondary-foreground"
          >
            {bound(row.title, TITLE_CHARS)}
          </p>
        </>
      ) : (
        <h3
          data-copy="stored"
          data-slot="pass_d_b_recommendation"
          title={row.title}
          className="m-0 text-[17px] font-semibold leading-[1.2] tracking-[-0.01em] text-foreground"
        >
          {bound(row.title, TITLE_CHARS)}
        </h3>
      )}
      <p className="m-0 font-mono text-[10.5px] leading-[1.35] text-muted-foreground">{provenance(row)}</p>
      {row.grounded?.pruned ? <p className="m-0 text-[12px] leading-[1.4] text-muted-foreground">{row.grounded.line}</p> : null}
      {/* `mt-auto`, WHICH IS THE ARTBOARD'S OWN `margin-top:auto` ON ITS LAST
          BLOCK (design review 5). The row is `items-stretch` now, so every card
          is one height; a card whose row carries less than another's would
          otherwise pool all of its white at the bottom and read as unfinished.
          Pushed down, the evidence lands near a common baseline across the row
          and the slack is one interior gap. */}
      <div className="mt-auto flex flex-col gap-1 pt-1">
        <div className="flex flex-col gap-1 rounded-md bg-inner px-3 py-2.5">
          <p className="m-0 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">What the conversation did after</p>
          <Reading verdict={row.afterwards.verdict} mode={mode} />
          <p className="m-0 text-[11.5px] leading-[1.4] text-secondary-foreground">{row.afterwards.line}</p>
        </div>
        {/* THE QUOTE BEFORE THE ARGUMENT, WHICH IS THE ARTBOARD'S ORDER: a
            commenter's own words are on this page or nowhere. */}
        {row.quote ? <BlockQuote quote={row.quote} mode={mode} /> : null}
        {row.why ? (
          <p data-copy="stored" data-slot="pass_d_b_recommendation" title={row.why} className="m-0 text-[12px] leading-[1.4] text-secondary-foreground">
            {bound(row.why, ARGUMENT_CHARS)}
          </p>
        ) : null}
      </div>
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

/** Every row the block draws, computed once. `verdicts()` and `quotes()` each
 *  re-ran `toMake` and called `toStop` twice inside themselves — four
 *  traversals of the ledger per `blockAnswers` (code review 12). */
export function shownRows(data: MarketSurfaceData): AdviceRow[] {
  const stop = toStop(data.advice.rows)
  return [...toMake(data.advice.rows), ...(stop ? [stop] : [])]
}

export const contentMake: Block<MarketSurfaceData> = {
  key: 'content.make',
  // NOT "THREE THINGS TO MAKE, AND ONE TO STOP" (design review 15). A block
  // title is fixed and the ledger is not: the same words printed over two open
  // items, over none, and — on the empty arm — over "Advice lands with your
  // next update." The mock's "3 to make · 1 to stop" is a COUNT, and a count
  // belongs where a count can be recomputed, which is the meta line below and
  // the cover's stamp. The title says what the page is.
  title: 'What to make, and what to stop',
  question: 'What has the conversation asked for, and what did you decide about each one?',

  render(data, mode = 'app') {
    const empty = contentMake.emptyState(data)
    if (empty) {
      return (
        // `header={mode !== 'print'}` ON THIS ARM TOO (design review 4). The
        // filled branch below suppresses the block's own <h2> on a printed
        // sheet, because the slide already carries the same words as its <h1>
        // and the question again as its serif framing. This branch did not, so
        // every THIN arm — refused, empty, unclassified — printed the section
        // title three times and its question twice, four lines apart, over
        // ~900px of white. It is the fault `document-deck.tsx` was fixed for
        // ("printed 'YOUR SUBJECTS' twice"), on the one arm not covered.
        <BlockFrame title={contentMake.title} question={contentMake.question} mode={mode} header={mode !== 'print'}>
          <BlockEmpty mode={mode}>{empty}</BlockEmpty>
        </BlockFrame>
      )
    }
    const make = toMake(data.advice.rows)
    const stop = toStop(data.advice.rows)
    // THE COUNTS THE TITLE NO LONGER CLAIMS, where they can be recomputed from
    // the rows actually drawn (design review 15).
    const meta = `${fmtInt(make.length)} to make${stop ? ' · 1 to stop' : ''} · ${fmtInt(data.advice.total)} in the ledger`

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
        header={mode !== 'print'}
        meta={meta}
        footer={data.advice.actedLine}
        footerNote={`${longMonth(data.month)} \u00b7 ${GROUNDING_BASIS}`}
      >
        <div className="flex min-w-0 flex-col gap-3">
          {/* ONE ROW, ALL OF ONE HEIGHT, AND THE STOP CARD IS THE LAST
              COLUMN (design review 5). The artboard puts the three make cards
              on page 2 and the one stop card in page 4's right pane; folded
              into one section they share a slide, and a full-width stop band
              under three columns costs more height than the sheet has
              (measured: three stretched cards 380px plus the shortest honest
              band 138px, against a 477px budget once the footer and the unlock
              line are paid for). So the four columns stay — and the two things
              the finding is actually about are fixed where they live.

              `items-start` made the row a four-step STAIRCASE: measured
              197 · 466 · 300 · 483 in a 535px body, with card 01 — the only
              undecided item, the reason the sheet exists — the shortest at 37%
              of the row, and the negative card its tallest step. The row is
              `items-stretch` now, which is the grid's default and the
              artboard's; the earlier objection to it — that the thinnest card
              became "a bordered box two thirds white" — is answered by
              `mt-auto` INSIDE the card, which puts the evidence on a common
              baseline, rather than by letting the row staircase. The row's
              height is the tallest card's either way, so this costs nothing.

              The hierarchy is fixed in the card: no colour on its chrome
              (design review 9) and a 15px headline against the make cards'
              17px, so the last column is quiet rather than the loudest object
              on a sheet titled "What to make next".

              */}
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
    return shownRows(data).map((r) => r.afterwards.verdict).filter((v): v is Verdict => v != null)
  },

  quotes(data) {
    return shownRows(data).map((r) => r.quote?.ref).filter((ref): ref is string => !!ref)
  },

  emptyState(data) {
    return data.advice.rows.length === 0 ? data.advice.empty ?? 'Advice lands with your next update.' : null
  },
}
