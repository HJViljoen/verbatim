import { dbSafeJson } from '../db-text'
import { isMissingColumnError } from '../supabase-admin'
import { periodWindowDays } from '../config'
import type { RunWindow, WindowBasis } from './window'

// What a run row records about itself, as pure rules.
//
// The window RULE lives next door in window.ts; this file is the bookkeeping
// around it — the shape of the config snapshot a run freezes, how a row's
// stored window is read back, the window the backfill reconstructs for a run
// that predates the columns, and the one error a write of these columns is
// allowed to survive.
//
// They live here rather than inside inngest/functions/pipeline.ts (and inside
// scripts/backfill-run-windows.ts) because every one of them carries a
// decision — which rows count as windowed, which config fields are comparable
// across runs, what a reconstructed window says — and the repo tests pure logic
// under lib/**. Only the DB reads stayed behind.

/** The `tracking_configs` columns a run freezes onto its row. */
export interface TrackingConfigRow {
  brand_keywords?: string[] | null
  competitor_keywords?: string[] | null
  industry_keywords?: string[] | null
  exclude_terms?: string[] | null
  competitor_names?: string[] | null
  own_handles?: Record<string, string> | null
  competitor_handles?: Record<string, Record<string, string>> | null
  platforms?: string[] | null
  subreddits?: { name?: string; status?: string }[] | null
  report_period?: string | null
  report_day?: string | null
  max_videos?: number | null
  max_comments?: number | null
  comment_depth?: number | null
}

/** Named columns, never `select('*')`: a snapshot that silently grows a column
 *  is one nobody can compare across runs. */
export const CONFIG_SNAPSHOT_COLUMNS =
  'brand_keywords, competitor_keywords, industry_keywords, exclude_terms, competitor_names, ' +
  'own_handles, competitor_handles, platforms, subreddits, report_period, report_day, ' +
  'max_videos, max_comments, comment_depth'

/** The `config_snapshot` a run writes at open: the configuration it acted on, in
 *  a fixed shape so two runs can be compared field by field. Subreddits keep
 *  name + status only — the probe detail is churn, and the question a snapshot
 *  answers is "which communities was this run searching". */
export function buildConfigSnapshot(tc: TrackingConfigRow | null) {
  return dbSafeJson({
    brand_keywords: tc?.brand_keywords ?? [],
    competitor_keywords: tc?.competitor_keywords ?? [],
    industry_keywords: tc?.industry_keywords ?? [],
    exclude_terms: tc?.exclude_terms ?? [],
    competitor_names: tc?.competitor_names ?? [],
    own_handles: tc?.own_handles ?? {},
    competitor_handles: tc?.competitor_handles ?? {},
    platforms: tc?.platforms ?? [],
    subreddits: (tc?.subreddits ?? []).map((s) => ({ name: s?.name ?? '', status: s?.status ?? '' })),
    report_period: tc?.report_period ?? null,
    report_day: tc?.report_day ?? null,
    max_videos: tc?.max_videos ?? null,
    max_comments: tc?.max_comments ?? null,
    comment_depth: tc?.comment_depth ?? null,
  })
}

/** The window columns of a run row, when it carries one. */
export interface WindowColumns {
  window_start?: string | null
  window_end?: string | null
  window_basis?: string | null
}

/**
 * The window a row carries, or null when it carries none.
 *
 * Both `window_end` and `window_basis` are required, and deliberately so: a row
 * with an end but no basis cannot say how its start was decided, and reading it
 * as a window would let a run present an unlabelled bound as a record of what
 * it gathered. `window_start` may legitimately be null — that is a baseline run.
 */
export function rowWindow(row: WindowColumns | null | undefined): RunWindow | null {
  if (!row?.window_end || !row.window_basis) return null
  return { start: row.window_start ?? null, end: row.window_end, basis: row.window_basis as WindowBasis }
}

/**
 * Where the next run anchors: the latest point any closed run of this client
 * has already covered.
 *
 * A row's own `window_end` is that point; `completed_at` stands in for a row
 * that carries no window (every row before 2026-09-15, and any run opened while
 * the migration had not landed). The two disagree after a resume — resuming a
 * run moves its `completed_at` to today while its `window_end` correctly stays
 * where the gather stopped — and taking the wrong one there is expensive: on
 * "run A covers 1-2 Sep, run B covers 8-9 Sep, A is resumed on the 10th",
 * ordering by `completed_at` makes A the previous run and the next window opens
 * on 1 Sep, a ~12-day window that re-buys a week of per-video comment scrapes
 * the run has already paid for.
 *
 * So the anchor is the MAXIMUM effective end, not the first row of an ordering.
 * `exclude` is this run's own id (and a resume's target), which can sit at the
 * top of the ordering and must never anchor the window on itself.
 */
export function previousRunEnd(
  rows: { id: string; window_end?: string | null; completed_at?: string | null }[],
  exclude: Iterable<string>,
): string | null {
  const mine = new Set(exclude)
  let best: string | null = null
  let bestMs = -Infinity
  for (const row of rows) {
    if (mine.has(row.id)) continue
    const end = row.window_end ?? row.completed_at ?? null
    if (!end) continue
    const ms = Date.parse(end)
    if (!Number.isFinite(ms) || ms <= bestMs) continue
    best = end
    bestMs = ms
  }
  return best
}

/** The columns a run writes about itself at open whose migration is applied by
 *  hand: 20260915090000_run_bookkeeping.sql's seven, plus `clustering_key`
 *  (20260918091000_theme_key.sql). They share this list because they share the
 *  fate — one write, one 42703 if the migration has not landed, and the same
 *  answer without them that every earlier run had. */
export const BOOKKEEPING_COLUMNS = [
  'scheduled_for',
  'window_start',
  'window_end',
  'window_basis',
  'period',
  'stalled',
  'config_snapshot',
  'clustering_key',
] as const

/**
 * Is this the error a bookkeeping write gets before its migration lands?
 *
 * The migration is applied by hand, deliberately (it is a schema change on a
 * live pipeline), so a deploy CAN reach production first — and the columns are
 * additive, which means the same write without them is exactly the behaviour
 * every run had before this shipped. Without this test, open-run would come
 * back 42703/PGRST204, exhaust its retries, and onFailure would mark every
 * tenant's run failed and email about it until someone noticed.
 *
 * The same shape as the guards in lib/pipeline/ocr.ts and Pass D-b's lineage
 * write: narrow, named columns only, never a blanket swallow.
 */
export function isMissingBookkeepingColumn(error: unknown): boolean {
  return BOOKKEEPING_COLUMNS.some((column) => isMissingColumnError(error, column))
}

export interface OpenRunBookkeepingInput {
  /** The run's effective period, frozen at open. */
  period: string
  /** The window just frozen (or, on a resume, the one kept from the row). */
  window: RunWindow
  /** The dispatcher slot this INVOCATION was asked to serve, if any. */
  scheduledFor?: string | null
  /** The config slice read at open — `buildConfigSnapshot`'s output. */
  snapshot: Record<string, unknown>
  /** The clustering regime this invocation will theme under
   *  (lib/pipeline/clustering.ts clusteringKey). Written on a resume too: the
   *  resume re-runs the analysis half, so the themes it persists are this
   *  invocation's clustering, not the original one's. */
  clusteringKey: string
  /** Present when this is an analysis-only resume of a row that already exists. */
  resume?: { hasConfigSnapshot: boolean } | null
}

/**
 * The bookkeeping columns a run writes at open.
 *
 * On a fresh run every column is this run's own: the slot the dispatcher named
 * (explicitly null on a manual run — the distinction is the point), the window
 * just frozen, the configuration it read.
 *
 * An analysis-only resume is different, and the difference is easy to get
 * wrong: the row already belongs to a run that happened. Which slot that run
 * served and which configuration it gathered under are facts about THAT run,
 * and `POST /api/admin/trigger-run {runId, skipGather:true}` — the documented
 * resume lever — carries neither. Writing them anyway would turn Sunday's
 * scheduled run into a manual one the moment its analysis half was resumed, so
 * that "was Sunday's run started?" answers no for a slot that was served. So:
 * the slot is written only when the resume event carries one of its own, and
 * the snapshot only when the row carries none (the resume's analysis half does
 * read today's config, so a row with nothing on it is better served by that
 * than by nothing at all).
 */
export function openRunBookkeeping(input: OpenRunBookkeepingInput): Record<string, unknown> {
  const window = {
    period: input.period,
    window_start: input.window.start,
    window_end: input.window.end,
    window_basis: input.window.basis,
    clustering_key: input.clusteringKey,
  }
  if (!input.resume) {
    return { ...window, scheduled_for: input.scheduledFor ?? null, config_snapshot: input.snapshot }
  }
  return {
    ...window,
    ...(input.scheduledFor ? { scheduled_for: input.scheduledFor } : {}),
    ...(input.resume.hasConfigSnapshot ? {} : { config_snapshot: input.snapshot }),
  }
}

/**
 * The epitaph an operator writes on a run nothing will ever close.
 *
 * A run parked at 'analyzing' is reclaimed by nothing — the single-flight sweep
 * and onFailure both know 'running' only — so closing one is a hand-made
 * decision, and the message is the whole record of it. Dated, and it says what
 * the row was doing when it stopped: ten April rows were once bulk-closed at a
 * single timestamp with no message at all, and their durations have been
 * unreadable ever since.
 */
export function closingMessage(status: string, startedAt: string, now: Date): string {
  return `closed by operator on ${now.toISOString().slice(0, 10)}: stranded at ${status} since ${startedAt.slice(0, 10)}`
}

/**
 * The window a historical run covered, from the rule its own code was
 * following: [started_at − periodWindowDays(period), started_at]. A label, not
 * a record — the real window was a reading of `Date.now()` inside a step that
 * left no trace, and on the two multi-day runs there were two different
 * readings. Written only under `window_basis = 'reconstructed'`.
 */
export function reconstructWindow(startedAt: string, period: string): { start: string; end: string } {
  const endMs = Date.parse(startedAt)
  return {
    start: new Date(endMs - periodWindowDays(period) * 86_400_000).toISOString(),
    end: new Date(endMs).toISOString(),
  }
}
