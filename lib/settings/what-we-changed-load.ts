import type { SupabaseClient } from '@supabase/supabase-js'

import { changesFromLog, type PairComparability } from '../reading/comparability'
import { monthStartOf, prevMonth as previousMonthOf } from '../reading/month-key'
import { loadChanges, loadMonthSeries, loadPairRows, type ReadingHandle } from '../reading/read'
import { loadAppPairOn, ourChangesWithoutGatherFlags } from '../reading/gather-flags'
import { loadDeliveredRuns, loadMarketRivalAudiences, loadReadingSchedule, readingViewFrom, updateInstant } from '../reading/reading-view'
import { scheduledUpdateAfter, type ReadingMonth } from '../reading/reading-month'
import { pooledDenominators } from '../reading/market'
import { selectAll } from '../supabase-admin'
import type { ConfigChange } from '../config-log'
import { buildChangeBlock, compareRules, type ChangeBlock, type CompareRule, type LedgerLine } from '../pages/overview-market/change'
import { ledgerLines, type ReachRow } from './what-we-changed'

// Settings › What we changed, read (market-first WP1.6). The page's own
// reading month and month pair, on the same inputs the front page reads them
// from, so "Why September is not compared" is the front page's sentence to the
// word; the change log (the memoised read every reading page makes); MF1's
// `config_change_reach`, absent until Wed 30 Sep and read as "not measured".

export const TABLE_CHANGE_REACH = 'config_change_reach'

/** Is MF1's reach table missing here? Narrowed to its name. */
export function isMissingChangeReach(error: unknown): boolean {
  if (!error) return false
  const { code, message } = (typeof error === 'object' ? error : {}) as { code?: string; message?: string }
  const text = message ?? (error instanceof Error ? error.message : String(error))
  if (!text.includes(TABLE_CHANGE_REACH)) return false
  if (code && ['PGRST205', 'PGRST204', '42P01', '42703'].includes(code)) return true
  return /in the schema cache/i.test(text) || /does not exist/i.test(text)
}

/** Every reach row for the tenant (every computation; the list keeps the
 *  newest per month). Empty until MF1 is applied. */
export async function loadChangeReach(client: SupabaseClient, clientId: string): Promise<ReachRow[]> {
  try {
    const rows = await selectAll<Record<string, unknown>>(() =>
      client
        .from(TABLE_CHANGE_REACH)
        .select('change_id, month, population, videos_touched, videos_in_month, read_through_run, computed_at')
        .eq('client_id', clientId)
        .order('computed_at', { ascending: true }),
    )
    return rows.map((r) => ({
      changeId: String(r.change_id),
      month: String(r.month),
      population: String(r.population ?? 'market'),
      touched: Number(r.videos_touched),
      inMonth: Number(r.videos_in_month),
      readThroughRun: typeof r.read_through_run === 'string' ? r.read_through_run : null,
      computedAt: String(r.computed_at),
    })).filter((r) => Number.isFinite(r.touched) && Number.isFinite(r.inMonth))
  } catch (error) {
    if (isMissingChangeReach(error)) return []
    throw error
  }
}

/**
 * The tab's reading month (decision A), as the reading pages and What we
 * changed read it: the same four memoised reads (`readingViewFrom`), so the
 * Record page's Delivery, Coverage and scope statement read September on 1 to
 * 15 Oct, not the calendar's October (deploy 2 review; WP1.2's open item).
 * Null for a tenant nothing has been delivered to.
 */
export async function loadRecordReadingMonth(supabase: SupabaseClient, reading: ReadingHandle, now: string): Promise<ReadingMonth | null> {
  const { client, clientId } = reading
  const [runs, schedule, history, rivalAudiences] = await Promise.all([
    loadDeliveredRuns(supabase, clientId),
    loadReadingSchedule(supabase, clientId),
    loadMonthSeries(client, clientId, { from: '2019-01-01', to: now, updatesByMonth: {} }),
    loadMarketRivalAudiences(supabase, clientId),
  ])
  if (runs.length === 0) return null
  return readingViewFrom({ now, runs, denominators: history.denominators, rivalAudiences, schedule }).reading
}

export interface WhatWeChanged {
  reading: ReadingMonth
  block: ChangeBlock
  rules: CompareRule[]
  pair: PairComparability | null
  lines: ReturnType<typeof ledgerLines>
  /** The change log's rows, for the page's Phase 1 log of everything else. */
  changeRows: ConfigChange[]
}

/**
 * The section's data, or null for a tenant nothing has been delivered to.
 * About six reads, most of them memoised with the change log and the pair
 * judge's own.
 */
export async function loadWhatWeChanged(supabase: SupabaseClient, reading: ReadingHandle, now: string): Promise<WhatWeChanged | null> {
  const { client, clientId } = reading
  const [runs, schedule, history, rivalAudiences, changeRows, pairRows, reach, pairOn] = await Promise.all([
    loadDeliveredRuns(supabase, clientId),
    loadReadingSchedule(supabase, clientId),
    loadMonthSeries(client, clientId, { from: '2019-01-01', to: now, updatesByMonth: {} }),
    loadMarketRivalAudiences(supabase, clientId),
    loadChanges(client, clientId),
    loadPairRows(client, clientId, null),
    loadChangeReach(client, clientId),
    loadAppPairOn(reading, now),
  ])
  if (runs.length === 0) return null
  const view = readingViewFrom({ now, runs, denominators: history.denominators, rivalAudiences, schedule })
  const rm = view.reading
  const month = monthStartOf(rm.month)
  const prev = previousMonthOf(month)
  const counts = pooledDenominators(
    history.denominators.map((d) => ({ month: d.month, audience: d.audience, videos: d.videos, comments: d.comments ?? 0 })),
    rivalAudiences ?? [],
  )
  const changes = changesFromLog(changeRows)
  const runFinish = new Map(runs.map((r) => [r.id, updateInstant(r)]))
  const pair = pairOn(prev, month, 'market')
  const block = buildChangeBlock({
    prevMonth: prev,
    month,
    hasPrev: counts.has(prev),
    pair,
    // A capped update is a gather flag, not a change of ours (decision D,
    // lib/reading/gather-flags.ts): the list below still prints it.
    changes: ourChangesWithoutGatherFlags(changeRows),
    pairRows,
    nextUpdateAfter: schedule ? scheduledUpdateAfter(schedule) : null,
    asAt: rm.asAt,
    paused: rm.paused,
    runFinish,
  })
  return {
    reading: rm,
    block,
    rules: compareRules(block.pair),
    pair: block.pair,
    lines: ledgerLines({ changes, rows: changeRows, reach, runFinish }),
    changeRows: [...changeRows],
  }
}

export type { LedgerLine }
