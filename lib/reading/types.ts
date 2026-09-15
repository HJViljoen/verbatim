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
 *  already uses. `lib/rivals.ts` audienceOf is the one place they are built —
 *  the nine hand-rolled copies (metrics.ts entityOf, step-a2.ts bucketOf,
 *  quotes.ts videoBucketOf and the rest) were folded into it in WP1. A
 *  competitor's is
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

/** One row of `monthly_kind_readings(p_client, p_from, p_to)`: what one insight
 *  KIND read in one month, inside one audience.
 *
 *  THE SHAPE IS `ThemeReading`'s WITH ONE FIELD RENAMED, AND ONE THING ABOUT IT
 *  IS DIFFERENT. There is no `p_run`, and the stored row's `run_id` is
 *  bookkeeping rather than identity: `audience_insights.category` is the enum
 *  Pass A writes, not a clustering artefact, so a re-grouping cannot move an
 *  insight from one kind to another and two kind months are comparable whether
 *  or not the runs that wrote them match. Two theme months are not. */
export interface KindReading {
  month: string
  audience: Audience
  /** The `audience_insights.category` value — `pain_point`, `question`, … The
   *  ten of `INSIGHT_CATEGORIES` today, and neither the column nor this type
   *  narrows to them: the vocabulary has grown once already. */
  kind: string
  videos: number
  comments: number
  platform_mix: PlatformMix
  /** Same rule as `ThemeReading`: per kind and audience, repeated identically
   *  on every month row of that kind, never summed. */
  excluded_on_camera: number
  /** Same rule as `ThemeReading`: per month, never summed. */
  excluded_undated: number
}

/** One row of `monthly_audience_stats(p_client, p_panel, p_from, p_to)`.
 *
 *  TWO READINGS ON TWO CLOCKS IN ONE ROW, and nothing here is ever added to
 *  anything else here. `judged`/`positive`/`negative`/`neutral`/`mixed` are the
 *  comment-dated analysed video set — the population `DenominatorReading`
 *  counts — so `negative / judged` is a share with a denominator a reader can
 *  check. `panel_videos`/`attention_comments`/`panel_platform_mix` are the
 *  UPLOAD-dated videos by an account on the frozen panel: a different
 *  population, on a different clock, answering a different question. */
export interface AudienceStatsReading {
  month: string
  audience: Audience
  /** Videos carrying an AUDIENCE-family sentiment (`lib/reading/mood.ts`
   *  `isAudienceSentiment`). The four counts below sum to it exactly. */
  judged: number
  positive: number
  negative: number
  neutral: number
  mixed: number
  /** Videos judged on the FRAMING family instead — what the video's own caption
   *  and transcript claim, not how it was received. Recorded, never mixed in:
   *  before the 2026-08-18 split the headline was 59% framing on Össur and a
   *  pass reorder read as "sentiment up 6.2 pts" in a sent subject line. */
  judged_framing: number
  /** Videos by a panel account in this audience UPLOADED in this month.
   *
   *  NULL IS NOT ZERO, AND THE DIFFERENCE IS PERMANENT. All three attention
   *  fields are null exactly when there was no panel to read over — Sealand's
   *  state until an October reading — and 0 / 0 / {} when a panel exists and
   *  saw nothing this month. The row freezes 30 days after its month ends and
   *  `month_reading_frozen_guard` then refuses to rewrite it, so a zero stored
   *  here for "not measured" is a wrong number nobody can correct. */
  panel_videos: number | null
  /** Platform-reported `videos.comments_count` summed over those videos, as at
   *  `read_at` — not a count of stored comments. It drifts upward while those
   *  videos are still being re-found, which is why the row freezes and why the
   *  reading date is printed beside it. Null with no panel; see above. */
  attention_comments: number | null
  /** Null with no panel; see `panel_videos`. */
  panel_platform_mix: PlatformMix | null
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
  /** That run's clustering fingerprint (`pipeline_runs.clustering_key`,
   *  lib/pipeline/clustering.ts). OMITTED — not null — when the run carries
   *  none, so a write still lands on a database where M2 has not been applied:
   *  an absent key is an absent column, and PostgREST rejects a bulk insert
   *  whose objects have differing keys, which is safe here because every row of
   *  one visit carries one run's answer. */
  clustering_key?: string
}

/** A `month_denominators` row, ready to upsert. */
export type DenominatorRow = DenominatorReading & FreezeColumns & { client_id: string }

/** A `month_theme_readings` row, ready to upsert. */
export type ThemeReadingRow = ThemeReading & FreezeColumns & { client_id: string }

/** A `month_kind_readings` row, ready to upsert. */
export type KindReadingRow = KindReading & FreezeColumns & { client_id: string }

/** A `month_audience_stats` row, ready to upsert. `panel_id` is null on a row
 *  written before any panel was frozen: the mood half stands on its own and
 *  does not wait for one. */
export type AudienceStatsRow = AudienceStatsReading & FreezeColumns & {
  client_id: string
  panel_id: string | null
}

/** What a stored row has to tell the merge: nothing about its numbers, only
 *  whether it may be touched and what it has always been. The identifying
 *  columns travel as columns, not as a parsed key — a competitor's name is
 *  free text and can hold any character a key separator could use. */
export interface StoredFreeze {
  key: string
  month: string
  audience: Audience
  theme_id: string | null
  /** The kind, on a `month_kind_readings` row; absent everywhere else. The
   *  third key column differs per table — `theme_id` on the theme readings,
   *  `kind` on the kind readings, neither on the denominators or the audience
   *  stats — and the delete path restates whichever one the row has, so a
   *  frozen row can never be deleted by a key that half-matches. */
  kind?: string | null
  status: MonthStatus
  origin: MonthOrigin
  frozen_at: string | null
}

/** The database names, in one place so a rename is one edit. */
export const RPC_DENOMINATORS = 'monthly_denominators'
export const RPC_THEME_READINGS = 'monthly_theme_readings'
/** The window siblings (20260918092000_reading_windows.sql): the same bodies
 *  with the month grouping taken out, for the one figure a page states over a
 *  window rather than a month. Service-role only, like the month pair. */
export const RPC_WINDOW_DENOMINATORS = 'window_denominators'
export const RPC_WINDOW_THEME_READINGS = 'window_theme_readings'
export const TABLE_DENOMINATORS = 'month_denominators'
export const TABLE_THEME_READINGS = 'month_theme_readings'
/** WP5's three (20260918094000_kind_mood_attention.sql). The kind read has no
 *  `p_run`; the audience stats take a panel id, which may be null. */
export const RPC_KIND_READINGS = 'monthly_kind_readings'
export const RPC_WINDOW_KIND_READINGS = 'window_kind_readings'
export const RPC_AUDIENCE_STATS = 'monthly_audience_stats'
export const TABLE_KIND_READINGS = 'month_kind_readings'
export const TABLE_AUDIENCE_STATS = 'month_audience_stats'
export const TABLE_ATTENTION_PANELS = 'attention_panels'
