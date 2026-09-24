import { SENTIMENT_BAND, type BandOptions } from '../report-bands'
import { monthChange, type SeriesPoint } from './bands'
import { monthStartOf, nextMonth } from './monthly'
import type { Verdict, VerdictFlag } from './verdicts'

// The mood line: how the month's conversation was received (design item 10,
// decision T).
//
// THE FULL FOUR-WAY DISTRIBUTION, WITH THE NEGATIVE SHARE BANDED. Decision T,
// and it is a measurement rather than a taste. The mock prints "negative share
// 18% (of 1,112 judged)". Production's negative share on the one audience that
// clears the floor is 1.9% (Össur category, August 2026, 537 judged) rising to
// 5.6% (September, 338 judged); Sealand's is 3.1% then 2.7%. A line drawn as
// negative share alone sits on the axis and every real movement in it looks
// like noise — while `mixed` is 56, 45, 71 and 58 videos in those same four
// tenant-months and has plenty of room. So the block prints all four shares and
// bands the negative one, which is the share a reader is actually asking about.
//
// SENTIMENT IS A PROPERTY OF THE VIDEO, NOT OF A COMMENT. There is no new
// chain: the month's video set is the denominator's video set — distinct
// ANALYSED videos carrying a comment dated in the month — and the mood is a
// grouping of it. That is why the counts live on month_audience_stats beside
// the attention half and not in a table of their own.
//
// THE 2026-08-18 BREAK IS DRAWN, NOT SMOOTHED. `videos.sentiment` has had two
// writers with two meanings: Pass A's full lane reads the COMMENTS (how the
// audience received the video) and classify-meta reads caption and transcript
// (the video's own framing). When classify-meta moved before Pass A on
// 2026-08-16 it began stamping every discovered video, run_summary's headline
// became 59% framing on Össur, and the reorder alone read as "sentiment up
// 6.2 pts" in a subject line that was sent. 20260820110000_sentiment_split.sql
// split the two families and backfilled provenance best-effort. A series that
// crosses that date is crossing a change in what the number MEANS, and
// `crossesSentimentBreak` is how a chart knows to draw the rule.
//
// ONE RULE FOR THE FAMILY, IN ONE PLACE. `isAudienceSentiment` below is that
// rule. Two copies of it already exist — lib/competitive-tiles.ts:85-89 and
// lib/pipeline/run-summary.ts:70-74 — and they must stay in step with each
// other, with this one and with the SQL in monthly_audience_stats. The two JS
// copies are left where they are for now (they are on run-indexed surfaces that
// re-base later, and moving them is a change to shipped tiles rather than to
// this reading); this is the copy the monthly reading uses, and it is the one
// the SQL mirrors line for line.

/** The four values `videos.sentiment` can hold (lib/pipeline/schemas.ts
 *  VIDEO_SENTIMENTS), in reading order: best news first, the honest middle
 *  last. */
export const MOODS = ['positive', 'mixed', 'neutral', 'negative'] as const
export type Mood = (typeof MOODS)[number]

/** What a reader is shown. Calibrated: no "sentiment", no "judged corpus" —
 *  the noun is the conversation, not the classifier.
 *
 *  THE MOCK'S WORDS (Heinrich's ruling, 2026-09-24). These read Warm / Both
 *  ways / Matter-of-fact / Cold until then. Display only: the keys are the
 *  values `videos.sentiment` stores and nothing persisted changes with them. */
export const MOOD_LABELS: Record<Mood, string> = {
  positive: 'Positive',
  mixed: 'Mixed',
  // NOT "Flat". `Direction` (lib/reading/bands.ts) already owns that word for a
  // different claim — three readings that exist and do not agree — and the two
  // will sit on the same block: a mood line under a direction word reading
  // "Flat / flat" would be two answers to two questions wearing one label.
  neutral: 'Neutral',
  negative: 'Negative',
}

/** The date `videos.sentiment` changed meaning. A series crossing it is
 *  crossing a change in the measurement, not in the conversation. */
export const SENTIMENT_SOURCE_BREAK = '2026-08-18'

/** The columns the family rule reads. Structurally typed so every caller's row
 *  shape fits. */
export interface SentimentTags {
  sentiment_source?: string | null
  analyzed_lane?: string | null
}

/**
 * Is this video's sentiment a reading of its AUDIENCE, or of its own framing?
 *
 * Provenance when it is stamped; with none, the lane, because only the full
 * lane ever read the comments. That is the rule the split migration backfilled
 * with, and the rule the SQL in `monthly_audience_stats` mirrors.
 */
export function isAudienceSentiment(v: SentimentTags): boolean {
  if (v.sentiment_source === 'audience') return true
  if (v.sentiment_source === 'framing') return false
  return v.analyzed_lane === 'full'
}

/** The stored counts a mood reading needs. `AudienceStatsReading` satisfies
 *  it. */
export interface MoodCounts {
  judged: number
  positive: number
  negative: number
  neutral: number
  mixed: number
  judged_framing?: number
}

export interface MoodShare {
  mood: Mood
  label: string
  videos: number
  judged: number
  /** Null when nothing was judged: a mood of no videos is not 0% positive. */
  pct: number | null
}

const round1 = (n: number): number => Math.round(n * 10) / 10

/** The word a share is DRAWN with: read off its key, never off the label it
 *  carries. A frozen snapshot (`report_snapshots.data`) holds the whole share,
 *  label included, so one frozen before the 2026-09-24 rename still carries
 *  "Warm" or "Cold"; rendering by key prints today's word over it without
 *  touching the stored row. Falls back to the carried label for a key this
 *  file does not know. */
export const moodLabel = (s: Pick<MoodShare, 'mood' | 'label'>): string => MOOD_LABELS[s.mood] ?? s.label

/** All four shares of the judged videos, in reading order. */
export function moodShares(counts: MoodCounts): MoodShare[] {
  const judged = counts.judged
  return MOODS.map((mood) => ({
    mood,
    label: MOOD_LABELS[mood],
    videos: counts[mood],
    judged,
    pct: judged > 0 ? round1((counts[mood] / judged) * 100) : null,
  }))
}

/** Do the four counts account for every judged video? A row where they do not
 *  is a row written by something that did not read this file — the SQL counts
 *  the four values and nothing else, so the sum is exact by construction and a
 *  mismatch is worth catching rather than rendering. */
export const moodCountsBalance = (counts: MoodCounts): boolean =>
  counts.positive + counts.negative + counts.neutral + counts.mixed === counts.judged

/** How much of the month was judged the OTHER way — on the video's own framing
 *  rather than on its audience — as a share of everything judged at all. The
 *  honest footnote under a mood line, and the number that would have caught the
 *  2026-08-16 reorder the week it happened. Null when nothing was judged. */
export function framingShare(counts: MoodCounts): number | null {
  const framing = counts.judged_framing ?? 0
  const all = counts.judged + framing
  return all > 0 ? round1((framing / all) * 100) : null
}

/** Does this comparison span the day `videos.sentiment` changed meaning? Both
 *  bounds are month starts or ISO instants; the break belongs to the LATER side
 *  of the pair, so a window ending before it is clean. `to` is EXCLUSIVE — the
 *  end of the span, not the start of its last month — which is why `moodChange`
 *  passes `nextMonth(curr.month)` rather than `curr.month`: August itself
 *  straddles the break, so a July-against-August comparison crosses it too. */
export function crossesSentimentBreak(from: string, to: string): boolean {
  const a = from.slice(0, 10)
  const b = to.slice(0, 10)
  return a < SENTIMENT_SOURCE_BREAK && b >= SENTIMENT_SOURCE_BREAK
}

export interface MoodChangeInput {
  /** The audience key this month is filed under — and, with no
   *  `prevAudience`, the key both months are filed under. */
  audience: string
  /** The key the PREVIOUS month was filed under, when it differs. A rival
   *  renamed between the two months gives one line two keys and the shared rule
   *  refuses the comparison (`monthChange`, decision L) — the record cannot say
   *  whether the mood moved or the string did. Omitted, the months are two
   *  readings of one name. */
  prevAudience?: string
  /** This month's counts and the month they are for. */
  curr: { month: string } & MoodCounts
  prev: { month: string } & MoodCounts
  /** Which share is being tested. The negative one, unless a caller has a
   *  measured reason for another — the positive share has more room to move on
   *  today's corpus and is the one the Dashboard already bands. */
  mood?: Mood
  floor?: BandOptions
  flags?: VerdictFlag[]
}

/**
 * Did the month's mood move?
 *
 * `SENTIMENT_BAND` — 100 judged videos a side, band never narrower than 2
 * points — and the JUDGED count as n, not the month's video count: the
 * proportion is a share of what was judged, and using the denominator's video
 * count would put a number under a numerator that cannot reach it.
 *
 * Two floors are in play in the product and they differ by an order of
 * magnitude: `SENTIMENT_MIN_JUDGED = 5` gates the face-off's sentiment LEVEL,
 * and `SENTIMENT_BAND.minN = 100` gates a CHANGE. This is the change, so it is
 * the 100 — which on today's corpus means only the category audience will ever
 * print a mood verdict, on either tenant.
 *
 * The clustering caveat is stripped for the same reason it is stripped from a
 * kind: re-grouping insights into themes cannot change how a video was
 * received.
 *
 * THE ONE CAVEAT IT ADDS INSTEAD. A pair whose span reaches across 2026-08-18
 * earns `measurement_changed`, because `videos.sentiment` meant two different
 * things on the two sides of that date and no caller should have to remember
 * it. That is not a hypothetical: the Aug→Sep Össur category pair is the single
 * comparison in the whole corpus that clears SENTIMENT_BAND (judged 537 → 338,
 * negative 10 → 19, +3.8 pts against a band of 2.8, "moved") and its span is
 * exactly the one that crosses. An unqualified "the mood moved" there is a
 * claim about the conversation that is partly a claim about a pass reorder —
 * the failure 20260820110000_sentiment_split.sql exists to stop. The verdict is
 * not refused: both counts are real, and a reader told what else changed can
 * still use them.
 */
export function moodChange(input: MoodChangeInput): Verdict {
  const mood = input.mood ?? 'negative'
  const point = (p: { month: string } & MoodCounts, audience: string): SeriesPoint => ({
    month: p.month,
    videos: p.judged,
    k: p[mood],
    audience,
    // A mood series has no clustering to be like-for-like about, and says so
    // rather than leaving the key absent — see `SeriesPoint.regime`.
    regime: 'n/a',
  })
  const flags = [...(input.flags ?? [])]
  // The span of the comparison, not the two month starts: the break falls
  // INSIDE August, so July-against-August crosses it as surely as
  // August-against-September does.
  if (
    crossesSentimentBreak(monthStartOf(input.prev.month), nextMonth(input.curr.month)) &&
    !flags.includes('measurement_changed')
  ) {
    flags.push('measurement_changed')
  }
  const verdict = monthChange({
    object: { kind: 'mood', id: mood, label: MOOD_LABELS[mood] },
    audience: input.audience,
    curr: point(input.curr, input.audience),
    prev: point(input.prev, input.prevAudience ?? input.audience),
    floor: input.floor ?? SENTIMENT_BAND,
    flags,
  })
  const regime = new Set<VerdictFlag>(['clustering_changed', 'clustering_unknown'])
  return { ...verdict, flags: verdict.flags.filter((f) => !regime.has(f)) }
}
