import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Block, BlockContext, QuoteRef, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame, NoValue } from '@/components/blocks/frame'
import { BlockQuote } from '@/components/blocks/quote'
import { MovementBadge } from '@/components/delta-badge'
import { sharedPairNote } from '@/lib/calibration'
import { RecStatusMenu, RecStatusWord } from '@/components/rec-status'
import { TileBlock } from '@/components/shell/tile'
import { FLAG_NOTE } from '@/lib/agent/movement'
import { fmtInt, shortDate } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable, Verdict, VerdictPairNote } from '@/lib/reading/verdicts'
import { openLink } from '@/components/blocks/open-link'
import {
  ADVICE_AFTERWARDS_UNRECORDED, ADVICE_UNRECORDED, LEDGER_ALL_PARAM, LEDGER_ALL_VALUE, LEDGER_FIRST_TIME_LINE,
  adviceAnchor, ageInMonths, madeInMonth, marketSurfaceHref, repeatCell,
  type AdviceRow, type MarketSurfaceData,
} from '@/lib/pages/market-surface'
import { GROUNDED_BASIS, type Afterwards } from '@/lib/reading/afterwards'
import { REC_STATUS_LABEL } from '@/lib/calibration'
import { LeadDecision } from './lead-decision'
import { LEAD_SQUARE, LEAD_UNDECIDED, leadStamp } from './lead-words'

// MK2 · The advice, and what you decided — the ledger (design §3 MK2; ported to
// the artboard, Block D wave 2).
//
// SEVEN COLUMNS, NOT FOUR. The artboard's ledger is a seven-track grid — # ·
// Recommendation · First raised · Repeated · Your decision · Grounded in ·
// Afterwards — and three of those tracks had no field until wave 1 built them.
// They are bound here: `AdviceRow.number` (the identity a person can say out
// loud), `AdviceRow.grounded` (`groundingFor`) and `AdviceRow.afterwards`
// (`afterwardsFor`). It stays a `<table>` rather than becoming a grid of divs:
// the columns ARE a table, the anchors and the deep link are already on rows,
// and a `colgroup` carries the artboard's own track widths.
//
// ONE ROW PER IDENTITY, THE CURRENT RECOMMENDATION FIRST AND THEN THE NEWEST
// (market-first WP1.9, GR F34). It ran oldest first, which on Sealand drew
// twelve June rows and left out the advice the headline showed. The first row
// carries the preview's row tag, "current recommendation"; the loader's header
// says why one row per identity is a different read from the parked page's.
//
// EVERY ROW HAS AN ADDRESS. `?rec=<id>` is carried by four sent emails and
// every digest until WP17; it used to resolve to a lineage that reached only
// MK5's accept button, so a reader following a digest link landed on a ledger
// of twelve rows that did not contain the row they had clicked. Each row now
// carries an anchor and a link of its own (`?item=<lineage>`, which is what
// `marketSurfaceHref` writes), the named row is drawn whether or not it is one
// of the twelve, and it is marked.
//
// THE EXPANDED ROW IS THE DEEP LINK'S, and otherwise the first row that has an
// argument to show, which is the current recommendation when it has one. The artboard draws one row expanded — "Why we keep raising
// it", the grounding restated, and the advice's own comment. `reasoning` and
// `hero_quote` are both selected again (D4) and both are already adjudicated:
// the argument is `stored` under `pass_d_b_recommendation`, and the comment is
// a SIBLING node with its own ref, never a span inside the scrubbed prose — a
// number inside a quotation is still refused, which is the whole reason the two
// are separate nodes.
//
// "AFTERWARDS" IS NEVER BLANK AND NEVER A DASH. The artboard prints "—" on
// three of its five rows, which in a column headed Afterwards reads as "nothing
// happened" — a claim. `afterwardsFor` has four states and each carries its own
// sentence; where it produced a comparison the band and the change travel
// together inside one `Verdict` (D2: `MovementBadge` prints points only when
// the state is `moved`). The clustering caveat is printed BESIDE it rather than
// dropped: on today's corpus every frozen month predates the clustering
// fingerprint, so `clustering_unknown` is on very nearly every comparison this
// column can draw, and a caveat that is always true is not one to skip.
//
// "GROUNDED IN" IS A COUNT OVER THE WHOLE CORPUS AND SAYS SO under the table
// (D8, `GROUNDED_CORPUS_LINE`) — the same shape as `CONCLUSIONS_CORPUS_LINE`
// one block above. Two of the cell's three states are not numbers at all:
// evidence a later update replaced says that (all twelve of Sealand's drawn
// rows are in that state), and a row that never recorded evidence says that
// instead of printing a zero.
//
// THE STATUS IS A CONTROL IN THE APP AND A WORD EVERYWHERE ELSE. An export must
// not render a button nobody can press, and `RecStatusWord` is the same fact
// with no affordance. One difference from the parked page, and it is deliberate:
// that page's word renders NOTHING while the status is `new`, which is 119 of
// 121 rows in production — a ledger whose subject is what you did about each
// row cannot have a blank column, so this one prints "New" itself.
//
// THE TITLE IS `stored`, NAMING `pass_d_b_recommendation`. A recommendation's
// words are Pass D-b's, adjudicated at write time by that slot's policy —
// `digits`, with the run's allow-list, and deliberately NOT the direction rule,
// because "Increase Content Volume to Improve Share of Voice" is an imperative
// addressed to the reader and not a claim that something is going up (the trade
// is measured beside PROSE_POLICY). Marking it `prose` made this block fail the
// copy contract on every production ledger; the marker says whose words they
// are instead of re-adjudicating them with no allow-list in hand.
//
// THE AGE IS BACK, AND IT IS THE ARTBOARD'S. This block said "NO AGE IN MONTHS
// ON THE ROW" while printing a day-and-month nobody reads as an age. The
// artboard stacks the month over the months standing, and `ageInMonths` counts
// CALENDAR months — the ledger's own unit, the one the column beside it counts
// in.

/** The row tag on the ledger's first row, the preview's "1 · current
 *  recommendation" (market-first WP1.9). A row tag, never header meta. */
export const CURRENT_TAG = 'current recommendation'

/** The quiet way to the rest of the ledger under the short list (walkthrough
 *  item 6): no count, because the count was the noise. */
export const EARLIER_ADVICE = 'Earlier advice, and other wordings of these →'

/** The artboard's track widths, in order. The empty one is the title, which
 *  takes what is left. */
const TRACKS = ['w-[22px]', '', 'w-[88px]', 'w-[96px]', 'w-[176px]', 'w-[100px]', 'w-[240px]'] as const
/** The "Repeated" track, left out where the column is not drawn (`repeatColumn`). */
const REPEAT_TRACK = 3

/** Under `md` a ledger row is a block, not seven tracks (sw-2 item 3): the
 *  number beside the advice, then each cell on its own line, under it. */
const STACK_ROW = 'max-md:grid max-md:grid-cols-[22px_minmax(0,1fr)] max-md:gap-x-2 max-md:gap-y-1 max-md:py-2.5'
const STACK_CELL = 'max-md:col-start-2 max-md:flex max-md:flex-wrap max-md:items-baseline max-md:gap-x-2 max-md:py-0 max-md:pr-0'

/** A cell's column name, printed beside it only where the table stacks. */
function StackLabel({ children }: { children: ReactNode }) {
  return <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground md:hidden">{children}</span>
}

/** The artboard's mono figure: a number a reader can see is counted rather
 *  than asserted.
 *
 *  AND IT DOES NOT WEAR THE DOTTED UNDERLINE, which on this page is a promise.
 *  MASTER rule 5 gives a quiet grey dotted underline to a claim with evidence
 *  BEHIND it — "click → popover with count, platform split, two quotes, link to
 *  the page" — and `components/claim-popover.tsx` states the rule in the same
 *  words it is built to: "Nothing gets this treatment unless it can open — a
 *  claim without evidence is plain text." The artboard draws the decoration on
 *  a bare `<span>` because an artboard is a still; the spec's own §3.12 draws
 *  the same ink as a `<button>` with a `role="dialog"` panel behind it.
 *
 *  This page's port took the still. Five of its most load-bearing counts —
 *  "157 of 1,699 videos behind it", "2 of 1,699 videos behind it" and the three
 *  grounding cells — carried the underline with no link, no handler and no
 *  popover, on the same viewport where every Derivation summary wears it and
 *  DOES open. So the decoration is spent on the thing that opens and nothing
 *  else, and the figure keeps everything the artboard gives it that is not an
 *  affordance: the mono face, the tabular figures, the 11.5px step and the
 *  secondary ink. The day one of these counts has an evidence panel behind it,
 *  the underline comes back with the panel and not before. */
const FIGURE = 'font-mono text-[11.5px] tabular-nums text-secondary-foreground'

function StatusCell({ row, mode }: { row: AdviceRow; mode: RenderMode }) {
  const decided = row.decidedAt ? shortDate(row.decidedAt) : null
  if (mode === 'app') {
    return <RecStatusMenu id={row.recommendationId} status={row.status} variant="pill" decidedAt={decided} />
  }
  if (mode === 'email') {
    return <span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.ink2 }}>{row.statusLabel}{decided ? ` · ${decided}` : ''}</span>
  }
  // Print: the word, and "New" spelled out rather than an empty cell.
  return (
    <span className="text-[12px] text-secondary-foreground">
      {row.status === 'new' ? 'New' : <RecStatusWord status={row.status} />}{decided ? ` · ${decided}` : ''}
    </span>
  )
}

/** The repeat cell: updates on top, months only where there is more than one
 *  (D9 — `timesMade` counts UPDATES and the word says so). It says "First
 *  time", never "New", because the cell one column to its right prints "New"
 *  for a row nobody has decided on (`LEDGER_FIRST_TIME_LINE`). */
function RepeatCell({ row, first, mode }: { row: AdviceRow; first: boolean; mode: RenderMode }) {
  const { updates, months } = repeatCell(row)
  if (mode === 'email') {
    return <span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted }}>{first ? 'First time' : updates}</span>
  }
  if (first) {
    return <span title={LEDGER_FIRST_TIME_LINE} className="inline-block cursor-help whitespace-nowrap rounded-full bg-inner px-2 py-0.5 text-[11.5px] font-medium text-secondary-foreground">First time</span>
  }
  return (
    <span className="flex min-w-0 flex-col gap-px">
      <span className="text-[12px] text-secondary-foreground">{updates}</span>
      {months ? <span className="text-[11px] text-muted-foreground">{months}</span> : null}
    </span>
  )
}

/**
 * "FIRST TIME" MARKS ADVICE THE LATEST UPDATE RAISED, AND ONLY BESIDE ROWS IT
 * DID NOT (deploy 1 review, the lead's R10). Since MK2 runs newest first,
 * every row visible on 2 Oct was first raised in September, and the chip
 * printed twelve times, row 1 included, directly above "Why we keep raising
 * it". The chip now marks a row whose lineage first appears in the latest
 * update, and only while some visible row is not one: a column that would be
 * the chip on every row says nothing, so it is not drawn.
 */
export function repeatColumn(rows: readonly AdviceRow[]): { shown: boolean; first: (row: AdviceRow) => boolean } {
  const first = (row: AdviceRow) => row.firstInLatest === true
  return { shown: !(rows.length > 0 && rows.every(first)), first }
}

/** "Grounded in": a count, or the named absence that is not a zero. */
function GroundedCell({ row, mode }: { row: AdviceRow; mode: RenderMode }) {
  const g = row.grounded
  // "an earlier read", not "evidence replaced" (walkthrough B8): 51 rows said
  // the latter, which is our bookkeeping. The tooltip keeps the whole fact.
  const words = g == null
    ? 'not recorded'
    : g.pruned
      ? 'an earlier read'
      : `${fmtInt(g.videos)} ${g.videos === 1 ? 'video' : 'videos'}`
  const title = g?.line ?? 'This advice did not record the evidence it was written from.'
  if (mode === 'email') {
    return <span style={{ fontFamily: FONT.mono, fontSize: 11.5, color: EMAIL.muted }}>{words}</span>
  }
  if (g == null || g.pruned) {
    return <span title={title} className="text-[11.5px] text-muted-foreground">{words}</span>
  }
  return <span data-copy="figure" title={title} className={FIGURE}>{words}</span>
}

/**
 * "Afterwards": two month readings with the band beside the word, or the
 * sentence for whichever silence this is.
 *
 * The whole cell is one `verdict` node in the reading state, because the badge
 * inside it is the only place on this page a movement word is allowed to appear
 * (copy contract, rule (c)).
 */
/**
 * The one sentence the Afterwards column says about EVERY row, or null
 * (polish pass, 2026-09-24).
 *
 * Nothing on this page has two monthly readings behind a decision yet, so
 * `afterwardsFor` answers every one of the ledger's twelve rows with the same
 * fifteen words — "You have not decided on this one yet. We start reading the
 * month after you do." — printed twelve times down a 200px column, with
 * `a.unlock` saying the same thing again in a line under the table. The
 * artboard's Afterwards column is an em dash on the three of its five rows
 * that have nothing to report.
 *
 * FOLDED ONLY WHERE IT IS ONE SENTENCE ABOUT ALL OF THEM. The moment two rows
 * give different answers — one decided, one not — the column is saying
 * something per row and every cell speaks for itself again. The block's own
 * four states are what make this safe: the fold is on the rendered LINE, not
 * on a state, so a new state cannot be folded away by accident.
 */
export function foldedAfterwards(rows: readonly AdviceRow[]): string | null {
  if (rows.length < 2) return null
  const lines = new Set(rows.map((r) =>
    r.afterwards?.state === 'reading' && r.afterwards.verdict ? '\u0000reading' : (r.afterwards?.line ?? ADVICE_AFTERWARDS_UNRECORDED),
  ))
  if (lines.size !== 1) return null
  const only = [...lines][0]
  return only === '\u0000reading' ? null : only
}

/** The month-pair refusals the Afterwards column carries, as verdict-shaped
 *  pairs for `sharedPairNote`. */
function afterwardsRefusals(rows: readonly AdviceRow[]): { state: string; pair: VerdictPairNote }[] {
  return rows.flatMap((r) => (r.afterwards?.state === 'refused' && r.afterwards.pair ? [{ state: 'refused', pair: r.afterwards.pair }] : []))
}

function AfterwardsCell({ row, mode, folded = false, shared = null }: { row: AdviceRow; mode: RenderMode; folded?: boolean; shared?: VerdictPairNote | null }) {
  // A FROZEN ROW MAY NOT HAVE THE FIELD AT ALL, and this cell used to reach
  // straight through it. `afterwards` is required and wave 1 added it, so a
  // `report_snapshots` row whose `surfaces.market` froze before Block D
  // arrives here with it absent — and `market.advice` is a named brief section
  // at 017fc6e and at HEAD, so such a snapshot reaches this block by the
  // ordinary path rather than by accident. `ADVICE_AFTERWARDS_UNRECORDED` is
  // the fifth thing this column can say, and it is about our record.
  const a: Afterwards | null = row.afterwards ?? null
  const email = mode === 'email'
  if (a == null || a.state !== 'reading' || !a.verdict) {
    // The column says one thing about every row: it says it once, under the
    // table, and the cell carries the artboard's mark for an empty one.
    if (folded) return <NoValue mode={mode} label="nothing to report yet" />
    // A REFUSED COMPARISON IS NOT SHOWN AND NOT EXPLAINED (T0a, YM-16; the
    // one condition): the cell is empty, with no "not compared", no refusal
    // sentence and no chip under the table.
    void shared
    if (a?.state === 'refused') return null
    const line = a?.line ?? ADVICE_AFTERWARDS_UNRECORDED
    return email
      ? <span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted }}>{line}</span>
      : <span className="text-[11.5px] leading-[1.35] text-muted-foreground">{line}</span>
  }
  // EVERY FLAG THIS COMPARISON CARRIES, in the product's one wording for them
  // (`FLAG_NOTE`, lib/agent/movement.ts) — not a caveat this block chooses.
  const notes = [...new Set(a.verdict.flags.map((f) => FLAG_NOTE[f]).filter((n): n is string => Boolean(n)))]
  if (email) {
    return (
      <span data-copy="verdict" style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.ink2 }}>
        {a.verdict.objectLabel}: {a.line}
        {notes.length > 0 ? ` (${notes.join('; ')})` : ''}
      </span>
    )
  }
  return (
    <span data-copy="verdict" className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[11.5px] leading-[1.35] text-secondary-foreground">{a.verdict.objectLabel}: {a.line}</span>
      <MovementBadge verdict={a.verdict} unit="pts" good="neutral" bandTip={mode === 'app'} />
      {notes.map((n) => <span key={n} className="text-[10.5px] leading-[1.3] text-muted-foreground">{n}</span>)}
    </span>
  )
}

/** "also raised 4 times before, in other words": the older advice the short
 *  list counted on this row (walkthrough item 6). Null where there is none. */
export function alsoRaisedLine(row: Pick<AdviceRow, 'alsoRaised'>): string | null {
  const n = row.alsoRaised ?? 0
  if (n <= 0) return null
  return `also raised ${n === 1 ? 'once' : `${fmtInt(n)} times`} in other words`
}

/** The expansion's heading. "Why we keep raising it" only where it HAS been
 *  raised more than once, by an update or in other words: on a row marked
 *  "First time" it said something the row beside it denied (item 6, B8). */
export const whyHeading = (row: Pick<AdviceRow, 'timesMade' | 'alsoRaised'>): string =>
  row.timesMade > 1 || (row.alsoRaised ?? 0) > 0 ? 'Why we keep raising it' : 'Why we recommend it'

/** The artboard's expanded row: the argument, the grounding restated, and the
 *  advice's own comment as its own node. */
function Expansion({ row, mode }: { row: AdviceRow; mode: RenderMode }) {
  const g = row.grounded
  return (
    <TileBlock className="ml-[34px] flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground">{whyHeading(row)}</span>
        {g && !g.pruned
          ? <span className="shrink-0 font-mono text-[11px] text-muted-foreground">grounded in <span data-copy="figure" className={FIGURE}>{fmtInt(g.videos)} {g.videos === 1 ? 'video' : 'videos'}</span></span>
          : null}
      </div>
      {row.why
        ? <p data-copy="stored" data-slot="pass_d_b_recommendation" className="m-0 text-[12.5px] leading-[1.45]">{row.why}</p>
        : null}
      {row.quote ? <BlockQuote quote={row.quote} mode={mode} /> : null}
    </TileBlock>
  )
}

/** Which row the artboard draws open: the one a link named, else the first
 *  in the ledger's order (the current recommendation, since WP1.9) that
 *  actually has something to show. Pure, so the choice is testable. */
export function expandedLineage(rows: readonly AdviceRow[], highlight: string | null): string | null {
  const hasBody = (r: AdviceRow) => Boolean(r.why || r.quote)
  const named = highlight ? rows.find((r) => r.lineageId === highlight) ?? null : null
  if (named && hasBody(named)) return named.lineageId
  return rows.find(hasBody)?.lineageId ?? null
}

/** The lead card's row (the current recommendation, when it is the first
 *  row) and the table's rows under it. One split, read by the render and by
 *  `quotes()`, so the block declares the quote it draws. */
export function splitLead(a: Pick<MarketSurfaceData['advice'], 'rows' | 'current'>): { lead: AdviceRow | null; tableRows: AdviceRow[] } {
  const lead = a.current && a.rows[0]?.lineageId === a.current ? a.rows[0] : null
  return { lead, tableRows: lead ? a.rows.slice(1) : [...a.rows] }
}

/**
 * THE CURRENT RECOMMENDATION LEADS, AS ITS OWN CARD (WP3.6 Y2; the preview's
 * "1 · current recommendation"). Its number, its words, how many updates have
 * raised it and the videos behind it, and on the right what you decided and
 * when. The ledger's table below it starts at row 2. The rest of the row's
 * reading (the afterwards sentence) rides under it, so nothing the table
 * printed for this row is lost by leading with it.
 */
function LeadCard({ row, mode, hrefFor, shared, folded }: { row: AdviceRow; mode: RenderMode; hrefFor: (lineageId: string) => string; shared: VerdictPairNote | null; folded: boolean }) {
  const email = mode === 'email'
  const repeated = row.timesMade > 1 ? `repeated across ${fmtInt(row.timesMade)} updates` : 'raised by one update'
  const grounded = row.grounded && !row.grounded.pruned ? row.grounded.videos : null
  if (email) {
    return (
      <div id={adviceAnchor(row.lineageId)} style={{ background: EMAIL.inner, borderRadius: 6, padding: '10px 12px', marginBottom: 8 }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted }}>{fmtInt(row.number)} · {CURRENT_TAG}</div>
        <div data-copy="stored" data-slot="pass_d_b_recommendation" style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: EMAIL.ink, marginTop: 4 }}>{row.title}</div>
        <div style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2, marginTop: 4 }}>
          {repeated}{grounded != null ? <> · <span data-copy="figure">{fmtInt(grounded)}</span> {grounded === 1 ? 'video' : 'videos'} behind it</> : null}
          {' · '}{row.status === 'new'
            ? <span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.ink2 }}>{LEAD_UNDECIDED}</span>
            : <StatusCell row={row} mode={mode} />}
        </div>
        {folded ? null : <div style={{ marginTop: 4 }}><AfterwardsCell row={row} mode={mode} shared={shared} /></div>}
      </div>
    )
  }
  return (
    <div id={adviceAnchor(row.lineageId)} className="grid min-w-0 grid-cols-1 gap-4 rounded-md bg-inner px-6 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:gap-8">
      <div className="flex min-w-0 flex-col gap-2">
        <span className="font-mono text-[12px] text-muted-foreground">{fmtInt(row.number)} · {CURRENT_TAG}</span>
        <span data-copy="stored" data-slot="pass_d_b_recommendation" className="max-w-[60ch] text-[18px] font-semibold leading-[1.35] text-foreground [text-wrap:pretty]">
          {mode === 'app' ? <Link href={hrefFor(row.lineageId)} className="hover:underline">{row.title}</Link> : row.title}
        </span>
        <span className="text-[14px] text-secondary-foreground">
          {row.timesMade > 1
            ? <>repeated across <span data-copy="figure" className="font-semibold text-foreground">{fmtInt(row.timesMade)}</span> updates</>
            : repeated}
          {alsoRaisedLine(row) ? <>{' · '}{alsoRaisedLine(row)}</> : null}
          {grounded != null
            ? <>{' · '}<span data-copy="figure" className="font-semibold text-foreground">{fmtInt(grounded)}</span> {grounded === 1 ? 'video' : 'videos'} behind it</>
            : <>{' · '}<GroundedCell row={row} mode={mode} /></>}
        </span>
        {folded ? null : <span className="text-[12px] text-muted-foreground"><AfterwardsCell row={row} mode={mode} shared={shared} /></span>}
      </div>
      <div className="flex min-w-0 flex-col items-start gap-1.5 md:border-l md:border-border md:pl-8">
        {/* WHAT YOU DECIDED, AND "MARK DONE" (the preview's column, WP3.6
            wave 2): the control in the app, the same words on paper. */}
        {mode === 'app'
          ? <LeadDecision id={row.recommendationId} status={row.status} stamp={leadStamp(row.decidedAt)} />
          : <LeadWord row={row} />}
      </div>
    </div>
  )
}

/** The lead card's decision on paper: the word behind its square and the
 *  day you marked it, as the app's control shows them, with nothing to press. */
function LeadWord({ row }: { row: AdviceRow }) {
  const stamp = leadStamp(row.decidedAt)
  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-2.5 text-[15px] font-semibold text-foreground">
        <span aria-hidden className={`inline-block size-2 flex-none rounded-[2px] ${LEAD_SQUARE[row.status]}`} />
        {row.status === 'new' ? LEAD_UNDECIDED : REC_STATUS_LABEL[row.status]}
      </span>
      {stamp ? <span className="pl-[18px] font-mono text-[13px] text-muted-foreground">{stamp}</span> : null}
    </span>
  )
}

export const marketAdvice: Block<MarketSurfaceData> = {
  key: 'market.advice',
  title: 'The advice, and what you decided',
  question: 'What were we told to do, and what did we do about it?',

  render(data, mode = 'app', ctx?: BlockContext) {
    // THE SHORT LIST IN THE APP (walkthrough item 6): the current advice, one
    // row per idea, with the rest one quiet link away. Every other mode draws
    // the ledger as it always did, so exports and briefs are unchanged.
    const list = mode === 'app' ? data.advice.shortlist ?? null : null
    const a = list ? { ...data.advice, rows: list.rows } : data.advice
    const email = mode === 'email'
    const empty = marketAdvice.emptyState(data)
    const more = list ? list.earlier : a.total - a.rows.length
    const hrefFor = (lineageId: string) => `${ctx?.appUrl ?? ''}${marketSurfaceHref(lineageId, ctx?.params ?? {})}`
    const allHref = `${ctx?.appUrl ?? ''}${marketSurfaceHref(null, { ...(ctx?.params ?? {}), [LEDGER_ALL_PARAM]: LEDGER_ALL_VALUE })}`
    const showAll = list
      ? <Link href={allHref} className="text-[12px] text-muted-foreground hover:text-foreground hover:underline">{EARLIER_ADVICE}</Link>
      : openLink(mode, allHref, `Show all ${fmtInt(a.total)} →`)
    // THE LEAD CARD IS THE CURRENT RECOMMENDATION WHERE IT IS THE FIRST ROW
    // (it always is on a live page, WP1.9); a stored copy with no `current`
    // draws its table as it was sent.
    const { lead, tableRows } = splitLead(a)
    const expanded = expandedLineage(tableRows, a.highlight)
    const repeat = repeatColumn(tableRows)
    const tracks = repeat.shown ? TRACKS : TRACKS.filter((_, i) => i !== REPEAT_TRACK)
    // THE COLUMN'S UNLOCK IS GONE WHERE THE COLUMN ANSWERS. `ADVICE_UNLOCK`
    // named the absence of an Afterwards column; the column exists now, so the
    // sentence is printed only while no row on the page has a reading in it —
    // which is production today, and is the honest naming of that absence.
    const anyReading = a.rows.some((r) => r.afterwards?.state === 'reading')

    // THE READER'S OWN ANSWER STAYS ON THE PAGE; THE DERIVATION IS ONE PRESS
    // AWAY. `requestedLine` answers a link the reader followed and the two
    // state sentences — nothing is being written down, nothing has been read
    // in the Afterwards column yet — are facts about this workspace, not
    // method. What goes behind the disclosure is how the columns count.
    // ONE REFUSAL, SAID ONCE (deploy 1 review, the lead's R3): the chip under
    // the table, and "not compared" in each refused cell. A column that is
    // one refusal on every row is the chip alone, not a folded footnote too.
    const sharedRefusal = sharedPairNote(afterwardsRefusals(a.rows))
    const folding = foldedAfterwards(a.rows)
    const afterwardsOnce = sharedRefusal && folding != null && afterwardsRefusals(a.rows).length === a.rows.length ? null : folding
    const state = [
      !a.recorded ? ADVICE_UNRECORDED : null,
      afterwardsOnce ? `Afterwards, on every row: ${afterwardsOnce}` : null,
      !anyReading ? a.unlock : null,
    ].filter((x): x is string => Boolean(x)).join(' ')
    const notes = (
      <div className={email ? undefined : 'flex min-w-0 flex-col gap-1'}>
        {a.total > 0 ? (
          // THE WHOLE LEDGER, NEVER A QUARTER (D12): the one-line answer this
          // block gives, in the body now the footer holds links only.
          <p
            className={email ? undefined : 'm-0 text-[12px] text-secondary-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2, marginTop: 6 } : undefined}
          >
            {a.actedLine}
          </p>
        ) : null}
        {a.requestedLine ? (
          <p
            className={email ? undefined : 'm-0 text-[11px] text-secondary-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2, marginTop: 6 } : undefined}
          >
            {a.requestedLine}
          </p>
        ) : null}
        {state ? (
          <p
            className={email ? undefined : 'm-0 text-[11px] leading-[1.35] text-muted-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 } : undefined}
          >
            {state}
          </p>
        ) : null}
        {mode !== 'app' ? (
          // Paper and email have no tooltip, so the basis prints once here.
          <p
            className={email ? undefined : 'm-0 text-[11px] leading-[1.35] text-muted-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 } : undefined}
          >
            Grounded in: {GROUNDED_BASIS.charAt(0).toLowerCase() + GROUNDED_BASIS.slice(1)}
          </p>
        ) : null}
        {/* The all-time basis rides on the "Grounded in" column header as a
            tooltip, the one place this page says it (copy de-clutter ruling
            C); the "First time" chip carries its clock as a tooltip (B57); the
            "How the Repeated column counts" disclosure is cut (B58). */}
      </div>
    )

    return (
      <BlockFrame
        title={marketAdvice.title}
        question={marketAdvice.question}
        mode={mode}
        roomy
        // THE TOTAL ONCE (copy slip 4a): where the footer says "12 of 67
        // shown", the meta does not say "67 recommendations" as well. And no
        // order words: the ledger is no longer oldest first (WP1.9), and the
        // first row says what it is with its own tag.
        // THE HEADER IS THE TITLE ALONE AND THE FOOTER A LINK ALONE (25 Sep
        // rulings; rebuilt with WP3.6). Where the table draws fewer than the
        // ledger holds, the footer is the preview's "Show all 67 →", and the
        // count it names is the whole ledger (never `LEDGER_SHOWN`, the cap).
        footer={more > 0 ? showAll : undefined}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {lead ? <LeadCard row={lead} mode={mode} hrefFor={hrefFor} shared={sharedRefusal} folded={afterwardsOnce != null} /> : null}
        {email ? (
          <div>
            {tableRows.map((row) => (
              <div key={row.lineageId} id={adviceAnchor(row.lineageId)} style={{ padding: '5px 0', borderTop: `1px solid ${EMAIL.hairline}`, background: row.lineageId === a.highlight ? EMAIL.inner : undefined }}>
                <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink }}>
                  <span style={{ fontFamily: FONT.mono, color: EMAIL.muted }}>{fmtInt(row.number)} </span>
                  <span data-copy="stored" data-slot="pass_d_b_recommendation">{row.title}</span>
                  {row.lineageId === a.current ? <span style={{ fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted }}> · {CURRENT_TAG}</span> : null}
                </div>
                <div style={{ marginTop: 2 }}>
                  <span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted }}>first raised {madeInMonth(row.firstMade)} · </span>
                  {repeat.shown ? (
                    <>
                      <RepeatCell row={row} first={repeat.first(row)} mode={mode} />
                      <span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted }}> · </span>
                    </>
                  ) : null}
                  <StatusCell row={row} mode={mode} />
                  <span style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted }}> · grounded in </span>
                  <GroundedCell row={row} mode={mode} />
                </div>
                <div style={{ marginTop: 2 }}><AfterwardsCell row={row} mode={mode} folded={afterwardsOnce != null} shared={sharedRefusal} /></div>
              </div>
            ))}
            {notes}
          </div>
        ) : (
          <>
            {/* UNDER `md` THE TABLE STACKS (sw-2 item 3). Its seven fixed
                tracks are 720 px, so at 390 it scrolled sideways inside its
                card: "YOUR DECISIC" at the edge, and the "Why we keep raising
                it" row, spanning the whole table, clipped mid-sentence. Below
                `md` each row is a block: the number and the advice, then each
                cell on its own line under its column's name, and the
                expansion as wide as the card. One DOM, so the anchors and the
                decision control are the table's own. */}
            <div className="-mx-1 overflow-x-auto px-1 max-md:overflow-visible">
              <table className="w-full border-collapse text-left max-md:block">
                <colgroup className="max-md:hidden">{tracks.map((w, i) => <col key={i} className={w || undefined} />)}</colgroup>
                <thead className="max-md:hidden">
                  <tr className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    <th className="py-1 pr-3 font-semibold">#</th>
                    <th className="py-1 pr-3 font-semibold">Recommendation</th>
                    <th className="py-1 pr-3 font-semibold">First raised</th>
                    {repeat.shown ? <th className="py-1 pr-3 font-semibold">Repeated</th> : null}
                    <th className="py-1 pr-3 font-semibold">Your decision</th>
                    <th className="py-1 pr-3 font-semibold">
                      <span title={GROUNDED_BASIS} className="cursor-help">Grounded in</span>
                    </th>
                    <th className="py-1 font-semibold">Afterwards</th>
                  </tr>
                </thead>
                {/* TOP-ALIGNED, WHICH IS WHAT LETS THE TABLE SCAN DOWN A
                    COLUMN. `align-middle` centred every cell against the
                    tallest one in its row, and the tallest is always
                    Afterwards: row 1 runs six lines, so at 1440 its other six
                    one-line cells floated ~80px below the sentence they belong
                    to and a reader following "First raised" down the page met
                    a stepped column. The artboard top-aligns its seven-track
                    rows for the same reason. */}
                <tbody className="align-top max-md:block">
                  {tableRows.flatMap((row) => {
                    const age = ageInMonths(row.firstMade, data.readingAt)
                    const cells = (
                      <tr key={row.lineageId} id={adviceAnchor(row.lineageId)} className={`border-t border-border/70 ${row.lineageId === a.highlight ? 'bg-inner' : ''} ${STACK_ROW}`}>
                        <td className="py-1.5 pr-3 font-mono text-[11.5px] tabular-nums text-muted-foreground max-md:py-0">{fmtInt(row.number)}</td>
                        <td className="py-1.5 pr-3 text-[12.5px] font-medium max-md:py-0 max-md:pr-0">
                          <span data-copy="stored" data-slot="pass_d_b_recommendation">
                            {mode === 'app'
                              ? <Link href={hrefFor(row.lineageId)} className="hover:underline">{row.title}</Link>
                              : row.title}
                          </span>
                          {row.lineageId === a.current
                            ? <span className="block text-[11px] font-normal text-muted-foreground">{CURRENT_TAG}</span>
                            : null}
                          {alsoRaisedLine(row)
                            ? <span className="block text-[11px] font-normal text-muted-foreground">{alsoRaisedLine(row)}</span>
                            : null}
                        </td>
                        <td className={`py-1.5 pr-3 ${STACK_CELL}`}>
                          <StackLabel>First raised</StackLabel>
                          <span className="flex min-w-0 flex-col gap-px max-md:flex-row max-md:flex-wrap max-md:items-baseline max-md:gap-x-2">
                            <span className="font-mono text-[11.5px] text-secondary-foreground">{madeInMonth(row.firstMade).split(' ')[0]}</span>
                            {age ? <span className="text-[11px] text-muted-foreground">{age}</span> : null}
                          </span>
                        </td>
                        {repeat.shown ? <td className={`py-1.5 pr-3 ${STACK_CELL}`}><StackLabel>Repeated</StackLabel><RepeatCell row={row} first={repeat.first(row)} mode={mode} /></td> : null}
                        <td className={`py-1.5 pr-3 ${STACK_CELL}`}><StackLabel>Your decision</StackLabel><StatusCell row={row} mode={mode} /></td>
                        <td className={`py-1.5 pr-3 ${STACK_CELL}`}><StackLabel>Grounded in</StackLabel><GroundedCell row={row} mode={mode} /></td>
                        <td className={`py-1.5 ${STACK_CELL}`}><StackLabel>Afterwards</StackLabel><AfterwardsCell row={row} mode={mode} folded={afterwardsOnce != null} shared={sharedRefusal} /></td>
                      </tr>
                    )
                    // The artboard's expansion, in its own track directly under
                    // the row it belongs to — never a second row pretending to
                    // be a ledger entry.
                    return row.lineageId === expanded
                      ? [cells, (
                        <tr key={`${row.lineageId}-why`} className="max-md:block">
                          <td colSpan={tracks.length} className="pb-2 pt-1 max-md:block"><Expansion row={row} mode={mode} /></td>
                        </tr>
                      )]
                      : [cells]
                  })}
                </tbody>
              </table>
            </div>
            {notes}
          </>
        )}
      </BlockFrame>
    )
  },

  // NO FIGURES. Everything counted here is a count of advice, of the evidence
  // behind it and of the decisions the client typed; the "Afterwards" verdict
  // carries its own counts inside itself. The budget counts the readings a
  // surface states as its own figures.
  figures(): FigureTable {
    return {}
  },

  // THE AFTERWARDS COLUMN'S COMPARISONS, DECLARED. `market.advice` is a named
  // brief section (`lib/reports/documents/sections.ts`, `ct.advice`), and a
  // brief composing this block folds its answers through `blockAnswers` →
  // `blockReading`: a movement claim this block PRINTS and does not declare is
  // a claim the brief's own reading does not know about. Every other block in
  // the codebase that draws a `MovementBadge` declares them.
  verdicts(data): Verdict[] {
    // `?.` FOR THE SAME FROZEN SNAPSHOT `AfterwardsCell` GUARDS, and this is
    // the worse of the two sites: `verdicts()` is part of the renderable
    // contract a brief's reading merge walks, so a missing field here threw
    // before anything was drawn — the freeze/resolve spine, not only the page.
    return data.advice.rows.map((r) => r.afterwards?.verdict).filter((v): v is Verdict => v != null)
  },

  // THE ONE COMMENT THIS BLOCK SHOWS, by the same choice the render makes —
  // `expandedLineage` decides which row opens, and only that row's quote is
  // drawn. Declaring every row's would freeze refs the page never prints.
  quotes(data): QuoteRef[] {
    const { tableRows } = splitLead(data.advice)
    const open = expandedLineage(tableRows, data.advice.highlight)
    const row = tableRows.find((r) => r.lineageId === open)
    return row?.quote ? [row.quote.ref] : []
  },

  emptyState(data) {
    return data.advice.empty
  },
}
