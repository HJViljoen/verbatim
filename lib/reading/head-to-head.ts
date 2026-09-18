import { COMPETITIVE_MIN_VIDEOS } from '../config'
import { fmtInt, fmtPct, longMonth, monthName } from '../format'
import { EXCLUDED_NOTE } from './formats'
import { monthStartOf, nextMonth } from './month-key'
import { bandVerdict, type Counted, type Verdict } from './verdicts'

// CO3 — "Head to head, then and now", on the monthly reading (Phase 1 Block D,
// D6).
//
// WHAT IT REPLACES. `lib/competitive-tiles.ts:faceOffRows` builds the same five
// measures today and is bound to the PARKED run-indexed page
// (`lib/pages/competitive.ts`), where every figure is one update's — a number
// dated by our own gather cadence and printed under a month's name. This module
// is the same five measures re-based on the comment-dated months
// (`month_denominators`) for the two share measures, and on the published-video
// clock for the engagement one, with the clock named on the row either way.
//
// THE BADGE IS YOUR SIDE'S, MONTH ON MONTH — NEVER YOU AGAINST THEM. The
// artboard's own note says "your side carries the verdict badge", and that is
// also the only comparison the code can band: a difference between YOUR share
// of one denominator and THEIRS of another has no band and no shape here
// (decision D1 — the gap line is its own commissioned reading, not something
// this table may improvise). So each measure carries up to two verdicts, one
// per side, each comparing that side's month with its own previous month, and
// the cross-brand difference is left as two levels printed beside each other.
//
// THREE OF THE FIVE MEASURES GET NO BAND AT ALL, AND SAY SO. `proportionDelta`
// is a two-PROPORTION band: it needs a k of an n on both sides. Videos-about
// (a share of the month's tracked videos) and positive share (positives of
// judged) are proportions and are banded. Comments per video is a RATE, own
// posts published is a bare COUNT, and engagement per video is a MEDIAN of
// rates — none of the three is k of n, and running a proportion band over one
// would print a confidence the arithmetic does not have. The mock prints
// "+2", "+0.2 pt" and "▼ 2" on exactly those three; `verdictWhy` prints the
// reason in their place.

/** Fewer videos than this on a side and no comparison is attempted at all.
 *  `COMPETITIVE_MIN_VIDEOS` is the same floor CO2 and CO5 use. */
export const FACE_OFF_FLOOR = COMPETITIVE_MIN_VIDEOS

export type FaceOffKey = 'videos' | 'comments_per_video' | 'engagement' | 'sentiment' | 'posts'

export interface FaceOffLevel {
  /**
   * What the level was counted over.
   *
   * `n === 0` means the measure is a COUNT and not a share of anything — own
   * posts published, where a denominator would have to be invented. Every other
   * measure carries a real one, so a cell printed alone still shows its "of N".
   * On the engagement row `value` is the COVERAGE — the videos a rate was read
   * off, of the videos published — and the figure itself is in `text`, because
   * a median is not a numerator.
   */
  value: Counted
  /** The level as a percentage where the measure is one; null otherwise. */
  pct: number | null
  /** The figure as it prints, unit included. */
  text: string
}

export interface FaceOffSide extends FaceOffLevel {
  /** The same side, the month before — the "then" of "then and now". Absent
   *  where that month was not read. */
  prev?: FaceOffLevel
}

export interface FaceOffMeasure {
  key: FaceOffKey
  label: string
  /** What the row's figures are dated by, in the reader's words — the comment
   *  month for the share measures, the publication date for engagement. */
  basisLine: string
  you: FaceOffSide | null
  them: FaceOffSide | null
  /** Your side, this month against last. Only where both months clear the
   *  floor and the measure is a proportion. Never an arrow otherwise. */
  verdict: Verdict | null
  /** The rival's side, on the same terms. */
  rivalVerdict: Verdict | null
  /** Why no verdict was drawn, when the row itself is fine. */
  verdictWhy: string | null
  /** Why a side is empty, in the reader's words. */
  why: string | null
}

export interface HeadToHead {
  rivalAudience: string
  rivalLabel: string
  month: string
  measures: FaceOffMeasure[]
  /** "84 videos of theirs read this month" — `month_denominators.videos`. */
  footerLine: string
  /** The engagement exclusion note (Reddit, by the cap). */
  excludedNote: string
  /** Set when there is nothing to draw at all. */
  unread: string | null
}

/** One brand's month, as the four tables already hold it. */
export interface HeadToHeadSide {
  audience: string
  label: string
  /** `month_denominators` for this audience — null where the month has no row. */
  month: { videos: number; comments: number } | null
  previous: { videos: number; comments: number } | null
  /** Median engagement of the videos this audience PUBLISHED in the month, and
   *  the videos it was read off. Reddit already excluded by the caller. */
  engagement: { median: number | null; n: number }
  engagementPrev?: { median: number | null; n: number }
  /** Videos this audience published in the month — the engagement coverage's
   *  denominator. */
  published: number
  publishedPrev?: number
  /** Audience-family sentiment (`isAudienceSentiment`), this month and last. */
  sentiment: { positive: number; judged: number }
  sentimentPrev?: { positive: number; judged: number }
  /** Posts on the brand's own tracked accounts. Null where the census does not
   *  record this month — an em dash, never a false zero. */
  ownPosts: number | null
  ownPostsPrev?: number | null
}

export interface HeadToHeadInput {
  month: string
  previousMonth: string
  you: HeadToHeadSide
  them: HeadToHeadSide
  /** Every audience's videos in the month, summed — what a share is a share of. */
  readThisMonth: number
  readPreviousMonth: number
  /** Videos on a side below which no comparison is attempted. */
  floor?: number
}

const round1 = (n: number): number => Math.round(n * 10) / 10

const RATE_NOT_A_SHARE =
  'Comments per video is a rate, not a share of a population, so no band is drawn over it — both months are printed instead.'
const MEDIAN_NOT_A_SHARE =
  'Engagement is a median of per-video rates, not a share of a population, so no band is drawn over it — both months are printed instead.'
const COUNT_NOT_A_SHARE =
  'Posts published is a count with no denominator, so no band is drawn over it — both months are printed instead.'

const floorWhy = (floor: number): string =>
  `Under ${fmtInt(floor)} videos on a side, so no comparison is drawn.`

/**
 * The five measures, each grounded or dropped — never fabricated.
 *
 * A side that has no row in `month_denominators` for the month is `null` with a
 * sentence saying so, which is a different fact from a zero: "nothing of theirs
 * was read this month" and "they were read and published nothing" are two
 * answers and a table that prints 0 for both is wrong about one of them.
 */
export function headToHead(input: HeadToHeadInput): HeadToHead {
  const { you, them } = input
  const month = monthStartOf(input.month)
  const floor = input.floor ?? FACE_OFF_FLOOR
  // TWO CLOCKS ON ONE TABLE, AND EVERY ROW SAYS WHICH IT KEEPS. The share and
  // the rate come off `month_denominators`, which is comment-dated — the one
  // clock this product keeps for a period. Engagement, positive share and own
  // posts are properties of a VIDEO and are dated by its upload. Printing the
  // five under one month heading without naming the difference is decision D9's
  // exact defect, so the difference is named per row rather than argued once in
  // a footnote nobody reads.
  const commentBasis = `videos and comments dated in ${longMonth(month)}`
  const publishedBasis = `videos published in ${longMonth(month)}`

  const measures: FaceOffMeasure[] = [
    videosMeasure(input, month, floor, commentBasis),
    commentsMeasure(input, commentBasis),
    engagementMeasure(input, publishedBasis),
    sentimentMeasure(input, month, floor, publishedBasis),
    postsMeasure(input, publishedBasis),
  ]

  const theirVideos = them.month?.videos ?? null
  return {
    rivalAudience: them.audience,
    rivalLabel: them.label,
    month,
    measures,
    footerLine:
      theirVideos === null
        ? `No month has been read for ${them.label} in ${monthName(month)}.`
        : `${fmtInt(theirVideos)} ${theirVideos === 1 ? 'video' : 'videos'} of theirs read in ${monthName(month)}, of ${fmtInt(input.readThisMonth)} read in all.`,
    excludedNote: EXCLUDED_NOTE,
    unread:
      you.month === null && them.month === null
        ? `Neither ${you.label} nor ${them.label} has a row in ${monthName(month)}, so there is nothing to put side by side.`
        : null,
  }
}

function shareSide(
  side: HeadToHeadSide,
  readNow: number,
  readPrev: number,
): FaceOffSide | null {
  if (!side.month) return null
  const value: Counted = { k: side.month.videos, n: readNow }
  const pct = readNow > 0 ? round1((value.k / readNow) * 100) : null
  const level: FaceOffSide = { value, pct, text: pct === null ? '—' : fmtPct(pct) }
  if (side.previous && readPrev > 0) {
    const prevPct = round1((side.previous.videos / readPrev) * 100)
    level.prev = { value: { k: side.previous.videos, n: readPrev }, pct: prevPct, text: fmtPct(prevPct) }
  }
  return level
}

function videosMeasure(input: HeadToHeadInput, month: string, floor: number, basisLine: string): FaceOffMeasure {
  const you = shareSide(input.you, input.readThisMonth, input.readPreviousMonth)
  const them = shareSide(input.them, input.readThisMonth, input.readPreviousMonth)
  const verdictFor = (side: HeadToHeadSide, level: FaceOffSide | null): Verdict | null => {
    if (!level || !level.prev) return null
    if (level.value.k < floor || level.prev.value.k < floor) return null
    return bandVerdict({
      objectKind: 'audience',
      objectId: side.audience,
      objectLabel: side.label,
      audience: side.audience,
      window: { kind: 'month', from: month, to: nextMonth(month) },
      basis: { from: monthStartOf(input.previousMonth), to: month },
      value: level.value,
      baseline: level.prev.value,
    })
  }
  const verdict = verdictFor(input.you, you)
  const rivalVerdict = verdictFor(input.them, them)
  return {
    key: 'videos',
    label: 'Videos about the brand',
    basisLine,
    you,
    them,
    verdict,
    rivalVerdict,
    verdictWhy: verdict === null && you !== null ? floorWhy(floor) : null,
    why: sideWhy(input, you, them),
  }
}

function rateSide(side: HeadToHeadSide): FaceOffSide | null {
  if (!side.month || side.month.videos <= 0) return null
  const per = round1(side.month.comments / side.month.videos)
  const level: FaceOffSide = {
    value: { k: side.month.comments, n: side.month.videos },
    pct: null,
    text: `${per} per video`,
  }
  if (side.previous && side.previous.videos > 0) {
    const prev = round1(side.previous.comments / side.previous.videos)
    level.prev = { value: { k: side.previous.comments, n: side.previous.videos }, pct: null, text: `${prev} per video` }
  }
  return level
}

function commentsMeasure(input: HeadToHeadInput, basisLine: string): FaceOffMeasure {
  const you = rateSide(input.you)
  const them = rateSide(input.them)
  return {
    key: 'comments_per_video',
    label: 'Comments per video',
    basisLine,
    you,
    them,
    verdict: null,
    rivalVerdict: null,
    verdictWhy: RATE_NOT_A_SHARE,
    why: sideWhy(input, you, them),
  }
}

function engagementSide(side: HeadToHeadSide): FaceOffSide | null {
  if (side.engagement.median === null) return null
  const level: FaceOffSide = {
    value: { k: side.engagement.n, n: side.published },
    pct: null,
    text: `${fmtPct(side.engagement.median)} median`,
  }
  const prev = side.engagementPrev
  if (prev && prev.median !== null) {
    level.prev = { value: { k: prev.n, n: side.publishedPrev ?? prev.n }, pct: null, text: `${fmtPct(prev.median)} median` }
  }
  return level
}

function engagementMeasure(input: HeadToHeadInput, basisLine: string): FaceOffMeasure {
  const you = engagementSide(input.you)
  const them = engagementSide(input.them)
  return {
    key: 'engagement',
    label: 'Engagement per video',
    basisLine,
    you,
    them,
    verdict: null,
    rivalVerdict: null,
    verdictWhy: MEDIAN_NOT_A_SHARE,
    why:
      you === null || them === null
        ? 'No engagement rate was read on one side this month — Reddit is excluded, and a video the platform gave us no rate for carries none.'
        : null,
  }
}

function sentimentSide(side: HeadToHeadSide): FaceOffSide | null {
  const { positive, judged } = side.sentiment
  if (judged <= 0) return null
  const pct = round1((positive / judged) * 100)
  const level: FaceOffSide = { value: { k: positive, n: judged }, pct, text: fmtPct(pct, 0) }
  const prev = side.sentimentPrev
  if (prev && prev.judged > 0) {
    const prevPct = round1((prev.positive / prev.judged) * 100)
    level.prev = { value: { k: prev.positive, n: prev.judged }, pct: prevPct, text: fmtPct(prevPct, 0) }
  }
  return level
}

function sentimentMeasure(input: HeadToHeadInput, month: string, floor: number, basisLine: string): FaceOffMeasure {
  const you = sentimentSide(input.you)
  const them = sentimentSide(input.them)
  const verdictFor = (side: HeadToHeadSide, level: FaceOffSide | null): Verdict | null => {
    if (!level || !level.prev) return null
    if (level.value.n < floor || level.prev.value.n < floor) return null
    return bandVerdict({
      objectKind: 'mood',
      objectId: `${side.audience}:positive`,
      objectLabel: side.label,
      audience: side.audience,
      window: { kind: 'month', from: month, to: nextMonth(month) },
      basis: { from: monthStartOf(input.previousMonth), to: month },
      value: level.value,
      baseline: level.prev.value,
      countedOver: { measure: 'videos', population: 'the videos a mood was judged on' },
    })
  }
  const verdict = verdictFor(input.you, you)
  const rivalVerdict = verdictFor(input.them, them)
  return {
    key: 'sentiment',
    label: 'Positive share',
    basisLine,
    you,
    them,
    verdict,
    rivalVerdict,
    verdictWhy: verdict === null && you !== null ? floorWhy(floor) : null,
    why: sideWhy(input, you, them),
  }
}

function postsSide(side: HeadToHeadSide): FaceOffSide | null {
  if (side.ownPosts === null) return null
  const level: FaceOffSide = { value: { k: side.ownPosts, n: 0 }, pct: null, text: fmtInt(side.ownPosts) }
  if (side.ownPostsPrev != null) {
    level.prev = { value: { k: side.ownPostsPrev, n: 0 }, pct: null, text: fmtInt(side.ownPostsPrev) }
  }
  return level
}

function postsMeasure(input: HeadToHeadInput, basisLine: string): FaceOffMeasure {
  const you = postsSide(input.you)
  const them = postsSide(input.them)
  return {
    key: 'posts',
    label: 'Posts on the brand’s own accounts',
    basisLine,
    you,
    them,
    verdict: null,
    rivalVerdict: null,
    verdictWhy: COUNT_NOT_A_SHARE,
    why:
      you === null || them === null
        ? 'Own posts are counted from the tracked accounts only, and one side’s accounts are not configured.'
        : null,
  }
}

function sideWhy(input: HeadToHeadInput, you: FaceOffSide | null, them: FaceOffSide | null): string | null {
  if (you !== null && them !== null) return null
  const missing = [you === null ? input.you.label : null, them === null ? input.them.label : null].filter(
    (l): l is string => l !== null,
  )
  return `Nothing was read for ${missing.join(' or ')} in ${monthName(input.month)}.`
}

// ---- recurrence ---------------------------------------------------------------

/**
 * A conclusion's recurrence — "seen in 4 of the last 6 months".
 *
 * THE IDENTITY IS A REGISTRY ID, NEVER A LABEL. `themes.id` is a per-run row id
 * and the table is replaced every run; `theme_registry.id` is the identity that
 * survives one, and labels churn about 88% run to run because a reasoning model
 * writes them. A "New" flag keyed on a label would mark nine findings in ten as
 * new every month and would be measuring our own naming, not the conversation.
 *
 * AND `isNew` IS A FLAG, NOT A DIRECTION. It says the identity has no earlier
 * month, which is a fact about the record. It says nothing about where anything
 * is headed — that word is `directionWord`'s alone, over three consecutive
 * readings in one clustering regime.
 */
export interface Recurrence {
  seenIn: string[]
  isNew: boolean
  line: string
}

export function recurrenceOf(
  /** `theme_registry.id` — carried so the caller cannot key this on a label. */
  registryId: string,
  monthsSeen: readonly string[],
  month: string,
): Recurrence {
  const here = monthStartOf(month)
  const seenIn = [...new Set(monthsSeen.map(monthStartOf))].filter((m) => m <= here).sort()
  const earlier = seenIn.filter((m) => m < here)
  const isNew = earlier.length === 0
  return {
    seenIn,
    isNew,
    line: isNew
      ? `First heard in ${monthName(here)}.`
      : `Heard in ${fmtInt(seenIn.length)} months, first in ${monthName(seenIn[0])}.`,
  }
}
