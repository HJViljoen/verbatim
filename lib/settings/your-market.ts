import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk, UUID_IN_CHUNK } from '../chunk'
import { GATHER_MAX_SEARCHES_PER_RUN } from '../config'
import { platformLabel } from '../format'
import { activeSubreddits, parseSubreddits, subredditKey, subredditLabel } from '../gather/subreddits'
import { isMissingObject, readMonthVideos, type Pages } from '../provenance/load'
import { segmentRulesEnabled } from '../segments/rules'
import { selectAll } from '../supabase-admin'

// Settings › Tracking › Your market (market-first plan §2.10 D5, WP3.10):
//   - the MARKET's platform mix (the Platforms section printed the client's
//     own videos, nine a month: GS F31);
//   - the search cap made visible, as used of 120 (113 of 120 on Sealand's set,
//     F13: the next term makes it bind);
//   - each search's share of the market and its maker share, from
//     `video_provenance` (how each video was first found) and `video_segments`
//     (through MF1's `segments_for_videos`, the reader precedence). "Kept" used
//     to mean "survived the gate", which made `upcycled bag` look like the best
//     term (GS F25); 84% of what it finds is makers'.
// Each reads "not measured" when its table is missing (before MF1 on a
// project), never a zero.
//
// THE MONTH IS THE READING MONTH (decision A), the one every reading page and
// the rest of this page reads. The market is MF1's `market_month_videos`: the
// category and the videos filed under a tracked brand, the client's own posts
// left out (decision E), the count the pages print.

/** The run's ceiling on searches (lib/config.ts GATHER_MAX_SEARCHES_PER_RUN). */
export const SEARCH_CAP = GATHER_MAX_SEARCHES_PER_RUN

/** Searches one term costs on a platform: Instagram answers with reels or feed
 *  posts but never both, so it searches twice (lib/gather/platforms/instagram.ts
 *  `searchVariants`); every other platform once. The test pins the total to the
 *  gather's own planner (`buildPlatformTasks`), so the two cannot drift. */
const SEARCHES_PER_TERM: Readonly<Record<string, number>> = { instagram: 2 }

export interface SearchGroup { key: 'brand' | 'competitor' | 'industry' | 'communities'; label: string; terms: number; searches: number }
export interface SearchPlan { groups: SearchGroup[]; used: number; cap: number }

/** How many searches each update plans, by group, as the gather plans them:
 *  every term once per platform (twice on Instagram), a term listed in two
 *  groups only once, and each active community once more on Reddit when
 *  discovery is on. */
export function searchPlan(config: {
  brand_keywords?: readonly string[] | null
  competitor_keywords?: readonly string[] | null
  industry_keywords?: readonly string[] | null
  platforms?: readonly string[] | null
  subreddits?: unknown
}, redditDiscovery: boolean): SearchPlan {
  const platforms = config.platforms ?? []
  const perTerm = platforms.reduce((n, p) => n + (SEARCHES_PER_TERM[p] ?? 1), 0)
  const seen = new Set<string>()
  const groups: SearchGroup[] = []
  const buckets: [SearchGroup['key'], string, readonly string[] | null | undefined][] = [
    ['brand', 'Your name', config.brand_keywords],
    ['competitor', 'Brands you track', config.competitor_keywords],
    ['industry', 'The category', config.industry_keywords],
  ]
  for (const [key, label, list] of buckets) {
    let terms = 0
    for (const raw of list ?? []) {
      const kw = `${raw}`.trim()
      if (!kw || seen.has(kw)) continue
      seen.add(kw)
      terms++
    }
    groups.push({ key, label, terms, searches: terms * perTerm })
  }
  const communities = platforms.includes('reddit') && redditDiscovery ? activeSubreddits(parseSubreddits(config.subreddits)).length : 0
  groups.push({ key: 'communities', label: 'Communities', terms: communities, searches: communities })
  return { groups, used: groups.reduce((n, g) => n + g.searches, 0), cap: SEARCH_CAP }
}

/** "113 of 120 searches each update · 7 free", or "capped" past it. */
export function searchCapLine(plan: SearchPlan): string {
  const free = plan.cap - plan.used
  return `${plan.used} of ${plan.cap} searches each update · ${free > 0 ? `${free} free` : free === 0 ? 'none free' : `${-free} over, so the update drops the last of them`}`
}

export interface MarketVideo {
  id: string
  platform: string
  /** `market_month_videos.audience`: 'industry-other' (the category) or
   *  'competitor:<name>' (filed under a brand you track). Optional, so a
   *  caller that counts platforms need not carry it (WP3.10's hero reads it). */
  audience?: string
}
export interface PlatformShare { platform: string; label: string; videos: number }

/** The market's videos by platform, biggest first. */
export function marketPlatformMix(videos: readonly MarketVideo[]): PlatformShare[] {
  const by = new Map<string, number>()
  for (const v of videos) by.set(v.platform, (by.get(v.platform) ?? 0) + 1)
  return [...by].map(([platform, n]) => ({ platform, label: platformLabel(platform), videos: n }))
    .sort((a, b) => b.videos - a.videos || a.platform.localeCompare(b.platform))
}

export interface TermShare {
  /** The search as typed, or "r/onebag" for a community. */
  search: string
  videos: number
  /** Of them, makers' (segment 'maker'); null where makers are not measured. */
  makers: number | null
}

export type MakerState = 'measured' | 'no_rule' | 'not_measured'

/**
 * Each search's videos in the month's market, and the makers among them. A
 * video first found by two searches counts for both, so the rows do not sum to
 * the market; a video with no provenance row counts for none (it is `unknown`).
 */
export function termShares(input: {
  market: readonly MarketVideo[]
  provenance: ReadonlyMap<string, { first_terms: readonly string[]; first_subreddits: readonly string[] }>
  segments: ReadonlyMap<string, string> | null
}): { rows: TermShare[]; unknown: number } {
  const rows = new Map<string, TermShare>()
  let unknown = 0
  for (const v of input.market) {
    const p = input.provenance.get(v.id)
    const found = p ? [...new Set([...p.first_terms.map((t) => t.trim()).filter(Boolean), ...p.first_subreddits.map((s) => subredditLabel(subredditKey(s))).filter((s) => s !== 'r/')])] : []
    if (found.length === 0) { unknown++; continue }
    const maker = input.segments ? input.segments.get(v.id) === 'maker' : null
    for (const search of found) {
      const row = rows.get(search) ?? { search, videos: 0, makers: input.segments ? 0 : null }
      row.videos++
      if (maker && row.makers != null) row.makers++
      rows.set(search, row)
    }
  }
  return {
    rows: [...rows.values()].sort((a, b) => b.videos - a.videos || a.search.localeCompare(b.search)),
    unknown,
  }
}

/** The one-line answer over the searches: the biggest search, and its makers
 *  where they are half or more of it ("Your biggest search, upcycled bag, finds
 *  mostly makers: 125 of its 149 videos."). Null where nothing is measured. */
export function biggestSearchLine(rows: readonly TermShare[]): { search: string; videos: number; makers: number | null; mostlyMakers: boolean } | null {
  const top = rows[0]
  if (!top) return null
  return { search: top.search, videos: top.videos, makers: top.makers, mostlyMakers: top.makers != null && top.videos > 0 && top.makers / top.videos >= 0.5 }
}

// ---- The read -------------------------------------------------------------------------

export interface YourMarket {
  month: string
  /** The month's market videos; null where MF1's function is not there. */
  market: MarketVideo[] | null
  mix: PlatformShare[] | null
  /** Null where `video_provenance` is not there. */
  terms: { rows: TermShare[]; unknown: number } | null
  makers: MakerState
  /** Settings' Makers and "This is not my market" (WP3.10): the category's
   *  videos and the makers among them, and the market's off-topic videos, by
   *  the reader precedence. Null where makers are not measured. */
  segmentCounts: SegmentCounts | null
  pages: number
}

export interface SegmentCounts {
  /** The month's category videos (audience 'industry-other'). */
  category: number
  /** Of them, makers'. */
  categoryMakers: number
  /** The month's market videos marked off-topic ('noise'). */
  marketNoise: number
  /** The month's market videos. */
  market: number
}

/** The counts `SegmentCounts` holds, from the month's market and each video's
 *  segment. A video with no segment row is 'market' (the rule marks nothing). */
export function segmentCounts(market: readonly MarketVideo[], segments: ReadonlyMap<string, string>): SegmentCounts {
  let category = 0
  let categoryMakers = 0
  let marketNoise = 0
  for (const v of market) {
    const seg = segments.get(v.id)
    if (seg === 'noise') marketNoise++
    if (v.audience !== 'industry-other') continue
    category++
    if (seg === 'maker') categoryMakers++
  }
  return { category, categoryMakers, marketNoise, market: market.length }
}

/**
 * The reads: the month's market videos (MF1), their first-found searches
 * (`video_provenance`, chunked by id) and their segments (`segments_for_videos`,
 * one call). The service role, because MF1's functions are granted to it alone;
 * the tenant is the session's.
 */
export async function loadYourMarket(admin: SupabaseClient, clientId: string, month: string): Promise<YourMarket> {
  const pages: Pages = { n: 0 }
  const rows = await readMonthVideos(admin, clientId, month, pages)
  if (rows === null) return { month, market: null, mix: null, terms: null, makers: 'not_measured', segmentCounts: null, pages: pages.n }
  const market = rows.map((r) => ({ id: r.id, platform: r.platform, audience: r.audience }))
  const ids = market.map((v) => v.id)

  let provenance: Map<string, { first_terms: string[]; first_subreddits: string[] }> | null = new Map()
  try {
    for (const part of chunk(ids, UUID_IN_CHUNK)) {
      const got = await selectAll<{ video_id: string; first_terms: string[] | null; first_subreddits: string[] | null }>(() => {
        pages.n++
        return admin.from('video_provenance').select('video_id, first_terms, first_subreddits').eq('client_id', clientId).in('video_id', part).order('video_id')
      })
      for (const r of got) provenance.set(r.video_id, { first_terms: r.first_terms ?? [], first_subreddits: r.first_subreddits ?? [] })
    }
  } catch (e) {
    if (!isMissingObject(e, 'video_provenance')) throw e
    provenance = null
  }

  let makers: MakerState = segmentRulesEnabled(clientId) ? 'measured' : 'no_rule'
  let segments: Map<string, string> | null = null
  if (makers === 'measured' && ids.length > 0) {
    // Chunked: an RPC's rows are capped like a table's (PostgREST's max rows),
    // and a month's market can pass a thousand videos.
    segments = new Map()
    for (const part of chunk(ids, UUID_IN_CHUNK)) {
      pages.n++
      const { data, error } = await admin.rpc('segments_for_videos', { p_client: clientId, p_video_ids: part })
      if (error) {
        if (!isMissingObject(error, 'segments_for_videos')) throw new Error(`segments_for_videos: ${error.message}`)
        makers = 'not_measured'
        segments = null
        break
      }
      for (const r of (data ?? []) as { video_id: string; segment: string }[]) segments.set(r.video_id, r.segment)
    }
  }

  return {
    month,
    market,
    mix: marketPlatformMix(market),
    terms: provenance ? termShares({ market, provenance, segments }) : null,
    makers,
    segmentCounts: segments ? segmentCounts(market, segments) : null,
    pages: pages.n,
  }
}
