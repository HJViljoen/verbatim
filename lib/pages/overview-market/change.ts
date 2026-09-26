import { pairSentence } from '../../calibration'
import { fmtInt, longMonth, shortDate } from '../../format'
import {
  COMPARE_REFUSE_SHARE,
  DEPTH_RATIO_MIN,
  modeForShare,
  pairOnVerdict,
  pairShare,
  shareOf,
  type OurChangeSurface,
  type PairComparability,
} from '../../reading/comparability'
import type { FigureTable, Verdict } from '../../reading/verdicts'

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
// ONE SENTENCE FOR THE ONE FIGURE, EVERYWHERE. "{measured} of September's
// videos came from searches we added in September" is WP1.8's one figure, and
// the brief, this block, the monthly's change section and Settings › What we
// changed print the same sentence off the same row (`month_pair_comparability`
// via the page's pair judge). It is composed here and nowhere else, so the
// words can change in one place once WP1.8 has named the population.
//
// PURE.

export interface LedgerLine {
  changeId: string
  /** When the change was made (`config_changes.changed_at`). */
  date: string
  surface: OurChangeSurface
  /** The change in client words. */
  words: string
  /** The change's reach in the month it was made, read with its update; null
   *  where nobody has measured it. */
  reach: { month: string; touched: number; of: number; readWith: string } | null
  /** Every month it touched, oldest first (the months a reader sees in the
   *  dated list). Additive to the pinned shape: a change made on 9 Sep brought
   *  in videos in August and in September. */
  months?: { month: string; touched: number; of: number; readWith: string | null }[]
}

/** WP2.3's check lines; none print before deploy 3. */
export interface CheckLine {
  objectKind: 'subject' | 'kind' | 'mood' | 'theme'
  objectId: string
  label: string
  population: 'same_searches_clean' | 'dense20' | 'equal_age' | 'all_but_noise'
  verdict: Verdict
  sentence: string
  populationShares: { makers: number; noise: number } | null
  readWith: string
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
  if (pair.mode === 'comparable') {
    return { body: `${longMonth(pair.prevMonth)} and ${longMonth(pair.month)} were read the same way.`, figures: {} }
  }
  const measured = measuredSearchSentence(block)
  if (measured) return measured
  const note = pairOnVerdict(pair).note
  return note ? { body: pairSentence(note), figures: {} } : null
}

/**
 * "Not a change we can stand behind yet: [290] of September's [655] videos
 * came from searches we added in September (read with the 27 Sep update)."
 *
 * Only where the pair is REFUSED ON WHAT WE SEARCH and a measured row carries
 * the later month's search-outside count (the strict count: videos not
 * surfaced by any search that ran unchanged through both months). One
 * denominator: the later month's market videos.
 */
export function measuredSearchSentence(block: ChangeBlock): { body: string; figures: FigureTable } | null {
  const pair = block.pair
  const row = pair?.row
  if (!pair || pair.mode !== 'refuse' || !row) return null
  const searches = pair.reasons.find((r) => r.kind === 'searches' && modeForShare(r.share) === 'refuse')
  if (!searches) return null
  const { k, n } = row.searchOutside.curr
  if (shareOf({ k, n }) == null) return null
  const month = longMonth(pair.month)
  const read = block.readWith ? ` (read with the ${shortDate(block.readWith)} update)` : ''
  return {
    body: `Not a change we can stand behind yet: [[${CHANGE_NEW}]] of ${month}’s [[${CHANGE_OF}]] videos came from searches we added in ${month}${read}.`,
    figures: {
      [CHANGE_NEW]: { value: k, unit: 'videos', label: `${month}'s videos that came from searches we added in ${month}` },
      [CHANGE_OF]: { value: n, unit: 'videos', label: `videos in your market in ${month}` },
    },
  }
}

/** "The first comparison read the same way: October against November, from
 *  the 6 Dec update, if nothing we search changes." Null where there is none
 *  to name, where it is the pair the block already reads, or where updates are
 *  paused (no update is promised). */
export function nextPairLine(block: ChangeBlock): string | null {
  const next = block.next
  if (!next || block.paused) return null
  if (block.pair?.mode === 'comparable' && next.month === block.month) return null
  return `The first comparison read the same way: ${longMonth(next.prevMonth)} against ${longMonth(next.month)}, from the ${shortDate(next.sameAgeFrom)} update, if nothing we search changes.`
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
}

export const COMPARE_RULES: readonly string[] = [
  'The newer month has ended, and an update has read past its end.',
  'Under 10% of either month’s videos came from searches that did not run unchanged through both.',
  'No change of ours to how we check or file videos touched 10% or more of either month.',
  'The newer month’s threads have filled to at least four fifths of the older month’s depth, in dated comments a video.',
]

const pctText = (share: number): string => `${Math.round(share * 100)}%`

/**
 * The four rules, and how one pair stands on each (the preview's "August
 * against September" column). Read off the pair judgement and its measured
 * row, never recomputed: a rule the pair did not reach (a so-far month returns
 * before the shares) reads "not measured yet" unless the row answers it.
 */
export function compareRules(pair: PairComparability | null): CompareRule[] {
  const kinds = new Set(pair?.reasons.map((r) => r.kind) ?? [])
  const row = pair?.row ?? null
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
      r2 = { n: 2, rule: COMPARE_RULES[1], state: held ? 'held' : 'not_held', answer: `${fmtInt(side.k)} of ${fmtInt(side.n)}` }
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
    r3 = { n: 3, rule: COMPARE_RULES[2], state: held ? 'held' : 'not_held', answer: pctText(worst.share ?? 0) }
  } else {
    r3 = { n: 3, rule: COMPARE_RULES[2], state: 'held', answer: 'none touched a tenth' }
  }

  let r4: CompareRule = { n: 4, rule: COMPARE_RULES[3], state: 'unmeasured', answer: 'not measured yet' }
  const depth = row?.depth
  if (depth && depth.prevMedian != null && depth.currMedian != null && Number.isFinite(depth.prevMedian) && Number.isFinite(depth.currMedian) && depth.prevMedian > 0) {
    const held = depth.currMedian / depth.prevMedian >= DEPTH_RATIO_MIN
    r4 = { n: 4, rule: COMPARE_RULES[3], state: held ? 'held' : 'not_held', answer: `${fmtInt(depth.currMedian)} against ${fmtInt(depth.prevMedian)}` }
  }
  return [r1, r2, r3, r4]
}

/** "Why September is not compared": the change block's own sentence, and the
 *  pair's chip words where no measured sentence applies. Null where the pair
 *  is read the same way. */
export function whyNotCompared(block: ChangeBlock): { title: string; body: string; figures: FigureTable } | null {
  const pair = block.pair
  if (!pair || pair.mode === 'comparable') return null
  const lead = measuredSearchSentence(block)
  const note = pairOnVerdict(pair).note
  const body = lead?.body ?? (note ? pairSentence(note) : null)
  if (!body) return null
  return { title: `Why ${longMonth(pair.month)} is not compared`, body, figures: lead?.figures ?? {} }
}
