import type { ReactNode } from 'react'

import { BlockMovement } from '@/components/blocks/movement'
import { FigureCell } from '@/components/blocks/frame'
import { TokenProse } from '@/components/blocks/prose'
import { Sparkline } from '@/components/charts/sparkline'
import { DirectionWord } from '@/components/pages/overview/subjects'
import { DeckFooter } from '@/components/print/report-deck'
import { Slide } from '@/components/print/slide'
import { fmtInt, fmtPct, monthName, shortDate } from '@/lib/format'
import { audienceInLabel, monthlyLineLabel, type AttentionBlock, type LedgerRow, type OverviewData, type SideReading, type SubjectRow } from '@/lib/pages/overview'
import { gapBasisLine, gapLine, type Gap } from '@/lib/reading/gap'
import type { MoveReading } from '@/lib/reading/moves'
import { monthAndYear } from '@/lib/reports/documents/reading'
import type { DocumentSnapshotData } from '@/lib/reports/documents/types'
import { INTERPRETATION_LABEL } from '@/lib/prose/interpret'

/**
 * The leadership one-pager (Block D wave 2, package E-leadership).
 *
 * THE MOCK IS ONE SHEET AND THE BUILD WAS A COVER PLUS SEVEN. The artboard
 * (`mock-sealand/artboards/LeadershipBrief.dc.html`, 1123 × 631) packs the
 * month into three figure cards, a decision, a subjects table, a moves ledger,
 * a read and a two-line coverage footer — about eight information units on one
 * sheet. The built brief drew one unit per slide at a markedly larger scale.
 * This is the re-pack: one `Slide`, the artboard's `5fr 3.5fr 3.5fr` figure row
 * over its `7fr 5fr` split, at the artboard's own 12.5px body and 9.5px mono
 * trails.
 *
 * IT REPLACES THE 58px COVER AND NOTHING ELSE. The mock has no cover slide and
 * the port removes it — it is a page a director had to turn past. What it does
 * NOT remove is anything else: the "In short" page, the finding pages, the
 * method page and EVERY borrowed section keep their slides, and the sheet leads
 * the document as a SUMMARY of them.
 *
 * IT ABSORBS NO SECTION, and an earlier draft of this file did. The sheet packs
 * a FRAGMENT of four borrowed blocks, and those blocks carry more than the
 * fragment: `overview.sentence` is also the month's own reading, the anomaly
 * line (the `anomaly-check` step's output) and the voices; `overview.category`
 * is also the kinds, the movers, the mood, Reddit and the register's quiet
 * flags; `overview.moves` is also every row past the second. Dropping their
 * slides deleted that substance from the document in silence, and with it each
 * section's `empty` sentence — the one line that names the missing input and
 * who closes it, which is what a blocked reading most needs to print. So the
 * pagination is untouched, and the count the deck prints is the count
 * `documentViewerPages` gives the viewer header and the Studio bar. See
 * `status/E-leadership.md`, deviation L1.
 *
 * EVERY NUMBER COMES OFF THE FROZEN OVERVIEW. `data.surfaces.overview` is the
 * loader output this brief already froze — the same reading the page drew — so
 * nothing here re-measures anything, and the sheet cannot come to say something
 * the page does not. That is the same rule `SectionBody` keeps for a borrowed
 * block; this component is that rule applied to a PACK of blocks rather than
 * one block per sheet.
 *
 * WHERE THE MOCK SAYS SOMETHING THE RULES REFUSE, THE LAYOUT STAYS AND THE
 * HONEST FORM GOES IN ITS PLACE (mock-gap §6). Named at each site below:
 * D1 (no "narrowed"), D7 (no percentage change of a raw comment count),
 * D12 (the acted-on ratio is the whole ledger, never a quarter), and the mock's
 * stand-alone "flat" badge, which is not in `MOVEMENT_WORDS` and would be a
 * direction word earned from one banded comparison.
 */

// ── the artboard's atoms ───────────────────────────────────────────────────

const CARD = 'rounded-lg border border-border bg-tile px-4 py-[13px]'
/** The artboard's mono trail: 9.5px, muted, 1.35. Metadata the eye skips. */
const TRAIL = 'm-0 font-mono text-[9.5px] leading-[1.35] text-muted-foreground'
/** The artboard's body: 12.5px / 1.35, not the deck's 13px / 1.5. */
const BODY = 'm-0 text-[12.5px] leading-[1.35] text-foreground'

/**
 * The green-ruled eyebrow, with the artboard's right-hand meta.
 *
 * `document-deck.tsx` has this device at exactly these numbers (11px mono
 * uppercase 0.08em, a 2 × 16px rule in the accent) and no meta slot; four of
 * the five eyebrows on this sheet carry one ("named 19 Aug · share of videos
 * where the subject came up", the acted-on ratio, the Interpretation pill). It
 * is declared here rather than by widening the deck's, because the deck's is
 * the marketing package's file and this is additive.
 */
function Eyebrow({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  return (
    <p className="m-0 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
      <span className="inline-block h-[2px] w-4 shrink-0 rounded-full bg-primary" aria-hidden />
      <span>{children}</span>
      {meta ? <span className="ml-auto min-w-0 truncate text-[9.5px] normal-case tracking-normal">{meta}</span> : null}
    </p>
  )
}

/** A legend dot, the artboard's 7px. */
function Dot({ tone }: { tone: 'you' | 'comp' | 'cat' }) {
  const bg = tone === 'you' ? 'bg-you' : tone === 'comp' ? 'bg-comp' : 'bg-cat'
  return <span className={`inline-block h-[7px] w-[7px] shrink-0 rounded-full ${bg}`} aria-hidden />
}

/**
 * The 38px hero figure.
 *
 * MARKED `figure`, AND ITS DENOMINATOR IS ON THE CARD. Rule (b) reads a
 * `level` node's whole text for its "of N", and the artboard's card puts the
 * hero, a caption and the evidence on three separate lines — so wrapping the
 * three in one level node would be marking a caption as a measurement. The
 * hero is the figure; the mono trail under it carries the level and is the node
 * rule (b) reads. That is strictly more than the deck's own `StatTile`, which
 * prints a 38px value with no marker at all.
 */
function Hero({ value, unit }: { value: string; unit: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span data-copy="figure" className="font-mono text-[38px] font-medium leading-none tracking-[-0.02em] tabular-nums text-foreground">{value}</span>
      <span className="text-[12px] font-medium text-muted-foreground">{unit}</span>
    </span>
  )
}

/** The artboard's muted pill. */
function Chip({ tone = 'plain', children }: { tone?: 'plain' | 'good'; children: ReactNode }) {
  return (
    <span className={`inline-block shrink-0 rounded-full px-2 py-[2px] text-[12px] font-medium ${tone === 'good' ? 'bg-accent text-accent-foreground' : 'bg-inner text-muted-foreground'}`}>
      {children}
    </span>
  )
}

/**
 * A monthly line, or the reason there is none.
 *
 * `monthlyLineLabel` is the built rule (lib/pages/overview.ts) and OV2 draws
 * the same picture over the same series: under three readings it names the
 * months instead of drawing, because a chart is a direction claim too
 * (AGENTS.md, mock-gap §6 D3) and a printed page has no hover to check a line
 * against.
 */
function MonthLine({ spark, months, width = 200, height = 44, color = 'var(--cat)' }: {
  spark: (number | null)[]
  months: string[]
  width?: number
  height?: number
  color?: string
}) {
  const refusal = monthlyLineLabel(spark, months)
  if (refusal) return <p className={TRAIL}>{refusal}</p>
  // THE DRAWN PATH NAMES ITS OWN ENDS. A printed line has no hover, so the two
  // months it was plotted between are the only axis it can have — the artboard
  // draws exactly that ("May · Apr below the floor" left, "Sep" right), and
  // the deck's own `DeckSpark` makes the same argument at length.
  const read = months.filter((_, i) => spark[i] != null)
  return (
    <span className="flex flex-col gap-0.5">
      <Sparkline values={spark} color={color} width={width} height={height} animate={false} endDot />
      <span className="flex justify-between font-mono text-[9px] text-muted-foreground" style={{ width }}>
        <span>{axisMonth(read[0])}</span>
        <span>{axisMonth(read[read.length - 1])}</span>
      </span>
    </span>
  )
}

/**
 * A month on an AXIS: "Jul", not "Jul 2026".
 *
 * `monthName` is the product's month form and carries its year on purpose — on
 * the readiness page two Augusts four years apart sit on one screen. On a
 * 9.5px trail of three consecutive months under a sheet already stamped
 * "September 2026" the year is three times the same noise, and it wraps the
 * line. `monthlyLineLabel` (lib/pages/overview.ts) already draws exactly this
 * distinction for exactly this reason — `monthName(m).split(' ')[0]` — and this
 * is that rule, not a second month format.
 */
const axisMonth = (month: string): string => monthName(month).split(' ')[0]

/** The months a series actually read, oldest first — "Jul 34% · Aug 30% · Sep 27%". */
function trailOf(spark: readonly (number | null)[], months: readonly string[]): string | null {
  if (spark.length !== months.length) return null
  const read = months
    .map((m, i) => ({ month: m, pct: spark[i] }))
    .filter((p): p is { month: string; pct: number } => p.pct != null)
  if (read.length < 3) return null
  return read.slice(-3).map((p) => `${axisMonth(p.month)} ${fmtPct(p.pct, 0)}`).join(' · ')
}

// ── which rows the three figure cards are about ────────────────────────────

/**
 * The gap the sheet leads with: the widest one that cleared its band, else the
 * first the block drew at all.
 *
 * A REFUSED GAP IS STILL THE ANSWER. `gapBetween` answers in four words
 * (`apart` · `level` · `too few to compare` · `comparison refused`) and three
 * of them carry no number — on Sealand's own September, where the client side
 * is 84 videos against a 100-video floor, "too few to compare" is what the card
 * prints and what the honest sheet says. Picking only from the `apart` ones
 * would have the card disappear on the tenant it was designed for.
 */
export function leadGap(gaps: Record<string, Gap | null>): Gap | null {
  const all = Object.values(gaps).filter((g): g is Gap => g != null)
  const apart = all.filter((g) => g.state === 'apart' && g.gapPts != null)
  if (apart.length > 0) {
    return [...apart].sort((a, b) => Math.abs(b.gapPts!) - Math.abs(a.gapPts!))[0]
  }
  return all[0] ?? null
}

/** The subject the third card is about: the biggest banded move on the side
 *  that can carry one (the category), else the first row. */
export function leadSubject(rows: readonly SubjectRow[], exceptId?: string | null): SubjectRow | null {
  // THREE CARDS ABOUT ONE SUBJECT IS ONE CARD. The artboard leads with the
  // Durability gap and closes with Price, which is the whole point of a
  // three-up row: a reader gets the gap, the category's attention and a second
  // subject. Where the gap card has already taken a subject this one steps over
  // it — and where that is the only subject there is, it takes it anyway,
  // because a repeated card says more than an empty one.
  const other = exceptId ? rows.filter((r) => r.id !== exceptId) : [...rows]
  const pool = other.length > 0 ? other : [...rows]
  const moved = pool.filter((r) => r.category.verdict?.state === 'moved' && r.category.verdict.changePts != null)
  if (moved.length > 0) {
    return [...moved].sort((a, b) => Math.abs(b.category.verdict!.changePts!) - Math.abs(a.category.verdict!.changePts!))[0]
  }
  return pool[0] ?? null
}

// ── the three figure cards ─────────────────────────────────────────────────

/**
 * `lead.fig1` — the gap card.
 *
 * D1. The mock's hero is "13 points · Durability gap to Freitag" with a green
 * "▼ 6 pts since June" under it. The magnitude is real and is printed; the
 * badge is not: "narrowed since June" is a direction word earned from two
 * readings of two independent binomials, and `narrowed` is on the scrubber's
 * own banned list (lib/calibration.ts). The earlier reading goes in its place,
 * dated, with its own band — `gapBasisLine`, which is exactly what D1 argued
 * for: a reader can see the gap was wider and decide for themselves.
 */
function GapCard({ gap, row }: { gap: Gap | null; row: SubjectRow | null }) {
  if (!gap) {
    return (
      <div className={`${CARD} flex flex-col justify-center gap-1.5`}>
        <p className={BODY}>No subject carries a reading on both sides this month.</p>
        <p className={TRAIL}>A gap needs your own side and a tracked rival read in the same month.</p>
      </div>
    )
  }
  const apart = gap.state === 'apart' && gap.gapPts != null
  const basis = gapBasisLine(gap)
  return (
    <div className={`${CARD} flex flex-col justify-between gap-1.5`}>
      <div className="flex items-start gap-3.5">
        <div className="flex w-[170px] shrink-0 flex-col gap-1.5">
          {apart
            ? <Hero value={fmtInt(Math.round(Math.abs(gap.gapPts!)))} unit="points" />
            : <p className="m-0 text-[15px] font-semibold leading-[1.2] text-foreground">{gapLine(gap).split(' · ').pop()}</p>}
          <span className="text-[12.5px] leading-[1.35] text-foreground">{gap.objectLabel} gap to {gap.b.label}</span>
          {/* D1: the earlier gap as its own dated, banded reading — never
              "narrowed". Null until a second window has been read. */}
          {basis ? <span className={`${TRAIL} whitespace-normal`}>{basis}</span> : null}
        </div>
        {row ? (
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <MonthLine spark={row.spark} months={row.sparkMonths} />
            <span className="flex items-center gap-2 font-mono text-[9px] text-muted-foreground">
              <span className="flex items-center gap-1"><Dot tone="cat" />the category</span>
            </span>
          </div>
        ) : null}
      </div>
      {/* The level pair rule (b) reads: both sides, each with its own count. */}
      <p data-copy="level" className={TRAIL}>{gapLine(gap)}</p>
    </div>
  )
}

/**
 * `lead.fig2` — the attention card.
 *
 * D7. The mock leads with "−18% since June" and "▼ 9,100 comments". Both are
 * refused: a percentage change of a raw comment count has no denominator, so no
 * band can be drawn over it, and June to September crosses the 3 September
 * re-freeze — the break a comparison must name rather than average through. So
 * the hero is the LEVEL the panel actually read this month, the movement beside
 * it is `AttentionBlock.verdict` (the category row's own banded step, drawn on
 * panel videos), and the panel's SIZE — `accountCount`, built since the panel
 * shipped and rendered nowhere — is the population the level is stated over.
 */
function AttentionCard({ attention, note }: { attention: AttentionBlock | null; note: string | null }) {
  const latest = attention?.months[attention.months.length - 1] ?? null
  if (!attention || !latest) {
    return (
      <div className={`${CARD} flex flex-col justify-center gap-1.5`}>
        <p className={BODY}>{note ?? 'How much attention the category held is not recorded for this workspace yet.'}</p>
      </div>
    )
  }
  const size = attention.accountCount
  const frozen = attention.panel?.frozen_at ? shortDate(attention.panel.frozen_at) : null
  const levels = attention.months.slice(-3).map((m) => `${axisMonth(m.month)} ${fmtInt(m.comments)}`).join(' · ')
  return (
    <div className={`${CARD} flex flex-col justify-between gap-1.5`}>
      <div className="flex items-end justify-between gap-2.5">
        <Hero value={fmtInt(latest.comments)} unit="comments" />
        <span className="shrink-0"><BlockMovement verdict={attention.verdict} unit="pts" /></span>
      </div>
      <span className="text-[12.5px] leading-[1.35] text-foreground">Attention across the panel</span>
      <p data-copy="level" className={TRAIL}>
        {size != null ? `a fixed panel of ${fmtInt(size)} accounts` : 'a fixed panel'}
        {frozen ? ` · re-frozen ${frozen}` : ''}
        {levels ? ` · ${levels}` : ''}
      </p>
    </div>
  )
}

/**
 * `lead.fig3` — the subject card.
 *
 * Every number was already built and printed — as a ROW in the subjects table,
 * with the band inside a badge's title and the three months as a 72 × 20
 * sparkline. The mock wants a 38px stat card with the three values printed, and
 * that is what this is. The mock's heading "Price is fading" becomes the
 * subject's name beside `DirectionWord`, which is the one node allowed to print
 * a direction (three consecutive months, one regime) and marks itself a verdict.
 */
function SubjectCard({ row, categoryLabel }: { row: SubjectRow | null; categoryLabel: string }) {
  if (!row || row.category.pct == null) {
    return (
      <div className={`${CARD} flex flex-col justify-center gap-1.5`}>
        <p className={BODY}>No subject carried a reading in {categoryLabel.toLowerCase()} this month.</p>
      </div>
    )
  }
  const trail = trailOf(row.spark, row.sparkMonths)
  return (
    <div className={`${CARD} flex flex-col justify-between gap-1.5`}>
      <div className="flex items-end justify-between gap-2.5">
        <Hero value={fmtPct(row.category.pct, 0)} unit="of category videos" />
        <span className="shrink-0"><BlockMovement verdict={row.category.verdict} unit="pts" /></span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[12.5px] leading-[1.35] text-foreground">{row.label}</span>
        {row.direction ? <Chip><DirectionWord direction={row.direction} /></Chip> : null}
      </div>
      <p data-copy="level" className={TRAIL}>
        {fmtInt(row.category.k ?? 0)} of {fmtInt(row.category.n ?? 0)} category videos
        {trail ? ` · ${trail}` : ''}
      </p>
    </div>
  )
}

// ── the left column ────────────────────────────────────────────────────────

/**
 * `lead.decide` — the one thing to decide.
 *
 * The recommendation and half its provenance were built and sat as a 13px link
 * inside the "The month" block; here they are the sheet's 17px h2 under a
 * green-ruled eyebrow, with the status as the artboard's tinted pill.
 *
 * THE TITLE IS A MODEL'S WORDS READ BACK OUT OF A COLUMN, so it carries
 * `stored` and names the slot that wrote it — the same exemption
 * `overview/sentence.tsx` argued for this exact string. The meta beside it is
 * code's and stays under rule (c).
 *
 * WHAT IS NOT HERE AND WHY. The mock also prints "repeated 3 updates running",
 * "Grounded in 412 videos" and an afterwards line. All three exist — as
 * `AdviceRow.timesMade`, `groundingFor` and `afterwardsFor` — on Market's
 * ledger row, and `LedgerRow` (lib/pages/overview.ts) carries none of them.
 * The leadership brief does not borrow the Market surface, and adding it is a
 * whole page loader's worth of reads for three fields. The sentence says what
 * is and is not on the row rather than leaving the reader to assume.
 */
function Decide({ ledger, company }: { ledger: LedgerRow | null; company: string }) {
  if (!ledger) {
    return (
      <div className="flex shrink-0 flex-col gap-1.5">
        <Eyebrow>The one thing to decide</Eyebrow>
        <p className={BODY}>Nothing has been recommended to {company} for this month yet.</p>
      </div>
    )
  }
  const age = ledger.monthsOld != null && ledger.monthsOld > 0
    ? `First raised ${ledger.monthsOld} ${ledger.monthsOld === 1 ? 'month' : 'months'} ago.`
    : 'First raised in this reading.'
  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <Eyebrow>The one thing to decide</Eyebrow>
      <h2 data-copy="stored" data-slot="pass_d_b_recommendation" className="m-0 text-[17px] font-semibold leading-[1.25] tracking-[-0.01em] text-foreground">{ledger.title}</h2>
      <p className={BODY}>{age} How many videos it is grounded in is not recorded on this reading.</p>
      <div className="flex items-center gap-2.5">
        <Chip tone={ledger.decidedAt ? 'good' : 'plain'}>
          {ledger.decidedAt ? `${ledger.statusLabel} · ${shortDate(ledger.decidedAt)}` : `${ledger.statusLabel} · no decision recorded`}
        </Chip>
        <span className={`${TRAIL} min-w-0`}>what the conversation did afterwards is read on the advice ledger, not here</span>
      </div>
    </div>
  )
}

/** One side of a subjects row — the share over the count it rests on, or the
 *  honest absence. `FigureCell` stamps its own `figure` / `level` markers, so
 *  the "of N" rule (b) wants cannot fall off the row. */
function Cell({ side }: { side: SideReading | null }) {
  if (!side || !side.observed || side.pct == null) {
    return <span className="text-[11.5px] text-muted-foreground">&mdash; not tracked</span>
  }
  return <FigureCell value={fmtPct(side.pct, 0)} of={`${fmtInt(side.k ?? 0)} of ${fmtInt(side.n ?? 0)}`} />
}

/**
 * `lead.subjects` — the table.
 *
 * THE ARTBOARD HOISTS THE DENOMINATOR INTO THE HEADER and brackets the count
 * ("You · of 84", then "31% (26)"); the built table repeats "26 of 84" in every
 * cell, which costs a column's width. The header is ported — dots and all — and
 * the cell keeps its own "of N", because a bracketed numerator alone is a level
 * without its evidence and rule (b) refuses it. `FigureCell` stacks the pair,
 * which is the artboards' own cell.
 *
 * ONE CHANGE COLUMN, not the build's two plus a sparkline: the artboard's grid
 * has room for one and the category is the only side with the n to carry a
 * month on this corpus. The mock's stand-alone "flat" badge is refused — it is
 * not in `MOVEMENT_WORDS`, and as a substitute for "no clear change" it is a
 * direction word off one banded comparison.
 */
function SubjectsTable({ data }: { data: OverviewData }) {
  const s = data.subjects
  const COLS = 'grid grid-cols-[minmax(0,112px)_82px_120px_138px_minmax(0,1fr)] items-center gap-x-2'
  return (
    <div className="flex min-h-0 shrink-0 flex-col gap-1.5">
      <Eyebrow meta={s.rows.length > 0 ? `${fmtInt(s.rows.length)} named · share of videos where the subject came up` : undefined}>
        Your subjects
      </Eyebrow>
      {s.rows.length === 0 ? (
        <p className={BODY}>{data.subjects.state === 'not_recorded' ? 'Your subjects are not recorded for this workspace yet.' : 'No subject carried a reading this month.'}</p>
      ) : (
        <div className="flex flex-col">
          <div className={`${COLS} border-b border-border pb-[5px] font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground`}>
            <span>Subject</span>
            <span className="flex items-center gap-1.5"><Dot tone="you" />You{firstOf(s.rows, (r) => r.you)}</span>
            <span className="flex min-w-0 items-center gap-1.5"><Dot tone="comp" /><span className="truncate">{s.rivalLabel ?? 'Lead rival'}{firstOf(s.rows, (r) => r.rival)}</span></span>
            <span className="flex min-w-0 items-center gap-1.5"><Dot tone="cat" /><span className="truncate">{shortLabel(s.categoryLabel)}{firstOf(s.rows, (r) => r.category)}</span></span>
            <span>{shortLabel(s.categoryLabel)} change</span>
          </div>
          {s.rows.map((r, i) => (
            <div key={r.id} className={`${COLS} py-[3px] text-[12.5px] text-foreground ${i === s.rows.length - 1 ? '' : 'border-b border-border/70'}`}>
              <span className="min-w-0 truncate">{r.label}</span>
              <Cell side={r.you} />
              <Cell side={r.rival} />
              <Cell side={r.category} />
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                <BlockMovement verdict={r.category.verdict} unit="pts" />
                <DirectionWord direction={r.direction} />
              </span>
            </div>
          ))}
        </div>
      )}
      {/* The artboard sets the caveat 9.5px mono; the app sets it 11.5px sans.
          On a sheet this dense it is a footnote, and the mono face is what says
          so. The words are `SubjectsBlock.note`'s, unchanged. */}
      {s.note ? <p className={TRAIL}>{s.note}</p> : null}
    </div>
  )
}

/** "The category" reads as a heading on a page and as a stutter in a table
 *  header beside a legend dot; the artboard writes "Category · 1,388". The
 *  label is the block's, with the article dropped — never a second name for the
 *  audience. */
const shortLabel = (label: string): string => label.replace(/^The\s+/i, '')

/** " · of 84" for the header, from the first row that read that side — the
 *  denominator the artboard hoists out of the cells. Absent where the side is
 *  not tracked, because "of 0" is a measurement nobody took. */
function firstOf(rows: readonly SubjectRow[], pick: (r: SubjectRow) => SideReading | null): string {
  for (const r of rows) {
    const side = pick(r)
    if (side?.observed && side.n != null && side.n > 0) return ` · of ${fmtInt(side.n)}`
  }
  return ''
}

// ── the right column ───────────────────────────────────────────────────────

/**
 * `lead.moves` — the ledger, as the artboard's cards.
 *
 * D12: "you acted on 2 of 5 this quarter" is refused and `actedTally`'s
 * whole-ledger ratio goes in its place — the product deliberately does not
 * quarter-scope this (lib/pages/market-surface.ts, and
 * components/blocks/quarterly/blocks.test.tsx asserts the quarter wording does
 * NOT appear), because the decisions were not dated inside the quarter.
 *
 * Each card is a `MoveReading`: the move, the ONE movement claim it earns as a
 * badge with its band, the control audiences' comparison beside it, and the
 * mono footer naming the declaration and what it was read against. Where no
 * verdict could be drawn the reading says which silence it is (`unread`).
 */
function Moves({ data }: { data: OverviewData }) {
  const m = data.moves
  const readings = m.readings
  return (
    <div className="flex shrink-0 flex-col gap-2">
      {/* The artboard's meta is four words ("you acted on 2 of 5 this
          quarter") and `actedTally`'s sentence is twenty, because the twenty
          are what make the ratio readable — it is the WHOLE ledger and not a
          quarter (D12). The count goes in the eyebrow at the artboard's length
          and the scoping sentence under the cards, so neither is truncated. */}
      <Eyebrow meta={m.acted ? `acted on ${m.acted.decided} of ${m.acted.of}` : undefined}>Your moves</Eyebrow>
      {readings.length === 0 ? (
        <p className={BODY}>{m.empty ?? m.unlock}</p>
      ) : (
        readings.slice(0, 2).map((r) => <MoveCard key={r.moveId} reading={r} />)
      )}
      {m.acted ? <p className={TRAIL}>{m.acted.line}</p> : null}
    </div>
  )
}

function MoveCard({ reading }: { reading: MoveReading }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-inner px-3 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">{reading.title}</span>
        <span className="ml-auto shrink-0"><BlockMovement verdict={reading.verdict} unit="pts" /></span>
      </div>
      {reading.unread ? <p className="m-0 text-[12px] leading-[1.45] text-secondary-foreground">{reading.unread}</p> : null}
      {reading.control.length > 0 ? (
        <p className="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] leading-[1.45] text-secondary-foreground">
          {reading.control.slice(0, 1).map((v) => (
            <span key={v.audience} className="flex items-baseline gap-1.5">
              <span>{audienceInLabel(v.audience)}, untouched:</span>
              <BlockMovement verdict={v} unit="pts" />
            </span>
          ))}
        </p>
      ) : null}
      <p className={TRAIL}>{reading.line} · {reading.on}{reading.chartNote ? ` · ${reading.chartNote}` : ''}</p>
    </div>
  )
}

/**
 * `lead.ourread` — already exact, and kept.
 *
 * The same eyebrow-plus-paragraph the artboard draws, through `TokenProse …
 * model` so `PROSE_POLICY`'s scrubbers apply and the node is marked `prose` for
 * rule (a). The artboard's "Interpretation" label is a pill on the right of the
 * eyebrow rather than part of the eyebrow's own words.
 */
function OurRead({ data }: { data: OverviewData }) {
  const i = data.sentence.interpretation
  if (i.sentences.length === 0) return null
  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <Eyebrow meta={<Chip>{i.label || INTERPRETATION_LABEL}</Chip>}>Our read</Eyebrow>
      <TokenProse body={i.sentences.join(' ')} figures={data.sentence.figures} model className={BODY} />
      {i.note ? <p className={TRAIL}>{i.note}</p> : null}
    </div>
  )
}

// ── the sheet ──────────────────────────────────────────────────────────────

/**
 * `lead.coverage` + `lead.footer` — the two mono lines, in place of a whole
 * method slide.
 *
 * Every clause was built and none of it reached a document: `record.line` is
 * the coverage sentence Overview's own record block prints, `bar.expected` the
 * trailing median beside it, and `bar.counter` ("your 3rd monthly reading · the
 * quarter view needs 6") the second half of the artboard's own footer, which
 * has only ever been drawn on Overview's page bar.
 */
function SheetFooter({ data, company, date }: { data: OverviewData; company: string; date: string }) {
  const coverage = [data.record.line, data.bar.expected != null ? `trailing median ${fmtInt(data.bar.expected)}` : '']
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {/* TWO LINES RATHER THAN AN ELLIPSIS. The artboard's coverage line runs
          to five clauses and the last of them is "2 comparisons refused" — the
          one clause a reader most needs and the first a `truncate` eats. */}
      <p className="line-clamp-2 font-mono text-[9.5px] leading-[1.35] text-muted-foreground">
        <span className="text-secondary-foreground">Coverage</span>
        <span aria-hidden> · </span>
        <span>{coverage}</span>
      </p>
      {/* `DeckFooter` is its own 9.5px mono paragraph — "Created by {company}
          with Verbatim · {date}" — the artboard's second footer line, verbatim,
          with the reading counter appended where Overview's page bar has it. */}
      <span className="flex min-w-0 items-baseline gap-1 truncate">
        <DeckFooter company={company} date={date} />
        {data.bar.counter ? <span className="shrink-0 whitespace-nowrap font-mono text-[9.5px] leading-[1.35] text-muted-foreground">· {data.bar.counter}</span> : null}
      </span>
    </div>
  )
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/**
 * Is this frozen Overview one the SHEET can be drawn from?
 *
 * A STORED SNAPSHOT IS DATA, NOT A TYPE. `surfaces` is typed
 * `Record<string, unknown>` (lib/reports/documents/types.ts) precisely because
 * it is whatever the loader wrote on the day the brief was built, and this
 * sheet reads fields that did not exist for most of the life of that column:
 * `subjects.gaps` and `moves.readings` / `moves.acted` landed in Block D
 * wave 1 on 2026-09-18, while `surfaces` has been frozen into documents since
 * 2026-08-30. Every leadership brief built in that window has an Overview
 * WITHOUT them — and a bare cast plus `Object.values(overview.subjects.gaps)`
 * is a `TypeError` inside a server component, which takes the whole document
 * down on the share link, the in-app viewer, the Studio preview and the PDF
 * route rather than degrading one sheet.
 *
 * The precedent is `isWeeklyData` (lib/reports/viewer.ts), added for exactly
 * this failure — "the cast below handed `deckSlides` a snapshot with no
 * sections and `d.sections.forEach` threw inside a server component" — and
 * `SectionBody` keeps the same rule per borrowed block. This is that rule for
 * a PACK of blocks.
 *
 * It checks the shapes the sheet DEREFERENCES WITHOUT ASKING, and nothing
 * else: a missing `attention`, a null `ledger` or an empty `rows` are answers
 * the sheet already prints in words, and a predicate that demanded them would
 * refuse a reading that renders perfectly well.
 */
export function isLeadershipOverview(value: unknown): value is OverviewData {
  if (!isObject(value)) return false
  const subjects = value.subjects
  if (!isObject(subjects) || !isObject(subjects.gaps) || !Array.isArray(subjects.rows)) return false
  const moves = value.moves
  if (!isObject(moves) || !Array.isArray(moves.readings)) return false
  const sentence = value.sentence
  if (!isObject(sentence) || !isObject(sentence.interpretation)) return false
  if (!Array.isArray(sentence.interpretation.sentences)) return false
  return isObject(value.category) && isObject(value.record) && isObject(value.bar)
}

/**
 * The frozen Overview a leadership brief's sheet is drawn from, or null.
 *
 * NULL IS A REAL ANSWER AND THE DECK USES IT: a brief built before the section
 * maps carries no `surfaces`, a workspace whose Overview could not be read
 * carries no `overview` inside them, and a brief frozen before wave 1 carries
 * an Overview this sheet cannot read. All three fall back to the cover and the
 * ordinary slides, which is what a stored artefact must keep rendering as.
 */
export function leadershipSheetData(data: DocumentSnapshotData): OverviewData | null {
  if (data.template !== 'leadership_brief' && data.role !== 'leadership_brief') return null
  const overview = (data.surfaces ?? {}).overview
  return isLeadershipOverview(overview) ? overview : null
}

export function LeadershipSheet({
  data, overview, date, page, pages,
}: {
  data: DocumentSnapshotData
  overview: OverviewData
  date: string
  page: number
  pages: number
}) {
  const gap = leadGap(overview.subjects.gaps)
  const gapRow = gap ? overview.subjects.rows.find((r) => r.id === gap.objectId) ?? null : null
  const subject = leadSubject(overview.subjects.rows, gap?.objectId ?? null)
  // THE SERIF SLOT STAYS THE OPERATOR'S, AND STAYS EMPTY HERE. The artboard
  // draws a lead line under the title and `Slide`'s `note` is the slot in that
  // position, so an earlier draft fed it `${objectLabel} · ${gapLine(gap)}`.
  // Three things were wrong with that. The serif face is SPEECH — verbatim
  // quotes, and the one framing line a person writes (`report-deck.tsx` passes
  // a section's framing) — so a machine-composed four-clause figures trail in
  // it reads as something somebody said; the slot is `truncate`, one line, with
  // no `title`, so a long subject or rival label drops the band off the end
  // with no other trace; and the figures are set in proportional italic where
  // every figure elsewhere on this sheet is tabular mono. The sentence is not
  // lost — `gapLine` prints it on the gap card, in mono, marked `level`, thirty
  // pixels below. The mock's own lead ("…narrowed to 13 points · price fading,
  // 3rd month") is two direction claims and is refused whatever face it is set
  // in (D1), so there is no honest sentence to put here; leaving the slot empty
  // gives its 26px back to the body and keeps it free for the Studio.
  const stamp = `${overview.brand} · ${overview.monthStatus === 'filling' ? 'still filling' : 'frozen'} · as at ${shortDate(overview.readingAt)}`
  return (
    <Slide
      title={`${data.title} · ${monthAndYear(overview.month)}`}
      chrome={{ context: stamp, footer: <SheetFooter data={overview} company={data.company} date={date} /> }}
      page={page}
      pages={pages}
      layout="single"
    >
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="grid shrink-0 grid-cols-[5fr_3.5fr_3.5fr] gap-4">
          <GapCard gap={gap} row={gapRow} />
          <AttentionCard attention={overview.category.attention} note={overview.category.attentionNote} />
          <SubjectCard row={subject} categoryLabel={overview.subjects.categoryLabel} />
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[7fr_5fr] gap-x-6">
          <div className="flex min-w-0 flex-col justify-between gap-3">
            <Decide ledger={overview.sentence.ledger} company={data.company} />
            <SubjectsTable data={overview} />
          </div>
          <div className="flex min-w-0 flex-col justify-between gap-3">
            <Moves data={overview} />
            <OurRead data={overview} />
          </div>
        </div>
      </div>
    </Slide>
  )
}
