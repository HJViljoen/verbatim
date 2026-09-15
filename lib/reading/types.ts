// The comment-dated monthly reading — the shapes, and only the shapes.
//
// Every number this product shows about a theme today is a per-RUN reading of a
// cumulative corpus. This is the other series: one clustering, read month by
// month, dated by when the COMMENT was written. The rules that produce the
// numbers live in the two SQL functions
// (supabase/migrations/20260915092000_monthly_reading.sql); the rules about
// WHEN a month stops moving live in ./monthly.ts; this file is the contract
// between them.

/** The three audiences, as the literal bucket strings the rest of the code
 *  already uses (`lib/pipeline/metrics.ts` entityOf, `lib/pipeline/step-a2.ts`
 *  bucketOf, `lib/quotes.ts` videoBucketOf). A competitor's is
 *  `competitor:<competitor_name>` with the name exactly as configured —
 *  `competitor:Topo Designs`, spaces and capitals included — because that is
 *  what `theme_registry.bucket` stores. */
export type Audience = string

/** A month is `filling` until 30 days after it ends and is rewritten by every
 *  run from the current clustering; then the first run past that line writes
 *  the final values and it is `frozen`. A frozen row is never rewritten. */
export const MONTH_STATUSES = ['filling', 'frozen'] as const
export type MonthStatus = (typeof MONTH_STATUSES)[number]

/** Where a row came from.
 *  `live`      first written while the month was still filling.
 *  `back_read` first written after the month had already closed — a reading of
 *              today's corpus, not what was reported at the time. The two are
 *              not the same thing and the row has to say which it is: older
 *              runs' citation sets are already 20–44% eroded by the Pass A
 *              prune, so what an earlier run would have said is gone. */
export const MONTH_ORIGINS = ['live', 'back_read'] as const
export type MonthOrigin = (typeof MONTH_ORIGINS)[number]

/** Days after a month ends before it freezes. 30 covers 96.6% of the re-scrape
 *  accrual measured on Össur (p90 14.2 d, p99 36.5 d) — it does NOT cover a
 *  video discovered later, which can drop a year-old back-thread into any
 *  month at any time. No clock covers that one, which is exactly why the row
 *  says what it was read at rather than pretending to be final. */
export const FREEZE_AFTER_DAYS = 30

/** Videos per platform — never pooled into a total. Reddit went from 6.4% to
 *  17.0% of Össur's category denominator in two months. */
export type PlatformMix = Record<string, number>

/** One row of `monthly_denominators(p_client, p_from, p_to)`: how much
 *  conversation an audience carried in a month. */
export interface DenominatorReading {
  /** First day of the month, `YYYY-MM-DD`, UTC. */
  month: string
  audience: Audience
  /** Distinct ANALYSED videos in this audience carrying at least one comment
   *  dated in this month. */
  videos: number
  comments: number
  platform_mix: PlatformMix
  /** Videos in the set that are the client's own AND name a tracked rival. */
  dual_mention: number
  /** Comments on those videos that carry no date at all. */
  excluded_undated: number
}

/** One row of `monthly_theme_readings(p_client, p_run, p_from, p_to)`: what one
 *  theme read in one month, inside one audience. */
export interface ThemeReading {
  month: string
  audience: Audience
  /** `theme_registry.id` — the stable cross-run identity. Never `themes.id`
   *  (a per-run row id) and never the label. */
  theme_id: string
  videos: number
  comments: number
  platform_mix: PlatformMix
  /** Member insights evidenced only on camera / on screen whose video carries
   *  no dated comment at all, so no month can take them. A property of the
   *  theme in this audience, repeated identically on each of its month rows and
   *  never summed across them — and independent of how wide a window the writer
   *  read, so the pipeline's two-month call and the seed's whole-history call
   *  write the same number. */
  excluded_on_camera: number
  /** Cited comments with no date, recorded against every month their video
   *  occupies in this theme's reading — the rule `DenominatorReading` uses for
   *  its own undated comments. Per month; never summed. */
  excluded_undated: number
}

/** The bookkeeping both stored tables carry. */
export interface FreezeColumns {
  status: MonthStatus
  origin: MonthOrigin
  /** When this reading was taken. */
  read_at: string
  /** The run whose clustering produced it; null for a seed with no run. */
  run_id: string | null
  frozen_at: string | null
}

/** A `month_denominators` row, ready to upsert. */
export type DenominatorRow = DenominatorReading & FreezeColumns & { client_id: string }

/** A `month_theme_readings` row, ready to upsert. */
export type ThemeReadingRow = ThemeReading & FreezeColumns & { client_id: string }

/** What a stored row has to tell the merge: nothing about its numbers, only
 *  whether it may be touched and what it has always been. The identifying
 *  columns travel as columns, not as a parsed key — a competitor's name is
 *  free text and can hold any character a key separator could use. */
export interface StoredFreeze {
  key: string
  month: string
  audience: Audience
  theme_id: string | null
  status: MonthStatus
  origin: MonthOrigin
  frozen_at: string | null
}

/** The database names, in one place so a rename is one edit. */
export const RPC_DENOMINATORS = 'monthly_denominators'
export const RPC_THEME_READINGS = 'monthly_theme_readings'
export const TABLE_DENOMINATORS = 'month_denominators'
export const TABLE_THEME_READINGS = 'month_theme_readings'
