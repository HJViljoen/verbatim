import type { SupabaseClient } from '@supabase/supabase-js'

import { changesFromLog, type PairComparability } from '../reading/comparability'
import { monthStartOf, prevMonth as previousMonthOf } from '../reading/month-key'
import { loadChanges, loadMonthSeries, loadPairRows, type ReadingHandle } from '../reading/read'
import { loadAppPairOn, ourChangesWithoutGatherFlags } from '../reading/gather-flags'
import { loadDeliveredRuns, loadMarketRivalAudiences, loadReadingMonth, loadReadingSchedule, readingViewFrom, updateInstant } from '../reading/reading-view'
import { scheduledUpdateAfter, type ReadingMonth } from '../reading/reading-month'
import { pooledDenominators } from '../reading/market'
import { selectAll } from '../supabase-admin'
import type { ConfigChange } from '../config-log'
import { buildChangeBlock, compareRules, type ChangeBlock, type CompareRule, type LedgerLine } from '../pages/overview-market/change'
import { gathersOf, type KeywordRow } from '../provenance/searches'
import { ledgerLines, recordView, type CommunityGathers, type ReachRow, type RecordView } from './what-we-changed'

// Settings › What we changed, read (market-first WP1.6). The page's own
// reading month and month pair, on the same inputs the front page reads them
// from, so "Why September is not compared" is the front page's sentence to the
// word; the change log (the memoised read every reading page makes); MF1's
// `config_change_reach`, absent until Wed 30 Sep and read as "not measured".

export const TABLE_CHANGE_REACH = 'config_change_reach'
export const TABLE_KEYWORD_PERFORMANCE = 'keyword_performance'

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
 * The tenant's gathers, for the dated list's community lines: every
 * keyword_performance row, one paged read (as the front page's lead reads it),
 * so a line names the communities the gathers ran, the reading
 * log-tracking-eras' reach uses (`communityDelta`, lib/provenance/searches.ts).
 * The reconstruction's 9 Sep rows alone name r/backpacks, which has run since
 * 17 Aug, and not r/onebag. Null where the read fails: the lines then read the
 * change log's rows as they stand, and the page still renders.
 */
export async function loadCommunityGathers(client: SupabaseClient, clientId: string): Promise<CommunityGathers> {
  try {
    const rows = await selectAll<KeywordRow>(() =>
      client.from(TABLE_KEYWORD_PERFORMANCE).select('run_id, platform, keyword, created_at').eq('client_id', clientId).order('id'),
    )
    return gathersOf(rows, [])
  } catch (error) {
    console.error(`[what-we-changed] ${TABLE_KEYWORD_PERFORMANCE}: ${(error as { message?: string })?.message ?? String(error)}; community lines read the change log as it stands`)
    return null
  }
}

/**
 * The tab's reading month (decision A), as the reading pages and What we
 * changed read it: the same four memoised reads (`readingViewFrom`), so the
 * Record page's Delivery, Coverage and scope statement read September on 1 to
 * 15 Oct, not the calendar's October (deploy 2 review; WP1.2's open item).
 * Null for a tenant nothing has been delivered to.
 */
export function loadRecordReadingMonth(supabase: SupabaseClient, reading: ReadingHandle, now: string): Promise<ReadingMonth | null> {
  return loadReadingMonth(supabase, reading, now)
}

export interface WhatWeChanged {
  reading: ReadingMonth
  block: ChangeBlock
  rules: CompareRule[]
  pair: PairComparability | null
  lines: ReturnType<typeof ledgerLines>
  /** The dated list as the preview groups it, with what each change stops
   *  (R-a, `recordView`). */
  record: RecordView
  /** The change log's rows, for the page's Phase 1 log of everything else. */
  changeRows: ConfigChange[]
}

/**
 * The section's data, or null for a tenant nothing has been delivered to.
 * About seven reads, most of them memoised with the change log and the pair
 * judge's own; the gathers are one paged read of keyword_performance.
 */
export async function loadWhatWeChanged(supabase: SupabaseClient, reading: ReadingHandle, now: string): Promise<WhatWeChanged | null> {
  const { client, clientId } = reading
  const [runs, schedule, history, rivalAudiences, changeRows, pairRows, reach, pairOn, gathers] = await Promise.all([
    loadDeliveredRuns(supabase, clientId),
    loadReadingSchedule(supabase, clientId),
    loadMonthSeries(client, clientId, { from: '2019-01-01', to: now, updatesByMonth: {} }),
    loadMarketRivalAudiences(supabase, clientId),
    loadChanges(client, clientId),
    loadPairRows(client, clientId, null),
    loadChangeReach(client, clientId),
    loadAppPairOn(reading, now),
    loadCommunityGathers(client, clientId),
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
  const lines = ledgerLines({ changes, rows: changeRows, reach, runFinish, gathers })
  return {
    reading: rm,
    block,
    rules: compareRules(block.pair),
    pair: block.pair,
    lines,
    // WHAT EACH CHANGE STOPS IS THE PAGE'S OWN JUDGE'S (the one every reading
    // page holds), asked of the pairs this list can show.
    record: recordView({ lines, changes, rows: changeRows, pair: pairOn, readingMonth: month, prevMonth: block.prevMonth, block, updates: [...runFinish.values()] }),
    changeRows: [...changeRows],
  }
}

export type { LedgerLine }
