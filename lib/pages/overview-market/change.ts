import {
  pairSentence, RECHECK_BUYERS_TOO_FEW, RECHECK_CHECKS_PENDING, RECHECK_FOLLOWS_DEPTH, RECHECK_MOVED,
  RECHECK_TOO_FEW, RECHECK_WITHIN,
} from '../../calibration'
import { fmtInt, longMonth, shortDate } from '../../format'
import { monthShareWord } from '../../provenance/searches'
import { KIND_LABELS } from '../../reading/kinds'
import { levelText } from '../../reading/level'
import { CHECK_MIN_VIDEOS, DENSE_MIN_DATED, mayPrintMoved, type CheckOutcome, type RecheckPopulation } from '../../reading/recheck'
import {
  COMPARE_FLAG_SHARE,
  COMPARE_REFUSE_SHARE,
  DEPTH_RATIO_MIN,
  VIEWS_BY_SURFACE,
  isSearchSurface,
  joins,
  modeForShare,
  nextComparablePair,
  pairOnVerdict,
  pairShare,
  shareOf,
  type OurChange,
  type OurChangeSurface,
  type PairComparability,
  type PairRow,
} from '../../reading/comparability'
import { monthStartOf, nextMonth } from '../../reading/month-key'
import type { FigureTable, Verdict } from '../../reading/verdicts'
import { marketKindLabel } from './kinds'

// "What changed, and what is ours" (market-first WP1.6, plan §2.2 block 10),
// and the three pieces of Settings › What we changed that ship with it (the
// dated list, "Why September is not compared", "When two months are
// compared").
//
// AT MOST TWO LINES ON THE FRONT PAGE AT DEPLOY 2 (three check lines join with
// WP2.3): the refusal, with its measured reach read with its update, and the
// first pair of months read the same way. The footer is the link to the dated
// list, never a note (25 Sep rulings).
//
// ONE SENTENCE FOR THE ONE FIGURE, EVERYWHERE. "About half of September came
// from searches we added in September (356 of 654, …)" is WP1.8's one figure,
// settled by the ruling of 26 Sep: the later month's market videos found only
// by searches first run in that month, over the market (`PairRow.addedOnly`,
// `month_pair_comparability.added_only_curr` of `market_videos_curr`, written
// by measure-comparability). The brief, this block, the monthly's change
// section and Settings › What we changed print it off the same row, its share
// word from one fixed ladder (`monthShareWord`), never typed into copy. It is
// composed here and nowhere else.
//
// THE STRICT COUNT IS NOT THIS FIGURE. `searchOutside` (not surfaced by any
// search that ran unchanged through both months) also holds the videos only
// the searches removed on 9 Sep found, and it is a category count. It stays
// decision D's rule 2 and nothing else: whether the pair refuses on searches
// (so whether the sentence prints at all), the 1% to 9% flag, and rule 2's
// cell in "When two months are compared" (`compareRules`). It is never
// printed as "came from searches we added". With no measured figure the
// block prints the refusal with no figure.
//
// PURE.

export interface LedgerLine {
  changeId: string
  /** When the change was made (`config_changes.changed_at`). */
  date: string
  surface: OurChangeSurface
  /** The change in client words. */
  words: string
  /** A description under the words, where the change's own note is client
   *  words (market-first's gate_rule, attribution and segment rows). Additive. */
  detail?: string | null
  /** The change's reach in the month it was made, read with its update; null
   *  where nobody has measured it. */
  reach: { month: string; touched: number; of: number; readWith: string } | null
  /** Every month it touched, oldest first (the months a reader sees in the
   *  dated list). Additive to the pinned shape: a change made on 9 Sep brought
   *  in videos in August and in September. */
  months?: { month: string; touched: number; of: number; readWith: string | null }[]
}

/** WP2.3's check lines: one printed line each, at most `CHECK_LINES_MAX`
 *  on the front page and in the monthly (`buildCheckLines`). */
export interface CheckLine {
  objectKind: 'subject' | 'kind' | 'mood' | 'theme'
  objectId: string
  label: string
  population: 'same_searches_clean' | 'dense20' | 'equal_age' | 'all_but_noise'
  verdict: Verdict
  sentence: string
  populationShares: { makers: number; noise: number } | null
  /** The finish of the update the row was read with (`read_through_run`);
   *  '' where that run is not a delivered update the page holds. */
  readWith: string
  /** Every object the line speaks for, where it is more than its own (the
   *  depth line names each kind whose fall follows depth). Additive. */
  covers?: string[]
}

/** The buyers-only line's counts (plan WP2.3's done-when): the market's
 *  videos read as neither makers' nor off-topic (segments_v1, MF1
 *  `market_segment_counts`) in each month of the pair, as at the page's
 *  update. Null counts were not read. */
export interface BuyersLine {
  prevMonth: string
  month: string
  prev: number | null
  curr: number | null
  readWith: string | null
}

export interface ChangeBlock {
  prevMonth: string | null
  month: string
  /** The market view's pair (decision E: the market does not move when a
   *  video is re-filed). */
  pair: PairComparability | null
  next: { prevMonth: string; month: string; sameAgeFrom: string; inFullExpected: string } | null
  checks: CheckLine[]
  /** The date of the update the pair's measured row was read with
   *  (`row.readThroughRun`'s finish), or null where there is no row. */
  readWith?: string | null
  /** The tenant's updates are paused: no update is promised. */
  paused?: boolean
  /** The update the page is read as at (the bar's "as at"), which the month
   *  strip marks where it falls in a month it draws. Additive: a block stored
   *  before it draws no mark. */
  asAt?: string | null
  /** The days we changed what we search (`isSearchSurface`: terms, platforms,
   *  communities) inside the two months the block reads, oldest first, one
   *  instant a day: the strip's marks under those months (the preview's "our
   *  search changes, 9, 13 and 17 Sep"). Additive. */
  searchChanges?: string[]
  /** WP2.3, the re-check beside a refused pair: 'read' where rows for the
   *  pair were read (`checks` holds its lines), 'pending' where none can be
   *  read yet ("checks pending"). Null or absent: no re-check is printed (the
   *  pair was read the same way, its later month is still running, updates
   *  are paused, or the block was stored before WP2.3). Additive. */
  recheck?: 'read' | 'pending' | null
  /** WP2.3, the buyers-only line's counts, where the re-check prints.
   *  Additive. */
  buyers?: BuyersLine | null
}

/**
 * The block, from the page's judge and what it read (one builder for the front
 * page and Settings › What we changed, so the two print one sentence). The
 * next pair assumes nothing further changes, and says so in its words.
 */
export function buildChangeBlock(input: {
  prevMonth: string
  month: string
  /** The previous month has a row: without one there is no pair. */
  hasPrev: boolean
  pair: PairComparability
  changes: readonly OurChange[]
  pairRows: readonly PairRow[]
  nextUpdateAfter?: ((instant: string) => string | null) | null
  asAt: string | null
  paused: boolean
  /** Run id to finish instant, for "read with the {date} update". */
  runFinish: ReadonlyMap<string, string>
  /** WP2.3: the stored re-check rows (`comparability_checks`, any pair; null
   *  where they could not be read) and the buyers-only counts of the pair's
   *  two months. Absent: a page built without the re-check. */
  recheck?: { rows: readonly StoredCheck[] | null; buyers: { prev: number | null; curr: number | null } | null } | null
}): ChangeBlock {
  const next = nextComparablePair(input.asAt ?? `${input.month}T12:00:00.000Z`, input.changes, input.pairRows, {
    view: 'market',
    readingMonth: input.month,
    ...(input.nextUpdateAfter ? { nextUpdateAfter: input.nextUpdateAfter } : {}),
  })
  const readRun = input.pair.row?.readThroughRun ?? null
  const pair = input.hasPrev ? input.pair : null
  const rows = (input.recheck?.rows ?? []).filter((r) => monthStartOf(r.prev_month) === monthStartOf(input.prevMonth) && monthStartOf(r.month) === monthStartOf(input.month))
  const shows = input.recheck != null && recheckShows(pair, input.paused, rows.length > 0)
  const checks = shows ? buildCheckLines({ rows, month: input.month, runFinish: input.runFinish }) : []
  const counts = input.recheck?.buyers ?? null
  return {
    prevMonth: input.hasPrev ? input.prevMonth : null,
    month: input.month,
    pair,
    next: next ? { prevMonth: next.prevMonth, month: next.month, sameAgeFrom: next.sameAgeFrom, inFullExpected: next.inFullExpected } : null,
    checks,
    readWith: readRun ? input.runFinish.get(readRun) ?? null : null,
    paused: input.paused,
    asAt: input.asAt,
    searchChanges: searchChangeDays(input.changes, input.prevMonth, input.month),
    recheck: shows ? (checks.length > 0 ? 'read' : 'pending') : null,
    buyers: shows && counts ? { prevMonth: input.prevMonth, month: input.month, prev: counts.prev, curr: counts.curr, readWith: input.asAt } : null,
  }
}

/**
 * One instant a day on which we changed what we search, from the first day of
 * `from` to the end of `to`, oldest first (the first change of each UTC day).
 * A change of ours to how we check or file videos is not a search change and
 * is not marked: the strip's key says "our search changes".
 */
export function searchChangeDays(changes: readonly OurChange[], from: string, to: string): string[] {
  const lo = Date.parse(`${monthStartOf(from)}T00:00:00.000Z`)
  const hi = Date.parse(`${nextMonth(to)}T00:00:00.000Z`)
  const byDay = new Map<string, { at: string; ms: number }>()
  for (const c of changes) {
    if (!isSearchSurface(c.surface)) continue
    const ms = Date.parse(c.changedAt)
    if (Number.isNaN(ms) || ms < lo || ms >= hi) continue
    const day = new Date(ms).toISOString().slice(0, 10)
    const had = byDay.get(day)
    if (!had || ms < had.ms) byDay.set(day, { at: c.changedAt, ms })
  }
  return [...byDay.values()].sort((a, b) => a.ms - b.ms).map((d) => d.at)
}

/**
 * The strip's key, "our search changes, 9, 13 and 17 Sep": each month named
 * once, after its last day ("28 Aug and 9 Sep"). Null where there is none.
 */
export function searchChangesLine(days: readonly string[]): string | null {
  if (days.length === 0) return null
  const dates = days.map((d) => shortDate(d).split(' ') as [string, string])
  const labels = dates.map(([day, month], i) => (dates[i + 1]?.[1] === month ? day : `${day} ${month}`))
  const list = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
  return `our search ${days.length === 1 ? 'change' : 'changes'}, ${list}`
}

/**
 * Where an instant sits in a month's cell, as a share of its width: the
 * middle of its UTC day, so the preview's 9 Sep mark stands at 8.5 of
 * September's 30. Null where the instant is in another month.
 */
export function placeInMonth(iso: string, month: string): number | null {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms) || monthStartOf(iso) !== monthStartOf(month)) return null
  const d = new Date(ms)
  const days = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  return (d.getUTCDate() - 0.5) / days
}

/**
 * Were the two months read the same way? Comparable, or flagged for run health
 * alone (rule 6's `gather` reason: a partial or spending-capped update), which
 * is none of decision D's four rules and adds no flag to a verdict
 * (`pairOnVerdict`). A capped Sunday in October flags October against November
 * (R-c, lib/reading/gather-flags.ts), and that pair must still read as the
 * first one read the same way (deploy 2 review): its verdicts print as a
 * comparable pair's do.
 */
export function readTheSameWay(pair: Pick<PairComparability, 'mode' | 'reasons'> | null | undefined): boolean {
  if (!pair) return false
  if (pair.mode === 'comparable') return true
  return pair.mode === 'flag' && pair.reasons.length > 0 && pair.reasons.every((r) => r.kind === 'gather')
}

/**
 * Does the pair's row measure the pair as it stands? The judge attaches the
 * latest row even where it no longer measures the pair: after a Sunday update
 * and before the Monday re-run of measure-comparability, the (Aug, Sep) row
 * read through the 27 Sep update is still attached on 4 Oct, and the judge
 * counts the pair `unmeasured` (its changes at 10%, decision D). A figure
 * printed from that row then sat beside rules that say "not measured yet"
 * (deploy 2 review). So every figure this file prints from a row needs the
 * judge to have measured the pair with it: no `unmeasured` reason. A month
 * still running, or not read past its end, is refused before the row is
 * checked, and its row still says why the next read will refuse too (the
 * preview's cells on 24 Sep), dated by the update it was read with.
 */
export function rowMeasuresPair(pair: Pick<PairComparability, 'row' | 'reasons'> | null | undefined): boolean {
  return pair?.row != null && !pair.reasons.some((r) => r.kind === 'unmeasured')
}

export const CHANGE_NEW = 'change_new_search_videos'
export const CHANGE_OF = 'change_month_videos'

/**
 * The block's first line, with its figures as tokens: the measured sentence
 * where the pair is refused on what we search and a row measured it, else the
 * pair's own refusal words (`pairSentence`), the flag note, or, for a pair read
 * the same way, a plain statement that it was.
 */
export function changeLead(block: ChangeBlock): { body: string; figures: FigureTable } | null {
  const pair = block.pair
  if (!pair || !block.prevMonth) {
    return { body: `Nothing is compared yet: ${longMonth(block.month)} is the first month we read.`, figures: {} }
  }
  if (readTheSameWay(pair)) {
    return { body: `${longMonth(pair.prevMonth)} and ${longMonth(pair.month)} were read the same way.`, figures: {} }
  }
  const measured = measuredSearchSentence(block)
  if (measured) return measured
  const note = pairOnVerdict(pair).note
  return note ? { body: pairSentence(note), figures: {} } : null
}

/** The pair's measured added-only figure (`PairRow.addedOnly`) with its share
 *  word and its share, where one was measured and is above none: a zero is
 *  never printed as "none of September came from…" (the pair then refused on
 *  the searches we removed, which the sentence does not name). */
export function measuredAddedOnly(block: ChangeBlock): { k: number; n: number; word: string; share: number } | null {
  if (!rowMeasuresPair(block.pair)) return null
  const added = block.pair?.row?.addedOnly
  const share = added ? shareOf(added) : null
  if (!added || share == null || !(added.k > 0)) return null
  const word = monthShareWord(added.k, added.n)
  return word ? { k: added.k, n: added.n, word, share } : null
}

/**
 * THE FIGURE PRINTS AS A REASON ONLY WHERE IT IS ONE (deploy 2 review). The
 * strict count decides whether the pair is refused on what we search; the
 * added-only figure is another population (only the searches first run in the
 * later month), and it can be tiny where the strict count is large: July
 * against August is refused on searches at 170 of 351 (the September terms read
 * back into August), while August's added-only figure is 2 of 377. Printed as
 * the refusal's reason, "under a tenth of August came from searches we added in
 * August (2 of 377)" gave a cause that could never refuse a pair, beside a chip
 * that names September. So the figure is the reason only where it reaches the
 * judge's own line itself: the refuse line (a tenth) for the sentence that says
 * why the pair is not compared, the flag line (1%) for a stat cell, which
 * prints a measure that does not hold. Below its line the block prints the
 * pair's refusal with no figure.
 */
const addedOnlyAtLine = (added: { share: number }, line: 'refuse' | 'flag'): boolean =>
  line === 'refuse' ? modeForShare(added.share) === 'refuse' : modeForShare(added.share) !== 'comparable'

/** The figures of the one sentence, as tokens. */
function addedOnlyFigures(month: string, added: { k: number; n: number }): FigureTable {
  return {
    [CHANGE_NEW]: { value: added.k, unit: 'videos', label: `${month}'s market videos found only by searches we added in ${month}` },
    [CHANGE_OF]: { value: added.n, unit: 'videos', label: `videos in your market in ${month}` },
  }
}

/**
 * "Not a change we can stand behind yet: about half of September came from
 * searches we added in September (356 of 654, read with the 20 Sep update)."
 * (the approved preview's sentence, the 26 Sep ruling's staging figure).
 *
 * Only where the pair is REFUSED ON WHAT WE SEARCH (the strict count's rule 2
 * decides) and the row measured WP1.8's figure (`PairRow.addedOnly`) at a
 * tenth or more (`addedOnlyAtLine`); null otherwise, and the block then prints
 * the pair's refusal with no figure,
 * never the strict count. One denominator: the later month's market videos.
 * The share word comes from `monthShareWord`'s ladder.
 */
export function measuredSearchSentence(block: ChangeBlock): { body: string; figures: FigureTable } | null {
  const pair = block.pair
  const row = pair?.row
  if (!pair || pair.mode !== 'refuse' || !row) return null
  const searches = pair.reasons.find((r) => r.kind === 'searches' && modeForShare(r.share) === 'refuse')
  if (!searches) return null
  const added = measuredAddedOnly(block)
  if (!added || !addedOnlyAtLine(added, 'refuse')) return null
  const month = longMonth(pair.month)
  return {
    body: `Not a change we can stand behind yet: ${added.word} of ${month} came from searches we added in ${month} ([[${CHANGE_NEW}]] of [[${CHANGE_OF}]]${readWithClause(block)}).`,
    figures: addedOnlyFigures(month, added),
  }
}

/** ", read with the 20 Sep update": the update the pair's row read through
 *  (`block.readWith`), or nothing where that update is unknown. The one date
 *  form of the figure on every surface. */
function readWithClause(block: ChangeBlock): string {
  return block.readWith ? `, read with the ${shortDate(block.readWith)} update` : ''
}

/**
 * Settings › What we changed's form of the same sentence (the approved
 * `SettingsRecord` artboard): "About half of September came from searches we
 * added in September: 356 of 654, read with the 20 Sep update." Dated as the
 * front page dates it, by the update the row read through, never by when the
 * row was computed (deploy 2 wording read item 32, Heinrich 27 Sep: "measured
 * on 26 Sep" beside a heading's "read with the 20 Sep update" was two dates
 * for one figure, and after a re-run it would read "measured on 5 Oct" beside
 * "read with the 4 Oct update"). The same gate as `measuredSearchSentence`.
 */
export function addedOnlyRecordSentence(block: ChangeBlock): { body: string; figures: FigureTable } | null {
  const lead = measuredSearchSentence(block)
  const added = measuredAddedOnly(block)
  const pair = block.pair
  if (!lead || !added || !pair) return null
  const month = longMonth(pair.month)
  const word = `${added.word.charAt(0).toUpperCase()}${added.word.slice(1)}`
  return {
    body: `${word} of ${month} came from searches we added in ${month}: [[${CHANGE_NEW}]] of [[${CHANGE_OF}]]${readWithClause(block)}.`,
    figures: addedOnlyFigures(month, added),
  }
}

/** "The first comparison read the same way: October against November, from
 *  the 6 Dec update, if nothing we search changes." Null where there is none
 *  to name, where it is the pair the block already reads and that pair is
 *  joined (comparable, or flagged: a capped update's flag included), or where
 *  updates are paused (no update is promised). */
export function nextPairLine(block: ChangeBlock): string | null {
  const parts = nextPairParts(block)
  return parts ? `${parts.lead}${parts.pair}${parts.tail}` : null
}

/** The same sentence in three parts, so Settings › What we changed can set
 *  the pair itself in weight, as the approved preview does ("…is **October
 *  against November, from the 6 Dec update**…"). One sentence, one source. */
export function nextPairParts(block: ChangeBlock): { lead: string; pair: string; tail: string } | null {
  const next = block.next
  if (!next || block.paused) return null
  const pair = block.pair
  if (pair && joins(pair) && monthStartOf(next.prevMonth) === monthStartOf(pair.prevMonth) && monthStartOf(next.month) === monthStartOf(pair.month)) return null
  return {
    // MONTH-ON-MONTH, SAID (finish-list item 9): Your market also names the
    // first week-on-week comparison (the 25 Oct update).
    lead: 'The first month-on-month comparison read the same way: ',
    pair: `${longMonth(next.prevMonth)} against ${longMonth(next.month)}, from the ${shortDate(next.sameAgeFrom)} update`,
    tail: ', if nothing we search changes.',
  }
}

// ---- When two months are compared (decision D) -----------------------------------------

export interface CompareRule {
  n: 1 | 2 | 3 | 4
  rule: string
  /** How the page's pair stands on the rule: held, not held, or not measured
   *  yet (which counts as not held, decision D). */
  state: 'held' | 'not_held' | 'unmeasured'
  /** The answer in words, with its figure where there is one. */
  answer: string
  /** The answer's figures, where it is a count ("206 of 625") or a pair of
   *  medians ("15 against 23"), so the page can set them as figures. The
   *  words are `answer`'s. Additive. */
  counts?: { figure: number; word: 'of' | 'against'; base: number }
  /** The view the answer is for, where it is not the market's: rule 3 held
   *  for the market but not for themes, which are grouped in the category
   *  (the artboard's "63 of 626, for themes"). Additive. */
  view?: 'themes'
}

export const COMPARE_RULES: readonly string[] = [
  'The newer month has ended, and an update has read past its end.',
  'Under 10% of either month’s videos came from searches that did not run unchanged through both.',
  'No change of ours to how we check or file videos touched 10% or more of either month.',
  'The newer month’s threads have filled to at least four fifths of the older month’s depth, in dated comments a video.',
]

const pctText = (share: number): string => `${Math.round(share * 100)}%`

type CodeEntry = PairRow['codeChanges'][number]

/** The side a change's judged share came from: the entry (market or
 *  category) whose pair share is the reason's, then its larger side, as
 *  rule 2 prints the larger of the two months. */
function judgedSide(entries: readonly CodeEntry[], share: number | null): CodeEntry['curr'] | null {
  if (share == null) return null
  const e = entries.find((x) => pairShare(x.prev, x.curr) === share)
  if (!e) return null
  return (shareOf(e.curr) ?? 0) >= (shareOf(e.prev) ?? 0) ? e.curr : e.prev
}

/**
 * The four rules, and how one pair stands on each (the preview's "August
 * against September" column). Read off the pair judgement and its measured
 * row, never recomputed: a rule the pair did not reach (a so-far month returns
 * before the shares) reads "not measured yet" unless the row answers it.
 */
export function compareRules(pair: PairComparability | null): CompareRule[] {
  const kinds = new Set(pair?.reasons.map((r) => r.kind) ?? [])
  // A row that no longer measures the pair (`rowMeasuresPair`) answers no
  // rule: rules 2 to 4 read "not measured yet", as the judge counts them.
  const row = rowMeasuresPair(pair) ? pair?.row ?? null : null
  const month = pair ? longMonth(pair.month) : ''

  const r1: CompareRule = !pair
    ? { n: 1, rule: COMPARE_RULES[0], state: 'unmeasured', answer: 'no pair to read' }
    : kinds.has('incomplete')
      ? { n: 1, rule: COMPARE_RULES[0], state: 'not_held', answer: `${month} is not over` }
      : kinds.has('not_read_to_end')
        ? { n: 1, rule: COMPARE_RULES[0], state: 'not_held', answer: `${month} was not read past its end` }
        : { n: 1, rule: COMPARE_RULES[0], state: 'held', answer: `${month} has ended and was read past it` }

  let r2: CompareRule = { n: 2, rule: COMPARE_RULES[1], state: 'unmeasured', answer: 'not measured yet' }
  if (row) {
    const { prev, curr } = row.searchOutside
    const share = pairShare(prev, curr)
    if (share != null) {
      const side = (shareOf(curr) ?? 0) >= (shareOf(prev) ?? 0) ? curr : prev
      const held = share < COMPARE_REFUSE_SHARE
      r2 = { n: 2, rule: COMPARE_RULES[1], state: held ? 'held' : 'not_held', answer: `${fmtInt(side.k)} of ${fmtInt(side.n)}`, counts: { figure: side.k, word: 'of', base: side.n } }
    }
  }

  const codes = pair?.reasons.filter((r) => r.kind === 'code_change') ?? []
  let r3: CompareRule
  if (!row) {
    r3 = { n: 3, rule: COMPARE_RULES[2], state: 'unmeasured', answer: 'not measured yet' }
  } else if (codes.some((r) => r.share == null)) {
    r3 = { n: 3, rule: COMPARE_RULES[2], state: 'unmeasured', answer: 'a change of ours is not measured yet' }
  } else if (codes.length > 0) {
    const worst = codes.reduce((a, b) => ((b.share ?? 0) > (a.share ?? 0) ? b : a))
    const held = (worst.share ?? 0) < COMPARE_REFUSE_SHARE
    // THE COUNT, NOT A ROUNDED SHARE (the approved preview's "63 of 626"): the
    // gate fix's 63 of 655 is 9.6%, which rounds to "10%" beside a rule that
    // says "10% or more" and a mark that says it held.
    // A change's entries may be keyed on any of its grouped rows, so where
    // none carries the reason's id the share alone finds the entry.
    const own = row.codeChanges.filter((e) => e.changeId === worst.changeId)
    const side = judgedSide(own.length > 0 ? own : row.codeChanges, worst.share)
    r3 = side
      ? { n: 3, rule: COMPARE_RULES[2], state: held ? 'held' : 'not_held', answer: `${fmtInt(side.k)} of ${fmtInt(side.n)}`, counts: { figure: side.k, word: 'of', base: side.n } }
      : { n: 3, rule: COMPARE_RULES[2], state: held ? 'held' : 'not_held', answer: pctText(worst.share ?? 0) }
  } else {
    r3 = { n: 3, rule: COMPARE_RULES[2], state: 'held', answer: 'none touched a tenth' }
  }
  // HELD FOR THE MARKET IS NOT HELD FOR THEMES (deploy 2 review; the
  // `SettingsRecord` artboard's rule 3, "63 of 626, for themes"). Themes are
  // grouped in the category, and a themes comparison divides by the category
  // (decision E), so the gate fix's 65 of 654 market videos (under a tenth)
  // is 64 of 625 category videos (over it), and the record beside this table
  // says it stops August against September for themes. A rule held on the
  // market's entries is read again on the category's, and where one of them
  // reaches a tenth the rule does not hold, for themes, with that count.
  if (row && r3.state === 'held') {
    let themes: { entry: CodeEntry; share: number } | null = null
    for (const e of row.codeChanges) {
      if (e.population !== 'category' || !(VIEWS_BY_SURFACE[e.surface] ?? []).includes('themes')) continue
      const share = pairShare(e.prev, e.curr)
      if (share == null || share < COMPARE_REFUSE_SHARE) continue
      if (!themes || share > themes.share) themes = { entry: e, share }
    }
    if (themes) {
      const side = (shareOf(themes.entry.curr) ?? 0) >= (shareOf(themes.entry.prev) ?? 0) ? themes.entry.curr : themes.entry.prev
      r3 = { n: 3, rule: COMPARE_RULES[2], state: 'not_held', answer: `${fmtInt(side.k)} of ${fmtInt(side.n)}, for themes`, counts: { figure: side.k, word: 'of', base: side.n }, view: 'themes' }
    }
  }

  let r4: CompareRule = { n: 4, rule: COMPARE_RULES[3], state: 'unmeasured', answer: 'not measured yet' }
  const depth = row?.depth
  if (depth && depth.prevMedian != null && depth.currMedian != null && Number.isFinite(depth.prevMedian) && Number.isFinite(depth.currMedian) && depth.prevMedian > 0) {
    const held = depth.currMedian / depth.prevMedian >= DEPTH_RATIO_MIN
    r4 = { n: 4, rule: COMPARE_RULES[3], state: held ? 'held' : 'not_held', answer: `${fmtInt(depth.currMedian)} against ${fmtInt(depth.prevMedian)}`, counts: { figure: depth.currMedian, word: 'against', base: depth.prevMedian } }
  }
  return [r1, r2, r3, r4]
}

// ---- Why September is not compared (the preview's three stat cells) ---------------------

/**
 * One of the section's stat cells: a measured figure, its base ("of 654" for
 * a count of the month's videos, "against 21" for the older month's median),
 * what it counts, and the update it was read with.
 */
export interface WhyCell {
  key: 'searches' | 'code_change' | 'depth'
  figure: number
  base: { word: 'of' | 'against'; value: number }
  caption: string
  /** The date of the update the measure was read with; null where unknown. */
  readWith: string | null
}

/** What a change of ours to how we check or file videos did to the month's
 *  videos, per surface, after "{n} {Month} videos". The gate fix's words are
 *  the approved preview's and its approved note's ("let in without that
 *  check"); any other surface says what rule 3 says. */
const CODE_CHANGE_CAPTION: Partial<Record<OurChangeSurface, string>> = {
  gate_rule: 'had been let in without our relevance check',
  regate: 'were checked again for relevance',
}

/**
 * The measured figures behind the refusal, read off the pair's row (never
 * recomputed): what came from searches added in the month (rule 2), the
 * largest change of ours to how we check or file videos that the page's view
 * divides by (rule 3), and the depth of the month's threads against the month
 * before (rule 4). A cell prints only where its measure does not hold, at the
 * judge's own lines (a share of 1% or more flags; depth under four fifths
 * refuses), and only where it was measured: nothing is printed as a zero.
 *
 * FROM THE ROW, NOT FROM THE REASONS. A month still running (or not yet read
 * past its end) is refused before the shares are judged, and its row still
 * says why the next read will refuse too: the preview's cells on 24 Sep. The
 * update each figure was read with prints beside it.
 */
export function whyCells(block: ChangeBlock): WhyCell[] {
  const pair = block.pair
  const row = pair?.row ?? null
  if (!pair || !row || readTheSameWay(pair) || !rowMeasuresPair(pair)) return []
  const month = longMonth(pair.month)
  const readWith = block.readWith ?? null
  const cells: WhyCell[] = []

  // Rule 2's strict share decides WHETHER the cell prints (a flag or worse);
  // WP1.8's one figure is WHAT it prints (the 26 Sep ruling): "356 of 654
  // September videos came from searches we added in September", and only where
  // that figure itself reaches the flag line (`addedOnlyAtLine`). The strict
  // count is never printed here, and with no measured figure there is no cell.
  const searchShare = pairShare(row.searchOutside.prev, row.searchOutside.curr)
  const added = measuredAddedOnly(block)
  if (searchShare != null && searchShare >= COMPARE_FLAG_SHARE && added && addedOnlyAtLine(added, 'flag')) {
    cells.push({
      key: 'searches',
      figure: added.k,
      base: { word: 'of', value: added.n },
      caption: `${month} videos came from searches we added in ${month}`,
      readWith,
    })
  }

  // The market view's entries: a change re-filing videos does not move the
  // market (decision E), so its measure is not this pair's.
  const byChange = new Map<string, CodeEntry[]>()
  for (const e of row.codeChanges) {
    if (!(VIEWS_BY_SURFACE[e.surface] ?? []).includes('market')) continue
    byChange.set(e.changeId, [...(byChange.get(e.changeId) ?? []), e])
  }
  let worst: { entry: CodeEntry; share: number } | null = null
  for (const entries of byChange.values()) {
    const entry = entries.find((e) => (e.population ?? 'market') === 'market') ?? entries[0]
    const share = pairShare(entry.prev, entry.curr)
    if (share == null || share < COMPARE_FLAG_SHARE || shareOf(entry.curr) == null) continue
    if (!worst || share > worst.share) worst = { entry, share }
  }
  if (worst) {
    const what = CODE_CHANGE_CAPTION[worst.entry.surface] ?? 'were touched by a change of ours to how we check or file videos'
    cells.push({
      key: 'code_change',
      figure: worst.entry.curr.k,
      base: { word: 'of', value: worst.entry.curr.n },
      caption: `${month} videos ${what}`,
      readWith,
    })
  }

  const { prevMedian, currMedian } = row.depth
  if (prevMedian != null && currMedian != null && Number.isFinite(prevMedian) && Number.isFinite(currMedian) && prevMedian > 0 && currMedian >= 0
    && currMedian / prevMedian < DEPTH_RATIO_MIN) {
    const soFar = pair.reasons.some((r) => r.kind === 'incomplete') ? ' so far' : ''
    cells.push({
      key: 'depth',
      figure: currMedian,
      base: { word: 'against', value: prevMedian },
      caption: `Dated comments a video: ${month}’s median${soFar}, against ${longMonth(pair.prevMonth)}’s`,
      readWith,
    })
  }
  return cells
}

/** "Why September is not compared": the measured cells behind the refusal
 *  (`whyCells`), and, where none was measured, the one sentence in Settings'
 *  form (`addedOnlyRecordSentence`) or the pair's chip words. Null where the
 *  pair is read the same way (`readTheSameWay`). */
export function whyNotCompared(block: ChangeBlock): { title: string; body: string; figures: FigureTable; cells: WhyCell[] } | null {
  const pair = block.pair
  if (!pair || readTheSameWay(pair)) return null
  const lead = addedOnlyRecordSentence(block)
  const note = pairOnVerdict(pair).note
  const body = lead?.body ?? (note ? pairSentence(note) : null)
  const cells = whyCells(block)
  if (!body && cells.length === 0) return null
  return { title: `Why ${longMonth(pair.month)} is not compared`, body: body ?? '', figures: lead?.figures ?? {}, cells }
}

// ---- The re-check on the searches both months ran (WP2.3) -------------------------------

/**
 * DECISION D's SECONDARY LINE, BESIDE A REFUSED PAIR (plan WP2.3). The same two
 * months read again on the searches both of them ran without makers and
 * off-topic videos, and among well-read videos, by scripts/comparability-checks.ts
 * into `comparability_checks` (MF2). The page never recomputes one: it reads
 * the newest row per object and population and says what it found, in the
 * outcome sentences `lib/calibration.ts` holds.
 *
 * AT MOST THREE LINES (`CHECK_LINES_MAX`), the rest waiting for Subjects'
 * checks block in December:
 *   1. the searches both months ran, without makers and off-topic videos: one
 *      line where that population is under 100 videos on a side ("Too few
 *      videos on the searches both months ran to check."), else one for each
 *      candidate decision D names, "asking for something" and buying interest;
 *   2. the kinds whose fall across the whole market is gone among well-read
 *      videos: "The fall follows how deeply September's videos have been read,
 *      not the market.";
 *   3. the buyers-only line, where a month is under 100 buyers' videos and
 *      there is room (`recheckLines`).
 *
 * A "MOVED" PRINTS ONLY WHERE IT MAY (`mayPrintMoved`): on the searches both
 * months ran and with 100 videos a side, and always "Provisional.". A stored
 * "moved" among well-read videos, or on everything but the off-topic videos,
 * is never read here (staging's plan holds six).
 *
 * WHEN IT PRINTS (`recheckShows`): beside a pair REFUSED once its later month
 * has ended. A month still running is refused as "not compared until it has
 * ended", which the block's first line already says; the script refuses to
 * write a month not read past its end, so until the first rows land the
 * re-check reads "checks pending" (real-volume graft 1). A paused tenant is
 * never told "pending" (no update is coming): it prints the rows it has, or
 * nothing.
 */

/** A `comparability_checks` row as the page reads it (MF2). */
export interface StoredCheck {
  prev_month: string
  month: string
  population: string
  object_kind: string
  object_id: string
  k_prev: number | null
  n_prev: number | null
  k_curr: number | null
  n_curr: number | null
  /** `numeric` columns come back from PostgREST as strings. */
  population_makers: number | string | null
  population_noise: number | string | null
  verdict: Verdict
  outcome: string
  read_through_run: string | null
  computed_at: string
}

export const CHECK_LINES_MAX = 3
/** Decision D's two candidates, in its order: wishes, then buying interest. */
export const RECHECK_CANDIDATES = ['feature_request', 'purchase_intent'] as const
const CHECK_KINDS: ReadonlySet<string> = new Set(['subject', 'kind', 'mood', 'theme'])
const KIND_ORDER = Object.keys(KIND_LABELS)

/** Does the block print a re-check beside this pair? A paused tenant prints
 *  one only where rows were read (`hasRows`): no update is coming to read
 *  them, so it is never told "checks pending". */
export function recheckShows(pair: Pick<PairComparability, 'mode' | 'reasons'> | null | undefined, paused: boolean, hasRows = false): boolean {
  if (!pair || pair.mode !== 'refuse' || readTheSameWay(pair)) return false
  if (pair.reasons.some((r) => r.kind === 'incomplete')) return false
  return !paused || hasRows
}

/** The newest row per population and object (the table is append-only and
 *  the newest `computed_at` wins, plan §4.0 rollback rule 4). */
export function newestChecks(rows: readonly StoredCheck[]): StoredCheck[] {
  const out = new Map<string, StoredCheck>()
  for (const r of rows) {
    const key = `${r.population}|${r.object_kind}|${r.object_id}`
    const held = out.get(key)
    if (!held || Date.parse(r.computed_at) > Date.parse(held.computed_at)) out.set(key, r)
  }
  return [...out.values()]
}

const share = (x: number | string | null): number | null => {
  const v = x == null ? Number.NaN : Number(x)
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : null
}

/** A check's object as a reader is shown it: a kind by its market label
 *  ("Praising it"), a theme in quotation marks, so a kind and a theme are
 *  never read as each other (real-volume must-fix 2), the positive mood by
 *  name. */
export function checkLabel(r: Pick<StoredCheck, 'object_kind' | 'object_id' | 'verdict'>): string {
  if (r.object_kind === 'kind') return marketKindLabel(r.object_id)
  if (r.object_kind === 'theme') return `“${r.verdict?.objectLabel ?? r.object_id}”`
  if (r.object_kind === 'mood') return `${r.verdict?.objectLabel ?? r.object_id} mood`
  return r.verdict?.objectLabel ?? r.object_id
}

const lowerFirst = (s: string): string => `${s.charAt(0).toLowerCase()}${s.slice(1)}`
const list = (xs: readonly string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

/** Both sides of a population at the floor a "moved" needs. */
const sidesAtFloor = (r: Pick<StoredCheck, 'n_prev' | 'n_curr'>): boolean =>
  (r.n_prev ?? 0) >= CHECK_MIN_VIDEOS && (r.n_curr ?? 0) >= CHECK_MIN_VIDEOS

/**
 * The lines the front page and the monthly print, from the pair's stored rows
 * (see above): at most `CHECK_LINES_MAX`, each with the update it was read
 * with and its population's maker and noise shares.
 */
export function buildCheckLines(input: {
  rows: readonly StoredCheck[]
  /** The later month of the pair. */
  month: string
  runFinish: ReadonlyMap<string, string>
}): CheckLine[] {
  const newest = newestChecks(input.rows).filter((r) => CHECK_KINDS.has(r.object_kind) && r.verdict != null)
  const line = (r: StoredCheck, sentence: string, covers?: string[]): CheckLine => {
    const makers = share(r.population_makers)
    const noise = share(r.population_noise)
    return {
      objectKind: r.object_kind as CheckLine['objectKind'],
      objectId: r.object_id,
      label: checkLabel(r),
      population: r.population as CheckLine['population'],
      verdict: r.verdict,
      sentence,
      populationShares: makers != null && noise != null ? { makers, noise } : null,
      readWith: (r.read_through_run ? input.runFinish.get(r.read_through_run) : null) ?? '',
      ...(covers ? { covers } : {}),
    }
  }
  const out: CheckLine[] = []

  // 1. The searches both months ran, without makers and off-topic videos.
  const kinds = newest.filter((r) => r.population === 'same_searches_clean' && r.object_kind === 'kind')
  if (kinds.length > 0) {
    const candidates = RECHECK_CANDIDATES.map((id) => kinds.find((r) => r.object_id === id)).filter((r): r is StoredCheck => r != null)
    // The population's own size is every kind row's n: the videos in it.
    if (!sidesAtFloor(kinds[0])) {
      out.push(line(candidates[0] ?? kinds[0], RECHECK_TOO_FEW))
    } else {
      for (const r of candidates) {
        const label = checkLabel(r)
        if (mayPrintMoved({ population: r.population as RecheckPopulation, outcome: r.outcome as CheckOutcome }) && sidesAtFloor(r) && r.verdict.state === 'moved') {
          const from = levelText(r.k_prev ?? 0, r.n_prev)?.text
          const to = levelText(r.k_curr ?? 0, r.n_curr)?.text
          if (from && to) out.push(line(r, RECHECK_MOVED(label, from, to)))
        } else if (r.outcome === 'no_clear_change') {
          out.push(line(r, RECHECK_WITHIN(label)))
        } else if (r.outcome === 'too_few') {
          out.push(line(r, `${label}: ${lowerFirst(RECHECK_TOO_FEW)}`))
        }
      }
    }
  }

  // 2. The kinds whose fall follows depth, among well-read videos.
  const depth = newest
    .filter((r) => r.population === 'dense20' && r.object_kind === 'kind' && r.outcome === 'follows_depth')
    .sort((a, b) => KIND_ORDER.indexOf(a.object_id) - KIND_ORDER.indexOf(b.object_id))
  if (depth.length > 0) {
    const labels = depth.map(checkLabel)
    out.push(line(depth[0], `${list(labels)}: ${lowerFirst(RECHECK_FOLLOWS_DEPTH(input.month))}`, labels))
  }
  return out.slice(0, CHECK_LINES_MAX)
}

/** A share of a population in the words a reader would say ("about half"),
 *  never a bare percentage: the ladder of "about half of September came
 *  from…" (`monthShareWord`). */
function shareWords(s: number, noun: string): string {
  const w = monthShareWord(Math.round(s * 1000), 1000)
  return w === 'none' ? `no ${noun}` : `${w} ${noun}`
}

/**
 * A check line's tag: its population's maker and off-topic shares (plan
 * WP2.3: "printed beside every result") and the update it was read with
 * ("Every line says which update it was read with"). The shares are of the
 * population's videos before its own clean-up, so on the searches both months
 * ran they say what was left out.
 */
export function checkTag(c: Pick<CheckLine, 'population' | 'populationShares' | 'readWith' | 'verdict'>): string | null {
  const parts: string[] = []
  const s = c.populationShares
  if (s) {
    const both = `${shareWords(s.makers, 'makers')}, ${shareWords(s.noise, 'off-topic')}`
    if (c.population === 'same_searches_clean') parts.push(`${both}, left out`)
    else if (c.population === 'dense20') parts.push(`with ${DENSE_MIN_DATED} or more comments: ${both}`)
    else parts.push(both)
  }
  // A moved or within line prints two levels; their bases sit here, so the
  // sentence keeps one denominator's worth of words.
  const v = c.verdict
  if (c.population === 'same_searches_clean' && v.baseline && (v.state === 'moved' || v.state === 'no_clear_change')) {
    const month = (iso: string | undefined) => (iso ? longMonth(iso) : '')
    parts.push(`${month(v.basis?.from)} of ${fmtInt(v.baseline.n)}, ${month(v.basis?.to)} of ${fmtInt(v.value.n)}`)
  }
  if (c.readWith) parts.push(`read with the ${shortDate(c.readWith)} update`)
  return parts.length > 0 ? parts.join(' · ') : null
}

const buyersTooFew = (b: BuyersLine | null | undefined): boolean =>
  b != null && b.prev != null && b.curr != null && (b.prev < CHECK_MIN_VIDEOS || b.curr < CHECK_MIN_VIDEOS)

/** "too few in August to check", naming each month under the floor; null
 *  where neither is. */
function buyersSentence(b: BuyersLine | null | undefined): string | null {
  if (!b || b.prev == null || b.curr == null) return null
  const under = [b.prev < CHECK_MIN_VIDEOS ? b.prevMonth : null, b.curr < CHECK_MIN_VIDEOS ? b.month : null].filter((m): m is string => m != null)
  return under.length > 0 ? RECHECK_BUYERS_TOO_FEW(list(under.map((m) => longMonth(m)))) : null
}

/** The pending line's key: the box is titled "Re-check", untagged, over it. */
export const RECHECK_PENDING_KEY = 'pending'

/** One printed line of the re-check: its sentence and its tag. */
export interface RecheckLine {
  key: string
  sentence: string
  tag: string | null
}

/**
 * What the re-check prints, in order (the front page's block 10 and the
 * monthly's change section print these and nothing else, so they print one
 * sentence each): the check lines, or the pending line where none was read,
 * then the buyers-only line where there is room. Empty where the block prints
 * no re-check.
 */
export function recheckLines(block: Pick<ChangeBlock, 'checks'> & Partial<Pick<ChangeBlock, 'recheck' | 'buyers' | 'paused' | 'asAt'>>): RecheckLine[] {
  if (!block.recheck) return []
  if (block.paused && block.checks.length === 0) return []
  // A PENDING LINE SAYS WHICH UPDATE IT WAS READ WITH TOO (WP2.3: every line
  // does; the deploy-3 review): the page's latest update, in its tag.
  const out: RecheckLine[] = block.checks.length > 0
    ? block.checks.slice(0, CHECK_LINES_MAX).map((c) => ({ key: `${c.population}:${c.objectKind}:${c.objectId}`, sentence: c.sentence, tag: checkTag(c) }))
    : [{ key: RECHECK_PENDING_KEY, sentence: RECHECK_CHECKS_PENDING, tag: block.asAt ? `read with the ${shortDate(block.asAt)} update` : null }]
  // The buyers-only line says one thing: that a month is too few to check
  // (the done-when's "too few in August to check"). With 100 or more a side
  // there is no buyers-only check to report before the Buyers view (WP3.3),
  // and a second "pending" line would only repeat the first.
  const buyers = buyersTooFew(block.buyers) ? buyersSentence(block.buyers) : null
  if (buyers && out.length < CHECK_LINES_MAX) {
    out.push({ key: 'buyers', sentence: buyers, tag: block.buyers?.readWith ? `read with the ${shortDate(block.buyers.readWith)} update` : null })
  }
  return out
}
