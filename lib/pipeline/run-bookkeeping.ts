import { dbSafeJson } from '../db-text'
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
