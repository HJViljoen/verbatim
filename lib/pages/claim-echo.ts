import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk, UUID_IN_CHUNK } from '../chunk'
import type { SayVsHearEntry } from '../pipeline/schemas'
import { fetchInsightsByIds } from '../quotes'
import type { ReadingHandle } from '../reading/read'
import { marketClaimEcho, marketEchoReading, type ClaimEcho } from '../reading/own-posts'
import { selectAll } from '../supabase-admin'

// Say vs hear, counted ONE way for every page that prints it (walkthrough
// item 8, 29 Sep).
//
// WHAT WAS WRONG. "Protect Our Paths" read "Echoed" on Subjects and "Not talked
// about · 0 of 852 videos" on Your moves, one click apart. Subjects printed
// Pass D-a's stance as stored; Your moves counted the market's videos behind
// the same evidence. Both were true — the evidence was Sealand's own comment
// sections, where followers praised the cleanups, and the market said
// nothing — and together they read as the product contradicting itself.
//
// SO BOTH PAGES READ THIS. Each claim's echo is counted in the reading month's
// market videos (the count decides the state, the stance only its sign:
// `claimEcho`), and the client's own posts behind the same evidence are
// counted apart as `followers`, so a reading that rests on your followers is
// said to rest on them (`followersLine`), in the same words on both pages.

/** The reading month's market videos (MF1 `market_month_videos`), as a set.
 *  Null where the function is not there or the read failed. */
export async function loadMarketMonthVideos(reading: ReadingHandle, clientId: string, month: string): Promise<Set<string> | null> {
  const rows = await selectAll<{ video_id: string }>(() =>
    reading.client.rpc('market_month_videos', { p_client: clientId, p_month: month }).select('video_id').order('video_id', { ascending: true }) as never,
  )
  return new Set(rows.map((r) => String(r.video_id)))
}

/**
 * Every ledger claim's echo, in the order given.
 *
 * `marketVideos` is the page's own read where it has one (Your moves already
 * holds it); otherwise it is read here. Each failure is its own honest
 * absence: an unread market is "not counted", unread followers are no
 * follower line — never the page.
 */
export async function loadClaimEchoes(input: {
  supabase: SupabaseClient
  reading: ReadingHandle
  clientId: string
  month: string
  entries: readonly SayVsHearEntry[]
  marketVideos?: Set<string> | null
}): Promise<ClaimEcho[]> {
  const { supabase, clientId, entries } = input
  if (entries.length === 0) return []
  const supportIds = [...new Set(entries.flatMap((e) => e.supporting_theme_ids ?? []))]
  const [marketVideos, supportRows] = await Promise.all([
    input.marketVideos !== undefined
      ? Promise.resolve(input.marketVideos)
      : loadMarketMonthVideos(input.reading, clientId, input.month).catch((e: unknown) => warn('marketVideos', e, null)),
    supportIds.length > 0
      ? fetchInsightsByIds<{ id: string; source_video_id: string | null }>(supabase, supportIds, 'id, source_video_id')
          .catch((e: unknown) => warn('support', e, [] as { id: string; source_video_id: string | null }[]))
      : Promise.resolve([] as { id: string; source_video_id: string | null }[]),
  ])
  const videoOf = new Map(supportRows.map((r) => [r.id, r.source_video_id]))
  const videoIds = [...new Set(supportRows.map((r) => r.source_video_id).filter((v): v is string => Boolean(v)))]
  const own = await loadOwnVideos(supabase, clientId, videoIds).catch((e: unknown) => warn('followers', e, null))
  return entries.map((e) => {
    const videos = [...new Set((e.supporting_theme_ids ?? []).map((id) => videoOf.get(id)).filter((v): v is string => Boolean(v)))]
    return marketClaimEcho({
      stance: e.audience,
      reading: marketEchoReading(videos, marketVideos ?? null),
      theySay: e.they_say,
      followers: own ? videos.filter((v) => own.has(v)).length : undefined,
    })
  })
}

/** Which of these videos are the client's own posts (`videos.is_client`). */
async function loadOwnVideos(supabase: SupabaseClient, clientId: string, videoIds: readonly string[]): Promise<Set<string>> {
  const out = new Set<string>()
  for (const part of chunk(videoIds, UUID_IN_CHUNK)) {
    const res = await supabase.from('videos').select('id').eq('client_id', clientId).eq('is_client', true).in('id', part)
    if (res.error) throw res.error
    for (const r of (res.data ?? []) as { id: string }[]) out.add(String(r.id))
  }
  return out
}

function warn<T>(what: string, e: unknown, fallback: T): T {
  console.error(`[pages] claimEchoes.${what}: ${(e as { message?: string })?.message ?? String(e)}`)
  return fallback
}
