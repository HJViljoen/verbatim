import type { SupabaseClient } from '@supabase/supabase-js'

import { INDUSTRY_AUDIENCE } from '../rivals'
import { isMissingLens, LENS_TABLE } from '../reading/lens'
import { pooledDenominators, type MarketCount } from '../reading/market'
import { monthStartOf } from '../reading/month-key'
import { selectAll } from '../supabase-admin'
import { VIEW_LENS, type MarketView, type ViewLens } from './view'

// A view's readings: one read of `month_lens_readings` (MF3, written by deploy
// 4's `lens-readings` step and the one back-read, lib/reading/lens.ts), for
// the view's lens and the months a page prints (the reading month and the one
// before it).
//
// THE SAME ROWS THE MONTH TABLES HOLD, OVER FEWER VIDEOS. A lens row is what
// `lens_readings` (MF2) returns for its video set, per audience: a denominator
// row for videos and one for comments (k = n), a row per subject, kind and
// category theme with the audience's videos as n, and the mood rows. So the
// pages' own pooling reads it unchanged: the market is the category plus the
// brands' audiences, never the client's own (decision E), and themes are the
// category's (`INDUSTRY_AUDIENCE`).
//
// FROZEN WITH THE MONTH. A lens row of a month that has frozen keeps what the
// month held when it froze (the back-read is pinned to that capture cut), so a
// view of September reads the same numbers in January as in November.
//
// NOT READ IS SAID, NEVER GUESSED. Before MF3 is applied, before the step has
// written a month, or on a read error, the view is `not_read`: the page reads
// its default and the pill's note names the month the view is not read for.

/** One `month_lens_readings` row, as a page reads it. */
export interface ViewLensRow {
  month: string
  audience: string
  object_kind: string
  object_id: string
  k: number
  n: number
}

export type ViewRead =
  /** The page reads the stored month rows: no lens, nothing read here. */
  | { state: 'everything'; view: 'everything' }
  | { state: 'read'; view: MarketView; lens: ViewLens; rows: ViewLensRow[] }
  /** `missing`: MF3 is not applied here. `no_rows`: no lens row for the
   *  reading month's category yet. `error`: the read failed (logged). */
  | { state: 'not_read'; view: MarketView; lens: ViewLens; why: 'missing' | 'no_rows' | 'error' }

/** The category's videos in one lens-month, or null where the lens holds no
 *  row for it: the test for "is this month read on the view". */
export function lensCategoryVideos(rows: readonly ViewLensRow[], month: string): number | null {
  const m = monthStartOf(month)
  const r = rows.find((x) => monthStartOf(x.month) === m && x.audience === INDUSTRY_AUDIENCE && x.object_kind === 'denominator' && x.object_id === 'videos')
  return r ? Number(r.n) : null
}

/**
 * The view's pooled market by month (`pooledDenominators`, decision E): the
 * category plus the brands you track, from the lens's denominator rows. A
 * month the lens does not hold is absent.
 */
export function lensCounts(rows: readonly ViewLensRow[], rivalAudiences: readonly string[]): Map<string, MarketCount> {
  const byKey = new Map<string, { month: string; audience: string; videos: number; comments: number }>()
  for (const r of rows) {
    if (r.object_kind !== 'denominator') continue
    const month = monthStartOf(r.month)
    const key = `${month}\u0000${r.audience}`
    const d = byKey.get(key) ?? { month, audience: r.audience, videos: 0, comments: 0 }
    if (r.object_id === 'videos') d.videos = Number(r.n)
    else if (r.object_id === 'comments') d.comments = Number(r.n)
    else continue
    byKey.set(key, d)
  }
  return pooledDenominators([...byKey.values()], rivalAudiences)
}

/** Each category theme's videos in one lens-month, by registry id. */
export function lensThemes(rows: readonly ViewLensRow[], month: string): Map<string, number> {
  const m = monthStartOf(month)
  const out = new Map<string, number>()
  for (const r of rows) {
    if (monthStartOf(r.month) !== m || r.audience !== INDUSTRY_AUDIENCE || r.object_kind !== 'theme') continue
    const k = Number(r.k)
    if (Number.isFinite(k) && k > 0) out.set(String(r.object_id), k)
  }
  return out
}

/**
 * The view's lens rows for these months, in one paged read. `everything`
 * reads nothing. The months are month keys ('YYYY-MM-01'); the last one is
 * the reading month, and a lens with no category row for it is `no_rows`.
 */
export async function loadViewLens(client: SupabaseClient, clientId: string, view: MarketView, months: readonly string[]): Promise<ViewRead> {
  const lens = VIEW_LENS[view]
  if (lens == null) return { state: 'everything', view: 'everything' }
  const keys = [...new Set(months.map(monthStartOf))].sort()
  let rows: ViewLensRow[]
  try {
    rows = await selectAll<ViewLensRow>(() => client.from(LENS_TABLE)
      .select('month, audience, object_kind, object_id, k, n')
      .eq('client_id', clientId).eq('lens', lens).in('month', keys)
      .order('month').order('audience').order('object_kind').order('object_id'))
  } catch (e) {
    if (isMissingLens(e)) return { state: 'not_read', view, lens, why: 'missing' }
    console.error(`[views] ${LENS_TABLE} ${lens}: ${(e as { message?: string })?.message ?? String(e)}; the page reads its default view`)
    return { state: 'not_read', view, lens, why: 'error' }
  }
  const reading = keys[keys.length - 1]
  if (reading == null || lensCategoryVideos(rows, reading) == null) return { state: 'not_read', view, lens, why: 'no_rows' }
  return { state: 'read', view, lens, rows }
}
