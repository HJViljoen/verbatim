import { COMPETITIVE_MIN_VIDEOS } from '../config'
import { fmtInt, fmtPct, longMonth, monthName } from '../format'
import { EXCLUDED_NOTE } from './formats'
import { monthStartOf, nextMonth } from './month-key'
import { bandVerdict, type Counted, type FigureTable, type Verdict } from './verdicts'

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

/** The measured-figure unit vocabulary, derived from the table it is written
 *  into rather than restated — `lib/reading/verdicts.ts` decides it, and
 *  `proseFigures` is the one crossing to a printed string. */
export type FaceOffUnit = FigureTable[string]['unit']

/**
 * A figure this level prints that is NOT its `pct` — the engagement median.
 *
 * `text` is for the page; this is for a document, which may not be handed a
 * string. Without it `qr.p5.h2h` and `mkt.p5.comparison` could name a row's k
 * and its n and not the figure the row is about, and a model that typed "1.8%"
 * itself would lose the sentence to `scrubProse`, correctly.
 *
 * `token` is the suffix the figure table publishes it under, so the name is
 * decided beside the measure and not by a loop that cannot see what it holds.
 */
export interface FaceOffFigure {
  value: number
  unit: FaceOffUnit
  token: string
}

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
  /** The figure `text` states, as a number, where `pct` does not already hold
   *  it. Null on every measure whose headline figure is `pct` or a bare count,
   *  and on comments per video — see `commentsMeasure`. */
  figure: FaceOffFigure | null
  /**
   * Whether this level's own figure is read off fewer than the floor, so no
   * band could be drawn over it whatever the other month holds. NULL on a
   * measure no floor applies to — a rate, a median and a count are refused a
   * band for a reason that is not the n (`verdictWhy`).
   *
   * It exists because the refusal was only ever in `verdictWhy`, which is the
   * ROW's. Össur's September positive share is 5 of 5 judged videos: the level
   * reads "100%" and every honest way to print that row says so beside the
   * figure, not in a footnote under the table. Whether it reads as a refusal is
   * the tile's decision; this is what the tile decides on.
   */
  belowFloor: boolean | null
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
  /**
   * WHAT `value.k` AND `value.n` COUNT, PER MEASURE.
   *
   * It is not "videos" on every row and it was published as though it were:
   * comments per video is 151 COMMENTS over 19 videos, and a figure table that
   * hardcodes the unit in its loop renders that comment count as a video count
   * on a document. The unit belongs to the measure, which is the only place
   * that knows what it counted.
   */
  countUnit: { k: FaceOffUnit; n: FaceOffUnit }
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

const noPreviousWhy = (previousMonth: string): string =>
  `${monthName(previousMonth)} has not been read on this measure, so this month has nothing to be compared with.`

/**
 * WHY A BANDED ROW DREW NO BAND, AND IT IS NOT ALWAYS THE FLOOR.
 *
 * `verdictFor` returns null on two conditions and they are different facts: the
 * side has no previous month at all, or one of the two months is under the
 * floor. Printing the floor sentence for both put "Under 10 videos on a side,
 * so no comparison is drawn." beside sides carrying 840 and 1,420 videos — a
 * false statement about our own bookkeeping printed beside a figure, which is
 * the class of claim `refused` / `REFUSAL_WHY` exists to keep honest.
 *
 * Null where the side itself is absent: `why` already says that, and a row that
 * says two things about one absence says neither.
 */
function whyNoVerdict(level: FaceOffSide | null, floor: number, previousMonth: string): string | null {
  if (level === null) return null
  if (!level.prev) return noPreviousWhy(previousMonth)
  return floorWhy(floor)
}

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
  floor: number,
): FaceOffSide | null {
  if (!side.month) return null
  const value: Counted = { k: side.month.videos, n: readNow }
  const pct = readNow > 0 ? round1((value.k / readNow) * 100) : null
  const level: FaceOffSide = {
    value,
    pct,
    text: pct === null ? '—' : fmtPct(pct),
    figure: null,
    belowFloor: value.k < floor,
  }
  if (side.previous && readPrev > 0) {
    const prevPct = round1((side.previous.videos / readPrev) * 100)
    level.prev = {
      value: { k: side.previous.videos, n: readPrev },
      pct: prevPct,
      text: fmtPct(prevPct),
      figure: null,
      belowFloor: side.previous.videos < floor,
    }
  }
  return level
}

function videosMeasure(input: HeadToHeadInput, month: string, floor: number, basisLine: string): FaceOffMeasure {
  const you = shareSide(input.you, input.readThisMonth, input.readPreviousMonth, floor)
  const them = shareSide(input.them, input.readThisMonth, input.readPreviousMonth, floor)
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
    countUnit: { k: 'videos', n: 'videos' },
    you,
    them,
    verdict,
    rivalVerdict,
    verdictWhy: verdict === null ? whyNoVerdict(you, floor, input.previousMonth) : null,
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
    figure: null,
    belowFloor: null,
  }
  if (side.previous && side.previous.videos > 0) {
    const prev = round1(side.previous.comments / side.previous.videos)
    level.prev = {
      value: { k: side.previous.comments, n: side.previous.videos },
      pct: null,
      text: `${prev} per video`,
      figure: null,
      belowFloor: null,
    }
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
    // k IS COMMENTS AND n IS VIDEOS — the one row on this table where they
    // differ, and the reason the unit is a property of the measure.
    //
    // The RATE itself publishes no figure token. `FigureTable`'s unit
    // vocabulary is `videos | comments | pts | pct` and a per-video rate is
    // none of them; `lib/reports/sent-figures.ts` casts a stored figure's unit
    // straight to `SentUnit`, so a fifth member added for this row would reach
    // a sent report as "8 per_video" and would round 7.9 to 8 on the way. A
    // document names the two counts instead — "151 comments across 19 videos"
    // is the same fact, exactly, and every digit in it is a token the table
    // holds.
    countUnit: { k: 'comments', n: 'videos' },
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
    figure: { value: side.engagement.median, unit: 'pct', token: 'median' },
    belowFloor: null,
  }
  const prev = side.engagementPrev
  if (prev && prev.median !== null) {
    level.prev = {
      value: { k: prev.n, n: side.publishedPrev ?? prev.n },
      pct: null,
      text: `${fmtPct(prev.median)} median`,
      figure: { value: prev.median, unit: 'pct', token: 'median_prev' },
      belowFloor: null,
    }
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
    // `value` is the COVERAGE on this row — videos a rate was read off, of
    // videos published — so both sides of it are videos. The median itself is
    // the level's `figure`, because a median is not a numerator.
    countUnit: { k: 'videos', n: 'videos' },
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

function sentimentSide(side: HeadToHeadSide, floor: number): FaceOffSide | null {
  const { positive, judged } = side.sentiment
  if (judged <= 0) return null
  const pct = round1((positive / judged) * 100)
  const level: FaceOffSide = {
    value: { k: positive, n: judged },
    pct,
    text: fmtPct(pct, 0),
    figure: null,
    belowFloor: judged < floor,
  }
  const prev = side.sentimentPrev
  if (prev && prev.judged > 0) {
    const prevPct = round1((prev.positive / prev.judged) * 100)
    level.prev = {
      value: { k: prev.positive, n: prev.judged },
      pct: prevPct,
      text: fmtPct(prevPct, 0),
      figure: null,
      belowFloor: prev.judged < floor,
    }
  }
  return level
}

function sentimentMeasure(input: HeadToHeadInput, month: string, floor: number, basisLine: string): FaceOffMeasure {
  const you = sentimentSide(input.you, floor)
  const them = sentimentSide(input.them, floor)
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
    countUnit: { k: 'videos', n: 'videos' },
    you,
    them,
    verdict,
    rivalVerdict,
    verdictWhy: verdict === null ? whyNoVerdict(you, floor, input.previousMonth) : null,
    why: sideWhy(input, you, them),
  }
}

function postsSide(side: HeadToHeadSide): FaceOffSide | null {
  if (side.ownPosts === null) return null
  const level: FaceOffSide = {
    value: { k: side.ownPosts, n: 0 },
    pct: null,
    text: fmtInt(side.ownPosts),
    figure: null,
    belowFloor: null,
  }
  if (side.ownPostsPrev != null) {
    level.prev = {
      value: { k: side.ownPostsPrev, n: 0 },
      pct: null,
      text: fmtInt(side.ownPostsPrev),
      figure: null,
      belowFloor: null,
    }
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
    countUnit: { k: 'videos', n: 'videos' },
    you,
    them,
    verdict: null,
    rivalVerdict: null,
    verdictWhy: COUNT_NOT_A_SHARE,
    // WHAT NULL ACTUALLY MEANS HERE, AND IT IS NOT "NOT CONFIGURED".
    // `ownPosts` is null where NOTHING OWNED WAS READ IN EITHER MONTH
    // (`buildHeadToHead`, lib/pages/playbook.ts, in its own words: "a rival
    // whose accounts have never yielded a post is not a rival who published
    // nothing"). Accounts being configured is a different fact and this
    // function cannot see it — `OwnPostCensus.unread` is where that fact
    // lives, on the own-post census. So the row said a client's digital
    // director had failed to configure an account that is configured, which
    // is a claim about their work made from a measurement that never looked.
    // The sentence is position-free: this row is drawn on Competitive and on
    // the quarterly review, where the census is not in the same place.
    //
    // It names the side, because "one side" leaves the reader to guess which.
    why: postsWhy(input, you, them),
  }
}

/** Which side has no own-post reading, in the words the reading supports. */
function postsWhy(input: HeadToHeadInput, you: FaceOffSide | null, them: FaceOffSide | null): string | null {
  if (you !== null && them !== null) return null
  const missing = [you === null ? input.you.label : null, them === null ? input.them.label : null].filter(
    (l): l is string => l !== null,
  )
  return `No post on an account of ${missing.join(' or ')}’s was read in either month, so there is nothing to count for them — which is not the same as having no account configured, and says nothing about whether one is.`
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
    line: recurrenceLine(seenIn, isNew, here),
  }
}

/** A conclusion heard in an EARLIER month but not this one has `seenIn.length
 *  === 1` and `isNew === false`, which read "Heard in 1 months, first in Aug
 *  2026." — a plural off by one and a "first" with nothing after it. One month
 *  is named, several are counted. */
function recurrenceLine(seenIn: readonly string[], isNew: boolean, here: string): string {
  if (isNew) return `First heard in ${monthName(here)}.`
  if (seenIn.length === 1) return `Heard in ${monthName(seenIn[0])}.`
  return `Heard in ${fmtInt(seenIn.length)} months, first in ${monthName(seenIn[0])}.`
}
