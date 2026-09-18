import { Fragment, type ReactNode } from 'react'
import { MACHINE_TRANSLATION_STAMP, QuoteBlock } from '@/components/quote-block'
import { BlockSlot } from './block-slot'
import { Slide } from '@/components/print/slide'
import { Sparkline } from '@/components/charts/sparkline'
import { CountBadge, MOVEMENT_WORDS, MovementBadge } from '@/components/delta-badge'
import { monthName, shortDate } from '@/lib/format'
import { platformShareLine } from '@/lib/reading/method'
import { MOVE_PROMISE } from '@/lib/subjects/types'
import type { Verdict } from '@/lib/reading/verdicts'
import type { Good } from '@/components/charts/stat'
import type { DeltaVerdict } from '@/lib/report-bands'
import type { ShareSide } from '@/lib/report-delta'
import { substituteFigures } from '@/lib/reports/cover'
import { documentSlides, sectionOfSlide } from '@/lib/reports/documents/compose'
import { briefStampShort } from '@/lib/reports/documents/reading'
import { blocksFor } from '@/lib/reports/documents/load-reading'
import type { BriefSurface } from '@/lib/reports/documents/sections'
import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { appBaseUrl } from '@/lib/site'
import { coverCarriesSummary, findingHeadlines, overviewTiles, slugOf } from '@/lib/reports/documents/overview'
import { shownTrajectory, type DocBlock, type DocBriefSection, type DocLens, type DocPage, type DocumentSnapshotData } from '@/lib/reports/documents/types'
import type { FigureTable } from '@/lib/reports/types'

// A document's deck from its (hydrated) snapshot data: the cover, then one
// slide per skeleton page, numbered once across the document. The same
// chrome as a report's pages (Heinrich, 2026-08-30): the page's name top
// right, "Created by {company} with Verbatim" and the date at the foot. No
// evidence on paper: the workings never reach this component.
//
// The pages (T6, 2026-08-31, second pass after Heinrich's read): a research
// report composed to fill a landscape sheet. Type at 15–17px on the 1168px
// body (about 11pt on paper), structured blocks with hairlines, pills for
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
// summary at 17px, the section intros at 15–16px) — §5 names those too, and
// the 15–17px nodes those artboards do carry are few and are the leads
// themselves (SalesBrief: 11 at 15.5px, 9 at 15px, 3 at 17px, against 59 at
// 12.5–13px). Only the body moved.
const BODY = 'text-[13px] leading-[1.5] text-foreground'
const BODY_SM = 'text-[12.5px] leading-[1.45] text-foreground'

export function Figured({ text, figures }: { text: string; figures: FigureTable }) {
  return (
    <>
      {substituteFigures(text, figures).map((p, i) =>
        'text' in p ? <Fragment key={i}>{p.text}</Fragment> : <span key={i} className="font-mono tabular-nums text-foreground">{p.figure}</span>,
      )}
    </>
  )
}

function Paragraphs({ text, figures, className }: { text: string; figures: FigureTable; className: string }) {
  return (
    <>
      {text.split(/\n\n+/).filter(Boolean).map((p, i) => <p key={i} className={className}><Figured text={p} figures={figures} /></p>)}
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
export function DeckSpark({ values, months, color = 'var(--primary)', width = 104, height = 22 }: {
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
}) {
  // The months that carried a reading, in order. A slot with no reading is not
  // a month this line can name.
  const read = months.filter((_, i) => values[i] != null)
  if (read.length < 3) {
    return (
      <p className="font-mono text-[10.5px] text-muted-foreground">
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
    return <p className="font-mono text-[10.5px] text-muted-foreground">the months and the readings do not line up</p>
  }
  return (
    <span className="flex flex-col gap-1">
      <Sparkline values={values} color={color} width={width} height={height} animate={false} endDot />
      <span className="flex justify-between font-mono text-[9.5px] text-muted-foreground">
        <span>{months[0]}</span>
        <span>{months[months.length - 1]}</span>
      </span>
    </span>
  )
}

/** An eyebrow: mono, uppercase, with a short rule in the accent. */
function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground ${className}`}>
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
  return <span className={`inline-flex items-center rounded-full px-2.5 py-[3px] font-mono text-[11px] leading-none ${cls}`}>{children}</span>
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
/** The footer's stamp: the artboard's short form where there is a reading, and
 *  nothing (so the render date stands) where there is not. */
const footerStamp = (data: DocumentSnapshotData): string | null =>
  data.reading ? briefStampShort(data.reading) : null

function BriefFooter({ company, date, stamp }: { company: string; date: string; stamp: string | null }) {
  return (
    <p className="truncate font-mono text-[9.5px] leading-[1.35] text-muted-foreground">
      <span className="text-secondary-foreground">Created by {company} with Verbatim</span>
      <span aria-hidden> · </span>
      <span>{stamp ?? date}</span>
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
  const stamp = data.reading ? `${data.reading.monthLabel} · ${data.company} · as at ${shortDate(data.reading.readingAt)}` : data.period
  return (
    <section className="vb-slide">
      <div className="vb-slide-body">
        <div className="grid h-full min-h-0 grid-cols-[7fr_5fr] items-center gap-x-12">
          <div className="flex flex-col gap-[18px]">
            <div className="flex flex-col gap-3.5">
              {/* VERTICAL, 3 × 48. The build drew it lying down. */}
              <span className="inline-block h-12 w-[3px] rounded-full bg-primary" aria-hidden />
              <h1 className="max-w-[16ch] text-[58px] font-semibold leading-[1.05] tracking-[-0.025em] text-foreground [text-wrap:balance]">{data.title}</h1>
              <p className="font-mono text-[13px] text-muted-foreground">
                {stamp} · {pages} {pages === 1 ? 'page' : 'pages'}
              </p>
            </div>
            {summary && summaryText && (
              <BlockSlot block={summary} textClass="max-w-[66ch] text-[16px] leading-[1.5] text-foreground">
                <Paragraphs text={summaryText} figures={data.figures} className="max-w-[66ch] text-[16px] leading-[1.5] text-foreground" />
              </BlockSlot>
            )}
            {contents.length > 0 && (
              <div className="flex flex-col gap-2">
                <Eyebrow>In this brief</Eyebrow>
                <ol className="flex flex-col gap-[5px]">
                  {contents.map((c) => (
                    <li key={c.page} className="flex text-[14.5px] font-medium leading-[1.35] text-foreground">
                      <span className="w-6 shrink-0 font-mono text-[13px] font-normal tabular-nums text-primary">{c.page}</span>
                      <span>{c.title}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-4">
            {tiles.map((t, i) => <StatTile key={i} value={t.value} label={t.label} verdict={t.verdict} note={t.note} />)}
          </div>
        </div>
      </div>
      {/* THE COVER CARRIES THE FOOTER TOO. The mock numbers it 1 / 7; the build
          printed no footer at all, so the first sheet of a paid PDF was the one
          sheet with no page number and no "Created by". */}
      <footer className="flex shrink-0 items-baseline justify-between gap-4 border-t border-border/70 pt-1.5">
        <div className="min-w-0 flex-1"><BriefFooter company={data.company} date={date} stamp={footerStamp(data)} /></div>
        <span className="shrink-0 font-mono text-[9.5px] text-muted-foreground">1 / {pages}</span>
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
function StatTile({ value, label, verdict, note }: {
  value: string
  label: string
  verdict?: Verdict | null
  note?: string | null
}) {
  const body = (
    <>
      <p data-copy="figure" className="font-mono text-[38px] font-medium leading-none tracking-[-0.02em] tabular-nums text-foreground">{value}</p>
      <p className="mt-2 text-[12.5px] leading-[1.35] text-muted-foreground">{label}</p>
    </>
  )
  const level = /\bof\s[\d]/.test(label)
  return (
    <div className={`${CARD} px-5 py-4`}>
      {level ? <div data-copy="level">{body}</div> : body}
      {(verdict || note) && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {verdict ? <ClaimBadge verdict={verdict} unit="pts" /> : null}
          {note ? <span className="text-[11.5px] leading-[1.35] text-muted-foreground">{note}</span> : null}
        </div>
      )}
    </div>
  )
}

function OverviewPage({ page, data }: { page: DocPage; data: DocumentSnapshotData }) {
  const f = data.figures
  const summary = page.blocks.find((b) => b.field === 'summary')
  // The numbers and the headlines are derived in
  // lib/reports/documents/overview.ts — the email reads the same functions, so
  // the paper and the email cannot drift. (The not-settled list stays local:
  // it is the page's own block, and the email does not carry it.)
  const findings = findingHeadlines(data)
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
      <div className="flex min-h-0 flex-col gap-6">
        {!onCover && (
          <div className="flex flex-col gap-3">
            <Eyebrow>In short</Eyebrow>
            {summary?.text && <BlockSlot block={summary} textClass="max-w-[66ch] text-[17px] leading-[1.55] text-foreground"><Paragraphs text={summary.text} figures={f} className="max-w-[66ch] text-[17px] leading-[1.55] text-foreground" /></BlockSlot>}
          </div>
        )}
        {findings.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <Eyebrow>Findings in this brief</Eyebrow>
            <ol className="flex flex-col gap-2">
              {findings.map((h, i) => (
                <li key={i} className="flex items-baseline gap-4 text-[16px] leading-[1.4] text-foreground">
                  <span className="w-6 shrink-0 font-mono text-[13px] tabular-nums text-primary">{i + 1}</span>
                  <span className="font-medium"><Figured text={h} figures={f} /></span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-col gap-4">
        {/* THE TILES BELONG TO WHICHEVER SHEET CARRIES THE SUMMARY. They are
            the same three numbers either way, and a brief that printed them on
            the cover AND here would be a document stating one measurement
            twice, three sheets apart, with nothing saying they are the same
            one. */}
        {!onCover && <div className="flex flex-col gap-3">{tiles.map((t, i) => <StatTile key={i} value={t.value} label={t.label} verdict={t.verdict} note={t.note} />)}</div>}
        {notSure.length > 0 && (
          <div className="rounded-lg bg-inner px-5 py-4">
            <Eyebrow className="mb-2">Not settled this update</Eyebrow>
            <BlockSlot block={notSureBlock!} textClass="text-[13px] leading-[1.45] text-secondary-foreground">
              <ul className="flex flex-col gap-1.5">
                {notSure.slice(0, 3).map((x, i) => <li key={i} className="text-[13px] leading-[1.45] text-secondary-foreground">{x}</li>)}
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
        {headline && <BlockSlot block={headline} textClass="max-w-[30ch] text-[32px] font-semibold leading-[1.12] tracking-[-0.02em] text-foreground"><h2 className="max-w-[30ch] text-[32px] font-semibold leading-[1.12] tracking-[-0.02em] text-foreground [text-wrap:balance]"><Figured text={headline.text} figures={figures} /></h2></BlockSlot>}
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
        <div className={`${CARD} flex min-h-0 flex-col gap-4 px-6 py-5`}>
          <p className="font-mono text-[12px] text-muted-foreground">
            <span className="text-foreground">{fmtCount(conversations)}</span> conversations · <span className="text-foreground">{strands}</span> strands of the research
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
          <div className="mt-auto flex flex-col gap-1.5 border-t border-border pt-3">
            <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Confidence <ConfidenceDots sure={sureWord} /> <span className="normal-case tracking-normal text-foreground">{sureWord}</span>
            </p>
            {sureNote && <p className="text-[12.5px] leading-[1.45] text-muted-foreground">{sureNote}</p>}
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
      <span className="w-[92px] shrink-0 truncate text-[13px] text-foreground">{label}</span>
      <span className="h-[10px] flex-1"><span className={`block h-full rounded-[3px] ${cls}`} style={{ width: `${Math.max(2, (pct / max) * 100)}%` }} /></span>
      <span className="w-[52px] text-right font-mono text-[13px] tabular-nums text-foreground">{pct}%</span>
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
          <h2 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground">{name}</h2>
          <p className="text-[14px] text-muted-foreground">As their own videos{aboutShown ? ', other people’s videos' : ''} and their audience tell it this update{page.meta?.thin === 'true' ? ', on few videos, read with care' : ''}.</p>
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
            <span className="w-[120px] shrink-0 truncate text-[13.5px] text-foreground">{r.name}</span>
            <span className="h-[11px] flex-1"><span className={`block h-full rounded-[3px] ${r.you ? 'bg-you' : 'bg-comp'}`} style={{ width: `${Math.max(2, (r.pct / max) * 100)}%` }} /></span>
            <span className="w-[54px] text-right font-mono text-[13.5px] tabular-nums text-foreground">{r.pct}%</span>
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
      value: `${fmtCount(d.conversations.now)} conversations, against ${fmtCount(d.conversations.prev)} last update`,
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
    <dd className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13.5px] leading-[1.4] text-foreground">
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
            <span className="w-[46px] shrink-0 text-right font-mono text-[14px] tabular-nums text-foreground">{fmtCount(r.total)}</span>
            <span className="h-[8px] w-[92px] shrink-0 rounded-[3px] bg-neutral-seg"><span className="block h-full rounded-[3px] bg-primary" style={{ width: `${Math.max(6, (r.total / max) * 100)}%` }} /></span>
            <span className="flex-1 truncate text-[14.5px] text-foreground">{r.label}</span>
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
  const READ = 'text-[17px] leading-[1.55] text-foreground'
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
                <dt className="pt-[2px] font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">{m.label}</dt>
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
      <p className="max-w-[92ch] text-[15px] leading-[1.5] text-secondary-foreground">
        {`What ${company} says in its own videos, set against what the conversation does with it. The verdict is the analysis’s; the reading is the researcher’s.`}
      </p>
      <ul className="grid min-h-0 grid-cols-2 items-start gap-6">
        {page.blocks.map((b) => {
          const verdict = VERDICT_WORD[b.items?.[0] ?? ''] ?? null
          const theySay = b.items?.[1] ?? ''
          return (
            <li key={b.id} className={`${CARD} flex min-h-0 flex-col gap-3 px-7 py-5`}>
              <div className="flex items-start justify-between gap-4">
                <p className="max-w-[40ch] font-serif text-[17px] italic leading-[1.4] text-foreground">&ldquo;{b.label}&rdquo;</p>
                {verdict && <span className="shrink-0"><Pill tone={verdict.tone}>{verdict.word}</Pill></span>}
              </div>
              {theySay && (
                <p className="border-l-2 border-border pl-3.5 text-[13.5px] leading-[1.45] text-secondary-foreground">{theySay}</p>
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
    <div className="flex h-full min-h-0 flex-col gap-5">
      <p className="max-w-[86ch] text-[16px] leading-[1.5] text-secondary-foreground">
        Questions the conversation puts and does not settle. Each is asked in the audience&rsquo;s own framing, not the company&rsquo;s; the note says what is behind it.
      </p>
      {block && (
        <BlockSlot block={block} textClass={BODY_SM}>
          <ol className="grid grid-cols-2 gap-x-8 gap-y-4">
            {items.map((x, i) => {
              const m = /^["“]?([^:"”]+)["”]?:\s*(.+)$/.exec(x)
              return (
                <li key={i} className="flex gap-4">
                  <span className="w-5 shrink-0 pt-[3px] font-mono text-[13px] tabular-nums text-primary">{i + 1}</span>
                  <div className="flex flex-col gap-1">
                    <p className="text-[16.5px] font-medium leading-[1.35] text-foreground">{m ? `${m[1].trim()}?`.replace(/\?\?$/, '?') : x}</p>
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
        <p className="text-[22px] font-semibold tracking-[-0.015em] text-foreground">{block.label}</p>
        {one && <p className="font-serif text-[15px] italic leading-[1.5] text-secondary-foreground">{one}</p>}
      </div>
      <div className="flex flex-col gap-3">
        {rest.map((it, i) => (
          <div key={i} className="flex gap-4">
            <p className="w-[104px] shrink-0 pt-[3px] font-mono text-[11px] uppercase leading-[1.3] tracking-[0.08em] text-muted-foreground">{PERSONA_LABELS[i + 1]}</p>
            <p className="text-[13.5px] leading-[1.45] text-foreground">{it}</p>
          </div>
        ))}
        {block.text && (
          <div className="flex gap-4 border-t border-border pt-3">
            <p className="w-[104px] shrink-0 pt-[3px] font-mono text-[11px] uppercase tracking-[0.08em] text-primary">{lens.short}</p>
            <BlockSlot block={block} textClass="text-[13.5px] font-medium leading-[1.45] text-foreground"><p className="text-[13.5px] font-medium leading-[1.45] text-foreground"><Figured text={block.text} figures={figures} /></p></BlockSlot>
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
    <div className="flex h-full min-h-0 flex-col gap-5">
      <p className="max-w-[80ch] text-[16px] leading-[1.5] text-secondary-foreground">Words and claims the conversation pushes back on or contradicts. Each is a phrase a buyer will hear as a promise; the note says what the audience already knows about it.</p>
      <BlockSlot block={careBlock!} textClass={BODY_SM}>
      <ul className="grid grid-cols-2 gap-5">
        {items.map((x, i) => {
          const m = /^["“]?([^:"”]+)["”]?:\s*(.+)$/.exec(x)
          return (
            <li key={i} className={`${CARD} flex flex-col gap-1.5 px-6 py-4`}>
              <p className="flex items-center gap-2.5 text-[18px] font-semibold text-foreground">
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
              <span data-copy="figure" className="font-mono text-[38px] font-medium leading-none tracking-[-0.02em] tabular-nums text-foreground">{fmtCount(f.pool)}</span>
              <span className="text-[12px] font-medium text-muted-foreground">{f.pool === 1 ? 'video' : 'videos'}</span>
            </span>
            {/* A COUNT, AND NO "of N" (D8). The artboard prints "12 of 1,388
                category videos", which is a numerator over somebody else's
                denominator twice over: the pool is the tenant's OWN videos,
                and it is dated by `upload_date` while the category's month is
                dated by the comment. There is no honest denominator for it, so
                it is printed as the count it is and the population is named in
                words. The SPLIT below has one — the pool itself — and carries
                it. */}
            <p className="text-[12.5px] text-muted-foreground">of {data.company}&rsquo;s own videos this month, and each of them also named a tracked rival</p>
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
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
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
          {f.unread && <p className="text-[12.5px] leading-[1.45] text-muted-foreground">{f.unread}</p>}
        </div>

        {/* THE BASIS SITS AT THE FOOT, where the artboard's confidence rail
            does (P0 item 2's `distribute="between"`, applied to a sheet). The
            column packs to the top and this block takes the slack, rather than
            the whole column spreading and opening a hole between the figure
            and its own bar. */}
        <div className="mt-auto flex flex-col gap-2 border-t border-border/70 pt-3">
          {/* THE BASIS, BESIDE THE NUMBER. A third clock on a month-stamped
              sheet, and a reader who is not told will read it as the month's. */}
          <p className="text-[12.5px] leading-[1.45] text-muted-foreground">Counted over {f.audienceLabel}, {f.basis}.</p>
          {/* The one thing the artboard asks for that nothing measured. */}
          <p className="text-[12.5px] leading-[1.45] text-muted-foreground">
            Which way a video leaned is read from what was stored about the video, not from any one comment under it, so no quote on this sheet is labelled toward or away.
          </p>
        </div>
      </div>

      <div className={`${CARD} flex min-h-0 flex-col gap-3.5 px-6 py-5`}>
        <Eyebrow>How to read these</Eyebrow>
        <p className="font-mono text-[12px] leading-[1.5] text-muted-foreground">
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
          <p className="text-[12.5px] leading-[1.45] text-muted-foreground">
            What was stored about each video. That column has been written by two different readings of tone, so the split is a lead rather than a rule.
          </p>
        </div>
      </div>
    </div>
  )
}

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
      <p className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">{label}</p>
      <ul className="flex flex-col gap-[7px]">
        {rows.map((b, i) => (
          <li key={i} className="flex gap-2.5 text-[13px] leading-[1.45] text-foreground">
            <span className="mt-[7px] inline-block h-[6px] w-[6px] shrink-0 rounded-full bg-primary" aria-hidden />
            <span>{b.label} — <Counted k={fmtCount(b.value.k)} n={fmtCount(b.value.n)} of="videos" /></span>
          </li>
        ))}
      </ul>
    </>
  )
  return (
    <div className="grid h-full min-h-0 grid-cols-3 items-stretch gap-x-5">
      {lines.slice(0, 3).map((line, i) => (
        <div key={i} className={`${CARD} flex min-h-0 flex-col gap-3 px-[22px] py-5`}>
          <div className="flex flex-col gap-1">
            <h2 className="text-[15.5px] font-semibold text-foreground">{line.objection.label}</h2>
            <p className="text-[12.5px] text-muted-foreground">
              <Counted k={fmtCount(line.objection.value.k)} n={fmtCount(line.objection.value.n)} of="videos" />
            </p>
          </div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">Say this</p>
          {line.say
            ? <blockquote className="m-0 rounded-md bg-inner px-3.5 py-3 font-serif text-[14px] italic leading-[1.5] text-secondary-foreground">{line.say}</blockquote>
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
          <p className="mt-auto border-t border-border pt-2.5 font-mono text-[10.5px] leading-[1.4] text-muted-foreground">
            {line.objection.source === 'kind'
              ? 'Counted as a kind of thing said, over the whole month — not as a theme of the register.'
              : 'Counted as a theme of the register.'}
          </p>
        </div>
      ))}
      {lines.length < 3 && (
        <div className="flex min-h-0 flex-col justify-end gap-2 self-stretch" style={{ gridColumn: `span ${3 - Math.min(lines.length, 3)}` }}>
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
  const comments = r ? r.denominators.reduce((n, d) => n + d.comments, 0) : m.conversations
  const refusals = data.slideFigures?.cannotTell.refusals ?? []
  const findings = data.pages.filter((p) => p.kind === 'finding').length
  const dropped = m.dropped ?? null
  const mix = r ? platformShareLine(r.platformMix) : ''
  const rows: [string, ReactNode][] = [
    ['Period', r ? r.stamp : m.period],
    [r ? 'Comments' : 'Conversations', `${fmtCount(comments)} read${r ? ` in ${r.monthLabel}` : ''}`],
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
      dropped != null
        ? `${fmtCount(findings)} of ${fmtCount(findings + dropped)} written · ${fmtCount(dropped)} below the bar${m.thin ? ' · thin update' : ''}`
        : `${fmtCount(findings)}${m.thin ? ' (thin update)' : ''}`,
    ],
  ]
  return (
    <div className={`${CARD} self-start px-6 py-5`}>
      <Eyebrow className="mb-3">This brief in numbers</Eyebrow>
      <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-2.5">
        {rows.map(([k, v]) => (
          <Fragment key={k}>
            <dt className="pt-[3px] font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">{k}</dt>
            <dd className="text-[14px] leading-[1.4] text-foreground">{v}</dd>
          </Fragment>
        ))}
      </dl>
      {/* `sales.p7.footnote` — five sentences the product has composed on every
          reading since wave 1 and no document has ever printed. Two of them are
          on a different clock from the sheet they sit on, and `basis` is the
          clause that says which (D15). */}
      {data.reading?.method && (
        <p className="mt-4 border-t border-border pt-3 font-mono text-[10.5px] leading-[1.5] text-muted-foreground">
          {[data.reading.method.basis, data.reading.method.language, data.reading.method.redditCap, data.reading.method.privacy]
            .filter(Boolean)
            .join(' ')}
        </p>
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
      <p className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">What this brief cannot tell you</p>
      <p className="text-[12.5px] leading-[1.4] text-secondary-foreground">{MOVE_PROMISE}</p>
      {/* `refusedSentence`, WHICH ALREADY NAMES EVERY REASON AND COUNTS THEM.
          `CannotTell.items` is one line per refusal and on a page with two
          refusals of two reasons it restates the summary twice; the summary is
          the one that carries the count, so it is the one that prints. Both
          are built from `REFUSAL_WHY`, so neither can say anything the record
          does not. */}
      {c && <p className="text-[12.5px] leading-[1.4] text-secondary-foreground">{c.line}</p>}
      {!c && <p className="text-[12.5px] leading-[1.4] text-secondary-foreground">Which comparisons this reading refused is not recorded for this brief.</p>}
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

const PAGE_NOTE: Partial<Record<DocPage['kind'], string>> = {
  switching: 'The videos that name both you and a rival, and which way each of them leaned — a small number, printed as it stands.',
  scripted: 'The sentence to say is a writer\u2019s; every figure under it is counted.',
}

/** The lens the document was written under. Older snapshots (before
 *  2026-09-02) carry none: they are all Sales briefs. */
const lensOf = (data: DocumentSnapshotData): DocLens => data.lens ?? { means: 'What it means for a sale', short: 'for a sale' }

function PageBody({ page, data }: { page: DocPage; data: DocumentSnapshotData }) {
  const figures = data.figures
  const lens = lensOf(data)
  switch (page.kind) {
    case 'in_short': return <OverviewPage page={page} data={data} />
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
function SectionPane({ section, data }: { section: DocBriefSection; data: DocumentSnapshotData }) {
  const line = data.slideFigures?.line ?? null
  const confidence = data.reading?.confidence ?? null
  const rail = confidence && (
    <div className="mt-auto flex flex-col gap-1.5 border-t border-border pt-3">
      <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
        Confidence <ConfidenceDots sure={confidence.word} /> <span className="normal-case tracking-normal text-foreground">{confidence.word}</span>
      </p>
      <p className="text-[12.5px] leading-[1.45] text-muted-foreground">{confidence.why}</p>
    </div>
  )
  if (section.pane === 'chart') {
    return (
      <div className={`${CARD} flex min-h-0 flex-col gap-4 px-6 py-5`}>
        <Eyebrow>The line behind these</Eyebrow>
        {line && line.series.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {line.series.map((serie) => (
              <div key={serie.label} className="flex flex-col gap-1.5">
                <DeckSpark values={serie.points} months={line.months.map(monthLabel)} width={300} height={120} />
                <p className="text-[11px] leading-[1.35] text-muted-foreground">{serie.label}</p>
              </div>
            ))}
            {/* ONE SIDE, AND THE SHEET SAYS SO. The artboard draws two theme
                series against each other; the tenant's own side carries no
                month series on a subject row, which is a schema limitation and
                not a missing render. */}
            <p className="text-[11px] leading-[1.35] text-muted-foreground">
              One side. Your own audience carries no month-by-month series on a subject, so there is nothing to draw against this.
            </p>
          </div>
        ) : (
          <p className={BODY_SM}>{line?.label ?? line?.empty ?? 'No month series stands behind this sheet yet.'}</p>
        )}
        {rail}
      </div>
    )
  }
  return (
    <div className={`${CARD} flex min-h-0 flex-col gap-4 px-6 py-5`}>
      <Eyebrow>What this rests on</Eyebrow>
      {data.reading && (
        <p className="font-mono text-[12px] leading-[1.5] text-muted-foreground">
          {data.reading.denominators.map((d) => (
            <Fragment key={d.audience}>
              <span className="text-foreground">{fmtCount(d.videos)}</span> {d.label}{' · '}
            </Fragment>
          ))}
          <span className="text-foreground">{fmtCount(data.reading.denominators.reduce((n, d) => n + d.comments, 0))}</span> comments read
        </p>
      )}
      {/* `sales.p4.untracked` — what is NOT tracked, beside the section rather
          than in place of it, naming the ROLE and no date (D14). Composed by
          `untrackedNotes` on every brief since wave 1 and printed by nothing. */}
      {(data.slideFigures?.untracked ?? [])
        .filter((n) => n.sections.includes(section.title))
        .map((n) => <p key={n.id} className={BODY_SM}>{n.line}</p>)}
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

function SectionBody({ section, data }: { section: DocBriefSection; data: DocumentSnapshotData }) {
  const surface = (data.surfaces ?? {})[section.surface]
  const block = blocksFor(section.surface as BriefSurface)?.find((b) => b.key === section.block)
  const body = section.empty != null || !block || surface == null
    // NO `data-copy` MARKER. These words are the product's own — composed in
    // code from a readiness row, not written by a model and not read back out
    // of a column — and the contract's kinds are all about a model's words.
    // Marking it `stored` asked the scanner for a `data-slot` that does not
    // exist (measured: two violations on Össur's marketing brief).
    ? <p className="m-0 text-[13px] leading-[1.5] text-muted-foreground">{section.empty ?? 'This section could not be read for this month.'}</p>
    : block.render(surface as never, 'print', blockContext(appBaseUrl(), EMAIL))
  // THE FRAMING IS THE SLIDE'S NOTE NOW, not a paragraph inside the body: the
  // artboard draws it as a serif italic line under the title, which is exactly
  // what `Slide.note` already prints, and `DocumentDeck` passes it there. What
  // opens the column instead is the green-ruled eyebrow every artboard sheet
  // has and no borrowed section had.
  const left = (
    <div className="flex min-h-0 flex-col gap-3">
      {section.eyebrow && <Eyebrow>{section.eyebrow}</Eyebrow>}
      {body}
    </div>
  )
  if (!section.pane) return left
  return (
    <div className="grid h-full min-h-0 grid-cols-[7fr_5fr] gap-x-12">
      {left}
      <SectionPane section={section} data={data} />
    </div>
  )
}

export function DocumentDeck({ data, date = fmtDate(new Date()) }: { data: DocumentSnapshotData; date?: string }) {
  const slides = documentSlides(data)
  const pages = slides.length + 1
  // THE HEADER NAMES THE SHEET'S PLACE; THE FOOTER CARRIES THE STAMP. The
  // artboard's header reads "Objections · September 2026" — two words and a
  // month in a 10.5px mono slot that has to fit on one line beside a title.
  // The deck put the whole 60-character reading stamp there, on every sheet,
  // beside a title it repeated, and the stamp then appeared nowhere else. It
  // now rides `BriefFooter` on every sheet including the cover, which is where
  // the artboard puts it.
  const short = data.reading?.monthLabel ?? data.period
  // WP19: the stamp rides every sheet, the way the weekly deck's rule does — a
  // reader of a PDF has no masthead to scroll back to. In the artboard's SHORT
  // form (`briefStampShort`), because the long one is sixty characters and the
  // method sheet printed it three times on one sheet; the freeze date it drops
  // is on the method card's PERIOD row, in full.
  const footer = <BriefFooter company={data.company} date={date} stamp={footerStamp(data)} />
  const chrome = (page: DocPage) => ({ context: `${PAGE_CONTEXT[page.kind] ?? page.title} · ${short}`, footer })
  return (
    <>
      <DocumentCover data={data} pages={pages} date={date} contents={slides.map((s, i) => ({ page: i + 2, title: s.title }))} />
      {slides.map((s, i) => {
        const section = sectionOfSlide(data, s.keys[0])
        if (section) {
          // "Objections · September 2026", not the title repeated beside itself
          // under a 60-character stamp in a 10.5px mono slot. The stamp rides
          // the footer of every sheet.
          const context = `${section.context ?? section.title} · ${short}`
          return (
            <Slide
              key={section.id}
              title={section.title}
              chrome={{ context, footer }}
              page={i + 2}
              pages={pages}
              layout="single"
              note={section.framing}
            >
              <SectionBody section={section} data={data} />
            </Slide>
          )
        }
        const page = data.pages.find((p) => p.id === s.keys[0])
        if (!page) return null
        const title = page.kind === 'finding' ? `Finding ${page.meta?.n ?? ''}` : page.kind === 'competitor' ? 'Competitor' : page.title
        return (
          <Slide key={page.id} title={title} chrome={chrome(page)} page={i + 2} pages={pages} layout="single" note={PAGE_NOTE[page.kind] ?? null}>
            <PageBody page={page} data={data} />
          </Slide>
        )
      })}
    </>
  )
}
