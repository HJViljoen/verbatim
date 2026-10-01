import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk, mapWithLimit, READ_CONCURRENCY, UUID_IN_CHUNK } from '../chunk'
import { CLIENT_AUDIENCE, loadCompetitors, rivalNameOf } from '../rivals'
import type { WhoAbout, WhoPart } from './types'

// Who a piece of talk is about (the pages build's brand rule, 1 Oct): every
// item of talk says whether it is about the client, a tracked rival, or the
// rest of the category.
//
// THE RULE, PER VIDEO:
//  · a comment counted on the video NAMES a tracked brand (the product's own
//    matcher, `brand_mentions` comment rows, `lib/brands/mentions.ts`; never
//    'rejected', and the 'watched:' brands are not tracked ones): the talk is
//    about that brand; where its comments name two, the alphabetically first,
//    so each video is filed once and a split adds up;
//  · else its audience: the client's own posts are about the client, a video
//    filed under a tracked rival is about that rival (found by search and
//    filed there, not the rival's own post), and the rest is the category.
// A brand is never inferred from a label, a caption or a guess.
//
// PURE but for the two reads at the bottom. The pages build's shared helper
// (`lib/brands/attribution.ts`, package WEEKCONV) states the same rule; this
// copy is the long-run read's, and the lead folds the two together.

/** One video of a piece of talk: its audience (the reading functions' CASE)
 *  and the tracked brands its counted comments name, by display name. */
export interface WhoVideo {
  id: string
  audience: string
  named: readonly string[]
}

/** Who one video is about. `company` is the client's display name. */
export function aboutOf(v: Pick<WhoVideo, 'audience' | 'named'>, company: string): WhoAbout {
  const named = [...new Set(v.named.map((n) => n.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const first = named[0]
  if (first) return first.toLowerCase() === company.trim().toLowerCase() ? 'client' : `rival:${first}`
  if (v.audience === CLIENT_AUDIENCE) return 'client'
  const rival = rivalNameOf(v.audience)
  return rival ? `rival:${rival}` : 'market'
}

/** Merge the same video seen through several pieces of talk: the named brands
 *  of every sighting count. Pure. */
export function mergeWhoVideos(videos: readonly WhoVideo[]): WhoVideo[] {
  const byId = new Map<string, { audience: string; named: Set<string> }>()
  for (const v of videos) {
    const held = byId.get(v.id)
    if (held) for (const n of v.named) held.named.add(n)
    else byId.set(v.id, { audience: v.audience, named: new Set(v.named) })
  }
  return [...byId.entries()].map(([id, v]) => ({ id, audience: v.audience, named: [...v.named] }))
}

/** The order a split prints in: the client first, then the rivals by videos
 *  (ties by name), the category last. */
function byWhoOrder(a: WhoPart, b: WhoPart): number {
  const rank = (p: WhoPart) => (p.about === 'client' ? 0 : p.about === 'market' ? 2 : 1)
  return rank(a) - rank(b) || b.videos - a.videos || a.about.localeCompare(b.about)
}

/** The split of a set of videos, one brand per video, in print order. Sums to
 *  the number of distinct videos. Pure. */
export function whoSplit(videos: readonly WhoVideo[], company: string): WhoPart[] {
  const counts = new Map<WhoAbout, number>()
  for (const v of mergeWhoVideos(videos)) {
    const about = aboutOf(v, company)
    counts.set(about, (counts.get(about) ?? 0) + 1)
  }
  return [...counts.entries()].map(([about, videos]) => ({ about, videos })).sort(byWhoOrder)
}

/** The split of an audience-keyed count (a stored per-audience reading, where
 *  no comment is read): the client's own posts, each rival, the category.
 *  Rows of an audience outside `audiences` are left out. Pure. */
export function whoOfAudiences(rows: readonly { audience: string; videos: number }[], audiences: ReadonlySet<string>): WhoPart[] {
  const counts = new Map<WhoAbout, number>()
  for (const r of rows) {
    if (!audiences.has(r.audience) || !(r.videos > 0)) continue
    const about = aboutOf({ audience: r.audience, named: [] }, '')
    counts.set(about, (counts.get(about) ?? 0) + r.videos)
  }
  return [...counts.entries()].map(([about, videos]) => ({ about, videos })).sort(byWhoOrder)
}

// ---- The reads ----------------------------------------------------------------------

/** The display names of the brand keys `brand_mentions` uses: 'client' is
 *  the company, a `competitors.id` its name (retired ones too: a frozen month
 *  may still name them). */
export async function loadBrandNames(admin: SupabaseClient, clientId: string, company: string): Promise<Map<string, string>> {
  const out = new Map<string, string>([['client', company]])
  for (const c of await loadCompetitors(admin, clientId)) out.set(String(c.id), c.name)
  return out
}

/**
 * The tracked brands each of these comments names, by display name (the
 * matcher's comment rows, never a rejected one; an unknown or 'watched:' key
 * names nothing). READ-ONLY: one request per UUID_IN_CHUNK comments.
 */
export async function loadCommentBrands(
  admin: SupabaseClient,
  clientId: string,
  commentIds: readonly string[],
  names: ReadonlyMap<string, string>,
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  const ids = [...new Set(commentIds.filter(Boolean))]
  if (ids.length === 0) return out
  const pages = await mapWithLimit(chunk(ids, UUID_IN_CHUNK), READ_CONCURRENCY, async (part) => {
    const res = await admin.from('brand_mentions')
      .select('comment_id, brand_key')
      .eq('client_id', clientId).eq('source', 'comment').neq('method', 'rejected')
      .in('comment_id', part)
    if (res.error) throw new Error(`brand mentions: ${res.error.message}`)
    return (res.data ?? []) as { comment_id: string | null; brand_key: string | null }[]
  })
  for (const r of pages.flat()) {
    const name = r.brand_key ? names.get(String(r.brand_key)) : undefined
    if (!r.comment_id || !name) continue
    const held = out.get(String(r.comment_id)) ?? []
    if (!held.includes(name)) held.push(name)
    out.set(String(r.comment_id), held)
  }
  return out
}
