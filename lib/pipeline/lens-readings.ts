import type { SupabaseClient } from '@supabase/supabase-js'

import { isMissingObject, readKeywordRows, readMonthVideos, readProvenanceTable, readRuns, readVerdicts, readVideos, type Pages } from '../provenance/load'
import { measureContext, pairRead } from '../provenance/measure'
import { isOutside, unchangedSearches } from '../provenance/searches'
import {
  isMissingLens, lensCalls, lensRowsOf, LENS_TABLE, mergeLensRows, pooledLensVideos, storedLensRows, writeLensRows,
  type LensReadingRow, type LensVideo,
} from '../reading/lens'
import { denominatorKey, fillingMonths, isMissingMonthlyReading, monthsToRefresh, monthStartOf } from '../reading/monthly'
import type { LensRow } from '../reading/recheck'
import { segmentRulesEnabled } from '../segments/rules'
import { selectAll } from '../supabase-admin'

// The `lens-readings` step (market-first plan WP3.3, deploy 4), the third of
// the four ids before `freeze-months`: `plan-lens-readings` +
// `lens-readings:${i}-of-${n}`, one month a step.
//
// It writes every lens of every month the run refreshes (the filling months,
// and any month whose lens rows are still filling), over THIS run's themes,
// before freeze-months: the rows of a month that freezes in the same run are
// written frozen, before freeze-months writes the denominator marker, which
// mirrors freezeMonths' own order (plan §4.2). Placed after it, the insert
// guard would refuse every first-seen key for that month and leave it
// half-frozen.
//
// Non-fatal, and a no-op until MF3's month_lens_readings exists (MF1 and MF2
// too: it reads market_month_videos, segments_for_videos and lens_readings).

const SEGMENT_CHUNK = 500

/** The months the step reads: the months the run refreshes, and any month a
 *  lens row is still filling in (its visit is what freezes it). PURE. */
export function lensMonths(now: string, storedFilling: readonly string[], lensFilling: readonly string[]): string[] {
  return monthsToRefresh(now, [...storedFilling, ...lensFilling])
}

export async function planLensReadings(admin: SupabaseClient, clientId: string, now: string): Promise<{ months: string[]; note: string }> {
  let lensFilling: { month: string }[]
  try {
    lensFilling = await selectAll<{ month: string }>(() => admin.from(LENS_TABLE).select('month')
      .eq('client_id', clientId).eq('status', 'filling').order('month').order('audience').order('lens').order('object_kind').order('object_id'))
  } catch (e) {
    if (isMissingLens(e)) return { months: [], note: `${LENS_TABLE} is not there (MF3 not applied)` }
    throw e
  }
  let filling: string[] = []
  try {
    filling = await fillingMonths(admin, clientId)
  } catch (e) {
    if (!isMissingMonthlyReading(e)) throw e
  }
  const months = lensMonths(now, filling, [...new Set(lensFilling.map((r) => monthStartOf(r.month)))])
  return { months, note: `months ${months.map((m) => m.slice(0, 7)).join(' ')}` }
}

export interface LensMonthResult {
  month: string
  status: 'written' | 'skipped'
  written: number
  frozen: number
  keptFrozen: number
  deleted: number
  refusedLate: number
  lenses: Record<string, number>
  note: string
}

/** Read and write every lens of one month. */
export async function runLensMonth(admin: SupabaseClient, args: { clientId: string; runId: string; now: string; month: string }): Promise<LensMonthResult> {
  const { clientId, runId, now } = args
  const month = monthStartOf(args.month)
  const base: LensMonthResult = { month, status: 'skipped', written: 0, frozen: 0, keptFrozen: 0, deleted: 0, refusedLate: 0, lenses: {}, note: '' }
  const stored = await storedLensRows(admin, clientId, [month])
  if (stored == null) return { ...base, note: `${LENS_TABLE} is not there (MF3 not applied)` }
  const monthVideos = await readMonthVideos(admin, clientId, month, { n: 0 })
  if (monthVideos == null) return { ...base, note: 'market_month_videos is not there (MF1 not applied)' }

  const withSegments = segmentRulesEnabled(clientId)
  const segments = new Map<string, LensVideo['segment']>()
  if (withSegments) {
    const ids = monthVideos.map((v) => v.id)
    for (let i = 0; i < ids.length; i += SEGMENT_CHUNK) {
      const { data, error } = await admin.rpc('segments_for_videos', { p_client: clientId, p_video_ids: ids.slice(i, i + SEGMENT_CHUNK) })
      if (error) throw new Error(`segments_for_videos: ${error.message}`)
      for (const r of (data ?? []) as { video_id: string; segment: string }[]) {
        segments.set(r.video_id, r.segment === 'maker' || r.segment === 'noise' ? r.segment : 'market')
      }
    }
  }

  // The same-searches lens: the pair (the month before, this month), read
  // through this run, exactly as the comparability step reads it.
  const pages: Pages = { n: 0 }
  const [videos, verdicts, keywordRows, runs] = await Promise.all([
    readVideos(admin, clientId, pages), readVerdicts(admin, clientId, pages), readKeywordRows(admin, clientId, pages), readRuns(admin, clientId, pages),
  ])
  const provenance = await readProvenanceTable(admin, clientId, pages)
  const ctx = measureContext({ clientId, now, changes: [], videos, verdicts, keywordRows, runs, provenance, inFlight: { runId } })
  const { lastGather } = pairRead(ctx, month)
  const prevStart = (() => {
    const d = new Date(`${month}T00:00:00.000Z`)
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString()
  })()
  const unchanged = lastGather ? unchangedSearches(ctx.gathers, prevStart, lastGather.runId) : null

  const lensVideos: LensVideo[] = monthVideos.map((v) => ({
    id: v.id, dated: v.dated, segment: segments.get(v.id) ?? 'market',
    insideSearches: unchanged ? !isOutside(v, ctx.evidence.get(v.id), unchanged) : false,
  }))
  const fresh: LensReadingRow[] = []
  const lenses: Record<string, number> = {}
  for (const call of lensCalls(month, lensVideos, { withSegments, withSearches: unchanged != null })) {
    if (call.ids && call.ids.length === 0) { lenses[call.lens] = 0; continue }
    let rows: LensRow[]
    try {
      rows = await selectAll<LensRow>(() => admin.rpc('lens_readings', {
        p_client: clientId, p_month: month, p_run: runId, p_video_ids: call.ids, p_min_dated_comments: call.minDated, p_captured_before: null,
      }).order('audience').order('object_kind').order('object_id'))
    } catch (e) {
      if (isMissingObject(e, 'lens_readings')) return { ...base, note: 'lens_readings is not there (MF2 not applied)' }
      throw e
    }
    const lensRows = lensRowsOf(clientId, month, call.lens, rows)
    lenses[call.lens] = pooledLensVideos(lensRows)
    fresh.push(...lensRows)
  }

  // The audience-months that have closed: a new key there is refused, the
  // guard's rule, one row at a time (mergeMonthRows).
  const closed = await selectAll<{ month: string; audience: string }>(() => admin.from('month_denominators').select('month, audience')
    .eq('client_id', clientId).eq('month', month).eq('status', 'frozen').order('audience'))
  const merged = mergeLensRows({ months: [month], fresh, stored, now, runId, closedAudienceMonths: closed.map(denominatorKey) })
  const { written, deleted } = await writeLensRows(admin, clientId, merged)
  return {
    month, status: 'written', written, deleted,
    frozen: merged.writes.filter((w) => w.status === 'frozen').length,
    keptFrozen: merged.keptFrozen, refusedLate: merged.refusedLate.length, lenses,
    note: Object.entries(lenses).map(([l, n]) => `${l} ${n}`).join(' · '),
  }
}

export const lensSummary = (r: LensMonthResult): string =>
  r.status === 'skipped'
    ? `${r.month.slice(0, 7)}: skipped · ${r.note}`
    : `${r.month.slice(0, 7)}: ${r.written} written (${r.frozen} frozen), ${r.keptFrozen} already frozen and left alone, ${r.deleted} dropped, ${r.refusedLate} refused as late · pooled videos by lens: ${r.note}`
