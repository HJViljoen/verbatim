import type { SupabaseClient } from '@supabase/supabase-js'

import { selectAll } from '../supabase-admin'
import type { StoredCheck } from './overview-market/change'

// The re-check's reads for Your market's block 10 (market-first WP2.3): the
// stored rows of `comparability_checks` (MF2) for the page's pair, and the
// buyers-only counts of its two months (MF1 `market_segment_counts`). Three
// reads, beside the page's other market reads; the block decides what prints
// (`buildChangeBlock`, `recheckLines`).
//
// FAILS CLOSED. A table or function that is not there yet (MF2 before Tue 6
// Oct) is "not read", which the block prints as "checks pending"; any other
// failure says so in the log and reads the same way. Never a zero.

export const TABLE_COMPARABILITY_CHECKS = 'comparability_checks'
export const RPC_MARKET_SEGMENT_COUNTS = 'market_segment_counts'
/** The populations the page prints from (the front page's at most three
 *  lines); `all_but_noise` waits for Subjects' checks block in December. */
const PAGE_POPULATIONS = ['same_searches_clean', 'dense20'] as const

const missing = (error: unknown, name: string): boolean => {
  const text = error instanceof Error ? error.message : String((error as { message?: string } | null)?.message ?? error)
  return text.includes(name) && /schema cache|does not exist|Could not find/i.test(text)
}

const say = (what: string, error: unknown): void => {
  console.error(`[overview] ${what}: ${(error as { message?: string } | null)?.message ?? String(error)}; read as not read`)
}

/** The pair's stored rows, every `computed_at` (the block keeps the newest per
 *  object); null where they could not be read. */
export async function loadCheckRows(client: SupabaseClient, clientId: string, prevMonth: string, month: string): Promise<StoredCheck[] | null> {
  try {
    const rows = await selectAll<StoredCheck>(() =>
      client
        .from(TABLE_COMPARABILITY_CHECKS)
        .select('prev_month, month, population, object_kind, object_id, k_prev, n_prev, k_curr, n_curr, population_makers, population_noise, verdict, outcome, read_through_run, computed_at')
        .eq('client_id', clientId)
        .eq('prev_month', prevMonth)
        .eq('month', month)
        .in('population', [...PAGE_POPULATIONS])
        .order('computed_at', { ascending: true })
        .order('population', { ascending: true })
        .order('object_kind', { ascending: true })
        .order('object_id', { ascending: true }),
    )
    return rows.map((r) => ({
      ...r,
      k_prev: r.k_prev == null ? null : Number(r.k_prev),
      n_prev: r.n_prev == null ? null : Number(r.n_prev),
      k_curr: r.k_curr == null ? null : Number(r.k_curr),
      n_curr: r.n_curr == null ? null : Number(r.n_curr),
    }))
  } catch (error) {
    if (!missing(error, TABLE_COMPARABILITY_CHECKS)) say('comparability_checks', error)
    return null
  }
}

/**
 * The buyers-only count of a month (plan WP2.3's population): the market's
 * videos (MF1 `market_month_videos`: full lane, a comment dated in the month,
 * your own posts out) that segments_v1 reads as neither makers' nor
 * off-topic, over every audience of the market. Null where not read.
 */
export async function loadBuyersCount(client: SupabaseClient, clientId: string, month: string): Promise<number | null> {
  const res = await client.rpc(RPC_MARKET_SEGMENT_COUNTS, { p_client: clientId, p_month: month })
  if (res.error) {
    if (!missing(res.error, RPC_MARKET_SEGMENT_COUNTS)) say(RPC_MARKET_SEGMENT_COUNTS, res.error)
    return null
  }
  const rows = (res.data ?? []) as { audience: string; segment: string; videos: number | string }[]
  if (!Array.isArray(rows)) return null
  let n = 0
  for (const r of rows) {
    const v = Number(r.videos)
    if (r.segment === 'market' && r.audience !== 'client' && Number.isFinite(v)) n += v
  }
  return n
}

/** The block's re-check inputs, read beside each other. */
export async function loadRecheck(client: SupabaseClient, clientId: string, prevMonth: string, month: string): Promise<{
  rows: StoredCheck[] | null
  buyers: { prev: number | null; curr: number | null } | null
}> {
  const [rows, prev, curr] = await Promise.all([
    loadCheckRows(client, clientId, prevMonth, month),
    loadBuyersCount(client, clientId, prevMonth).catch((e: unknown) => { say(RPC_MARKET_SEGMENT_COUNTS, e); return null }),
    loadBuyersCount(client, clientId, month).catch((e: unknown) => { say(RPC_MARKET_SEGMENT_COUNTS, e); return null }),
  ])
  return { rows, buyers: prev == null && curr == null ? null : { prev, curr } }
}
