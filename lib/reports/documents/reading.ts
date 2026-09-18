import { fmtInt, fullDate, longMonth, platformLabel } from '../../format'
import { blockAnswers, mergeFigures } from '../../blocks/types'
import type { Block } from '../../blocks/types'
import { freezeBoundary } from '../../reading/monthly'
import type { HorizonWindow } from '../../reading/horizon'
import type { MonthStatus, PlatformMix } from '../../reading/types'
import type { FigureTable as ReadingFigures, Verdict } from '../../reading/verdicts'
import type { Gap } from '../../reading/gap'
import { proseFigures } from '../../prose/figures'
import type { FigureTable } from '../types'
import type { CoverageRecord } from '../../reading/record'
import type { MethodLines } from '../../reading/method'

/**
 * The reading a brief is written from (Phase 1 WP19, item 43, decision R).
 *
 * WHAT ITEM 43 ACTUALLY ASKS FOR. Every number in every brief was
 * run-indexed: `Signals.run` reads `run_summary.period_*`, the period string is
 * literally "Update of 30 Aug 2026", and no figure anywhere carried a
 * denominator, a band, an n or a reading date. "Rewire every number onto the
 * monthly reading" is therefore not a template edit — it is a replacement of
 * the source, and this module is that source.
 *
 * IT IS THE BLOCKS' OWN FIGURE TABLES, NOT A SECOND READ. The page blocks that
 * Block B built already answer `figures()` and `verdicts()` — that is exactly
 * what the Block contract added them for ("what a model may name", "the banded
 * comparisons behind its direction words"). A brief that read the month tables
 * for itself would be a second measurement of one quantity, and the product has
 * already shipped that bug once. So a brief's numbers are the numbers the
 * READER SEES ON THE PAGE, gathered off the same blocks the page draws, which
 * is what makes item 43's "its numbers reproduce the page's blocks for the same
 * month" true by construction rather than by test.
 *
 * TWO SHAPES OF FIGURE, AND THE ONE DOCUMENTED CROSSING. `measured` is the
 * reading layer's `{value, unit, label}`; `figures` is the printed
 * `{label, value: '3.4%', kind}` a document substitutes into prose. The
 * crossing is `lib/prose/figures.ts proseFigures`, and it is the only one
 * (Block A's own correction to the conventions line).
 */

/** One audience's month, as the method page prints it. */
export interface BriefDenominator {
  audience: string
  label: string
  videos: number
  comments: number
}

export interface BriefReading {
  /** The month every number on the brief is about, `YYYY-MM-01`. */
  month: string
  /** "September 2026". */
  monthLabel: string
  monthStatus: MonthStatus
  /** ISO instant the brief was read at — printed, not inferred from created_at. */
  readingAt: string
  /** The month's own window, as the surfaces resolved it. A brief has no
   *  window control: see `load-reading.ts`. */
  window: HorizonWindow
  /** Figures as measured — what a verdict argues from. */
  measured: ReadingFigures
  /** The same table as printed — what prose substitutes. */
  figures: FigureTable
  /** Every banded comparison the blocks drew. */
  verdicts: Verdict[]
  /**
   * Every two-audience gap the blocks drew (D1) — what `lead.fig1` and the
   * monthly's headline are written from.
   *
   * A SECOND LIST BESIDE `verdicts`, NOT A MEMBER OF IT. A `Verdict` is a claim
   * that something MOVED and every reader of that list treats it as one —
   * `countedLines`, `confidenceOf`, `countRefused` and the cover's own prompt
   * all argue from "did it move". A gap is a claim that two audiences DIFFER in
   * one window; dropping it into `verdicts` would have it counted as a movement
   * comparison by four callers that never asked for one.
   *
   * The figure tokens a document may name come from `gapFigures(gap, prefix)`,
   * called by the surface that prints it — deliberately not merged into
   * `measured` here, because a token's prefix belongs to the sentence that
   * names it and this module holds no sentence.
   */
  gaps: Gap[]
  denominators: BriefDenominator[]
  platformMix: PlatformMix
  /** The reading layer's own caveats, said once (collapsed upstream). */
  notes: string[]
  /** True when the window crosses a recorded clustering boundary. A reading
   *  may not cross a boundary without saying so. */
  crossesClustering: boolean
  /**
   * The method footnote (block D, D9 — `sales.p7.footnote`).
   *
   * Every number in it was already on `RecordInputs` and composed by
   * `recordLines`, and none of it has ever reached a document: the read-depth
   * shares, the language share and the Reddit cap are drawn on the app
   * surfaces through the page bar and on Settings › The record, and nowhere
   * else. Composed from the record `load-reading.ts` already loads, so it
   * costs the build nothing. Null where that record could not be read.
   */
  method: MethodLines | null
  /**
   * "23 updates since 6 Apr 2026 · longest gap 35 days · last on 27 Sep 2026"
   * (`content.p5.delivery`). `deliveryRecord().line`, the same sentence
   * Settings › The record prints — never a second count of `pipeline_runs`.
   * RUN-DATED, and it is the record OF the deliveries, which is the one thing
   * a run's own date is the honest index for.
   */
  delivery: string | null
  /** "your 3rd monthly reading · the quarter view needs 6" — the second half
   *  of `content.p5.delivery`, taken off the Overview this brief already
   *  loaded (`readingsCounter`), never recomputed. */
  counter: string | null
  /**
   * "Your side reads 'too few to compare' on 84 videos — the category column
   * carries the month." (`content.p5.caveat`).
   *
   * Overview composes this and no document has ever printed it, which is the
   * wrong way round: a reader of the PDF cannot see the column that carries
   * the month, so the caveat matters MORE here than on the page. Null where
   * the client's own side is not hollow.
   */
  hollow: string | null
}

/** What a brief says about its own window, on every page, in the design's
 *  words: the month, the instant, and — while the month is still filling —
 *  the day it stops moving.
 *
 *  THE STAMP IS THE PERIOD STRING. `periodOf(runDate)` printed "Update of 30
 *  Aug 2026" on the method page, in the email and on every figure's frame; a
 *  brief whose numbers are a month's cannot keep a stamp that names a run. */
export function briefStamp(r: Pick<BriefReading, 'month' | 'monthStatus' | 'readingAt'>): string {
  const parts = [monthAndYear(r.month), `reading as at ${fullDate(r.readingAt)}`]
  if (r.monthStatus === 'filling') parts.push(`still filling until ${fullDate(freezeBoundary(r.month))}`)
  return parts.join(' · ')
}

/** "September 2026". `longMonth` is the product's month name and carries no
 *  year, which is right on a page a reader opened today and wrong on a
 *  document they will open in March — a brief is read long after it is
 *  written, and "September" alone is then ambiguous by twelve months. */
export function monthAndYear(month: string): string {
  const year = month.slice(0, 4)
  const name = longMonth(month)
  return /^\d{4}$/.test(year) && name !== month.slice(0, 10) ? `${name} ${year}` : name
}

/** "388 videos in the category · 158 of your own · 1,406 comments" — the
 *  denominator every figure on the brief is a share of, printed once. */
export function denominatorLine(denominators: readonly BriefDenominator[]): string {
  if (denominators.length === 0) return 'No denominator recorded for this month.'
  const videos = denominators.map((d) => `${fmtInt(d.videos)} ${d.videos === 1 ? 'video' : 'videos'} in ${d.label}`)
  const comments = denominators.reduce((n, d) => n + d.comments, 0)
  return `${videos.join(' · ')} · ${fmtInt(comments)} ${comments === 1 ? 'comment' : 'comments'} read.`
}

/** "TikTok 161 · YouTube 135 · Instagram 85 · Reddit 68" — the mix behind the
 *  denominator, because a share of a corpus that is 90% one platform is a
 *  statement about that platform. Empty where nothing was recorded. */
export function platformLine(mix: PlatformMix): string {
  const rows = Object.entries(mix)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  if (rows.length === 0) return ''
  return rows.map(([p, n]) => `${platformLabel(p)} ${fmtInt(n)}`).join(' · ')
}

/** The line a brief prints when its window reaches across a clustering
 *  boundary. Decision L: the reading continues, the caveat travels with it,
 *  and no direction word is earned across it.
 *
 *  ONE WORDING. The method page wrote its own, inline and slightly different,
 *  which is "no two surfaces word the same emptiness differently" broken
 *  inside one file. */
export const CLUSTERING_CAVEAT =
  'Themes were grouped differently inside part of this window, so a comparison across it is not like for like and no direction word is claimed over it.'

/** Every figure and verdict a set of blocks prints, gathered without rendering
 *  any of them. The one crossing to printed figures happens here, once. */
export function blockReading<D>(
  blocks: readonly Block<D>[],
  data: D,
): { measured: ReadingFigures; figures: FigureTable; verdicts: Verdict[] } {
  const answers = blocks.map((b) => blockAnswers(b, data))
  const measured = mergeFigures(answers.map((a) => a.figures))
  return {
    measured,
    figures: proseFigures(measured),
    verdicts: answers.flatMap((a) => a.verdicts),
  }
}

/** Fold several surfaces' block readings into one. A token printed by two
 *  surfaces with two values is a bug in one of them; `figureConflicts` is what
 *  names it, and the LAST one wins, exactly as `mergeFigures` decides. */
export function mergeReadings(
  parts: readonly { measured: ReadingFigures; verdicts: Verdict[] }[],
): { measured: ReadingFigures; figures: FigureTable; verdicts: Verdict[] } {
  const measured = mergeFigures(parts.map((p) => p.measured))
  return { measured, figures: proseFigures(measured), verdicts: parts.flatMap((p) => p.verdicts) }
}

/** The month's denominators as the method page wants them: the audiences that
 *  actually hold something, biggest first, with the category named. */
export function denominatorsOf(coverage: readonly CoverageRecord[] | null, label: (audience: string) => string): BriefDenominator[] {
  if (!coverage) return []
  return coverage
    .filter((c) => c.videos > 0 || c.comments > 0)
    .map((c) => ({ audience: c.audience, label: label(c.audience), videos: c.videos, comments: c.comments }))
    .sort((a, b) => b.videos - a.videos || a.label.localeCompare(b.label))
}
