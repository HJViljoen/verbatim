import { median } from '../content-tiles'
import { fmtInt, longMonth, platformLabel } from '../format'
import { monthStartOf, nextMonth } from './month-key'
import type { Counted } from './verdicts'

// Formats and hooks, month-scoped and audience-split (Phase 1 Block D, D6).
//
// WHY THIS IS NOT A COMMENT-DATED READING, AND SAYS SO ON EVERY FIGURE.
// A period in this product is dated by the COMMENT — `comments.comment_date`
// through `lib/reading/monthly.ts` into `month_denominators` /
// `month_theme_readings`. A format, a hook and an engagement rate are not
// properties of a comment: they are properties of a VIDEO, written once by the
// classifier when the video was read, and a video has its own date
// (`videos.upload_date`). Scoping them by the comment month would count a video
// published in June under September because somebody commented under it in
// September, and it would then be indistinguishable on the page from a figure
// that really is the month's conversation.
//
// So this reading keeps a DIFFERENT clock and carries it: `basis: 'published'`
// and a `basisLine` ("videos published in September") that a surface prints
// beside every figure it draws from here. That is what lets these tables sit on
// a month-stamped page without lying about what the month means, and it is what
// closes decision D9 for `classified_type` / `hook_style` / `engagement_rate`
// without a month table and without a migration.
//
// THE DENOMINATOR IS THE CLASSIFIED n, NOT THE PUBLISHED ONE (mock-gap
// Competitive D6). The artboard prints "read from all 1,388 category videos"
// over shares that were measured on 569 of them — the classifier covered 41% of
// the corpus. A share of a population the measurement never reached is not a
// share of what it says it is, so every row's `value.n` is the videos that
// carry a value for THIS key, `of` is that same number, and `published` is
// kept beside it so the basis line can say both ("read from 569 of 1,388
// videos published in September").
//
// NOTHING SUMS. One video carries a format AND a hook, and the three columns of
// the matrix are three independent audiences, never a partition of one whole —
// decision D4's rule applied to formats. There is no "other" remainder row and
// no bar that reads as a whole, because a mix that adds to 100% invites the one
// arithmetic the reading layer exists to stop.

/** The clock this reading keeps. `published` is `videos.upload_date` and is the
 *  ONLY basis in wave 1; the type exists so a later comment-dated sibling
 *  cannot be confused with it. */
export type FormatBasis = 'published'

/** Platforms whose engagement rate is not comparable with the rest.
 *  Reddit, by `REDDIT_COMMENT_DEPTH_CAP` — a thread's comments are capped at 40
 *  before the rate is computed, so a Reddit rate is a rate against a ceiling. */
export const ENGAGEMENT_EXCLUDED: readonly string[] = ['reddit']

/**
 * Videos carrying a rate below which a GROUP's median is not read at all.
 *
 * `lib/content-tiles.ts:perfVsMedian` has set this at three since the product
 * shipped, in its own words: "Three videos is the floor for a multiple — two
 * can be one fluke twice… a singleton at 40% would print 12×." A format median
 * read off one video is not a property of the format, and "what not to make"
 * printing a format off two videos beside one read off fourteen, in the same
 * type, tells a client the two claims are worth the same.
 *
 * The floor is on the GROUP, exactly as `perfVsMedian` puts it — not on the
 * audience's own median, which is the median of every rated video on the side
 * and is reported with its own n (`FormatReading.median.n`) for a surface to
 * qualify. `engagement.n` is always the real count, so a row below the floor
 * still says how many videos it had; only the median and the multiple are
 * withheld.
 */
export const ENGAGEMENT_MIN_VIDEOS = 3

export const EXCLUDED_NOTE =
  'Reddit is excluded from every engagement figure: its comments are capped at 40 a thread before a rate is computed, so a Reddit rate is measured against a ceiling and the others are not.'

export interface FormatRow {
  /** The stored value — `classified_type` / `hook_style`. Stable; never a label. */
  key: string
  /** `workedLabel`-humanised where the caller passed the humaniser, so email,
   *  print and the page agree on the words. */
  label: string
  /** k of the audience's CLASSIFIED published videos that month. `n` equals the
   *  reading's `of`, so a cell printed on its own still carries its "of N". */
  value: Counted
  pct: number | null
  /** Median engagement rate of this group, as the column stores it (3.8 = 3.8%),
   *  with the videos it was measured over. Null below
   *  `ENGAGEMENT_MIN_VIDEOS`, where `n` still carries the real count. */
  engagement: { median: number | null; n: number }
  /** That median against the audience's own median video. Null where either is. */
  multiple: number | null
}

export interface FormatReading {
  audience: string
  audienceLabel: string
  month: string
  basis: FormatBasis
  /** "videos published in September" — printed beside every figure. */
  basisLine: string
  /** Every row's denominator: the audience's published videos that month that
   *  carry a value for this key. NOT the published total — see the header. */
  of: number
  /** The audience's published videos that month, classified or not. */
  published: number
  rows: FormatRow[]
  /** The audience's median engagement rate, and its n. */
  median: { value: number | null; n: number }
  /** Platforms excluded from the engagement reading, by name, with the reason. */
  excluded: string[]
  excludedNote: string
  /** Why this reading is empty, in the reader's words. Null when it is not. */
  unread: string | null
}

export interface FormatVideo {
  id: string
  upload_date: string | null
  platform: string
  classified_type: string | null
  hook_style: string | null
  engagement_rate: number | string | null
}

export interface FormatInput {
  month: string
  audience: string
  audienceLabel: string
  key: 'classified_type' | 'hook_style'
  videos: readonly FormatVideo[]
  /** Platforms whose engagement is not comparable — Reddit, by the cap. */
  excludePlatforms?: readonly string[]
  /** Videos a group needs before its median is read. `ENGAGEMENT_MIN_VIDEOS`. */
  minRated?: number
  /** `workedLabel`, passed in rather than imported: the humaniser lives beside
   *  This week's own block (`lib/pages/week.ts`) and importing a page module
   *  from the reading layer would invert the dependency. A caller that passes
   *  none gets the stored value through unchanged, which is a slug on the page
   *  and therefore a bug a test catches, not a silent prettification. */
  label?: (key: string) => string
  /** How many rows to keep, best-counted first. Every row that is dropped is
   *  still counted in `of`, so the shares stay shares of the same thing. */
  top?: number
}

const round1 = (n: number): number => Math.round(n * 10) / 10

const inMonth = (uploadDate: string | null, month: string): boolean => {
  if (!uploadDate) return false
  const start = monthStartOf(month)
  const end = nextMonth(start)
  const day = uploadDate.slice(0, 10)
  return day >= start && day < end
}

/** "videos published in September" — the clock, in the reader's words. */
export function basisLineFor(month: string): string {
  return `videos published in ${longMonth(month)}`
}

/**
 * One audience's formats (or hooks) for one month, on the published clock.
 *
 * Rows are one per stored value, each with its own k of the classified n, its
 * own median engagement and its multiple against the audience's median video.
 * They do not sum and are not meant to: a row is a share of the audience's
 * classified videos, and a video can be counted in a format row and a hook row
 * at once.
 */
export function formatReading(input: FormatInput): FormatReading {
  const { month, audience, audienceLabel, key } = input
  const excludePlatforms = input.excludePlatforms ?? ENGAGEMENT_EXCLUDED
  const minRated = input.minRated ?? ENGAGEMENT_MIN_VIDEOS
  const label = input.label ?? ((k: string) => k)
  const basisLine = basisLineFor(month)

  const published = input.videos.filter((v) => inMonth(v.upload_date, month))
  const classified = published.filter((v) => (v[key] ?? null) !== null && v[key] !== '')
  const of = classified.length

  // The engagement floor is per VIDEO, not per row: a rate is read off the
  // videos the platform gave us one for, on the platforms the rate is
  // comparable across.
  const rateOf = (v: FormatVideo): number | null => {
    if (excludePlatforms.includes(v.platform)) return null
    const e = Number(v.engagement_rate)
    return Number.isFinite(e) && e > 0 ? e : null
  }
  const rates = published.map(rateOf).filter((e): e is number => e !== null)
  const audienceMedian = median(rates)

  const groups = new Map<string, { k: number; rates: number[] }>()
  for (const v of classified) {
    const value = v[key] as string
    const g = groups.get(value) ?? { k: 0, rates: [] }
    g.k += 1
    const rate = rateOf(v)
    if (rate !== null) g.rates.push(rate)
    groups.set(value, g)
  }

  const rows: FormatRow[] = [...groups.entries()]
    .map(([value, g]) => {
      // THE FLOOR IS THE GROUP'S, AND IT WITHHOLDS THE MEDIAN, NOT THE ROW. A
      // format read off two videos is still counted, still carries its k of n
      // and still says it had two rates; what it does not get is a median or a
      // multiple, because neither is a property of the format at that n.
      const groupMedian = g.rates.length >= minRated ? median(g.rates) : null
      return {
        key: value,
        label: label(value),
        value: { k: g.k, n: of },
        pct: of > 0 ? round1((g.k / of) * 100) : null,
        engagement: { median: groupMedian === null ? null : round1(groupMedian), n: g.rates.length },
        multiple:
          groupMedian !== null && audienceMedian !== null && audienceMedian > 0
            ? round1(groupMedian / audienceMedian)
            : null,
      }
    })
    .sort((a, b) => b.value.k - a.value.k || a.label.localeCompare(b.label))

  return {
    audience,
    audienceLabel,
    month: monthStartOf(month),
    basis: 'published',
    basisLine,
    of,
    published: published.length,
    rows: input.top != null ? rows.slice(0, input.top) : rows,
    median: { value: audienceMedian === null ? null : round1(audienceMedian), n: rates.length },
    excluded: excludePlatforms.map(platformLabel),
    excludedNote: EXCLUDED_NOTE,
    unread: unreadLine({ audienceLabel, month, published: published.length, of }),
  }
}

function unreadLine(input: { audienceLabel: string; month: string; published: number; of: number }): string | null {
  const { audienceLabel, published, of } = input
  const when = longMonth(input.month)
  if (published === 0) return `${audienceLabel} published nothing we read in ${when}, so there is nothing to read a format off.`
  if (of === 0) {
    return `${audienceLabel} published ${fmtInt(published)} ${published === 1 ? 'video' : 'videos'} in ${when} and none of them has been classified yet, so no share can be stated.`
  }
  return null
}

/** One side of the matrix — an audience's column, with its own denominator. */
export interface FormatMatrixSide {
  audience: string
  label: string
  /** The side's classified n — what "0 of N" is N in. */
  of: number
  /** The side's published total, for a basis line that names both. */
  published: number
  /**
   * The side's row for each key, or NULL where the side has no row for it.
   *
   * A NULL CELL IS TWO DIFFERENT FACTS AND THE SIDE SAYS WHICH. Where `unread`
   * is null the side WAS read and simply has none of that format — the cell
   * prints "0 of N" off `of`, which is the mock's "none of 9" said honestly.
   * Where `unread` is set the side was not read for this key at all (Freitag's
   * hooks: own-post hooks are counted for tracked accounts only), and the cell
   * prints that sentence instead. A renderer that prints 0 for both states is
   * claiming a measurement nobody made.
   */
  byKey: Record<string, FormatRow | null>
  unread: string | null
  median: { value: number | null; n: number }
}

/** The mock's Format × (Category · You · Rival) matrix: the same rows across
 *  several readings, aligned by key, each cell keeping its own "of N". */
export interface FormatMatrix {
  keys: { key: string; label: string }[]
  sides: FormatMatrixSide[]
  basisLine: string
  /** The one sentence comparing two formats, composed in code from the two
   *  rows — never by a model. Null when neither clears the floor. */
  conclusion: string | null
}

/**
 * Several readings aligned into one table.
 *
 * THE KEY ORDER IS THE FIRST READING'S. The category column is the widest
 * reading there is and is passed first, so the table reads down the order the
 * category actually makes content in, and a rival's one-off format lands at the
 * bottom rather than re-ordering the table around it.
 */
export function formatMatrix(readings: readonly FormatReading[]): FormatMatrix {
  const keys: { key: string; label: string }[] = []
  const seen = new Set<string>()
  for (const reading of readings) {
    for (const row of reading.rows) {
      if (seen.has(row.key)) continue
      seen.add(row.key)
      keys.push({ key: row.key, label: row.label })
    }
  }

  const sides: FormatMatrixSide[] = readings.map((reading) => ({
    audience: reading.audience,
    label: reading.audienceLabel,
    of: reading.of,
    published: reading.published,
    byKey: Object.fromEntries(keys.map((k) => [k.key, reading.rows.find((r) => r.key === k.key) ?? null])),
    unread: reading.unread,
    median: reading.median,
  }))

  return {
    keys,
    sides,
    basisLine: readings[0]?.basisLine ?? '',
    conclusion: matrixConclusion(readings),
  }
}

/**
 * The two-format sentence, composed from the numbers rather than written about
 * them.
 *
 * It states two medians with the videos each was measured over and says nothing
 * about direction: a comparison between two formats at one moment is not a
 * claim that either is going anywhere, and the only word that may say so is
 * `directionWord`'s, over three consecutive readings. Null unless the widest
 * reading has two rows that both carry a median.
 */
export function matrixConclusion(readings: readonly FormatReading[]): string | null {
  const widest = [...readings].sort((a, b) => b.of - a.of)[0]
  if (!widest) return null
  const rated = widest.rows.filter((r) => r.engagement.median !== null)
  if (rated.length < 2) return null
  const best = [...rated].sort((a, b) => (b.engagement.median ?? 0) - (a.engagement.median ?? 0))[0]
  const next = [...rated].sort((a, b) => (b.engagement.median ?? 0) - (a.engagement.median ?? 0))[1]
  return (
    `${best.label} ran at ${best.engagement.median}% against ${next.label} at ${next.engagement.median}% ` +
    `— measured over ${fmtInt(best.engagement.n)} and ${fmtInt(next.engagement.n)} of ${widest.audienceLabel}’s ` +
    `${fmtInt(widest.of)} classified ${widest.basisLine}.`
  )
}

/**
 * Formats running below the audience's own median video — "what not to make",
 * as the inverse of the playbook rather than as an instruction.
 *
 * It carries both numbers and the n and stops there. The mock's page tells the
 * reader to stop making something; the data supports "this ran below your
 * median", which is a different sentence and the only one that is true.
 */
export function belowMedian(reading: FormatReading): FormatRow[] {
  const med = reading.median.value
  if (med === null || med <= 0) return []
  return reading.rows
    .filter((r) => r.engagement.median !== null && r.engagement.median < med)
    .sort((a, b) => (a.engagement.median ?? 0) - (b.engagement.median ?? 0))
}
