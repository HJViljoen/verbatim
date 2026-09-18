import type { SupabaseClient } from '@supabase/supabase-js'

import { isAudienceSentiment } from '../competitive-tiles'
import { median } from '../content-tiles'
import { fmtInt, longMonth } from '../format'
import { EXCLUDED_NOTE, ENGAGEMENT_EXCLUDED, belowMedian, formatMatrix, formatReading, type FormatMatrix, type FormatRow, type FormatVideo } from '../reading/formats'
import { headToHead, type HeadToHead, type HeadToHeadSide } from '../reading/head-to-head'
import type { FigureTable } from '../reading/verdicts'
import { monthStartOf, nextMonth, prevMonth } from '../reading/month-key'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, audienceOf, rivalKey } from '../rivals'
import { selectAll } from '../supabase-admin'
import { workedLabel } from './week'

// CO3 and CO7's reads — the one `videos` query both sections are built from
// (Phase 1 Block D, D6).
//
// WHY ONE MODULE AND ONE QUERY. The head-to-head and the playbook want the same
// rows: this month's and last month's videos, tagged by audience, carrying the
// classifier's format and hook, the platform's engagement rate and Pass A's
// sentiment. Two loaders would be two scans of the largest table on the page
// for one answer, and production has already been taken down once by a morning
// of extra reads (AGENTS.md, 2026-09-16). So the page reads `videos` ONCE over
// the two months and both sections are built from that array in memory.
//
// THE DATE FILTER IS `upload_date`, WHICH IS THE POINT. Everything here is a
// property of a video and is dated by the video — see `lib/reading/formats.ts`.
// The two figures that are NOT (videos about the brand, comments per video)
// come off `month_denominators`, which the page has already read for CO2, and
// each row on the table names which of the two clocks it keeps.

/** How many format and hook rows a column prints before the tail is left to
 *  the "of N" to account for. Every dropped row is still counted in the
 *  denominator, so the shares stay shares of the same thing. */
export const PLAYBOOK_ROWS = 6

export interface PlaybookVideo extends FormatVideo {
  is_client: boolean | null
  is_competitor: boolean | null
  competitor_name: string | null
  source: string | null
  sentiment: string | null
  sentiment_source: string | null
  analyzed_lane: string | null
}

export interface PlaybookBlock {
  month: string
  /** "videos published in September" — the clock every figure here keeps. */
  basisLine: string
  formats: FormatMatrix
  hooks: FormatMatrix
  /** "Read from 569 of 1,388 videos published in September." — the classified
   *  n against the published one, per side, said once under the table. */
  coverageLine: string
  /** The category's median engagement per format, BEST FIRST — the mock's
   *  fourth column, each with the videos it was measured over.
   *
   *  Best means the highest MEDIAN, which is not the same list as the format
   *  table beside it: that one is count-ordered, and the highest median of a
   *  month is regularly a format nobody makes much of. It ran count-ordered
   *  once and published the most common format's median under the token named
   *  `playbook_best_format_engagement`. Every row here clears
   *  `ENGAGEMENT_MIN_VIDEOS`, because a row under it carries no median at all. */
  engagement: FormatRow[]
  /** Your own formats running under your own median video — "what not to make"
   *  as the inverse of the playbook rather than as an instruction. */
  below: FormatRow[]
  excludedNote: string
  unread: string | null
}

const SENTIMENTS = new Set(['positive', 'negative', 'neutral', 'mixed'])

const inMonth = (v: PlaybookVideo, month: string): boolean => {
  const start = monthStartOf(month)
  const end = nextMonth(start)
  const day = (v.upload_date ?? '').slice(0, 10)
  return day >= start && day < end
}

/**
 * The three columns of CO7, and the content brief's page 3.
 *
 * The category leads because it is the widest reading there is, which fixes the
 * key order for every column beside it; your own posts and the selected rival
 * follow. A column the tenant has no rival for is simply absent — a two-column
 * table is honest and an empty third column headed with a rival's name is not.
 */
export function buildPlaybook(input: {
  month: string
  brand: string
  rival: string | null
  videos: readonly PlaybookVideo[]
  /** Platforms whose engagement rate is not comparable. Defaulted here, and
   *  defaulted the SAME WAY in `buildHeadToHead`, so the one page cannot print
   *  two medians of the same videos under two exclusion lists. */
  excludePlatforms?: readonly string[]
  /**
   * Rated videos a format needs before the two-format SENTENCE may name it
   * (`matrixConclusion`'s `leadMinRated`). A floor on what may lead, never on
   * what may be shown: every row stays in the table with its own n. Undefined
   * keeps the sentence as it was — a surface that promotes it into a takeaway
   * passes the floor it is willing to rest a finding on.
   */
  conclusionMinRated?: number
}): PlaybookBlock {
  const month = monthStartOf(input.month)
  const excludePlatforms = input.excludePlatforms ?? ENGAGEMENT_EXCLUDED
  const rivalAudience = input.rival ? rivalKey(input.rival) : null
  const published = input.videos.filter((v) => inMonth(v, month))

  const sides: { audience: string; label: string }[] = [
    { audience: INDUSTRY_AUDIENCE, label: 'The category' },
    { audience: CLIENT_AUDIENCE, label: input.brand },
    ...(rivalAudience && input.rival ? [{ audience: rivalAudience, label: input.rival }] : []),
  ]

  const readingsFor = (key: 'classified_type' | 'hook_style') =>
    sides.map((side) =>
      formatReading({
        month,
        audience: side.audience,
        audienceLabel: side.label,
        key,
        videos: published.filter((v) => audienceOf(v) === side.audience),
        excludePlatforms,
        label: workedLabel,
      }),
    )

  // THE READINGS ARE WHOLE AND ONLY THE TABLE IS SHORT. `PLAYBOOK_ROWS` is
  // handed to `formatMatrix`, which shortens the key list a column PRINTS;
  // `engagement` and `below` below read the readings themselves, because the
  // highest median of the month is regularly a format nobody makes much of.
  const formatReadings = readingsFor('classified_type')
  const hookReadings = readingsFor('hook_style')
  const matrixOptions = { top: PLAYBOOK_ROWS, leadMinRated: input.conclusionMinRated }
  const formats = formatMatrix(formatReadings, matrixOptions)
  const hooks = formatMatrix(hookReadings, matrixOptions)

  const category = formatReadings[0]
  const own = formatReadings.find((r) => r.audience === CLIENT_AUDIENCE) ?? null

  return {
    month,
    basisLine: category.basisLine,
    formats,
    hooks,
    coverageLine: coverageLine(formatReadings, month),
    engagement: [...category.rows]
      .filter((r) => r.engagement.median !== null)
      .sort(
        (a, b) =>
          (b.engagement.median ?? 0) - (a.engagement.median ?? 0) ||
          b.engagement.n - a.engagement.n ||
          a.label.localeCompare(b.label),
      ),
    below: own ? belowMedian(own) : [],
    excludedNote: EXCLUDED_NOTE,
    unread:
      formats.sides.every((s) => s.unread !== null) && hooks.sides.every((s) => s.unread !== null)
        ? `Nothing published in ${longMonth(month)} has been classified yet, so there is no format or hook to read.`
        : null,
  }
}

/**
 * "Read from 569 of 1,388 videos published in September", per side.
 *
 * mock-gap Competitive D6: the artboard heads this table "read from all 1,388
 * category videos" over shares the classifier reached 41% of. Both numbers are
 * printed here, per column, so the reader can see the difference rather than
 * be told the larger one.
 */
export function coverageLine(readings: readonly { audienceLabel: string; of: number; published: number }[], month: string): string {
  const parts = readings.map((r) => `${fmtInt(r.of)} of ${r.audienceLabel}’s ${fmtInt(r.published)}`)
  return `Read from ${parts.join(' · ')} videos published in ${longMonth(month)}.`
}

/**
 * CO3's two sides, from the same array of videos plus CO2's denominators.
 *
 * `ownPosts` IS NULL RATHER THAN ZERO WHERE NOTHING OWNED WAS READ EITHER
 * MONTH. `videos.source` distinguishes a post on the brand's own account
 * (`owned` / `competitor_owned`) from one we merely found, and a rival whose
 * accounts have never yielded a post is not a rival who published nothing —
 * that is This week's own argument (`ownPostsUnread`, lib/pages/week.ts) and a
 * false zero there tells a paying client their rival went quiet. Two months of
 * silence is conservatively read as "not recorded" for the same reason.
 */
export function buildHeadToHead(input: {
  month: string
  brand: string
  rival: string
  videos: readonly PlaybookVideo[]
  denominators: readonly { month: string; audience: string; videos: number; comments: number }[]
  /** As `buildPlaybook` — same default, threaded rather than hardcoded. */
  excludePlatforms?: readonly string[]
}): HeadToHead {
  const month = monthStartOf(input.month)
  const excludePlatforms = input.excludePlatforms ?? ENGAGEMENT_EXCLUDED
  const previousMonth = prevMonth(month)
  const rivalAudience = rivalKey(input.rival)

  const denom = (audience: string, m: string) => {
    const hit = input.denominators.find((d) => monthStartOf(d.month) === m && d.audience === audience)
    return hit ? { videos: hit.videos, comments: hit.comments } : null
  }
  const readIn = (m: string) =>
    input.denominators.filter((d) => monthStartOf(d.month) === m).reduce((n, d) => n + d.videos, 0)

  const sideOf = (audience: string, label: string): HeadToHeadSide => {
    const mine = input.videos.filter((v) => audienceOf(v) === audience)
    const now = mine.filter((v) => inMonth(v, month))
    const before = mine.filter((v) => inMonth(v, previousMonth))
    const ownedNow = ownedCount(now)
    const ownedBefore = ownedCount(before)
    return {
      audience,
      label,
      month: denom(audience, month),
      previous: denom(audience, previousMonth),
      engagement: medianRate(now, excludePlatforms),
      engagementPrev: medianRate(before, excludePlatforms),
      published: now.length,
      publishedPrev: before.length,
      sentiment: moodOf(now),
      sentimentPrev: moodOf(before),
      ownPosts: ownedNow + ownedBefore > 0 ? ownedNow : null,
      ownPostsPrev: ownedNow + ownedBefore > 0 ? ownedBefore : null,
    }
  }

  return headToHead({
    month,
    previousMonth,
    you: sideOf(CLIENT_AUDIENCE, input.brand),
    them: sideOf(rivalAudience, input.rival),
    readThisMonth: readIn(month),
    readPreviousMonth: readIn(previousMonth),
  })
}

const ownedCount = (videos: readonly PlaybookVideo[]): number =>
  videos.filter((v) => v.source === 'owned' || v.source === 'competitor_owned').length

/**
 * CO3's engagement median — `lib/content-tiles.ts:median`, the same one
 * `formatReading` uses, over the same rows under the same exclusion list.
 *
 * It rolled its own middle-of-a-sorted-array once and hardcoded
 * `ENGAGEMENT_EXCLUDED` while `formatReading` took the list as a parameter, so
 * a caller that ever overrode the exclusion got CO3 and CO7 printing two
 * different medians of the same videos on one page. AGENTS.md's own rule:
 * three hand-rolled ones is how "3.4%", "3%" and "3.4 pct" reach one product.
 *
 * No `ENGAGEMENT_MIN_VIDEOS` floor here on purpose: this is the SIDE's own
 * median over every rated video it published, which is `FormatReading.median`'s
 * position and not a per-format group's, and its `n` is printed beside it.
 */
function medianRate(
  videos: readonly PlaybookVideo[],
  excludePlatforms: readonly string[],
): { median: number | null; n: number } {
  const rates = videos
    .filter((v) => !excludePlatforms.includes(v.platform))
    .map((v) => Number(v.engagement_rate))
    .filter((e) => Number.isFinite(e) && e > 0)
  const value = median(rates)
  return { median: value === null ? null : Math.round(value * 10) / 10, n: rates.length }
}

/** Audience-family sentiment only — how commenters received the video, never
 *  how the video framed itself (`isAudienceSentiment`, the rule `run_summary`
 *  applies and the one `videos.sentiment` needed two writers to learn). */
function moodOf(videos: readonly PlaybookVideo[]): { positive: number; judged: number } {
  let positive = 0
  let judged = 0
  for (const v of videos) {
    if (!v.sentiment || !SENTIMENTS.has(v.sentiment)) continue
    if (!isAudienceSentiment(v)) continue
    judged += 1
    if (v.sentiment === 'positive') positive += 1
  }
  return { positive, judged }
}

/**
 * §6's own side of the same reading — your posts, month to date.
 *
 * `week.worked` today reads every video of the UPDATE with no audience split at
 * all, so a client cannot see their own hooks separately from the category's.
 * This is the client half of CO7 over the same month the rest of This week is
 * stated against, on the published clock, so the figure reads "5 of the 9 you
 * published in September" rather than a share of a gather.
 */
export function ownSides(input: {
  month: string
  brand: string
  videos: readonly PlaybookVideo[]
  excludePlatforms?: readonly string[]
}): {
  formats: FormatMatrix
  hooks: FormatMatrix
  coverageLine: string
  basisLine: string
} {
  const built = buildPlaybook({
    month: input.month,
    brand: input.brand,
    rival: null,
    videos: input.videos,
    excludePlatforms: input.excludePlatforms,
  })
  const mine = (m: FormatMatrix): FormatMatrix => ({ ...m, sides: m.sides.filter((s) => s.audience === CLIENT_AUDIENCE) })
  return {
    formats: mine(built.formats),
    hooks: mine(built.hooks),
    coverageLine: coverageLine(
      built.formats.sides.filter((s) => s.audience === CLIENT_AUDIENCE).map((s) => ({ audienceLabel: s.label, of: s.of, published: s.published })),
      input.month,
    ),
    basisLine: built.basisLine,
  }
}

/** The client's own published videos for one month — the narrow read §6 needs,
 *  which is tens of rows on every tenant we have rather than the two-month
 *  corpus CO3 and CO7 share. */
export async function loadOwnPublishedVideos(
  supabase: SupabaseClient,
  clientId: string,
  month: string,
): Promise<PlaybookVideo[]> {
  const from = monthStartOf(month)
  const to = nextMonth(from)
  return selectAll<PlaybookVideo>(() =>
    supabase
      .from('videos')
      .select(PLAYBOOK_COLUMNS)
      .eq('client_id', clientId)
      .eq('is_client', true)
      .gte('upload_date', from)
      .lt('upload_date', to)
      .order('upload_date', { ascending: true }),
  )
}

/** The columns CO3 and CO7 need, and no more. Two months of videos by upload
 *  date, tenant-scoped; `selectAll` because a bare `.select()` caps at 1000 and
 *  a category month is bigger than that on every tenant we have. */
const PLAYBOOK_COLUMNS =
  'id, upload_date, platform, classified_type, hook_style, engagement_rate, is_client, is_competitor, competitor_name, source, sentiment, sentiment_source, analyzed_lane'

export async function loadPlaybookVideos(
  supabase: SupabaseClient,
  clientId: string,
  month: string,
): Promise<PlaybookVideo[]> {
  const from = prevMonth(monthStartOf(month))
  const to = nextMonth(monthStartOf(month))
  return selectAll<PlaybookVideo>(() =>
    supabase
      .from('videos')
      .select(PLAYBOOK_COLUMNS)
      .eq('client_id', clientId)
      .gte('upload_date', from)
      .lt('upload_date', to)
      .order('upload_date', { ascending: true }),
  )
}

// ---- what a document may NAME ---------------------------------------------------
//
// A model explains, code rates (design item 9): prose written about this
// reading is handed figure KEYS and never the numbers, and the surface
// substitutes the value at render, so a model cannot round, drift or invent
// one. These are the two tables the content and marketing briefs draw from —
// the crossing to PRINTED figures happens once, in `proseFigures`, and never
// here.
//
// THE TOKENS ARE PREFIXED because key collisions across the three block
// registries are zero and must stay zero: `lib/reports/documents/reading.ts`
// merges every block's table into one and the LAST writer of a token wins, so
// two surfaces publishing `median_engagement` with two meanings would be a
// silent wrong number on a document rather than a failure.

export function playbookFigures(playbook: PlaybookBlock | null): FigureTable {
  if (!playbook) return {}
  const out: FigureTable = {}
  for (const side of playbook.formats.sides) {
    const key = side.audience === CLIENT_AUDIENCE ? 'own' : side.audience === INDUSTRY_AUDIENCE ? 'category' : 'rival'
    out[`playbook_${key}_classified`] = { value: side.of, unit: 'videos', label: `${side.label}’s classified videos` }
    out[`playbook_${key}_published`] = { value: side.published, unit: 'videos', label: `${side.label}’s published videos` }
    if (side.median.value !== null) {
      out[`playbook_${key}_median`] = { value: side.median.value, unit: 'pct', label: `${side.label}’s median engagement` }
      out[`playbook_${key}_median_n`] = { value: side.median.n, unit: 'videos', label: `videos ${side.label}’s median was read off` }
    }
  }
  // `engagement` is median-ordered, so `[0]` IS the best-performing format.
  // It was count-ordered once, and this token then published the most common
  // format's median under a label reading "median engagement of X" — a wrong
  // number reaching a document through the mechanism built to stop wrong
  // numbers reaching documents.
  const best = playbook.engagement[0]
  if (best?.engagement.median != null) {
    out['playbook_best_format_engagement'] = { value: best.engagement.median, unit: 'pct', label: `median engagement of ${best.label}` }
    out['playbook_best_format_n'] = { value: best.engagement.n, unit: 'videos', label: `videos ${best.label}’s median was read off` }
  }
  return out
}

export function headToHeadFigures(h2h: HeadToHead | null): FigureTable {
  if (!h2h) return {}
  const out: FigureTable = {}
  for (const m of h2h.measures) {
    for (const [who, level] of [['you', m.you], ['rival', m.them]] as const) {
      if (!level) continue
      const whose = who === 'you' ? 'your side' : h2h.rivalLabel
      // A COUNT WITH NO DENOMINATOR PUBLISHES THE COUNT AND NOTHING ELSE
      // (`n === 0`), and a measure whose figure is not k/n publishes its
      // numerator as what it was read off — never a percentage the token does
      // not hold.
      if (level.pct !== null) {
        out[`h2h_${who}_${m.key}`] = { value: level.pct, unit: 'pct', label: `${m.label}, ${whose}` }
      }
      // THE UNIT COMES OFF THE MEASURE, NOT OFF THIS LOOP. It ran with
      // `unit: 'videos'` hardcoded and published 151 and 645 COMMENTS as video
      // counts on the comments-per-video row; `proseFigures` reads `unit`, so a
      // document naming that token rendered a comment count as a video count.
      out[`h2h_${who}_${m.key}_k`] = {
        value: level.value.k,
        unit: m.countUnit.k,
        label: `${m.label}, ${whose} — the count behind it`,
      }
      if (level.value.n > 0) {
        out[`h2h_${who}_${m.key}_n`] = {
          value: level.value.n,
          unit: m.countUnit.n,
          label: `${m.label}, ${whose} — what it is of`,
        }
      }
      // …and the figure the row actually PRINTS, where `pct` does not hold it.
      // Without this the engagement row published its coverage and not its
      // median, and a document could not name the one number the row is about.
      if (level.figure) {
        out[`h2h_${who}_${m.key}_${level.figure.token}`] = {
          value: level.figure.value,
          unit: level.figure.unit,
          label: `${m.label}, ${whose}`,
        }
      }
    }
  }
  return out
}
