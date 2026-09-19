import { Fragment, type ReactNode } from 'react'
import { MACHINE_TRANSLATION_STAMP, QuoteBlock } from '@/components/quote-block'
import { BlockSlot } from './block-slot'
import { LeadershipSheet, leadershipSheetData } from '@/components/print/leadership-sheet'
import { Slide } from '@/components/print/slide'
import { Sparkline } from '@/components/charts/sparkline'
import { CountBadge, MOVEMENT_WORDS, MovementBadge } from '@/components/delta-badge'
import { FigureCell } from '@/components/blocks/frame'
import { gapLine, sidePct, type Gap } from '@/lib/reading/gap'
import { fullDate, monthName, round1, shortDate } from '@/lib/format'
import { nextMonth } from '@/lib/reading/month-key'
import { platformShareLine } from '@/lib/reading/method'
import { MOVE_PROMISE } from '@/lib/subjects/types'
import { MOVES_EMPTY } from '@/lib/pages/overview'
import { MONTHLY_MOVES_EMPTY } from '@/lib/reports/monthly'
import type { Verdict } from '@/lib/reading/verdicts'
import type { Good } from '@/components/charts/stat'
import type { DeltaVerdict } from '@/lib/report-bands'
import type { ShareSide } from '@/lib/report-delta'
import { substituteFigures } from '@/lib/reports/cover'
import { documentCoverSheet, documentSheetCount, documentSlides, sectionOfSlide } from '@/lib/reports/documents/compose'
import { briefStampShort, commentsRead } from '@/lib/reports/documents/reading'
import { blocksFor } from '@/lib/reports/documents/load-reading'
import { UNFILLED_FRAMING, UNFILLED_SHEET, type BriefSurface } from '@/lib/reports/documents/sections'
import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { appBaseUrl } from '@/lib/site'
import { concludedBasisLine, coverCarriesSummary, findingCards, leadGap, overviewTiles, slugOf } from '@/lib/reports/documents/overview'
import { shownTrajectory, type DocBlock, type DocBriefSection, type DocLens, type DocPage, type DocumentSnapshotData } from '@/lib/reports/documents/types'
import type { FigureTable } from '@/lib/reports/types'

// A document's deck from its (hydrated) snapshot data: the cover, then one
// slide per skeleton page, numbered once across the document. The same
// chrome as a report's pages (Heinrich, 2026-08-30): the page's name top
// right, "Created by {company} with Verbatim" and the date at the foot. No
// evidence on paper: the workings never reach this component.
//
// The pages (T6, 2026-08-31, second pass after Heinrich's read): a research
// report composed to fill a landscape sheet. Type on the ladder THE DECK'S
// BODY TYPE sets out below, structured blocks with hairlines, pills for
// audiences, bars for shares, a tinted inner block for the pull quote.
// NO blurred shadow on paper: Chrome prints a box-shadow as a bitmap that
// some PDF viewers draw as a grey slab (Heinrich's screenshots, 2026-08-30).
// Depth on paper is the hairline; the ambient shadow stays on screen.

const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtCount = (n: number) => new Intl.NumberFormat('en-US').format(n)
const PLATFORM: Record<string, string> = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', reddit: 'Reddit' }

const CARD = 'rounded-lg border border-border bg-tile'
// THE DECK'S BODY TYPE (Block D wave 1, P0 item 7; mock-gap §8 P0). 15.5px on
// a 1168px body zoomed to .902 is about 12pt on a 297mm sheet — a large-print
// research report. Measured across the four brief artboards, the body runs
// 12.5–13px, and it is why the mock fits a finding, its quote, its card and
// its practice list on one slide where the build clips at twenty rows.
//
// §5 AND ITS OWN ARTBOARDS DISAGREE, AND THE ARTBOARDS WON. The spec's prose
// names this size explicitly — "prose at 15.5px/1.55 (BODY; small variant
// 14px/1.5)", design-system.md §5 — which is exactly what stood here. Its
// four brief artboards then draw the body at 12–13px throughout (SalesBrief
// 12.5px ×32 and 13px ×27; MarketingBrief 13px ×37 and 12.5px ×35;
// ContentBrief 12px ×43 and 13px ×17; LeadershipBrief 12px ×18 and 12.5px
// ×12). A drawing is a measurement and a sentence about it is not, so the
// drawings were followed. The page LEADS are untouched (the "In short"
// summary, the section intros) — §5 names those too, and the large nodes
// those artboards do carry are few and are the leads themselves.
//
// AND THE DRAWINGS WERE READ IN THE WRONG UNITS, WHICH IS WHY EVERY TIER MOVED
// AGAIN (Block D wave 3, `sales`-1). An artboard sheet IS the page: it is laid
// out at 1123px, which is 297mm at 96dpi, so every font-size in it is the size
// the glyph PRINTS at. A deck sheet is not: `.vb-slide-body` lays the content
// out at 1168px and applies `zoom: .902` (app/globals.css), so a size written
// here prints at .902 × itself. Writing the artboard's 13px as 13px here
// printed it at 11.73px — the whole deck set 9.8% under its own spec, which is
// what the review measured (the build's tiers 8.57–11.73px against the
// artboard's 9.5–15.5px, its figures 11.73px against 14px).
//
// So every tier in this file is the artboard's number divided by .902, and the
// ladder here is the source side of that: 10.5 · 11.5 · 12 · 12.5 · 13.5 · 14 ·
// 14.5 · 15 · 15.5 · 16 · 16.5 · 17 · 17.5 · 18.5 · 19 prints as 9.5 · 10.5 · 11 ·
// 11.5 · 12 · 12.5 · 13 · 13.5 · 14 · 14.5 · 15 · 15.5 · 16 · 16.5 · 17. The
// display sizes go the same way: 42px prints the artboard's 38px numeral and
// 64.5px its 58px title. THE RULE, for anything added later: pick the size off
// the artboard and divide by .902 — never paste the artboard's number in.
//
// What this does NOT settle is the 8pt floor `components/print/slide.tsx`
// names. The artboard's own smallest tiers are 9.5px and 10px, which print at
// 7.1pt and 7.5pt, so the floor and the spec disagree at the bottom of the
// ladder. That is the same class of question as SH19 and it is Heinrich's, not
// a fixer's: this pass puts the deck ON its spec and says where the spec sits.
const BODY = 'text-[14.5px] leading-[1.5] text-foreground'
const BODY_SM = 'text-[14px] leading-[1.45] text-foreground'

/**
 * A caller's sentence with its `[[key]]` figures substituted (D13).
 *
 * THE FACE IS THE CALLER'S, AND IT IS MONO BY DEFAULT. Plex Mono is the
 * product's identity for a count and it is right wherever the number is the
 * element — a tile's value, a card's figure, a headline's count. Inside
 * RUNNING PROSE it is not: Plex Mono sets a comma in a full advance,
 * so "1,388" reads as three tokens in the middle of a sentence ("across 1 ,
 * 388 category videos" on the cover, measured against the artboard, which sets
 * the same figure in Plex Sans in its paragraph and in Plex Mono on its tile —
 * SalesBrief.dc.html:27 against :42). `sans` keeps `tabular-nums`, so the
 * digits still align; only the face moves.
 */
export function Figured({ text, figures, face = 'mono' }: { text: string; figures: FigureTable; face?: 'mono' | 'sans' }) {
  const cls = face === 'sans' ? 'tabular-nums text-foreground' : 'font-mono tabular-nums text-foreground'
  return (
    <>
      {substituteFigures(text, figures).map((p, i) =>
        'text' in p ? <Fragment key={i}>{p.text}</Fragment> : <span key={i} className={cls}>{p.figure}</span>,
      )}
    </>
  )
}

function Paragraphs({ text, figures, className, face }: { text: string; figures: FigureTable; className: string; face?: 'mono' | 'sans' }) {
  return (
    <>
      {text.split(/\n\n+/).filter(Boolean).map((p, i) => <p key={i} className={className}><Figured text={p} figures={figures} face={face} /></p>)}
    </>
  )
}

/**
 * A series on paper (Block D wave 1, P0 item 7).
 *
 * The deck could not draw one. `components/charts/sparkline.tsx` has drawn
 * every in-app series since the redesign — gaps kept as gaps, one polyline per
 * unbroken run, no fill under a broken line — and the deck reached for a bar
 * or a sentence instead, so a printed brief said "up from June" where the page
 * showed the shape. This is that component at the deck's scale, with the
 * animation off: a slide is printed once by a headless browser and a draw-in
 * that has not finished is a line that is not there.
 *
 * `months` is the axis in words, and it is REQUIRED because it is the only
 * honest thing a printed sparkline has instead of a hover: a reader with a
 * sheet of paper cannot ask what a point was. Under three readings nothing is
 * drawn at all and the months that CARRIED a reading are named instead — the
 * rule `monthlyLineLabel` already applies on screen (mock-gap §6 D3: a chart
 * is a direction claim too, and two points are not a direction), in the words
 * that rule already prints: "Aug → Sep only", "Sep only", "no month reads".
 * The label named every month it was handed until 2026-09-18, so two readings
 * over a four-month axis printed four month names — the opposite of what the
 * refusal is for, and a fourth phrase for a state the product already had
 * words for.
 *
 * No document in the snapshot carries a series yet, so nothing on the four
 * fixed templates calls this today. It is the seam D-brief (P13–P17) binds
 * when the quarterly's and the leadership one-pager's charts land.
 */
export function DeckSpark({ values, months, color = 'var(--primary)', width = 104, height = 22, className, unit, zeroBase = false, rule = false }: {
  values: (number | null)[]
  /** The months these points are, in order — the printed page's only axis. */
  months: string[]
  color?: string
  /** The drawn size. 104 × 22 is a sparkline inside a row of text; a chart
   *  that IS the element gets the artboard's size, which is about 300 × 120 in
   *  the 5fr pane (Block D wave 2, `sales.p2.chart`). Optional, so nothing
   *  that already draws one moves. */
  width?: number
  height?: number
  /** Passed through to the SVG. `w-full` lets a chart that IS the element fill
   *  its card instead of leaving a dead gutter down the right of it — the
   *  `viewBox` keeps the drawn geometry, so the shape does not change. */
  className?: string
  /** The points' unit (`MonthLineSeries.unit`), so the axis can carry the
   *  magnitude a printed line has no hover to ask for. Absent prints the
   *  months alone, which is what every caller did before. */
  unit?: 'pct'
  /** Pull the floor to zero and draw the hairline that says where it is
   *  (SH22). Off by default, because at 104 x 22 this is a sparkline inside a
   *  row of text and an axis rule under it is noise. A chart that IS the
   *  element turns both on: normalised to its own min and max, an 18% -> 20%
   *  series draws as a full-pane 45 degree climb, which is a much louder claim
   *  than "Jun 18% -> Sep 20%" in a document whose premise is that a change is
   *  not called until it clears a band. */
  zeroBase?: boolean
  rule?: boolean
}) {
  // The months that carried a reading, in order. A slot with no reading is not
  // a month this line can name.
  const read = months.filter((_, i) => values[i] != null)
  if (read.length < 3) {
    return (
      <p className="font-mono text-[11.5px] text-muted-foreground">
        {read.length === 0 ? 'no month reads'
          : read.length === 1 ? `${read[0]} only`
          : `${read[0]} → ${read[read.length - 1]} only`}
      </p>
    )
  }
  // THE DRAWN PATH DEFENDS ITS AXIS. The labels are `months[0]` and the last
  // month, so one month per slot is what makes them the ends of the line that
  // was actually plotted; a list of a different length labels the wrong end,
  // silently, on a sheet of paper with no hover to check it against. The
  // comment above says a printed line without its axis cannot happen, and this
  // is what makes that true rather than intended. Unreachable from a caller
  // that hands over a series and its own months — which is the point.
  if (months.length !== values.length) {
    return <p className="font-mono text-[11.5px] text-muted-foreground">the months and the readings do not line up</p>
  }
  return (
    <span className={`flex flex-col gap-1 ${className ?? ''}`}>
      <Sparkline values={values} color={color} width={width} height={height} animate={false} endDot className={className} zeroBase={zeroBase} rule={rule} />
      {/* BOTH ENDS, WITH THEIR VALUE WHERE THERE IS ONE. A printed line has no
          hover and a shape with two month names under it and no magnitude
          anywhere is decoration — the artboard labels both endpoints
          ("Price 27%", "Durability 22%"). The value is printed only for a
          slot that carries a reading, because an end month with a gap in it
          is not a point on this line. */}
      <span className="flex justify-between gap-2 font-mono text-[10.5px] text-muted-foreground">
        <span>{months[0]}{endLabel(values[0], unit)}</span>
        <span>{months[months.length - 1]}{endLabel(values[values.length - 1], unit)}</span>
      </span>
    </span>
  )
}

/** An axis end's value, where the slot carries one and the caller named the
 *  unit. One decimal, which is what every share in this product prints. */
const endLabel = (v: number | null | undefined, unit?: 'pct'): string =>
  v == null || !unit ? '' : ` ${Math.round(v * 10) / 10}%`

/** An eyebrow: mono, uppercase, with a short rule in the accent. */
function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.08em] text-muted-foreground ${className}`}>
      <span className="inline-block h-[2px] w-4 rounded-full bg-primary" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

function Pill({ tone, children }: { tone: 'you' | 'comp' | 'cat' | 'new' | 'plain'; children: ReactNode }) {
  const cls =
    tone === 'you' ? 'bg-accent text-accent-foreground'
    : tone === 'comp' ? 'bg-comp/15 text-foreground'
    : tone === 'new' ? 'bg-warning/20 text-foreground'
    : tone === 'plain' ? 'border border-border text-secondary-foreground'
    : 'bg-inner text-secondary-foreground'
  return <span className={`inline-flex items-center rounded-full px-2.5 py-[3px] font-mono text-[12px] leading-none ${cls}`}>{children}</span>
}

function audiencePills(audiences: string, company: string) {
  return audiences.split(',').filter(Boolean).map((b) => {
    if (b === 'client') return <Pill key={b} tone="you">{company}&rsquo;s audience</Pill>
    if (b === 'industry-other') return <Pill key={b} tone="cat">the category</Pill>
    if (b.startsWith('competitor:')) return <Pill key={b} tone="comp">{b.slice('competitor:'.length)}&rsquo;s audience</Pill>
    return null
  })
}

/**
 * The cover (`sales.p1.*`, ported from the artboard).
 *
 * WHAT MOVED, AND WHY. The artboard's cover is not a title card: it is the
 * brief's first working page — a vertical rule and a 58px title on the left
 * over the summary and a numbered table of contents, three stat tiles down the
 * right, and the same hairline footer every other sheet carries. The build
 * drew a centred title, two mono lines and nothing else, and put the summary
 * and the contents on slide 2.
 *
 * THE CONTENTS ARE THE DECK'S OWN PAGINATION, not a second list. `documentSlides`
 * already decides what every sheet is and in what order; the cover is sheet 1,
 * so slide `i` is page `i + 2`. The build's "Findings in this brief" indexed
 * findings rather than pages, which is a different list of a different length
 * from the document it sits in front of — and it stays, on the overview sheet,
 * because a finding list is worth having. This one indexes the document.
 *
 * ONE MONO SUB-LINE. The mock reads "September 2026 · Sealand · as at 28 Sep ·
 * 7 pages" and the build printed two lines — a section/page count, then the
 * full stamp. The stamp's freeze boundary ("still filling until 30 October")
 * is not dropped: it rides the FOOTER, on this sheet and on every other, which
 * is where the mock puts it too.
 *
 * AND THE SUMMARY ONLY WHERE ITS ARTBOARD ASKS (see `coverCarriesSummary`).
 */
/**
 * The footer every sheet of a brief carries, the cover included.
 *
 * NOT `DeckFooter` (components/print/report-deck.tsx), and the difference is
 * the stamp. A REPORT's footer is "Created by X with Verbatim · 18 Sep 2026" —
 * the day it was made, which is all an arranged report has. A BRIEF is a
 * reading of a month, and the artboard puts that month, the instant it was
 * read and the freeze boundary on every single sheet, because a reader of a
 * PDF has no masthead to scroll back to. So the brief prints its reading's own
 * stamp where the report prints a render date, and falls back to the date on a
 * brief that has no reading — in the artboard's SHORT form (`briefStampShort`),
 * because the long one is sixty characters and printing it on all eleven
 * sheets put it three times on the method sheet alone.
 */
/**
 * The ONE mono line under a brief's name — "September 2026 · Sealand · as at
 * 28 Sep", the artboard's own context line, in the artboard's own order.
 *
 * READ BY BOTH TITLE BLOCKS (wave 3, `sales`-4). The cover composed this and
 * `SheetTitle` reached for `reading.stamp`, which is the SIXTY-character long
 * form — "September 2026 reading as at 28 Sep 2026 · still filling until 30 Oct
 * 2026" — so the marketing brief's first sheet wrapped its context onto two
 * lines under a title the cover sets on one. They are the same block on the
 * same artboard; they read the same function.
 *
 * The freeze boundary is not dropped, it rides `BriefFooter` on this sheet and
 * on every other, which is where the artboard puts it too.
 */
const titleStamp = (data: DocumentSnapshotData): string =>
  data.reading ? `${data.reading.monthLabel} · ${data.company} · as at ${shortDate(data.reading.readingAt)}` : data.period

/** The footer's stamp: the artboard's short form where there is a reading, and
 *  nothing (so the render date stands) where there is not. */
const footerStamp = (data: DocumentSnapshotData): string | null =>
  data.reading ? briefStampShort(data.reading) : null

/* 11px, AND IT IS NOT ON THE BODY'S SCALE (wave 3, `sales`-3). This paragraph
   and the cover's page number are the only two nodes in this file that render
   OUTSIDE `.vb-slide-body`, in the slide's own footer row, so `zoom: .902`
   never touches them and the divisor the rest of the deck's type carries does
   not apply here: 11px prints 11px, which is 8.25pt and the only tier on the
   sheet that clears the floor `components/print/slide.tsx:60-63` names.
   The 9.5 -> 11 pass landed on `DeckFooter` (report-deck.tsx), which a brief
   never renders, and not on this — although slide.tsx says in a comment that
   the two move together. They do now: the stamp and the "1 / 11" beside it are
   one baseline and one size. */
function BriefFooter({ company, date, stamp, note }: { company: string; date: string; stamp: string | null; note?: string | null }) {
  return (
    <p className="truncate font-mono text-[11px] leading-[1.35] text-muted-foreground">
      <span className="text-secondary-foreground">Created by {company} with Verbatim</span>
      <span aria-hidden> · </span>
      <span>{stamp ?? date}</span>
      {/* WHAT THE SHEET WAS READ FROM (merge, Block D wave 2: E-marketing's
          `corpusNote`, which it carried on its own footer). The platform list
          and the corpus count are what make every figure above them mean
          something, and they appeared on no sheet of any brief. */}
      {note ? <><span aria-hidden> · </span><span>{note}</span></> : null}
    </p>
  )
}

function DocumentCover({ data, pages, contents, date }: {
  data: DocumentSnapshotData
  pages: number
  contents: { page: number; title: string }[]
  date: string
}) {
  const tiles = overviewTiles(data)
  // THE BLOCK, NOT JUST ITS TEXT: the Studio edits a brief through `BlockSlot`,
  // which keys on the block's stored id, so moving the paragraph to the cover
  // must move the edit handle with it or the summary silently stops being
  // editable on the one brief that prints it here.
  const summary = coverCarriesSummary(data)
    ? data.pages.find((p) => p.kind === 'in_short')?.blocks.find((b) => b.field === 'summary') ?? null
    : null
  const summaryText = summary?.text ?? ''
  const stamp = titleStamp(data)
  return (
    // THE COVER SAYS SO. Three test files asked "is this the cover?" by
    // grepping the markup for the title's font-size, which made a type pass
    // (wave 3, `sales`-1) read as a missing cover sheet. A sheet declares what
    // it is; a size is not an identity.
    <section className="vb-slide" data-sheet="cover">
      <div className="vb-slide-body">
        <div className="grid h-full min-h-0 grid-cols-[7fr_5fr] items-center gap-x-12">
          {/* 16px, NOT THE ARTBOARD'S 18 (wave 3, `sales`-1). Everything else
              on this sheet is the drawing's number, and at 18 the column ran
              566px inside a 563px body once the type went onto the artboard's
              scale — because the contents list has TEN entries where the
              artboard's has six (the deck runs eleven sheets against the
              artboard's seven, `reports`-13). Two pixels of gap is the
              cheapest thing on the sheet to spend and the only one a reader
              cannot see; the real fix is the sheet count. */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3.5">
              {/* VERTICAL, 3 × 48. The build drew it lying down. */}
              <span className="inline-block h-12 w-[3px] rounded-full bg-primary" aria-hidden />
              <h1 className="max-w-[16ch] text-[64.5px] font-semibold leading-[1.05] tracking-[-0.025em] text-foreground [text-wrap:balance]">{data.title}</h1>
              <p className="font-mono text-[14.5px] text-muted-foreground">
                {stamp} · {pages} {pages === 1 ? 'page' : 'pages'}
              </p>
            </div>
            {summary && summaryText && (
              <BlockSlot block={summary} textClass="max-w-[66ch] text-[17.5px] leading-[1.5] text-foreground">
                <Paragraphs text={summaryText} figures={data.figures} face="sans" className="max-w-[66ch] text-[17.5px] leading-[1.5] text-foreground" />
              </BlockSlot>
            )}
            {contents.length > 0 && (
              <div className="flex flex-col gap-2">
                <Eyebrow>In this brief</Eyebrow>
                <ol className="flex flex-col gap-[5px]">
                  {contents.map((c) => (
                    <li key={c.page} className="flex text-[16px] font-medium leading-[1.35] text-foreground">
                      <span className="w-6 shrink-0 font-mono text-[14.5px] font-normal tabular-nums text-primary">{c.page}</span>
                      <span>{c.title}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-4">
            {tiles.map((t, i) => <StatTile key={i} value={t.value} label={t.label} verdict={t.verdict} note={t.note} level={t.level} />)}
          </div>
        </div>
      </div>
      {/* THE COVER CARRIES THE FOOTER TOO. The mock numbers it 1 / 7; the build
          printed no footer at all, so the first sheet of a paid PDF was the one
          sheet with no page number and no "Created by". */}
      <footer className="flex shrink-0 items-baseline justify-between gap-4 border-t border-border/70 pt-1.5">
        <div className="min-w-0 flex-1"><BriefFooter company={data.company} date={date} stamp={footerStamp(data)} /></div>
        {/* The same 11px as every other sheet's page number, which `Slide`
            sets; the cover draws its own footer and had drifted below it. */}
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">1 / {pages}</span>
      </footer>
    </section>
  )
}

// ── overview ───────────────────────────────────────────────────────────────

/**
 * The badge over a figure this brief measured (`sales.p1.stats`, `sales.p5`).
 *
 * A VERDICT WITH NO BASELINE IS A LEVEL, NOT A THIN COMPARISON, and this seam
 * is the one that knows the difference. `bandVerdict` with no `baseline`
 * returns `too_little_data` with a null change (lib/reading/verdicts.ts) —
 * deliberately, because it is "what this is running at" and never "flat" —
 * and `MOVEMENT_WORDS` renders that token as "too few to compare". On the
 * switching pool that is a sentence that refutes itself on the page:
 * `switchingFigure` builds a verdict ONLY when the pool cleared both floors,
 * so a cover tile reading "120 videos … too few to compare" tells a paying
 * reader their sample is too small when it is not, beside the number that
 * shows it is not (figures.ts warns against exactly this sentence).
 *
 * The reason the comparison was not drawn is that there is no PRIOR pool, and
 * the closed vocabulary already has that word: `baseline_forming`, "not enough
 * months yet", the state whose own docstring says it resolves on the calendar.
 * So no fifth refusal word is invented and no badge is suppressed — the state
 * is corrected where the baseline is known to be absent, and the badge stays
 * the one component allowed to write the claim.
 *
 * `refused` and `no_clear_change` are untouched: a refusal is about our
 * bookkeeping and a cleared band is an answer, and neither becomes this.
 */
function ClaimBadge({ verdict, unit }: { verdict?: Verdict | null; unit?: string }) {
  if (!verdict) return null
  const shown: Verdict =
    !verdict.baseline && verdict.state === 'too_little_data'
      ? { ...verdict, state: 'baseline_forming' }
      : verdict
  return <MovementBadge verdict={shown} unit={unit} />
}

/**
 * A cover tile: the figure, what it is of, and — where the reading earned one
 * — the claim about it (`sales.p1.stats`).
 *
 * THE BADGE ROW IS THE ARTBOARD'S THIRD LINE AND IT IS NOT A THIRD SENTENCE.
 * The mock writes "▼ 3 pts · fading, 3rd month" by hand; here the magnitude
 * and the band come from `MovementBadge` (which prints points only when the
 * state is `moved`, D2) and the direction word does not come at all, because
 * only `directionWord` may fill one and no reader on this artefact has its
 * flag true (D5). Which non-answer it is comes from `ClaimBadge`, and where a
 * floor bit it is the FIGURE's own words that say which one and how many it
 * had — which the mock's bare "too few to compare" does not.
 *
 * THE PAIR IS THE LEVEL. The number is code's figure and the label carries the
 * "of N", so the two together are what rule (b) reads — a tile whose label
 * names no population is a score, which this product does not print.
 */
function StatTile({ value, label, verdict, note, level = false, word = false }: {
  value: string
  label: string
  verdict?: Verdict | null
  note?: string | null
  /** Whether the pair is a level — the CALLER's answer (`OverviewTile.level`),
   *  because the caller is the side that built the label and knows whether it
   *  names a population. It was a regex over the rendered label until
   *  2026-09-18, which is the node-declares-itself discipline inverted. */
  level?: boolean
  /** The value is a WORD and not a figure — a refusal is the tile's ANSWER and
   *  is set as a sentence (`OverviewTile.word`, E-marketing). It carries no
   *  `data-copy="figure"` for the same reason: it is not one. */
  word?: boolean
}) {
  const body = word
    ? (
      <>
        {/* A refusal at the artboard's numeral scale reads as a measurement
            (mock-gap §6 D2), so it is set as a sentence. */}
        <p className="text-[21px] font-medium leading-[1.2] tracking-[-0.01em] text-secondary-foreground">{value}</p>
        <p className="mt-2 text-[14px] leading-[1.35] text-muted-foreground">{label}</p>
      </>
    )
    : (
      <>
        <p data-copy="figure" className="font-mono text-[42px] font-medium leading-none tracking-[-0.02em] tabular-nums text-foreground">
          {/* The arrow is set in the SANS face at two thirds the numeral's
              size: IBM Plex Mono draws ▲ at the full advance width of a digit,
              so a 38px mono arrow is twice the artboard's and drags the figure
              beside it off the tile. */}
          {/^[\u25b2\u25bc]/.test(value)
            ? <><span className="font-sans text-[26.5px] align-[0.06em]">{value.slice(0, 1)}</span>{value.slice(1)}</>
            : value}
        </p>
        <p className="mt-2 text-[14px] leading-[1.35] text-muted-foreground">{label}</p>
      </>
    )
  return (
    <div className={`${CARD} px-5 py-4`}>
      {level ? <div data-copy="level">{body}</div> : body}
      {(verdict || note) && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {verdict ? <ClaimBadge verdict={verdict} unit="pts" /> : null}
          {note ? <span className="text-[12.5px] leading-[1.35] text-muted-foreground">{note}</span> : null}
        </div>
      )}
    </div>
  )
}

/**
 * The calibration note, at last on a brief (`mkt.p1.calibrationnote`).
 *
 * The sentence exists twice in the product — `components/how-to-read.tsx` and
 * the quarterly's method block — and has never reached a printed artefact,
 * where it matters most: a reader of a PDF has no How-to-read drawer to open,
 * and the whole question a brief raises is which of its words a model chose.
 * It names the words this deck actually prints.
 *
 * AND IT NAMES THE EVIDENCE WORDS TOO (fix pass). The sentence listed the five
 * movement words and stopped, two lines above finding rows carrying chips that
 * read `solid` and `reasonable` — calibrated words by exactly the definition
 * this sentence uses, assigned by `calibrateSure` (lib/reports/documents/
 * scrub.ts) from videos and independent strands. On the one sheet whose job is
 * to make the vocabulary checkable, two of its own words were unlisted; the
 * artboard's version names its evidence words as well.
 *
 * AND THE BASIS CLAUSE NAMES ONE UNIT (wave 3, `sales`-6). It read "from
 * counted videos and the conversations behind each finding", which is two
 * names for one thing on the one sentence whose job is to make the vocabulary
 * checkable — the reader has to already know they are not two inputs. They
 * are not: `calibrateSure` counts `ResearchPoint.conversationCount`, which is
 * distinct source VIDEOS, and the strands they came from. The artboard's own
 * version of this sentence says "from counted videos" and stops, and so does
 * this one.
 *
 * "NEVER WORDED BY THE MODEL" STAYS, although "the model" is in neither
 * THIRTEEN_WORDS nor GLOSSARY. The artboard writes those five words verbatim,
 * Heinrich's ruling is that the wording follows the mock, and the sentence has
 * no other way to say the thing a reader of a machine-written PDF most needs
 * told. Adding "the model" to the glossary is `lib`'s call, not a render fix.
 */
export const CALIBRATION_NOTE =
  'Every calibrated word here — up, down, no clear change, too few to compare, comparison refused, and a finding’s solid, reasonable or thin — is assigned by a fixed rule from counted videos, never worded by the model.'

/**
 * WHAT THIS SHEET WAS READ FROM, along the foot (`mkt.p1.title`'s corpus line).
 *
 * The artboard's footer is "September 2026 reading · as at 28 Sep · TikTok,
 * YouTube, Instagram, Reddit · 2,359 videos" and the deck printed only the
 * provenance half — so the platform list and the corpus count, which are what
 * make every figure above them mean something, appeared nowhere on any sheet.
 * The month and the reading instant are NOT repeated here: they ride the
 * header's stamp on every sheet already.
 *
 * The count is the category's denominator, the same number the numbers card
 * prints — never `method.videos`, which is the update's and would be a second
 * answer to the card's question at the other end of the same sheet.
 */
export function corpusNote(data: DocumentSnapshotData): string | null {
  const r = data.reading
  if (!r || r.denominators.length === 0) return null
  const platforms = Object.entries(r.platformMix)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => PLATFORM[k] ?? k)
  const category = r.denominators.find((d) => d.audience === 'industry-other') ?? r.denominators[0]
  const corpus = category ? `${fmtCount(category.videos)} videos in ${category.label}` : ''
  return [platforms.join(', '), corpus].filter(Boolean).join(' · ') || null
}

/**
 * The brief's own title, on the first sheet of content rather than on a
 * landscape sheet of its own (`mkt.p1.title`). The mono line under it is the
 * artboard's context line: the month, the company, the reading instant and
 * how much follows.
 *
 * AND IT IS THE SAME TITLE THE COVER SETS (wave 3, `sales`-4). This was 26px,
 * on deviation 14's reason that 26 "sits between" the artboard's 58 and the
 * build's old 32 — and splitting a difference is not a rule. The result was a
 * first sheet whose own name was the FOURTH-largest thing on it: the three
 * stat tiles down the right set their numerals at the artboard's 38px, so
 * "11,840" printed 1.46x the size of the words "Marketing brief". The artboard
 * draws this block and the sales cover's title block identically — the rule,
 * the 58px name, the mono context line — and the ratio that follows from it
 * (58 : 38) is what makes the sheet have a focal point at all. Sizes are the
 * artboard's divided by .902, as everything in this file is: 64.5px prints 58,
 * 14.5px prints 13, and the rule is 62 x 3 to print 56 x 3.
 */
function SheetTitle({ data, pages }: { data: DocumentSnapshotData; pages: number }) {
  const stamp = titleStamp(data)
  return (
    <div className="flex flex-col gap-[15.5px]">
      <span className="inline-block h-[3px] w-[62px] rounded-full bg-primary" aria-hidden />
      <h1 className="max-w-[16ch] text-[64.5px] font-semibold leading-[1.05] tracking-[-0.025em] text-foreground [text-wrap:balance]">{data.title}</h1>
      {/* The company is inside `titleStamp` — it was appended here as well and
          the line read "… · Sealand · as at 28 Sep · Sealand · 9 pages". */}
      <p className="font-mono text-[14.5px] text-muted-foreground">
        {stamp} · {pages} {pages === 1 ? 'page' : 'pages'}
      </p>
    </div>
  )
}

// `findingMeta` STOOD HERE (merge, Block D wave 2). E-marketing read the
// finding's count and confidence word off the page's meta one at a time;
// E-sales's `findingCards` (lib/reports/documents/overview.ts) returns the same
// two with the headline, the strands and the audiences beside them, and the
// In-short list is built from that. One reader of `page.meta`, not two.

function OverviewPage({ page, data, title, pages }: { page: DocPage; data: DocumentSnapshotData; title?: boolean; pages?: number }) {
  const f = data.figures
  const summary = page.blocks.find((b) => b.field === 'summary')
  // The numbers and the headlines are derived in
  // lib/reports/documents/overview.ts — the email reads the same functions, so
  // the paper and the email cannot drift. (The not-settled list stays local:
  // it is the page's own block, and the email does not carry it.)
  const findings = findingCards(data)
  // The sheet each finding is on, so the list points at the argument rather
  // than restating it. The deck's own pagination: slide `i` is page `i + 2`.
  const slides = documentSlides(data)
  const pageOf = (id: string) => slides.findIndex((x) => x.keys[0] === id) + 2
  const notSureBlock = page.blocks.find((b) => b.field === 'not_sure')
  const notSure = notSureBlock?.items ?? []
  const tiles = overviewTiles(data)
  // ONE SUMMARY PER DOCUMENT. The sales brief's artboard puts it on the cover,
  // under the 58px title; the marketing brief's puts it here. The predicate is
  // stated once, in `overview.ts`, and read by both, so neither sheet can come
  // to draw it twice or drop it between them.
  const onCover = coverCarriesSummary(data)
  return (
    <div className="grid h-full min-h-0 grid-cols-[7fr_5fr] gap-x-12">
      {/* 15.5px BETWEEN THE FOUR PARTS, which prints the artboard's 14px
          (`sales`-4). At 20px the column ran 594px inside a 563px body once the
          title took the size the artboard draws it at, and the sentence the
          sheet ends on — the calibration note — was the half that fell off. */}
      <div className="flex min-h-0 flex-col gap-[15.5px]">
        {/* THE SHEET'S OWN TITLE, where the brief puts one here rather than on
            a cover (E-marketing); the eyebrow stands in its place where it
            does not. */}
        {title && <SheetTitle data={data} pages={pages ?? 0} />}
        {!onCover && (
          <div className="flex flex-col gap-3">
            {!title && <Eyebrow>In short</Eyebrow>}
            {summary?.text && <BlockSlot block={summary} textClass="max-w-[66ch] text-[19px] leading-[1.55] text-foreground"><Paragraphs text={summary.text} figures={f} className="max-w-[66ch] text-[19px] leading-[1.55] text-foreground" /></BlockSlot>}
          </div>
        )}
        {findings.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <Eyebrow>Findings in this brief</Eyebrow>
            <ol className="flex flex-col gap-3.5">
              {findings.map((c, i) => (
                <li key={c.id} className="flex items-baseline gap-4">
                  <span className="w-6 shrink-0 font-mono text-[14.5px] tabular-nums text-primary">{i + 1}</span>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span className="text-[17.5px] font-medium leading-[1.4] text-foreground"><Figured text={c.headline} figures={f} /></span>
                    {/* THE EVIDENCE TRAVELS WITH THE HEADLINE. Every count here
                        is the finding page's own meta, already printed on its
                        sheet — the list indexes the argument rather than
                        restating it, and a sheet that was 85% white space on a
                        one-finding brief carries what it is a list OF. */}
                    <p className="flex flex-wrap items-baseline gap-x-1.5 font-mono text-[12px] leading-[1.4] text-muted-foreground">
                      <span>
                        page <span className="tabular-nums text-foreground">{pageOf(c.id)}</span>
                        {/* VIDEOS, AND "ACROSS" (wave 3, `sales`-5). See `FindingPage`. */}
                        {' · '}<span className="tabular-nums text-foreground">{fmtCount(c.conversations)}</span> videos across
                        {' '}<span className="tabular-nums text-foreground">{c.strands}</span> {c.strands === 1 ? 'strand' : 'strands'} of the research
                        {' · '}confidence
                      </span>
                      {/* THE TIER KEEPS ITS COLOUR STEP (E-marketing's fix
                          pass). The artboard's evidence chips are a green one
                          and an amber one; `reasonable` drawn on the neutral
                          inner tint read as the third tier. The WORDS are the
                          calibrated ones and do not change — the treatment is
                          the mock's. */}
                      <Pill tone={c.sure === 'solid' ? 'you' : c.sure === 'reasonable' ? 'new' : 'plain'}>{c.sure}</Pill>
                    </p>
                    {/* AND NOT THE AUDIENCES, HERE (wave 3, `sales`-6). This
                        list's own rule, three comments up, is that it INDEXES
                        the argument rather than restating it — and every
                        finding's audience pills are drawn again beside its
                        headline on the sheet the row's page number points at
                        (`FindingPage`). The artboard's version of this list is
                        a number, a headline, a count and an evidence chip, and
                        a second row of pills per finding is what put the
                        sheet's last sentence past the bottom of the body once
                        the title took the size the artboard draws it at. */}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
        {/* NO MEASURE CAP ON THE LAST LINE OF THE SHEET (wave 3, `sales`-6).
            `max-w-[70ch]` is a reading measure for running prose and this is
            one sentence of apparatus at the foot of a column 600px wide: the
            cap held it to 462px and cost it a third line, which was the line
            that fell off the bottom of the body. The artboard sets the same
            sentence across the whole column, in two. */}
        <p className="mt-auto text-[13.5px] leading-[1.45] text-muted-foreground">{CALIBRATION_NOTE}</p>
      </div>
      <div className="flex min-h-0 flex-col gap-4">
        {/* THE TILES BELONG TO WHICHEVER SHEET CARRIES THE SUMMARY. They are
            the same three numbers either way, and a brief that printed them on
            the cover AND here would be a document stating one measurement
            twice, three sheets apart, with nothing saying they are the same
            one. */}
        {!onCover && <div className="flex flex-col gap-3">{tiles.map((t, i) => <StatTile key={i} value={t.value} label={t.label} verdict={t.verdict} note={t.note} level={t.level} word={t.word} />)}</div>}
        {notSure.length > 0 && (
          <div className="rounded-lg bg-inner px-5 py-4">
            <Eyebrow className="mb-2">Not settled this update</Eyebrow>
            <BlockSlot block={notSureBlock!} textClass="text-[14.5px] leading-[1.45] text-secondary-foreground">
              <ul className="flex flex-col gap-1.5">
                {notSure.slice(0, 3).map((x, i) => <li key={i} className="text-[14.5px] leading-[1.45] text-secondary-foreground">{x}</li>)}
              </ul>
            </BlockSlot>
          </div>
        )}
      </div>
    </div>
  )
}

// ── finding ────────────────────────────────────────────────────────────────

/**
 * Three dots, filled to the confidence word.
 *
 * TWO VOCABULARIES, ONE LADDER. A finding's word is `solid | reasonable |
 * thin` (calibrated from conversations and strands); a READING's is
 * `reasonable | partly | not yet` (`confidenceOf`, off the verdicts). They are
 * two answers to two questions and neither is being renamed — but they sit on
 * ONE sheet count in one document, so a word may not fill two different
 * numbers of dots depending on which question asked it.
 *
 * THE LADDER IS THIS TABLE AND EVERY WORD HAS ITS OWN RUNG. `solid` is three
 * and only a finding can earn it; `reasonable` is two in both vocabularies
 * because it is one word meaning one thing, and a reading is CAPPED there by
 * construction (`confidenceOf`: a quarter whose own side is still forming is
 * never better than "partly", however solid the category side is, so no
 * reading ever claims `solid`); `partly` and `thin` are one; and `not yet` is
 * ZERO, which is what "nothing cleared a band on either side, so there is no
 * reading to be confident about" actually says. Until 2026-09-18 the body was
 * `solid ? 3 : reasonable ? 2 : 1`, so `partly` and `not yet` drew the same
 * one dot and a three-state word rendered as two — while the docstring above
 * claimed the dots knew both vocabularies.
 *
 * An unrecognised word fills one rather than three, which is the safe way for
 * it to be wrong, and the WORD is printed beside the dots at both call sites,
 * so the dots never carry the claim alone.
 */
const CONFIDENCE_DOTS: Record<string, number> = {
  solid: 3,
  reasonable: 2,
  partly: 1,
  thin: 1,
  'not yet': 0,
}

function ConfidenceDots({ sure }: { sure: string }) {
  const n = CONFIDENCE_DOTS[sure.toLowerCase()] ?? 1
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      {[0, 1, 2].map((i) => <span key={i} className={`inline-block h-[9px] w-[9px] rounded-full ${i < n ? 'bg-primary' : 'bg-neutral-seg'}`} />)}
    </span>
  )
}

function FindingPage({ page, figures, company, lens }: { page: DocPage; figures: FigureTable; company: string; lens: DocLens }) {
  const b = (field: string) => page.blocks.find((x) => x.field === field)
  const headline = b('headline')
  const saw = b('saw')
  const means = b('means')
  const practiceBlock = b('practice')
  const practice = practiceBlock?.items ?? []
  const sureWord = page.meta?.sure ?? 'thin'
  const sureNote = (b('sure')?.text ?? '').replace(/^(Solid|Reasonable|Thin):[^.]*\.\s*(Treat it as a lead, not a rule\.\s*)?/, '')
  // Through `shownTrajectory` (D1): this page is drawn from a snapshot, and
  // one built before the gate carries "rising" / "seen 2 updates running" in
  // its meta. The gate is on the surface, not on the build.
  const history = shownTrajectory(page.meta?.history)
  const conversations = Number(page.meta?.conversations ?? 0)
  const strands = Number(page.meta?.strands ?? 0)
  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <div className="flex items-end justify-between gap-8">
        {headline && <BlockSlot block={headline} textClass="max-w-[30ch] text-[35.5px] font-semibold leading-[1.12] tracking-[-0.02em] text-foreground"><h2 className="max-w-[30ch] text-[35.5px] font-semibold leading-[1.12] tracking-[-0.02em] text-foreground [text-wrap:balance]"><Figured text={headline.text} figures={figures} /></h2></BlockSlot>}
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5 pb-1">
          {audiencePills(page.meta?.audiences ?? '', company)}
          {history && <Pill tone={history.startsWith('new') ? 'new' : 'plain'}>{history}</Pill>}
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[7fr_5fr] gap-x-12">
        <div className="flex min-h-0 flex-col gap-3">
          <Eyebrow>What the conversation shows</Eyebrow>
          {saw?.text && <BlockSlot block={saw} textClass={`max-w-[70ch] ${BODY}`}><Paragraphs text={saw.text} figures={figures} className={`max-w-[70ch] ${BODY}`} /></BlockSlot>}
          {saw?.quote?.text && (
            <div className="mt-1"><QuoteBlock quote={saw.quote} mode="print" /></div>
          )}
        </div>
        {/* SIZED TO ITS CONTENT, NOT TO THE SHEET (fix pass). The card filled
            the column's height and pinned CONFIDENCE to its foot, so a finding
            with one practice bullet drew about 380px of empty bordered white
            between the bullet and the rule — a hole in the middle of the
            sheet's most prominent card. `distribute="between"` is right for a
            card whose content fills it; the artboard's card is sized to its
            content and lets the SHEET carry the slack. */}
        <div className={`${CARD} flex min-h-0 flex-col gap-4 self-start px-6 py-5`}>
          {/*
            VIDEOS, AND "ACROSS" IS NOT DECORATION (wave 3, `sales`-5).
            This printed "conversations", a word the deck never defines: the
            numbers card two sheets on defines COMMENTS, VIDEOS and THE UNIT
            and not this, and `lib/calibration.ts` GLOSSARY makes a
            conversation the same unit as THE UNIT under a second name — so a
            reader could not tell whether 305 was a subset of 1,388 or
            something counted another way. AGENTS.md's rule for a new reading
            surface is "videos", all four artboards count in videos, and the
            number really is one: `meta.conversations` comes from `heardMeta`,
            off `ResearchPoint.conversationCount`, whose own docstring is
            "Distinct source videos behind `insightIds`".

            WHAT "ACROSS" CARRIES. `heardMeta` SUMS that count over the
            finding's strands, so a video cited by two strands is counted
            twice and the figure is an upper bound on the distinct videos
            behind the finding. "305 videos across 3 strands" is the true
            shape of a per-strand tally, and it is `heardLine`'s own wording;
            a bare "305 videos" would be a distinctness claim this number
            cannot make. Deduplicating it means deduplicating in `heardMeta`
            (lib/reports/documents/compose.ts), which is `reports`' file and
            not a render-time fix.
          */}
          <p className="font-mono text-[13.5px] text-muted-foreground">
            <span className="text-foreground">{fmtCount(conversations)}</span> videos across <span className="text-foreground">{strands}</span> {strands === 1 ? 'strand' : 'strands'} of the research
          </p>
          {means?.text && (
            <div className="flex flex-col gap-2">
              <Eyebrow>{lens.means}</Eyebrow>
              <BlockSlot block={means} textClass={BODY_SM}><Paragraphs text={means.text} figures={figures} className={BODY_SM} /></BlockSlot>
            </div>
          )}
          {practice.length > 0 && (
            <div className="flex flex-col gap-2">
              <Eyebrow>In practice</Eyebrow>
              <BlockSlot block={practiceBlock!} textClass={BODY_SM}>
                <ul className="flex flex-col gap-1.5">
                  {practice.map((x, i) => (
                    <li key={i} className={`flex gap-3 ${BODY_SM}`}>
                      <span className="mt-[9px] inline-block h-[6px] w-[6px] shrink-0 rounded-full bg-primary" aria-hidden />
                      <span><Figured text={x} figures={figures} /></span>
                    </li>
                  ))}
                </ul>
              </BlockSlot>
            </div>
          )}
          <div className="mt-1 flex flex-col gap-1.5 border-t border-border pt-3">
            <p className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.08em] text-muted-foreground">
              Confidence <ConfidenceDots sure={sureWord} /> <span className="normal-case tracking-normal text-foreground">{sureWord}</span>
            </p>
            {sureNote && <p className="text-[14px] leading-[1.45] text-muted-foreground">{sureNote}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── competitor ─────────────────────────────────────────────────────────────

function ShareStrip({ data, name }: { data: DocumentSnapshotData; name: string }) {
  const f = data.figures
  const key = `${slugOf(name)}_share_pct`
  const you = f.client_share_pct ? parseFloat(f.client_share_pct.value) : null
  const them = f[key] ? parseFloat(f[key].value) : null
  if (you == null || them == null || Number.isNaN(you) || Number.isNaN(them)) return null
  const max = Math.max(you, them, 1)
  const row = (label: string, pct: number, cls: string) => (
    <div className="flex items-center gap-3">
      <span className="w-[92px] shrink-0 truncate text-[14.5px] text-foreground">{label}</span>
      <span className="h-[10px] flex-1"><span className={`block h-full rounded-[3px] ${cls}`} style={{ width: `${Math.max(2, (pct / max) * 100)}%` }} /></span>
      <span className="w-[52px] text-right font-mono text-[14.5px] tabular-nums text-foreground">{pct}%</span>
    </div>
  )
  return (
    <div className={`${CARD} w-[400px] shrink-0 px-5 py-4`}>
      <Eyebrow className="mb-2.5">Share of tracked conversation this update</Eyebrow>
      <div className="flex flex-col gap-2">
        {row(data.company, you, 'bg-you')}
        {row(name, them, 'bg-comp')}
      </div>
    </div>
  )
}

function CompetitorPage({ page, figures, data }: { page: DocPage; figures: FigureTable; data: DocumentSnapshotData }) {
  const b = (field: string) => page.blocks.find((x) => x.field === field)
  const name = page.meta?.name ?? page.title
  // Four columns since 2026-09-15, three on a snapshot frozen before the
  // "what others say" block existed: a column is drawn only for a block the
  // snapshot actually carries, so an older document prints exactly as it did.
  const cols = ([
    ['What they are pitching', 'pitch'],
    ['What others say about them', 'about'],
    ['What their users praise', 'praise'],
    ['Where their users hurt', 'hurt'],
  ] as const)
    .map(([label, field]) => [label, b(field)] as [string, DocBlock | undefined])
    .filter(([, block]) => !!block)
  const read = b('read')
  // The sentence is conditioned on the same thing the columns are. It names
  // the method, and nine frozen snapshots carry a competitor page with no
  // `about` block — one of them served live on a share link — so an
  // unconditional "other people's videos" would have them claiming a reading
  // they never did, beside three columns rather than four. A document says
  // what it read, not what today's pipeline reads.
  const aboutShown = Boolean(b('about'))
  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <div className="flex items-start justify-between gap-8">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[35.5px] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground">{name}</h2>
          <p className="text-[15.5px] text-muted-foreground">As their own videos{aboutShown ? ', other people’s videos' : ''} and their audience tell it this update{page.meta?.thin === 'true' ? ', on few videos, read with care' : ''}.</p>
        </div>
        <ShareStrip data={data} name={name} />
      </div>
      <div className={`grid min-h-0 flex-1 ${cols.length >= 4 ? 'grid-cols-4 gap-x-4' : 'grid-cols-3 gap-x-6'}`}>
        {cols.map(([label, block]) => (
          <div key={label} className={`${CARD} flex flex-col gap-2.5 px-5 py-4`}>
            <Eyebrow>{label}</Eyebrow>
            {block?.text && <BlockSlot block={block} textClass={BODY_SM}><Paragraphs text={block.text} figures={figures} className={BODY_SM} /></BlockSlot>}
          </div>
        ))}
      </div>
      {read?.text && (
        <div className="rounded-lg bg-inner px-6 py-4">
          <Eyebrow className="mb-1.5">When {name} comes up</Eyebrow>
          <BlockSlot block={read} textClass={`max-w-[100ch] ${BODY}`}><Paragraphs text={read.text} figures={figures} className={`max-w-[100ch] ${BODY}`} /></BlockSlot>
        </div>
      )}
    </div>
  )
}

/** A page's packed meta. JSON, so a company or a theme label carrying a
 *  separator cannot mis-split into NaN on paper; a snapshot that somehow does
 *  not parse degrades to the empty case rather than throwing inside a print
 *  render, which would fail a paid build. */
function parseMeta<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? (v as T) : fallback
  } catch {
    return fallback
  }
}

// ── standing ───────────────────────────────────────────────────────────────
// The leadership brief's one page of position: the writer's read on the left,
// and on the right the shares as bars and what actually moved, both drawn by
// code from the frozen figures and delta. The verdicts are the pipeline's own
// (T0-8): a change the data cannot carry prints as "about where it was", not
// as a number.

function StandingBars({ data, parties }: { data: DocumentSnapshotData; parties: string[] }) {
  const f = data.figures
  const rows = parties
    .map((name, i) => {
      const key = i === 0 ? 'client_share_pct' : `${slugOf(name)}_share_pct`
      const pct = f[key] ? parseFloat(f[key].value) : NaN
      return Number.isNaN(pct) ? null : { name, pct, you: i === 0 }
    })
    .filter(Boolean) as { name: string; pct: number; you: boolean }[]
  if (!rows.length) return null
  const max = Math.max(...rows.map((r) => r.pct), 1)
  return (
    <div className={`${CARD} px-6 py-5`}>
      <Eyebrow className="mb-3">Share of tracked conversation this update</Eyebrow>
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-3">
            <span className="w-[120px] shrink-0 truncate text-[15px] text-foreground">{r.name}</span>
            <span className="h-[11px] flex-1"><span className={`block h-full rounded-[3px] ${r.you ? 'bg-you' : 'bg-comp'}`} style={{ width: `${Math.max(2, (r.pct / max) * 100)}%` }} /></span>
            <span className="w-[54px] text-right font-mono text-[15px] tabular-nums text-foreground">{r.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** A share with the count it was measured on — "23.4% of 380". Null where the
 *  count is not on the delta at all, which a snapshot frozen before the field
 *  existed is: that is a fact about our own bookkeeping, and `UNCOUNTED` says
 *  it rather than printing the percentage anyway. */
const judgedLevel = (pct: number, n: number | null | undefined): string | null =>
  typeof pct === 'number' && Number.isFinite(pct) && typeof n === 'number' && Number.isFinite(n) && n > 0
    ? `${Math.round(pct * 10) / 10}% of ${fmtCount(n)}`
    : null

/** The same for a share side, which carries its numerator too — the videos in
 *  the client's own bucket out of every tracked video, the pair `SHARE_BAND`
 *  floors on. */
const shareLevel = (s: ShareSide | null | undefined): string | null =>
  s && typeof s.client === 'number' && Number.isFinite(s.client)
    && typeof s.totalVideos === 'number' && s.totalVideos > 0
    && typeof s.clientVideos === 'number' && Number.isFinite(s.clientVideos)
    ? `${Math.round(s.client * 10) / 10}% (${fmtCount(s.clientVideos)} of ${fmtCount(s.totalVideos)} videos)`
    : null

/** What a level says when the count behind it was never stored. It is not a
 *  fifth refusal word for a thin comparison — the badge beside it still says
 *  what the comparison was — it is the sentence for a figure we cannot
 *  evidence, and it prints no percentage at all. */
const UNCOUNTED = 'The counts behind these levels were not recorded'

/** What moved, in the delta's own verdicts. A metric the update could not
 *  judge says so rather than showing a number that means nothing.
 *
 *  THE LINE STATES THE LEVELS; THE BADGE STATES THE MOVEMENT (P0 item 7).
 *  These sentences used to write their own — "Moved up, 23.4% to 27.1%
 *  positive" — which is a direction word earned from ONE banded comparison,
 *  mock-gap §6 D5's exact error, hand-rolled on paper where no badge could
 *  contradict it. `MovementBadge` is what the rest of the product prints for
 *  this: the arrow is the sign, the band travels beside it, and a non-answer
 *  reads as a non-answer in the same words the app and the email use. So the
 *  sentence keeps the two levels, which are real and measured, and hands the
 *  claim about the difference to the one component allowed to make it.
 *
 *  `good` is the favourability axis: tone and share rising is good for the
 *  client, and volume is our own gather cadence rather than anything about
 *  them, so it is neutral.
 *
 *  EVERY LEVEL CARRIES THE COUNT IT WAS MEASURED ON (copy contract rule (b)).
 *  Both figures used to print bare — "23.4% to 27.1% positive" — in every
 *  state INCLUDING `too_little_data`, which is the one state that says those
 *  levels are thin, and where the sentence this replaced printed no number at
 *  all. Two percentages to one decimal, a badge that only qualifies the
 *  DIFFERENCE, and no n anywhere on the sheet is a score, and the
 *  denominators were sitting unused on the delta the whole time
 *  (`nowJudged` / `prevJudged`, `ShareSide.clientVideos` / `totalVideos` —
 *  the same counts `SHARE_BAND` floors on). `copy: 'level'` is what carries
 *  that into the markup, so rule (b) reads these two lines on paper the way
 *  it reads every level on screen. */
export function movementLines(data: DocumentSnapshotData): {
  label: string
  value: string
  /** The `data-copy` kind the line's value is rendered under. `level` is a
   *  calibrated share and rule (b) will demand its "of N"; the lines that are
   *  a plain count or a list of labels claim no level and mark nothing. */
  copy?: 'level'
  verdict?: DeltaVerdict | null
  count?: number | null
  good?: Good
}[] {
  const d = data.delta
  if (!d) return [{ label: 'Movement', value: 'No earlier update to compare with.' }]
  const out: { label: string; value: string; copy?: 'level'; verdict?: DeltaVerdict | null; count?: number | null; good?: Good }[] = []
  if (d.sentiment) {
    const prev = judgedLevel(d.sentiment.prev, d.sentiment.prevJudged)
    const now = judgedLevel(d.sentiment.now, d.sentiment.nowJudged)
    out.push({
      label: 'Tone',
      value: prev && now ? `${prev} judged to ${now} positive` : UNCOUNTED,
      ...(prev && now ? { copy: 'level' as const } : {}),
      verdict: d.sentiment.verdict,
      good: 'up',
    })
  }
  if (d.share) {
    const prev = shareLevel(d.share.prev)
    const now = shareLevel(d.share.now)
    out.push({
      label: 'Share',
      value: prev && now ? `${prev} to ${now}` : UNCOUNTED,
      ...(prev && now ? { copy: 'level' as const } : {}),
      verdict: d.share.verdict,
      good: 'up',
    })
  }
  if (d.newThemes) out.push({ label: 'New', value: d.newThemes.count ? `${fmtCount(d.newThemes.count)} new: ${d.newThemes.labels.slice(0, 3).join(', ')}` : 'Nothing confirmed new this update' })
  if (d.conversations) {
    out.push({
      label: 'Volume',
      // COMMENTS (wave 3, `sales`-5). `run.conversations` is
      // `run_summary.period_comments` — which is what `methodRows` calls it,
      // four hundred lines down this same file.
      value: `${fmtCount(d.conversations.now)} comments, against ${fmtCount(d.conversations.prev)} last update`,
      count: d.conversations.now - d.conversations.prev,
      good: 'neutral',
    })
  }
  return out
}

/**
 * One row of "what moved": the levels, then the badge that judges the
 * difference between them.
 *
 * IT IS A COMPONENT SO THE MARKER IS TESTABLE. The row used to be written
 * inline in `StandingPage`, which is not exported, so the only check anywhere
 * near it ran the copy contract over a hand-built `<span>{value}</span>` — an
 * unmarked node, which produces no copy node at all, so the assertion passed
 * on "99%" and on the empty string alike. The value of a calibrated share now
 * renders under `data-copy="level"`, which is what makes rule (b) — a level
 * prints its "of N" — actually read these two figures, on the real markup the
 * page prints. The lines that are a plain count or a list of theme labels
 * claim no level and mark nothing, exactly as before.
 */
export function MovementLine({ line }: { line: ReturnType<typeof movementLines>[number] }) {
  return (
    <dd className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[15px] leading-[1.4] text-foreground">
      <span {...(line.copy ? { 'data-copy': line.copy } : {})}>{line.value}</span>
      {line.verdict ? <MovementBadge verdict={line.verdict} unit="pts" good={line.good} /> : null}
      {line.count != null ? <CountBadge delta={line.count} good={line.good} /> : null}
    </dd>
  )
}

/** What the conversation was about this update: the merged concerns with the
 *  conversations behind them and how long each has been running. The findings
 *  pick three; this is the field they were picked from. */
function ConcernField({ meta }: { meta: string }) {
  const rows = parseMeta<{ label: string; total: number; trajectory: string }[]>(meta, [])
    .filter((r) => r && typeof r.label === 'string' && Number.isFinite(r.total))
    // Same gate as the finding page's pill: the counts are this update's and
    // stay; the history word beside them is withdrawn, frozen or not (D1).
    .map((r) => ({ ...r, trajectory: shownTrajectory(r.trajectory) }))
  if (!rows.length) return null
  const max = Math.max(...rows.map((r) => r.total), 1)
  return (
    <div className="flex flex-col gap-2.5">
      <Eyebrow>What the conversation was about this update</Eyebrow>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-4">
            <span className="w-[46px] shrink-0 text-right font-mono text-[15.5px] tabular-nums text-foreground">{fmtCount(r.total)}</span>
            <span className="h-[8px] w-[92px] shrink-0 rounded-[3px] bg-neutral-seg"><span className="block h-full rounded-[3px] bg-primary" style={{ width: `${Math.max(6, (r.total / max) * 100)}%` }} /></span>
            <span className="flex-1 truncate text-[16px] text-foreground">{r.label}</span>
            {r.trajectory && <span className="shrink-0"><Pill tone={r.trajectory.startsWith('new') ? 'new' : 'plain'}>{r.trajectory}</Pill></span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function StandingPage({ page, data }: { page: DocPage; data: DocumentSnapshotData }) {
  const block = page.blocks.find((b) => b.field === 'standing')
  const parties = parseMeta<string[]>(page.meta?.parties, []).filter((x) => typeof x === 'string' && x)
  const moved = movementLines(data)
  const READ = 'text-[19px] leading-[1.55] text-foreground'
  return (
    <div className="grid h-full min-h-0 grid-cols-[7fr_5fr] gap-x-12">
      <div className="flex min-h-0 flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Eyebrow>How it reads</Eyebrow>
          {block?.text && <BlockSlot block={block} textClass={`max-w-[62ch] ${READ}`}><Paragraphs text={block.text} figures={data.figures} className={`max-w-[62ch] ${READ}`} /></BlockSlot>}
        </div>
        <ConcernField meta={page.meta?.concerns ?? ''} />
      </div>
      <div className="flex min-h-0 flex-col gap-4">
        <StandingBars data={data} parties={parties} />
        <div className={`${CARD} px-6 py-5`}>
          <Eyebrow className="mb-3">What moved since the previous update</Eyebrow>
          <dl className="grid grid-cols-[64px_1fr] gap-x-4 gap-y-2.5">
            {moved.map((m) => (
              <Fragment key={m.label}>
                <dt className="pt-[2px] font-mono text-[12px] uppercase tracking-[0.06em] text-muted-foreground">{m.label}</dt>
                <MovementLine line={m} />
              </Fragment>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}

// ── what is claimed and what comes back ────────────────────────────────────
// The market brief's own page. One card per claim the company makes in its
// videos: the claim as it was made, the verdict the analysis reached, what
// the audience says back, and the researcher's read of the difference.

const VERDICT_WORD: Record<string, { word: string; tone: 'you' | 'comp' | 'new' | 'plain' }> = {
  echoes: { word: 'the audience says it too', tone: 'you' },
  contradicts: { word: 'the audience says otherwise', tone: 'new' },
  silent: { word: 'the audience does not take it up', tone: 'plain' },
}

function SayHearPage({ page, figures, company }: { page: DocPage; figures: FigureTable; company: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <p className="max-w-[92ch] text-[16.5px] leading-[1.5] text-secondary-foreground">
        {`What ${company} says in its own videos, set against what the conversation does with it. The verdict is the analysis’s; the reading is the researcher’s.`}
      </p>
      <ul className="grid min-h-0 grid-cols-2 items-start gap-6">
        {page.blocks.map((b) => {
          const verdict = VERDICT_WORD[b.items?.[0] ?? ''] ?? null
          const theySay = b.items?.[1] ?? ''
          return (
            <li key={b.id} className={`${CARD} flex min-h-0 flex-col gap-3 px-7 py-5`}>
              <div className="flex items-start justify-between gap-4">
                <p className="max-w-[40ch] font-serif text-[19px] italic leading-[1.4] text-foreground">&ldquo;{b.label}&rdquo;</p>
                {verdict && <span className="shrink-0"><Pill tone={verdict.tone}>{verdict.word}</Pill></span>}
              </div>
              {theySay && (
                <p className="border-l-2 border-border pl-3.5 text-[15px] leading-[1.45] text-secondary-foreground">{theySay}</p>
              )}
              {b.text && <BlockSlot block={b} textClass={BODY}><Paragraphs text={b.text} figures={figures} className={BODY} /></BlockSlot>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ── what the audience asks ─────────────────────────────────────────────────
// The content brief's page: the questions the conversation puts and nobody
// settles, in the audience's own framing. Written as "the question: what is
// behind it", split the way the language page splits its own lines.

function AskedPage({ page }: { page: DocPage }) {
  const block = page.blocks.find((b) => b.field === 'asked')
  const items = block?.items ?? []
  return (
    // The framing is `PAGE_NOTE.asked`.
    <div className="flex h-full min-h-0 flex-col gap-5">
      {block && (
        <BlockSlot block={block} textClass={BODY_SM}>
          <ol className="grid grid-cols-2 gap-x-8 gap-y-4">
            {items.map((x, i) => {
              const m = /^["“]?([^:"”]+)["”]?:\s*(.+)$/.exec(x)
              return (
                <li key={i} className="flex gap-4">
                  <span className="w-5 shrink-0 pt-[3px] font-mono text-[14.5px] tabular-nums text-primary">{i + 1}</span>
                  <div className="flex flex-col gap-1">
                    <p className="text-[18.5px] font-medium leading-[1.35] text-foreground">{m ? `${m[1].trim()}?`.replace(/\?\?$/, '?') : x}</p>
                    {m && <p className={BODY_SM}>{m[2].replace(/^./, (c) => c.toUpperCase())}</p>}
                  </div>
                </li>
              )
            })}
          </ol>
        </BlockSlot>
      )}
    </div>
  )
}

// ── personas ───────────────────────────────────────────────────────────────

const PERSONA_LABELS = ['Who they are', 'What they want', 'What stops them', 'What moves them']

function PersonaCard({ block, figures, lens }: { block: DocBlock; figures: FigureTable; lens: DocLens }) {
  const [one, ...rest] = block.items ?? []
  return (
    <div className={`${CARD} flex min-h-0 flex-col gap-3 px-7 py-5`}>
      <div className="flex flex-col gap-1.5">
        <p className="text-[24.5px] font-semibold tracking-[-0.015em] text-foreground">{block.label}</p>
        {one && <p className="font-serif text-[16.5px] italic leading-[1.5] text-secondary-foreground">{one}</p>}
      </div>
      <div className="flex flex-col gap-3">
        {rest.map((it, i) => (
          <div key={i} className="flex gap-4">
            <p className="w-[104px] shrink-0 pt-[3px] font-mono text-[12px] uppercase leading-[1.3] tracking-[0.08em] text-muted-foreground">{PERSONA_LABELS[i + 1]}</p>
            <p className="text-[15px] leading-[1.45] text-foreground">{it}</p>
          </div>
        ))}
        {block.text && (
          <div className="flex gap-4 border-t border-border pt-3">
            <p className="w-[104px] shrink-0 pt-[3px] font-mono text-[12px] uppercase tracking-[0.08em] text-primary">{lens.short}</p>
            <BlockSlot block={block} textClass="text-[15px] font-medium leading-[1.45] text-foreground"><p className="text-[15px] font-medium leading-[1.45] text-foreground"><Figured text={block.text} figures={figures} /></p></BlockSlot>
          </div>
        )}
      </div>
    </div>
  )
}

function PersonasPage({ page, figures, lens }: { page: DocPage; figures: FigureTable; lens: DocLens }) {
  return (
    <div className="grid h-full min-h-0 grid-cols-2 items-start gap-x-8">
      {page.blocks.map((b) => <PersonaCard key={b.id} block={b} figures={figures} lens={lens} />)}
    </div>
  )
}

// ── language ───────────────────────────────────────────────────────────────

function LanguagePage({ page }: { page: DocPage }) {
  const careBlock = page.blocks.find((b) => b.field === 'care')
  const items = careBlock?.items ?? []
  return (
    // The framing is `PAGE_NOTE.language`, so the body starts at the cards.
    <div className="flex h-full min-h-0 flex-col gap-5">
      <BlockSlot block={careBlock!} textClass={BODY_SM}>
      <ul className="grid grid-cols-2 gap-5">
        {items.map((x, i) => {
          const m = /^["“]?([^:"”]+)["”]?:\s*(.+)$/.exec(x)
          return (
            <li key={i} className={`${CARD} flex flex-col gap-1.5 px-6 py-4`}>
              <p className="flex items-center gap-2.5 text-[20px] font-semibold text-foreground">
                <span className="inline-block h-[10px] w-[10px] shrink-0 rounded-full bg-warning" aria-hidden />
                <span>{m ? m[1].trim() : x}</span>
              </p>
              {m && <p className={BODY_SM}>{m[2].replace(/^./, (c) => c.toUpperCase())}</p>}
            </li>
          )
        })}
      </ul>
      </BlockSlot>
    </div>
  )
}

// ── who is moving, and which way (sales.p5) ────────────────────────────────

/** "375 of 1,388 category videos" — the figure and the population it is a
 *  share of, as one level node, under the artboard's dotted rule.
 *
 *  THE PAIR IS THE LEVEL, which is `FigureCell`'s rule applied to a sentence
 *  rather than to a cell: a bare "375" is a figure and "375 of 1,388 category
 *  videos" is a measurement, and rule (b) reads the whole node. The dotted
 *  underline is the artboard's own device for "this number has a denominator
 *  under it". */
function Counted({ k, n, of }: { k: number | string; n: number | string; of: string }) {
  return (
    <span data-copy="level" className="text-foreground underline decoration-muted-foreground decoration-dotted decoration-1 underline-offset-[3px]">
      <span className="font-mono tabular-nums">{k}</span> of <span className="font-mono tabular-nums">{n}</span> {of}
    </span>
  )
}

/**
 * The switching sheet (`sales.p5`).
 *
 * WHAT THE ARTBOARD DRAWS AND WHAT IS ACTUALLY HELD. The mock's sheet is "12
 * videos · 7 toward Sealand · 5 away", a two-segment bar, a reconciliation
 * sentence, and two quotes labelled Toward and Away with a counted line under
 * each. Four of those five are `switchingFigure` and `crosscheckLine`,
 * verbatim. The fifth is not: NOTHING IN THE PRODUCT LABELS A QUOTE WITH A
 * LEAN. The lean is `videos.sentiment` on the video, a quote belongs to a
 * comment under it, and inventing the join would be a direction claim about a
 * customer's words that nobody measured. So the sheet prints the split, the
 * bar, the pool and the refusal — and says, once, that it cannot label a
 * voice.
 *
 * AND THE BASIS IS ON THE FACE OF IT (D9). This is the one figure in the
 * package that is not comment-dated: a video that names both is a property of
 * the VIDEO, so it is dated by `upload_date` — a third clock — and
 * `SwitchingFigure.basis` is the sentence that says so, printed beside the
 * number rather than in the method page.
 */
function SwitchingPage({ data }: { data: DocumentSnapshotData }) {
  const f = data.slideFigures?.switching ?? null
  if (!f) return null
  const pct = (k: number) => (f.pool > 0 ? (k / f.pool) * 100 : 0)
  return (
    <div className="grid h-full min-h-0 grid-cols-[7fr_5fr] gap-x-12">
      <div className="flex min-h-0 flex-col gap-4">
        <div className="flex items-end gap-6">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="flex items-baseline gap-2">
              <span data-copy="figure" className="font-mono text-[42px] font-medium leading-none tracking-[-0.02em] tabular-nums text-foreground">{fmtCount(f.pool)}</span>
              <span className="text-[13.5px] font-medium text-muted-foreground">{f.pool === 1 ? 'video' : 'videos'}</span>
            </span>
            {/* A COUNT, AND NO "of N" (D8). The artboard prints "12 of 1,388
                category videos", which is a numerator over somebody else's
                denominator twice over: the pool is the tenant's OWN videos,
                and it is dated by `upload_date` while the category's month is
                dated by the comment. There is no honest denominator for it, so
                it is printed as the count it is and the population is named in
                words. The SPLIT below has one — the pool itself — and carries
                it. */}
            <p className="text-[14px] text-muted-foreground">of {data.company}&rsquo;s own videos this month, and each of them also named a tracked rival</p>
          </div>
          {/* The badge, and nothing beside it. The mock writes "no earlier
              figure for this one"; the closed vocabulary's own word for that
              state is `baseline_forming`, "not enough months yet", and
              `ClaimBadge` is what picks it — the pool cleared both floors, so
              "too few to compare" would be a sentence the number beside it
              refutes. */}
          <span className="ml-auto shrink-0"><ClaimBadge verdict={f.verdict} unit="pts" /></span>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex h-[10px] w-full shrink-0 gap-0.5 overflow-hidden rounded-full bg-neutral-seg">
            <span className="block h-full rounded-l-full bg-primary" style={{ width: `${pct(f.toward.k)}%` }} />
            <span className="block h-full rounded-r-full bg-negative" style={{ width: `${pct(f.away.k)}%` }} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            {/* THE LEGEND IS NOT A DOTTED FIGURE. The artboard's dotted rule
                marks a number whose denominator is spelled out beside it; in a
                legend the "of 12" IS the sentence, and underlining it twice
                reads as two devices for one idea. It is still a level node, so
                rule (b) reads it. */}
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
              <span data-copy="level">Toward {data.company} <span className="font-mono tabular-nums text-foreground">{fmtCount(f.toward.k)}</span> of <span className="font-mono tabular-nums text-foreground">{fmtCount(f.pool)}</span></span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-negative" aria-hidden />
              <span data-copy="level">Away from {data.company} <span className="font-mono tabular-nums text-foreground">{fmtCount(f.away.k)}</span> of <span className="font-mono tabular-nums text-foreground">{fmtCount(f.pool)}</span></span>
            </span>
          </div>
          {f.unread && <p className="text-[14px] leading-[1.45] text-muted-foreground">{f.unread}</p>}
        </div>

        {/* THE BASIS SITS AT THE FOOT, where the artboard's confidence rail
            does (P0 item 2's `distribute="between"`, applied to a sheet). The
            column packs to the top and this block takes the slack, rather than
            the whole column spreading and opening a hole between the figure
            and its own bar. */}
        <div className="mt-auto flex flex-col gap-2 border-t border-border/70 pt-3">
          {/* THE BASIS, BESIDE THE NUMBER. A third clock on a month-stamped
              sheet, and a reader who is not told will read it as the month's. */}
          <p className="text-[14px] leading-[1.45] text-muted-foreground">Counted over {f.audienceLabel}, {f.basis}.</p>
          {/* The one thing the artboard asks for that nothing measured. */}
          <p className="text-[14px] leading-[1.45] text-muted-foreground">
            Which way a video leaned is read from what was stored about the video, not from any one comment under it, so no quote on this sheet is labelled toward or away.
          </p>
        </div>
      </div>

      <div className={`${CARD} flex min-h-0 flex-col gap-3.5 px-6 py-5`}>
        <Eyebrow>How to read these</Eyebrow>
        <p className="font-mono text-[13.5px] leading-[1.5] text-muted-foreground">
          <span className="text-foreground">{fmtCount(f.toward.k)}</span> toward · <span className="text-foreground">{fmtCount(f.away.k)}</span> away · <span className="text-foreground">{fmtCount(f.neither.k)}</span> neither · <span className="text-foreground">{fmtCount(f.pool)}</span> in all
        </p>
        {data.slideFigures?.crosscheck && (
          <p className={BODY_SM}>{data.slideFigures.crosscheck}</p>
        )}
        <div className="mt-auto flex flex-col gap-1.5 border-t border-border pt-3">
          <Eyebrow>Measured on</Eyebrow>
          {/* `measurement_changed` rides this figure by construction
              (figures.ts): `videos.sentiment` is the one production column two
              writers have written with two meanings. */}
          <p className="text-[14px] leading-[1.45] text-muted-foreground">
            What was stored about each video. That column has been written by two different readings of tone, so the split is a lead rather than a rule.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * "This brief in numbers" (`mkt.p7.numbers`).
 *
 * THE SHARPEST DEVIATION ON THE DECK, FIXED. `data.method.conversations` and
 * `.videos` are `run_summary.period_comments` / `period_videos` — an UPDATE's
 * two biggest counts, printed under a month stamp in the row above them, three
 * inches from a basis paragraph stating the month's own denominators from
 * `month_denominators`. Two measurements of one quantity on one sheet, which is
 * the thing `lib/reports/documents/reading.ts` says in its header it exists to
 * prevent. Where the brief HAS a reading, this card is the reading's.
 *
 * Eight rows against the six the card printed: the artboard's "The unit" and
 * its language share are added, `Sources` becomes the mix as SHARES rather
 * than a list of names, `Held back` becomes the comparisons this reading
 * refused (the phrase count keeps its place where there is no reading), and
 * `Findings` states both sides of the bar.
 *
 * NOT THE ARTBOARD'S "trailing median 2,240" and not its "4 updates": neither
 * is computed anywhere in the product, and a median invented at render would
 * be a figure with no basis on the sheet that explains the basis.
 */
/** The last day of a month, as a date — `2026-09-01` → `2026-09-30`. The
 *  period a month reading covers ends here; `readingAt` is when we looked. */
function monthLastDay(month: string): string {
  return new Date(new Date(`${nextMonth(month)}T00:00:00.000Z`).getTime() - 86_400_000).toISOString()
}

export function methodRows(data: DocumentSnapshotData): [string, string][] {
  const m = data.method
  // THE BASIS IS DECIDED ONCE, FOR THE WHOLE CARD (fix pass). Every row used to
  // guard independently — `Period` on `r`, `Conversations` on `r && comments`,
  // `Videos` on `r && category`, `Sources` on a non-empty mix — so a reading
  // whose denominators had not been written (the state AGENTS.md says every
  // reader has to survive) printed the MONTH's period and platform mix beside
  // the UPDATE's comment and video counts. That is the same two-measurements-
  // of-one-quantity defect this card was rewritten to close, one branch over.
  // A reading with no denominators is not a reading for this card's purposes.
  const r = data.reading && data.reading.denominators.length > 0 ? data.reading : null
  const category = r?.denominators.find((d) => d.audience === 'industry-other') ?? r?.denominators[0] ?? null
  const comments = r ? r.denominators.reduce((n, d) => n + d.comments, 0) : 0
  const refused =
    (r?.verdicts ?? []).filter((v) => v.state === 'refused').length +
    (r?.gaps ?? []).filter((g) => g.state === 'refused').length
  const findings = data.pages.filter((p) => p.kind === 'finding').length
  const below = m.findingsBelow ?? 0
  const held = m.findingsHeld ?? 0
  const rows: [string, string][] = [
    // THE PERIOD ENDS WHEN THE MONTH ENDS, NOT WHEN WE LOOKED. This printed
    // `month start → readingAt`, and `readingAt` is the instant we read: a
    // September month re-read on 2 December printed "Period 1 Sep 2026 → 2 Dec
    // 2026" on the one sheet whose job is to state the basis. The quarterly's
    // identical row already prints "1 Jul – 30 Sep 2026" with "still filling"
    // as a separate note, and the reading instant is on every sheet's stamp.
    ['Period', r ? `${shortDate(r.month)} – ${fullDate(monthLastDay(r.month))}${r.monthStatus === 'filling' ? ' · still filling' : ''}` : m.period],
    // COMMENTS, NEVER "CONVERSATIONS" (lib/calibration.ts GLOSSARY: a
    // conversation is one video and the comments it sparked, and comments are
    // always counted separately as comments). Two rows below, this card defines
    // the unit as "a video with at least one analysed comment" — so the old
    // label contradicted its own table. The quarterly was fixed for this reason
    // and its fix is pinned (lib/pages/quarterly.test.ts).
    ['Comments', r ? `${fmtCount(comments)} read in ${r.monthLabel}` : fmtCount(m.conversations)],
    [
      'Videos',
      r && category
        ? `${fmtCount(category.videos)} in ${category.label}${r.denominators.filter((d) => d !== category).map((d) => ` · ${fmtCount(d.videos)} in ${d.label}`).join('')}`
        : `${fmtCount(m.videos)} · ${fmtCount(m.clientVideos)} ${data.company} · ${fmtCount(m.competitorVideos)} competitor`,
    ],
    [
      'Sources',
      (r ? platformShareLine(r.platformMix) : '') || m.sources.map((s) => PLATFORM[s] ?? s).join(', ') || 'public video platforms',
    ],
    [
      'Held back',
      r && refused > 0
        ? `${refused} ${refused === 1 ? 'comparison' : 'comparisons'} refused${m.heldBack ? ` · ${fmtCount(m.heldBack)} phrases in other languages` : ''}`
        : `${fmtCount(m.heldBack)} phrases in other languages`,
    ],
    // BOTH SIDES OF THE BAR, AND THE CAP IS A THIRD THING. The bar is the
    // conversations floor; a finding that cleared it and was not printed was
    // held back by the template's cap, which is not an evidence failure and may
    // not be counted as one.
    [
      'Findings',
      `${findings} printed${held > 0 ? ` of ${findings + held} above the bar` : ' above the bar'}`
      + `${below > 0 ? ` · ${below} below it` : ''}${m.thin ? ' (thin update)' : ''}`,
    ],
    // The artboard's own definition, and the reason every count on this deck
    // is comparable with every other: the unit is a VIDEO, never a comment.
    ['The unit', 'a video with at least one analysed comment'],
  ]
  if (m.languages) rows.push(['Languages', m.languages])
  return rows
}

// E-MARKETING'S `MethodPage` STOOD HERE (merge, Block D wave 2). Both packages
// ported this sheet and the deck can only have one: the surviving one is
// E-sales's, below, because its left column carries the band rule, the quote
// rule and `CannotTell` — which prints the same "What this brief cannot tell
// you" box E-marketing's did, in the record's own words. What E-marketing's
// card had and that one did not has moved INTO `NumbersCard`: the delivery
// record under the hairline, and any row `methodRows` names that the sales
// card has no answer for. `methodRows` is still the marketing brief's row set
// and is still exported and tested.

// ── answers you can use (sales.p6) ─────────────────────────────────────────

/**
 * The "Say this" sheet (`sales.p6`).
 *
 * THE ONE PLACE THE MOCK ASKS FOR PROSE THE PRODUCT DOES NOT WRITE. Its card
 * is objection → a scripted sentence → a "Because" list. The objection and
 * every figure under it are counted and printed; the SENTENCE is a model's and
 * there is no drafted one on any workspace, so the row prints its counts and
 * no script rather than a sentence this code invented. `ScriptedLine.say` is
 * already scrubbed under `document_write` where a draft exists, so a digit the
 * model typed has already cost its sentence before it reaches here.
 *
 * "BECAUSE" AND "ALSO RUNNING" ARE TWO LISTS BECAUSE THEY ARE TWO CLAIMS.
 * Because is causal and the product refuses causal claims it has not measured;
 * the three biggest subjects of a category month are not reasons for a KIND's
 * share — different denominators, no measured relation, and the same three
 * would sit under every objection whatever it was. They are printed as what
 * they are.
 *
 * ONE ROW, AND IT SAYS WHY. `theme_registry` carries no kind column, so the
 * only place an objection is counted on this corpus is the aggregate kind
 * share: one row, with no registry identity, rather than several the reading
 * cannot substantiate.
 */
function ScriptedPage({ data }: { data: DocumentSnapshotData }) {
  const lines = data.slideFigures?.scripted ?? []
  if (lines.length === 0) return null
  const list = (label: string, rows: { label: string; value: { k: number; n: number } }[]) => (
    <>
      <p className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">{label}</p>
      <ul className="flex flex-col gap-[7px]">
        {rows.map((b, i) => (
          <li key={i} className="flex gap-2.5 text-[14.5px] leading-[1.45] text-foreground">
            <span className="mt-[7px] inline-block h-[6px] w-[6px] shrink-0 rounded-full bg-primary" aria-hidden />
            <span>{b.label} — <Counted k={fmtCount(b.value.k)} n={fmtCount(b.value.n)} of="videos" /></span>
          </li>
        ))}
      </ul>
    </>
  )
  return (
    // `items-start`, NOT `items-stretch`. One card in a three-column grid was
    // stretched to the full slide and its footnote pinned to the foot by
    // `mt-auto`, so the sheet drew an L with a 900 × 700 hole in the middle of
    // it: a 350px void inside the card, and the explanation bottom-anchored in
    // the two columns beside it. The mock's three cards are the same height
    // because they hold the same amount; a card holds what it holds.
    <div className="grid h-full min-h-0 grid-cols-3 items-start gap-x-5">
      {lines.slice(0, 3).map((line, i) => (
        <div key={i} className={`${CARD} flex min-h-0 flex-col gap-3 px-[22px] py-5`}>
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] font-semibold text-foreground">{line.objection.label}</h2>
            <p className="text-[14px] text-muted-foreground">
              <Counted k={fmtCount(line.objection.value.k)} n={fmtCount(line.objection.value.n)} of="videos" />
            </p>
          </div>
          <p className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">Say this</p>
          {line.say
            ? <blockquote className="m-0 rounded-md bg-inner px-3.5 py-3 font-serif text-[15.5px] italic leading-[1.5] text-secondary-foreground">{line.say}</blockquote>
            : <p className={BODY_SM}>No sentence has been written for this one yet. The counts under it are the reading; the line to say is not something this brief will make up.</p>}
          {line.because.length > 0 && list('Because', line.because)}
          {line.alsoRunning.length > 0 && list('Also running this month', line.alsoRunning)}
          {line.quote?.text && (
            <div className="mt-1">
              {/* A SIBLING NODE WITH ITS OWN REF, never a span inside scrubbed
                  prose: rule (c) may not police a commenter's words, and a
                  number inside a quotation is still refused. */}
              <QuoteBlock quote={line.quote} mode="print" />
            </div>
          )}
          <p className="border-t border-border pt-2.5 font-mono text-[11.5px] leading-[1.4] text-muted-foreground">
            {line.objection.source === 'kind'
              ? 'Counted as a kind of thing said, over the whole month — not as a theme of the register.'
              : 'Counted as a theme of the register.'}
          </p>
        </div>
      ))}
      {lines.length < 3 && (
        // A NOTE IN A DECK OF CARDS IS STILL ON A CARD (wave 3, `sales`-9).
        // With fewer than three scripted lines this column was a naked eyebrow
        // and a paragraph laid straight on the sheet beside a bordered card —
        // the only bare column in the whole deck, and on the sales brief it is
        // two thirds of the sheet's width. It takes the sibling card's
        // padding, on the TINT this deck already uses for apparatus ("Not
        // settled this update"), and not the card's border and white ground:
        // it is the reason there is one answer, not a second answer.
        <div
          className="flex min-h-0 flex-col gap-2 self-start rounded-lg bg-inner px-[22px] py-5"
          style={{ gridColumn: `span ${3 - Math.min(lines.length, 3)}` }}
        >
          <Eyebrow>Why there is one of these</Eyebrow>
          <p className={BODY_SM}>
            An objection is counted as a kind of thing said, and the register that names themes carries no kind. So this sheet has one row per month rather than one per objection, and it will have more the day a theme can be an objection.
          </p>
        </div>
      )}
    </div>
  )
}

// ── method ─────────────────────────────────────────────────────────────────

/**
 * The numbers card (`sales.p7.numbers`).
 *
 * The card's ANATOMY was already the artboard's — a 130px mono gutter, six
 * rows, hairline above the footnote. Every row's CONTENT differed, and three
 * of the six were wrong rather than merely thin:
 *
 *  · "Videos: 1,388 · 84 Sealand · 356 competitor" SUMMED the rivals, which
 *    double-counts a video naming two of them — `compose.ts` warns about
 *    exactly this in `AUDIENCE_SUMMED_VIDEO_FIGURES`, and then the method card
 *    printed the sum anyway. The row is now one audience per entry, off the
 *    reading's own denominators, which is what the artboard draws too (D8).
 *  · "Sources: TikTok, YouTube, Instagram, Reddit" was a NAME LIST. A share of
 *    a corpus that is 90% one platform is a statement about that platform, so
 *    the row is the mix as shares (`platformShareLine`).
 *  · "Findings: 1" had no denominator. The count of findings BELOW THE BAR was
 *    computed on every build and kept in the workings; without it the row says
 *    nothing about how selective the reading was.
 *
 * AND THE LABEL FOLLOWS THE UNIT. The artboard's own row reads `Conversations`
 * over "2,359 videos analysed", which is the label and the unit disagreeing
 * (D10). Comments are comments (`lib/calibration.ts` GLOSSARY) and the row
 * says so.
 */
function NumbersCard({ data }: { data: DocumentSnapshotData }) {
  const m = data.method
  const r = data.reading ?? null
  const comments = r ? commentsRead(r.denominators) : m.conversations
  const refusals = data.slideFigures?.cannotTell.refusals ?? []
  const findings = data.pages.filter((p) => p.kind === 'finding').length
  const dropped = m.dropped ?? null
  const mix = r ? platformShareLine(r.platformMix) : ''
  const rows: [string, ReactNode][] = [
    // THE SAME PERIOD ROW `methodRows` SETTLED, 170 LINES UP (wave 3). `stamp`
    // is the long form — "September 2026 · reading as at 28 September 2026 ·
    // still filling until 30 October 2026" — which is three lines in a 130px
    // gutter card, and every clause of it is already on this sheet: the
    // reading instant rides the footer stamp and the first method paragraph,
    // and the freeze date is the row's own last clause. A period row says what
    // period the reading covers, and that ends when the month ends.
    ['Period', r ? `${shortDate(r.month)} – ${fullDate(monthLastDay(r.month))}${r.monthStatus === 'filling' ? ' · still filling' : ''}` : m.period],
    // 'Comments' EITHER WAY (wave 3, `sales`-5). Without a reading the value is
    // `method.conversations`, which is `run_summary.period_comments` and which
    // `methodRows` labels Comments unconditionally — so the no-reading arm was
    // the same row under the one word this card's own "The unit" row refutes.
    ['Comments', `${fmtCount(comments)} read${r ? ` in ${r.monthLabel}` : ''}`],
    [
      'Videos',
      r && r.denominators.length > 0
        // NEVER SUMMED: one entry per audience, named.
        ? r.denominators.map((d) => `${fmtCount(d.videos)} ${d.label}`).join(' · ')
        : `${fmtCount(m.videos)} · ${fmtCount(m.clientVideos)} ${data.company} · ${fmtCount(m.competitorVideos)} competitor`,
    ],
    ['Sources', mix || m.sources.map((x) => PLATFORM[x] ?? x).join(', ') || 'public video platforms'],
    [
      'Held back',
      [
        refusals.length > 0
          ? `${fmtCount(refusals.length)} ${refusals.length === 1 ? 'comparison' : 'comparisons'} not drawn`
          : '',
        m.heldBack > 0 ? `${fmtCount(m.heldBack)} phrases in other languages read for the counts, not quoted` : '',
      ].filter(Boolean).join(' · ') || 'Nothing was held back.',
    ],
    [
      'Findings',
      // "NOT CARRIED", NOT "BELOW THE BAR". The denominator is the real
      // improvement on a bare "1" and it stays; the REASON is not one reason.
      // `DocumentWorkings.dropped` is seeded with the structural check's own
      // rejections and then collects three different events — "no headline
      // survived scrub", "rests on no grounded point" and "too thin: N
      // conversations" (compose.ts). Only the last is a bar, so "3 below the
      // bar" states a reason that is true of at most one of the three. The
      // count says the same thing about how selective the reading was, and
      // claims nothing about why.
      dropped != null
        ? `${fmtCount(findings)} of ${fmtCount(findings + dropped)} written · ${fmtCount(dropped)} not carried${m.thin ? ' · thin update' : ''}`
        : `${fmtCount(findings)}${m.thin ? ' (thin update)' : ''}`,
    ],
  ]
  // E-MARKETING'S ROWS THAT THIS CARD HAS NO ANSWER FOR (merge). The six above
  // are the sales artboard's, and their wording is what its tests pin; the
  // marketing artboard names two more — "The unit" and "Languages" — and a
  // brief that lost them to a merge would be a brief whose basis got quieter.
  const extra = methodRows(data).filter(([k]) => !rows.some(([j]) => j === k))
  return (
    <div className={`${CARD} self-start px-6 py-5`}>
      <Eyebrow className="mb-3">This brief in numbers</Eyebrow>
      <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-2.5">
        {[...rows, ...extra].map(([k, v]) => (
          <Fragment key={k}>
            <dt className="pt-[3px] font-mono text-[12px] uppercase tracking-[0.06em] text-muted-foreground">{k}</dt>
            <dd className="text-[15.5px] leading-[1.4] text-foreground">{v}</dd>
          </Fragment>
        ))}
      </dl>
      {/* `sales.p7.footnote` — five sentences the product has composed on every
          reading since wave 1 and no document has ever printed. Two of them are
          on a different clock from the sheet they sit on, and `basis` is the
          clause that says which (D15). */}
      {data.reading?.method && (
        <p className="mt-4 border-t border-border pt-3 font-mono text-[11.5px] leading-[1.5] text-muted-foreground">
          {[data.reading.method.basis, data.reading.method.language, data.reading.method.redditCap, data.reading.method.privacy]
            .filter(Boolean)
            .join(' ')}
        </p>
      )}
      {/* Under the hairline because it is the one line on this card that is NOT
          a month reading: the delivery record is dated by the run, and says so
          in its own words (E-marketing, `mkt.p7.delivery`). */}
      {data.method.delivery && (
        <p className="mt-3 border-t border-border pt-3 text-[14px] leading-[1.45] text-muted-foreground">{data.method.delivery}</p>
      )}
    </div>
  )
}

/**
 * What this brief cannot tell you (`sales.p7.cannottell`).
 *
 * THE CHEAPEST ELEMENT IN THE PACKAGE AND THE ONE THAT MATTERS MOST. The
 * refusals are the product's own honesty machinery: computed on every brief's
 * reading, and thrown away at the door until wave 1 gave them a shape and wave
 * 2 a sheet. Every string here is the RECORD's own — `refusedSentence` and
 * `REFUSAL_WHY` — so a brief and Settings › The record cannot come to say
 * different things about one refusal.
 *
 * THE CAUSATION LINE IS THE PRODUCT'S OWN PROMISE, not a sentence written for
 * this card: `MOVE_PROMISE` is what the moves list prints over itself, and the
 * artboard asks for it here in the same words.
 */
function CannotTell({ data }: { data: DocumentSnapshotData }) {
  const c = data.slideFigures?.cannotTell ?? null
  return (
    <div className="mt-auto flex flex-col gap-1.5 rounded-lg bg-inner px-[18px] py-3.5">
      <p className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">What this brief cannot tell you</p>
      <p className="text-[14px] leading-[1.4] text-secondary-foreground">{MOVE_PROMISE}</p>
      {/* `refusedSentence`, WHICH ALREADY NAMES EVERY REASON AND COUNTS THEM.
          `CannotTell.items` is one line per refusal and on a page with two
          refusals of two reasons it restates the summary twice; the summary is
          the one that carries the count, so it is the one that prints. Both
          are built from `REFUSAL_WHY`, so neither can say anything the record
          does not. */}
      {c && <p className="text-[14px] leading-[1.4] text-secondary-foreground">{c.line}</p>}
      {!c && <p className="text-[14px] leading-[1.4] text-secondary-foreground">Which comparisons this reading refused is not recorded for this brief.</p>}
    </div>
  )
}

function MethodPage({ page, data }: { page: DocPage; data: DocumentSnapshotData }) {
  const items = page.blocks.find((b) => b.field === 'method')?.items ?? []
  return (
    <div className="grid h-full min-h-0 grid-cols-[7fr_5fr] gap-x-12">
      <div className="flex min-h-0 flex-col gap-3">
        <Eyebrow>How this brief was made</Eyebrow>
        {items.map((it, i) => <p key={i} className={`max-w-[66ch] ${BODY}`}>{it}</p>)}
        {/* THE BAND RULE, IN THE READER'S OWN WORDS. The artboard prints it and
            the product never has: the vocabulary lives in `MOVEMENT_WORDS` and
            is stamped on badges a reader is never told the rule for. The words
            are that table's, so the sentence and the badge cannot drift. */}
        <p className={`max-w-[66ch] ${BODY}`}>
          Every figure prints how many it came from. A change is called only when it clears its band; below that it reads
          {' '}<em className="font-semibold not-italic">{MOVEMENT_WORDS.no_clear_change}</em>, and where the audience is too small it reads
          {' '}<em className="font-semibold not-italic">{MOVEMENT_WORDS.too_little_data}</em>.
        </p>
        {/* HOW A QUOTE IS PRINTED, which is the other half of the privacy
            rule and is true of this deck by construction: `QuoteBlock` prints
            the original first and the machine rendering under it, stamped. The
            artboard asks for the sentence; the product only ever printed the
            half about identification. */}
        <p className={`max-w-[66ch] ${BODY}`}>
          Quotes carry the platform, the date and where they were found. The words are printed as they were written, with an English rendering underneath — marked as a {MACHINE_TRANSLATION_STAMP} — where they were not in English.
        </p>
        <CannotTell data={data} />
      </div>
      <NumbersCard data={data} />
    </div>
  )
}

// ── deck ───────────────────────────────────────────────────────────────────

/**
 * The serif line under a sheet's title, for the sheets that have no section
 * map entry to carry one.
 *
 * A BORROWED SECTION HAS `framing`, and the artboard draws one on every sheet
 * that is not the cover. These two are page kinds, so the line lives here —
 * the same slot (`Slide.note`), the same 12.5px serif italic, the artboard's
 * own words. The other page kinds keep no note, because each already opens
 * with its own lead paragraph.
 */
/**
 * The sheet's PLACE in the brief, for the page kinds (`sales.p2.header`).
 *
 * `BriefBlockSection.context` gave the four borrowed sheets the artboard's own
 * two-word slot — "Objections", "Selling points", "Rivals" — and every PAGE
 * kind went on through `chrome`, which is `${title} · ${short}` beside an
 * `<h1>` of the same title. Five of the nine numbered sheets therefore read
 * "Who is moving, and which way · September 2026" next to "Who is moving, and
 * which way", which is the exact fault the comment on `chrome` claims to have
 * fixed. The artboard's own words are used where it has them (`Switching
 * signals`, `Grounded answers`, `Method`); the kinds this brief does not carry
 * take the same shape, because the map is shared with three other briefs.
 *
 * Absent falls back to the page's title, which is what every kind did before.
 */
const PAGE_CONTEXT: Partial<Record<DocPage['kind'], string>> = {
  in_short: 'In short',
  finding: 'Findings',
  competitor: 'Rivals',
  personas: 'Buyers',
  standing: 'Standing',
  say_hear: 'Say and hear',
  asked: 'Questions',
  language: 'Language',
  switching: 'Switching signals',
  scripted: 'Grounded answers',
  method: 'Method',
}

/**
 * A WRITTEN PAGE'S FRAMING IS THE SLIDE'S NOTE (wave 3, `sales`-8).
 *
 * Every sheet in this deck frames itself the same way — the serif italic line
 * `Slide.note` prints under the title, which is what the artboards draw and
 * what `DocumentDeck` hoists a borrowed section's `framing` into. Three
 * written pages did it differently, with a 16–17px sans paragraph as the FIRST
 * ELEMENT OF THE BODY: between the numbers card and the switching sheet the
 * language sheet read as a page out of a different document, and saying it
 * cost the sheet a row of its own data. A written page's framing belongs here,
 * beside the two that were already here, and the body starts at the content.
 *
 * Two of the three are here. `say_hear`'s framing names the COMPANY, so it is
 * not a constant and cannot be an entry in a record of strings; it keeps its
 * paragraph until this map takes a function, and it is the only sheet in the
 * deck that still frames itself in its body.
 */
const PAGE_NOTE: Partial<Record<DocPage['kind'], string>> = {
  switching: 'The videos that name both you and a rival, and which way each of them leaned — a small number, printed as it stands.',
  scripted: 'The sentence to say is a writer\u2019s; every figure under it is counted.',
  language: 'Words and claims the conversation pushes back on or contradicts. Each is a phrase a buyer will hear as a promise; the note says what the audience already knows about it.',
  asked: 'Questions the conversation puts and does not settle. Each is asked in the audience\u2019s own framing, not the company\u2019s; the note says what is behind it.',
}

/** The lens the document was written under. Older snapshots (before
 *  2026-09-02) carry none: they are all Sales briefs. */
const lensOf = (data: DocumentSnapshotData): DocLens => data.lens ?? { means: 'What it means for a sale', short: 'for a sale' }

function PageBody({ page, data, title, pages }: { page: DocPage; data: DocumentSnapshotData; title?: boolean; pages?: number }) {
  const figures = data.figures
  const lens = lensOf(data)
  switch (page.kind) {
    case 'in_short': return <OverviewPage page={page} data={data} title={title} pages={pages} />
    case 'finding': return <FindingPage page={page} figures={figures} company={data.company} lens={lens} />
    case 'competitor': return <CompetitorPage page={page} figures={figures} data={data} />
    case 'personas': return <PersonasPage page={page} figures={figures} lens={lens} />
    case 'standing': return <StandingPage page={page} data={data} />
    case 'say_hear': return <SayHearPage page={page} figures={figures} company={data.company} />
    case 'asked': return <AskedPage page={page} />
    case 'language': return <LanguagePage page={page} />
    case 'switching': return <SwitchingPage data={data} />
    case 'scripted': return <ScriptedPage data={data} />
    case 'method': return <MethodPage page={page} data={data} />
    default: return null
  }
}

/**
 * A borrowed page block, on paper (Phase 1 WP19).
 *
 * THE BLOCK DRAWS ITSELF, in `'print'` mode, from the surface data the brief
 * froze — the same body of code the page and the email call, which is what
 * makes "the report cannot say something the page cannot" true of these
 * sections rather than merely intended. A section that could not be filled
 * prints its one line instead: the block's own empty state, or the
 * missing-input sentence naming the input and who closes it.
 */
/**
/**
 * The right-hand pane of a borrowed sheet (`sales.p2` … `sales.p5`).
 *
 * WHY A BORROWED SECTION GETS ONE AT ALL. Every artboard sheet is 7fr/5fr and
 * the build drew borrowed sections full-bleed, single column, at about half the
 * density — so the mock's chart, its conclusion and its confidence rail had
 * nowhere to go, and the confidence dots existed only inside a finding page's
 * right card. The sheet says which pane it wants, in the section map, and the
 * map is the artboard read into data.
 *
 * `chart` is `slideFigures.line` — ONE SIDE, and only where three readings
 * stand behind it (D3: a chart is a direction claim too, and two points are
 * not a direction). Below that `monthLine` has already named the months
 * instead, in `monthlyLineLabel`'s own words, and the pane prints that.
 *
 * `confidence` is the reading's own, `confidenceOf` off the verdicts the
 * brief's blocks drew — not a finding's `sure` word, which is calibrated from
 * conversations and strands and belongs to one argument.
 */
function SectionPane({ section, data, why }: {
  section: DocBriefSection
  data: DocumentSnapshotData
  /** Does this sheet print the SENTENCE behind the confidence word?
   *
   *  THE WORD IS PER SHEET AND THE SENTENCE IS PER DOCUMENT. `confidence.why`
   *  is one reading's account of itself — "9 of 12 comparisons on these pages
   *  were answered against their band" — and it appeared verbatim on three
   *  consecutive sheets. The dots and the word stay on every pane, because
   *  that is the artboard's own device and a reader meets each sheet on its
   *  own; the sentence prints on the first pane of the deck, and the method
   *  sheet carries the full account. */
  why: boolean
}) {
  const line = data.slideFigures?.line ?? null
  const confidence = data.reading?.confidence ?? null
  const rail = confidence && (
    <div className="flex flex-col gap-1.5 border-t border-border pt-3">
      <p className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.08em] text-muted-foreground">
        Confidence <ConfidenceDots sure={confidence.word} /> <span className="normal-case tracking-normal text-foreground">{confidence.word}</span>
      </p>
      {why && <p className="text-[14px] leading-[1.45] text-muted-foreground">{confidence.why}</p>}
    </div>
  )
  // THE CARD HUGS ITS CONTENT (`self-start`). It used to stretch to the full
  // slide with the rail pinned to the foot by `mt-auto`, so a pane with two
  // lines in it drew a 700px empty box with a confidence rail at the bottom —
  // on five of eleven sheets. The artboard's right cards run the full height
  // because they are FULL; a card that is not full and pretends to be reads as
  // a failed render on a paid PDF, which is how both live workspaces would
  // have received it.
  const card = `${CARD} flex min-h-0 flex-col gap-4 self-start px-6 py-5`
  if (section.pane === 'chart') {
    const drawn = Boolean(line && line.series.length > 0)
    return (
      <div className={card}>
        {/* THE EYEBROW DOES NOT PROMISE A LINE THERE IS NOT. Below three
            readings nothing is drawn (D3) and the card was still headed "THE
            LINE BEHIND THESE" over four words — which is the state every
            workspace without `month_kind_readings` is in today. */}
        <Eyebrow>{drawn ? 'The line behind these' : 'The months behind these'}</Eyebrow>
        {drawn ? (
          <div className="flex flex-col gap-2.5">
            {line!.series.map((serie) => (
              <div key={serie.label} className="flex flex-col gap-1.5">
                {/* THE ONE CHART THAT IS THE ELEMENT, so it takes SH22's
                    floor and its rule (wired at the wave-3 merge; SH22 named
                    this caller and shipped with none). */}
                <DeckSpark values={serie.points} months={line!.months.map(monthLabel)} width={300} height={120} className="w-full" unit={serie.unit} zeroBase rule />
                <p className="text-[12px] leading-[1.35] text-muted-foreground">{serie.label}</p>
              </div>
            ))}
            {/* ONE SIDE, AND THE SHEET SAYS SO. The artboard draws two theme
                series against each other; the tenant's own side carries no
                month series on a subject row, which is a schema limitation and
                not a missing render. */}
            <p className="text-[12px] leading-[1.35] text-muted-foreground">
              One side. Your own audience carries no month-by-month series on a subject, so there is nothing to draw against this.
            </p>
          </div>
        ) : (
          // BOTH HALVES. `label` is which months read ("Aug → Sep only") and
          // `empty` is why that is not a line; the pane printed the first and
          // dropped the second, so the card said four words and explained
          // none of them.
          <div className="flex flex-col gap-1.5">
            <p className="font-mono text-[13.5px] text-foreground">{line?.label ?? 'no month reads'}</p>
            <p className={BODY_SM}>{line?.empty ?? 'No month series stands behind this sheet yet.'}</p>
          </div>
        )}
        {rail}
      </div>
    )
  }
  // THE DENOMINATORS ARE THE FALLBACK, NOT THE BODY. They are the same three
  // counts on every sheet and the method card prints them in full; a pane with
  // its own lead prints the lead instead, so no two panes in the deck are the
  // same card.
  const untracked = (data.slideFigures?.untracked ?? []).filter((n) => n.sections.includes(section.title))
  return (
    <div className={card}>
      <Eyebrow>{section.paneTitle ?? 'What this rests on'}</Eyebrow>
      {section.paneLead
        ? <p className={BODY_SM}>{section.paneLead}</p>
        : data.reading && (
          <p className="font-mono text-[13.5px] leading-[1.5] text-muted-foreground">
            {data.reading.denominators.map((d) => (
              <Fragment key={d.audience}>
                <span className="text-foreground">{fmtCount(d.videos)}</span> {d.label}{' · '}
              </Fragment>
            ))}
            <span className="text-foreground">{fmtCount(commentsRead(data.reading.denominators))}</span> comments read
          </p>
        )}
      {/* `sales.p4.untracked` — what is NOT tracked, beside the section rather
          than in place of it, naming the ROLE and no date (D14). Composed by
          `untrackedNotes` on every brief since wave 1 and printed by nothing. */}
      {untracked.map((n) => <p key={n.id} className={BODY_SM}>{n.line}</p>)}
      {rail}
    </div>
  )
}

/** "2026-09-01" → "Sep 2026". The axis a printed line has instead of a hover.
 *
 *  `monthName`, NOT `toLocaleDateString`. ICU data differs between the Node
 *  server and the browser (lib/format.ts says so at length: en-GB renders
 *  September as "Sept"), and a month name that differs between the two is an
 *  SSR mismatch on a page that is also printed by a headless browser. */
const monthLabel = monthName

/**
 * AN EMPTY STATE WRITTEN FOR A SCREEN, SAID ON PAPER (fix pass).
 *
 * `overview.moves` says "Nothing dated yet. Press Track this on a subject or a
 * theme and this block starts scoring it from the following month." — which on
 * production today is the WHOLE BODY of the brief's Your-moves sheet: an
 * instruction to press a control, printed on a landscape page, to a reader who
 * has a PDF. `lib/reports/monthly.ts` ruled on exactly this when it gave the
 * monthly artefact `MONTHLY_MOVES_EMPTY` — the page's wording "is a control on
 * a page the reader of an email is not looking at" — and a brief is the same
 * reader with less recourse, so it takes the artefact's sentence.
 *
 * KEYED ON THE BLOCK AND ON THE EXACT STRING, both. The section's `empty` is
 * also where the MISSING-INPUT sentence lands ("we have not recorded your
 * subjects, and here is who closes it"), and that one names an act the reader's
 * own operator performs — substituting the artefact's wording over it would
 * throw away the answer. Matching the page's own constant means a section
 * carrying anything else prints what it was given.
 *
 * AT RENDER, NOT AT COMPOSE: the string is frozen onto the snapshot, so a brief
 * already built and already shared stops printing the control the next time it
 * is opened.
 */
const PAPER_EMPTY: { block: string; screen: string; paper: string }[] = [
  { block: 'overview.moves', screen: MOVES_EMPTY, paper: MONTHLY_MOVES_EMPTY },
]

export function paperEmpty(section: Pick<DocBriefSection, 'block' | 'empty'>): string | null {
  if (section.empty == null) return null
  return PAPER_EMPTY.find((x) => x.block === section.block && x.screen === section.empty)?.paper ?? section.empty
}

/**
 * Whether the sheet's own title is about to be said again, one line lower, by
 * the first block on it (wave 3, `sales`-2).
 *
 * `MARKETING_MAP` titles three sheets with the words their leading block also
 * prints through `BlockFrame` — "Your subjects", "Rivals", "Your moves" — so
 * the sheet opened with an `<h1>`, a serif framing line, and then a caps
 * eyebrow saying the `<h1>` over again, before a line of meta and a question.
 * The line that survives is the block's, because it is the one that carries
 * the meta beside it ("2 named 19 Aug · share of videos where the subject came
 * up"); the slide's carries only the words. The month that rode the header's
 * context slot is on `BriefFooter`'s stamp on every sheet, so nothing else is
 * lost.
 *
 * THE COMPARISON IS THE BLOCK'S DECLARED TITLE, not the rendered markup: a
 * block states its heading on the contract (`Block.title`) precisely so a
 * surface can ask without reading what it drew.
 */
function sheetRenamesItself(sections: DocBriefSection[], title: string, data: DocumentSnapshotData): boolean {
  const first = sections[0]
  if (!first || first.empty != null) return false
  if ((data.surfaces ?? {})[first.surface] == null) return false
  const block = blocksFor(first.surface as BriefSurface)?.find((b) => b.key === first.block)
  const norm = (x: string) => x.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return !!block && norm(block.title) === norm(title)
}

/** One borrowed section's body. `why` (E-sales) says whether this sheet
 *  prints the sentence behind the confidence word; `framing` / `title`
 *  (E-marketing) are for a sheet that carries more than one section, where the
 *  slide's note belongs to the first of them and the others state their own. */
function SectionBody({ section, data, why = false, framing = true, title = false }: {
  section: DocBriefSection
  data: DocumentSnapshotData
  why?: boolean
  framing?: boolean
  title?: boolean
}) {
  const surface = (data.surfaces ?? {})[section.surface]
  const block = blocksFor(section.surface as BriefSurface)?.find((b) => b.key === section.block)
  // WHETHER THE BLOCK ITSELF IS ABOUT TO DRAW ITS OWN HEADER. A filled block
  // renders through `BlockFrame`, which prints the block's title and its meta;
  // an unfilled one draws a single sentence and names nothing.
  const filled = section.empty == null && !!block && surface != null
  const body = !filled
    // NO `data-copy` MARKER. These words are the product's own — composed in
    // code from a readiness row, not written by a model and not read back out
    // of a column — and the contract's kinds are all about a model's words.
    // Marking it `stored` asked the scanner for a `data-slot` that does not
    // exist (measured: two violations on Össur's marketing brief).
    ? <p className="m-0 text-[14.5px] leading-[1.5] text-muted-foreground">{paperEmpty(section) ?? 'This section could not be read for this month.'}</p>
    : block.render(surface as never, 'print', blockContext(appBaseUrl(), EMAIL))
  // THE FRAMING IS THE SLIDE'S NOTE WHERE THE SHEET HAS ONE TO SPARE, not a
  // paragraph inside the body: the artboard draws it as a serif italic line
  // under the title, which is exactly what `Slide.note` prints, and
  // `DocumentDeck` passes it there for a sheet carrying ONE section. A sheet
  // carrying several can only put the FIRST section's there, so the others
  // print their own here — which is what `framing` is for. What opens the
  // column either way is the green-ruled eyebrow every artboard sheet has and
  // no borrowed section had.
  const left = (
    <div className="flex min-h-0 flex-col gap-3">
      {/* AN UNFILLED SECTION SAYS WHICH SECTION IT IS. A filled block prints
          its own `BlockFrame` title; a section that could not be filled prints
          one sentence, and on a shared sheet that sentence had nothing above
          it naming what it was about. */}
      {/* THE EYEBROW STAYS, AND IT IS THE ARTBOARD'S (wave 3, `sales`-2). The
          review reads it as the surplus label in the stack of six; photographed
          against the drawing it is the opposite — SalesBrief.dc.html's
          objections sheet is `<h1>`, then "— MOST HEARD FIRST" in exactly this
          treatment, then the rows, and the eyebrow is the only thing on it that
          says what the ORDER of a list of counted rows is. The labels with no
          artboard anywhere are `BlockFrame`'s title, its meta line and its
          question, which this file cannot suppress through the Block contract:
          a block renders its own frame. That half is SH6's and SH5's. */}
      {section.eyebrow ? <Eyebrow>{section.eyebrow}</Eyebrow> : title ? <Eyebrow>{section.title}</Eyebrow> : null}
      {framing && section.framing && <p className="m-0 text-[14px] leading-[1.45] text-muted-foreground">{section.framing}</p>}
      {body}
    </div>
  )
  if (!section.pane) return left
  return (
    <div className="grid h-full min-h-0 grid-cols-[7fr_5fr] items-start gap-x-12">
      {left}
      <SectionPane section={section} data={data} why={why} />
    </div>
  )
}

/**
 * "The gap that matters" — the artboard's own headline, in the honest form
 * (package E-marketing, `mkt.p2.gap`; mock-gap §6 D1).
 *
 * THE ARTBOARD WRITES "gap 13 points, narrowed from 19 in June". "Narrowed" is
 * a movement claim about a DERIVED quantity — the difference of two shares on
 * two denominators — and nothing bands it, so the product cannot say it.
 * `gapLine` prints both sides with their k, their n and the band beside the
 * magnitude, and `gapBasisLine` prints the EARLIER gap as its own dated, banded
 * reading beside it, which is what lets a reader see that it was larger without
 * the product deciding for them. Below the floor the line reads "too few to
 * compare" and across a rename "comparison refused" — and in both cases no
 * magnitude is printed at all, because a `Gap` carries the number and the band
 * together or neither.
 *
 * THE BARS ARE THE TWO SIDES THE GAP IS BETWEEN. The artboard draws three,
 * adding the category; a `Gap` is a claim about two audiences and holds two,
 * and drawing a third bar from another figure would put a number on this card
 * that the sentence above it was not measured against.
 */
export function GapCard({ gap }: { gap: Gap }) {
  const basis = concludedBasisLine(gap)
  const sides = [gap.a, gap.b]
  const pcts = sides.map((s) => sidePct(s))
  const max = Math.max(...pcts.map((p) => p ?? 0), 1)
  // MARKED `level` ONLY WHERE IT CARRIES ONE (fix pass). `levelOf` prints
  // "— not tracked" / "— no reading" for a side nothing was read for, so a gap
  // with BOTH sides unread renders "you — not tracked · the category — not
  // tracked · too few to compare" — a `level` node with no "of N" in it, which
  // is rule (b)'s own failure and would have thrown the copy contract at
  // render. Unmarked it is what it is: a sentence naming two silences, with no
  // level to defend and no direction word for rule (c) to catch.
  const carriesLevel = sides.some((side) => side.observed && sidePct(side) != null)
  return (
    <div className={`${CARD} flex flex-col gap-3 px-5 py-4`}>
      <Eyebrow>The gap that matters</Eyebrow>
      <p className={`m-0 ${BODY_SM}`}>
        <span className="font-medium">{gap.objectLabel}</span>
        {' — '}
        <span {...(carriesLevel ? { 'data-copy': 'level' as const } : {})}>{gapLine(gap)}</span>
        {/* UNMARKED, and deliberately. `gapLine` is two levels and their
            banded difference, which is a `level` node; the basis line is a
            SECOND banded difference at an earlier window and carries no level
            at all — marking it one asked rule (b) for an "of N" that a
            refusal ("too few to compare in August") has no business printing.
            It carries no direction word either, which is what rule (c) polices
            on unmarked markup. */}
        {basis && <>{'. '}{basis}</>}
      </p>
      <div className="flex flex-col gap-2">
        {sides.map((side, i) => {
          const pct = pcts[i]
          return (
            <div key={side.audience} className="flex items-center gap-3">
              <span className="w-[104px] shrink-0 truncate text-[14px] text-foreground">{side.label}</span>
              <span className="h-[10px] flex-1">
                <span
                  className={`block h-full rounded-[3px] ${i === 0 ? 'bg-you' : 'bg-comp'}`}
                  style={{ width: pct == null ? '0%' : `${Math.max(2, (pct / max) * 100)}%` }}
                />
              </span>
              <span className="w-[104px] shrink-0">
                {side.observed && pct != null
                  ? <FigureCell align="right" value={`${round1(pct)}%`} of={`${fmtCount(side.value.k)} of ${fmtCount(side.value.n)}`} />
                  : <span className="block text-right font-mono text-[12px] text-muted-foreground">&mdash; not tracked</span>}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * What the deck draws on a sheet BESIDE its blocks.
 *
 * One element today: the gap card. It is here rather than in a block because
 * no surface owns it — `overview.subjects` publishes the two levels and
 * deliberately publishes no gap figure — and the gap itself is frozen onto the
 * reading.
 *
 * KEYED ON THE SECTION'S OWN FLAG (fix pass), not on the sheet's title. It read
 * `if (sheet !== 'Your subjects') return null`, so renaming that sheet in the
 * map dropped the card silently with no test failing, and a second map naming a
 * sheet "Your subjects" inherited it. `extras: 'gap'` travels on the section,
 * frozen, so the card follows the section that asked for it and nothing else.
 */
function sheetExtras(sections: readonly DocBriefSection[], data: DocumentSnapshotData): ReactNode {
  if (!sections.some((s) => s.extras === 'gap')) return null
  const gap = leadGap(data.reading?.gaps)
  if (!gap) return null
  return <div data-col="6" className="flex min-w-0 flex-col"><GapCard gap={gap} /></div>
}

/**
 * One sheet carrying two or three borrowed blocks, on the 12-column print grid
 * (package E-marketing).
 *
 * `.vb-print-grid` and `Slide.layout: 'grid'` have been in the codebase since
 * the deck was written and no built page has ever composed internal columns —
 * which is most of the density gap between the artboards and the deck. A
 * section's own `span` is its width; a section that declares none takes the
 * full twelve, so a sheet that groups by accident still reads as the stack it
 * was.
 *
 * `data-col` is what `.vb-print [data-col="n"]` keys on, and the extra wrapper
 * is deliberate: the block renders itself and must not be asked to know what
 * width it was given.
 */
function SheetSection({ section, data, framing = false }: { section: DocBriefSection; data: DocumentSnapshotData; framing?: boolean }) {
  // NO SECTION TITLE HERE FOR A FILLED BLOCK. `BlockFrame` prints the block's
  // own title and its question, so a wrapper heading printed "YOUR SUBJECTS"
  // twice, four lines apart. An UNFILLED section draws no frame of its own, so
  // on the shared sheet it takes both: the title says which section, the
  // framing says what it was for.
  //
  // AND THE SECOND SECTION'S FRAMING IS NOT DROPPED (fix pass). Only the FIRST
  // section's framing is hoisted to the Slide's serif note — which is the one
  // line the artboard draws under a sheet's title — and every section after it
  // was rendered with `framing={false}`, so `mk.subjectline`'s "The same
  // subjects month by month, on the axis each side was read on." was composed,
  // frozen onto the snapshot and printed nowhere. It prints in its own column.
  const unfilled = section.empty != null
  return (
    <div data-col={String(unfilled ? 6 : Math.min(12, Math.max(1, section.span ?? 12)))} className="flex min-w-0 flex-col">
      <SectionBody section={section} data={data} framing={framing || unfilled} title={unfilled} />
    </div>
  )
}

export function DocumentDeck({ data, date = fmtDate(new Date()) }: { data: DocumentSnapshotData; date?: string }) {
  // THE LEADERSHIP ONE-PAGER TAKES THE COVER'S PLACE, AND NOTHING ELSE'S
  // (Block D wave 2, E-leadership). The artboard is one sheet with no cover, so
  // where the sheet can be drawn it REPLACES the 58px cover — a page a director
  // had to turn past — and leads the document as a SUMMARY of it.
  //
  // IT ABSORBS NO SECTION. It packs a fragment of four borrowed blocks (the
  // gap and one attention level and the subjects table and two move readings)
  // and those blocks carry more than the fragment: `overview.sentence` is also
  // the month's own reading, the anomaly line and the voices;
  // `overview.category` is also the kinds, the mood, Reddit and the register's
  // quiet flags; `overview.moves` is also every row past the second. A sheet
  // that dropped their slides would delete that substance from the document
  // silently — and with it each section's `empty` sentence, which is the one
  // line that names the missing input and who closes it, exactly when the
  // reading is blocked. A one-pager is a summary of the pages behind it, which
  // is what a one-pager usually is.
  //
  // So the pagination is untouched: one slide per layout entry plus the lead
  // sheet, which is `documentSlides(data).length + 1` — the same arithmetic
  // `documentViewerPages` (lib/reports/viewer.ts) does for the viewer header
  // and the Studio bar, so the count the client reads and the count the deck
  // prints cannot diverge. Null for every other template and for any snapshot
  // with no readable frozen Overview, where the deck is exactly as it was.
  const sheet = leadershipSheetData(data)
  const slides = documentSlides(data)
  // THE COVER FOLDS WHERE ITS MAP SAYS SO (E-marketing). The artboards open on
  // the In-short sheet, not on a 58px title sheet; a brief composed from a map
  // that opts in folds its cover onto that first sheet, and a stored artefact
  // built before the maps keeps the cover it printed.
  const cover = documentCoverSheet(data)
  // ONE FUNCTION, and every surface that states this number reads it: the deck,
  // the viewer/Studio bar and the share link's header.
  const pages = documentSheetCount(data)
  // THE HEADER NAMES THE SHEET'S PLACE; THE FOOTER CARRIES THE STAMP AND THE
  // CORPUS (E-sales and E-marketing, merged). The artboard's header reads
  // "Objections · September 2026" — two words and a month in a 10.5px mono
  // slot that has to fit beside a title — so the SHORT month label goes there
  // and the sixty-character reading stamp rides `BriefFooter` on every sheet,
  // with the platforms and the corpus count beside it.
  const short = data.reading?.monthLabel ?? data.period
  // The first sheet in the deck that carries a pane — the one that prints the
  // sentence behind the confidence word. See `SectionPane`'s `why`.
  const firstPane = slides.map((x) => sectionOfSlide(data, x.keys[0])).find((x) => x?.pane)?.id ?? null
  const footer = <BriefFooter company={data.company} date={date} stamp={footerStamp(data)} note={corpusNote(data)} />
  const chrome = (context: string) => ({ context, footer })
  const n = (i: number) => i + (cover ? 2 : 1)
  return (
    <>
      {/* THE FIRST SHEET IS ONE OF THREE THINGS (merge, Block D wave 2): the
          leadership one-pager where the template has one (E-leadership), the
          cover where the map keeps one, and nothing at all where the map folds
          its cover onto the In-short sheet (E-marketing). */}
      {sheet
        ? <LeadershipSheet data={data} overview={sheet} date={date} page={1} pages={pages} />
        : cover
          ? <DocumentCover data={data} pages={pages} date={date} contents={slides.map((s, i) => ({ page: n(i), title: s.title }))} />
          : null}
      {slides.map((s, i) => {
        const sections = s.keys.map((k) => sectionOfSlide(data, k)).filter(Boolean) as DocBriefSection[]
        // A SHEET THAT CARRIES SEVERAL SECTIONS (E-marketing). Its note is the
        // first section's; the rest state their own framing in their columns.
        if (sections.length > 1 || (sections.length === 1 && s.layout === 'grid')) {
          return (
            <Slide
              key={sections[0].id}
              title={s.title}
              chrome={chrome(short)}
              page={n(i)}
              pages={pages}
              layout="grid"
              flow
              header={!sheetRenamesItself(sections, s.title, data)}
              note={s.title === UNFILLED_SHEET ? UNFILLED_FRAMING : sections[0].framing}
            >
              {sections.map((sec, j) => <SheetSection key={sec.id} section={sec} data={data} framing={j > 0} />)}
              {sheetExtras(sections, data)}
            </Slide>
          )
        }
        if (sections.length === 1) {
          const section = sections[0]
          // "Objections · September 2026", not the title repeated beside itself
          // under a 60-character stamp in a 10.5px mono slot.
          const context = section.context ? `${section.context} · ${short}` : short
          return (
            <Slide
              key={section.id}
              title={section.title}
              chrome={chrome(context)}
              page={n(i)}
              pages={pages}
              layout="single"
              // …and the same on a sheet of one section (`sales`-2): the
              // marketing brief's Rivals and Your-moves sheets are titled with
              // the words their block prints. Only where the header would say
              // NOTHING else — a section with its own `context` ("Objections ·
              // September 2026") states where the sheet sits in the document,
              // which is not on the footer and is not the block's to say.
              header={!!section.context || !sheetRenamesItself([section], section.title, data)}
              note={section.framing}
            >
              {/* The framing is the slide's note on a sheet of its own, so the
                  body does not print it a second time. */}
              <SectionBody section={section} data={data} why={section.id === firstPane} framing={false} />
            </Slide>
          )
        }
        const page = data.pages.find((p) => p.id === s.keys[0])
        if (!page) return null
        const title = page.kind === 'finding' ? `Finding ${page.meta?.n ?? ''}` : page.kind === 'competitor' ? 'Competitor' : page.title
        return (
          <Slide
            key={page.id}
            title={title}
            chrome={chrome(`${PAGE_CONTEXT[page.kind] ?? page.title} · ${short}`)}
            page={n(i)}
            pages={pages}
            layout="single"
            note={PAGE_NOTE[page.kind] ?? null}
            header={cover || page.kind !== 'in_short'}
          >
            {/* The brief's own title rides the first sheet of content when the
                cover was folded away — never on a second one, and never under
                a section line saying the same words. */}
            <PageBody page={page} data={data} title={!cover && page.kind === 'in_short'} pages={pages} />
          </Slide>
        )
      })}
    </>
  )
}
