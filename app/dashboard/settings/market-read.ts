import type { SupabaseClient } from '@supabase/supabase-js'

import { marketSplit, type MarketSplit } from '@/components/settings/tracking/your-market'
import { pairChipWords } from '@/lib/calibration'
import { readMonthVideos, type Pages } from '@/lib/provenance/load'
import { pairOnVerdict } from '@/lib/reading/comparability'
import { monthStartOf, nextMonth } from '@/lib/reading/month-key'
import { loadPairJudge, readingHandle } from '@/lib/reading/read'
import { isMissingVideoSegments } from '@/lib/segments/override'

// The reads Settings › What we read adds for the preview's words (market-first
// WP3.10): the month before as counts, the market pair's chip, your own posts
// in the month and the videos you marked "not my market". Each read that fails
// returns null, and the page prints the part without it, never a zero.

const say = (what: string, clientId: string, error: unknown): null => {
  console.error(`[settings] ${what} not read for ${clientId}: ${(error as { message?: string } | null)?.message ?? String(error)}`)
  return null
}

/** The month before the reading month, split as the hero draws it; null where
 *  MF1 is not there or the month holds no market video. */
export async function prevMarketSplit(admin: SupabaseClient, clientId: string, prevMonth: string): Promise<MarketSplit | null> {
  const pages: Pages = { n: 0 }
  const rows = await readMonthVideos(admin, clientId, monthStartOf(prevMonth), pages).catch((e: unknown) => say('the month before', clientId, e))
  if (!rows || rows.length === 0) return null
  return marketSplit(rows)
}

/** The market pair's chip for the reading month against the month before, in
 *  `pairChipWords`' one wording, where the pair is refused; null otherwise. */
export async function marketPairChip(clientId: string, prevMonth: string, month: string, now: string): Promise<string | null> {
  try {
    const judge = await loadPairJudge(readingHandle(clientId), now)
    const note = pairOnVerdict(judge(monthStartOf(prevMonth), monthStartOf(month), 'market')).note
    return note && note.mode === 'refuse' ? pairChipWords(note) : null
  } catch (e) {
    return say('the market pair', clientId, e)
  }
}

/** Your own posts dated in the month (by the post: the census's clock, as
 *  What you published counts them). A head count, no rows. */
export async function ownPostsIn(supabase: SupabaseClient, clientId: string, month: string): Promise<number | null> {
  const m = monthStartOf(month)
  const { count, error } = await supabase
    .from('videos')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('is_client', true)
    .gte('upload_date', m)
    .lt('upload_date', nextMonth(m))
  if (error) return say('your own posts', clientId, error)
  return count ?? 0
}

/**
 * The videos you marked "this is not my market" (lib/segments/override.ts): a
 * video whose newest override row marks it off-topic. The session's own read
 * (MF1 grants `authenticated` a column SELECT under the tenant policy). Null
 * where `video_segments` is not there or the read fails.
 */
export async function notMyMarketCount(supabase: SupabaseClient, clientId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('video_segments')
    .select('video_id, segment, decided_at')
    .eq('client_id', clientId)
    .eq('method', 'override')
    .order('decided_at', { ascending: true })
  if (error) return isMissingVideoSegments(error) ? null : say('the videos marked not your market', clientId, error)
  const newest = new Map<string, string>()
  for (const r of (data ?? []) as { video_id: string; segment: string }[]) newest.set(String(r.video_id), r.segment)
  return [...newest.values()].filter((s) => s === 'noise').length
}
