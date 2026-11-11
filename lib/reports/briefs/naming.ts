import type { SupabaseClient } from '@supabase/supabase-js'

import { ownerOfVideos, type IdentityRow } from '../../brands/owners'
import { readRivalFound } from '../../brands/rival-searches'
import { chunk, UUID_IN_CHUNK } from '../../chunk'
import { countedMentions, loadBrandRefs, type CrossMention, type MentionRowIn } from '../../reading/cross'
import { monthStartOf, nextMonth } from '../../reading/month-key'
import { readingHandle } from '../../reading/read'
import { selectAll } from '../../supabase-admin'

// WHERE THE COMPANY STANDS, BY WHO NAMES IT (the blind-report check, 9 Nov;
// its ranked change 2). Leadership printed "Össur 1.1% of October's comments,
// Ottobock 2.1%": the bucket each brand's talk is filed under, which held
// Össur's own posts and the posts naming it against Ottobock's naming alone,
// because Ottobock's own posts are never read. On direct naming the brands
// were level. So the standing is read by naming, one way for every brand:
//
//   · COMMENTS: the comments dated in the month on the videos we read (the
//     comment-read lane, every audience), each brand's own posts left out,
//     and of them those naming each brand (`brand_mentions`, the counted
//     rule rows, `countedMentions`).
//   · VIDEOS NAMED WITHOUT BEING ASKED: the same videos, less every video a
//     brand search of ours found (the rival searches AND the company's own
//     name searches: each brand's own search is out of its own row, and one
//     base serves every row, as `lib/brands/rival-searches.ts` rules for the
//     rivals), and of them those naming each brand in the content or in a
//     comment dated in the month.
//
// Only brands whose naming production has hand-checked and counts
// (`BrandRef.countState`, lib/brands/precision.ts) are read: the gate the
// briefs' standing has always used (`brandsCountedFor`). Marketing's "Who gets
// named without being asked" prints the same rows (app.ts `namedSection`).
//
// READ-ONLY. `loadNaming` makes a handful of paged reads; `namingOf` is pure.

/** One brand's naming in the month. */
export interface BriefNamingRow {
  /** 'client', or a rival's `competitors.id`. */
  brandKey: string
  label: string
  you: boolean
  /** Comments dated in the month naming it, of `BriefNaming.comments`. */
  comments: number
  /** Videos naming it that no brand search of ours found, of
   *  `BriefNaming.videos`. */
  videos: number
  /** The platforms of those videos, the most first. */
  platforms: string[]
}

export interface BriefNaming {
  /** `YYYY-MM-01`. */
  month: string
  /** Comments dated in the month on the videos we read, every brand's own
   *  posts left out: every row's comments "of". */
  comments: number
  /** The videos those comments are on (`comments`' base). */
  read: number
  /** Those videos, less every video a brand search of ours found: every
   *  row's videos "of". */
  videos: number
  /** The company first, then its rivals, the most named first. */
  rows: BriefNamingRow[]
}

/** One video we read in the month: its comments dated in the month and whose
 *  own post it is ('client', a rival's key, or null). */
export interface NamingVideo {
  id: string
  platform: string
  comments: number
  owner: string | null
}

const PLATFORM: Readonly<Record<string, string>> = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', reddit: 'Reddit' }
const platformName = (p: string): string => PLATFORM[p.toLowerCase()] ?? p

/**
 * The month's naming of each brand, from the videos read, what our brand
 * searches found and the counted namings. Null where the company or every
 * rival is missing from `brands`. Pure.
 */
export function namingOf(input: {
  month: string
  brands: readonly { brandKey: string; label: string }[]
  videos: readonly NamingVideo[]
  /** Every video a brand search of ours found (the rivals' and the company's). */
  searched: ReadonlySet<string>
  mentions: readonly CrossMention[]
}): BriefNaming | null {
  const month = monthStartOf(input.month)
  const client = input.brands.find((b) => b.brandKey === 'client') ?? null
  const rivals = input.brands.filter((b) => b.brandKey !== 'client')
  if (!client || rivals.length === 0) return null
  const seen = new Set<string>()
  const videos = input.videos.filter((v) => !seen.has(v.id) && seen.add(v.id))
  // Every brand's own posts are its posts, never the market naming it.
  const read = videos.filter((v) => v.owner == null)
  const readIds = new Set(read.map((v) => v.id))
  const unasked = read.filter((v) => !input.searched.has(v.id))
  const unaskedIds = new Set(unasked.map((v) => v.id))
  const platformOf = new Map(read.map((v) => [v.id, v.platform]))
  const rowOf = (b: { brandKey: string; label: string }): BriefNamingRow => {
    const mine = input.mentions.filter((m) => m.brandKey === b.brandKey)
    const comments = mine.filter((m) => m.source === 'comment' && m.commentMonth === month && readIds.has(m.videoId)).length
    const named = new Set(mine.filter((m) => m.source === 'content' || m.commentMonth === month).map((m) => m.videoId).filter((id) => unaskedIds.has(id)))
    const byPlatform = new Map<string, number>()
    for (const id of named) {
      const p = platformName(platformOf.get(id) ?? '')
      if (p) byPlatform.set(p, (byPlatform.get(p) ?? 0) + 1)
    }
    return {
      brandKey: b.brandKey,
      label: b.label,
      you: b.brandKey === 'client',
      comments,
      videos: named.size,
      platforms: [...byPlatform.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([p]) => p),
    }
  }
  const theirs = rivals.map(rowOf).sort((x, y) => y.comments - x.comments || y.videos - x.videos || x.label.localeCompare(y.label))
  return {
    month,
    comments: read.reduce((n, v) => n + v.comments, 0),
    read: read.length,
    videos: unasked.length,
    rows: [rowOf(client), ...theirs],
  }
}

const IDENTITY = 'id, platform, video_id, source, account_name, is_client, is_competitor, competitor_name'

/**
 * The month's naming, read: the brands production counts (the company and
 * each tracked rival), the videos we read with comments dated in the month
 * (the market's, `market_month_videos`, and the company's audience, which
 * that read leaves out), whose own post each is, what our brand searches
 * found, and the counted namings. Null where the tenant has no brand rules, or
 * the company or every rival is not counted. Throws on a read error: the
 * caller is fail-soft.
 */
export async function loadNaming(admin: SupabaseClient, a: { clientId: string; month: string }): Promise<BriefNaming | null> {
  const handle = readingHandle(a.clientId, admin)
  const month = monthStartOf(a.month)
  const refs = await loadBrandRefs(handle)
  if (!refs) return null
  const brands = refs.brands.filter((b) => b.countState === 'counted' && (b.brandKey === 'client' || [...refs.rivalKeys.values()].includes(b.brandKey)))
  if (!brands.some((b) => b.brandKey === 'client') || brands.length < 2) return null
  const from = `${month}T00:00:00.000Z`
  const to = `${nextMonth(month)}T00:00:00.000Z`

  // The market's videos with comments dated in the month (every audience but
  // the company's), and the company's audience's videos in the read lane.
  const market = await selectAll<{ video_id: string; platform: string; dated_comments: number }>(() =>
    admin.rpc('market_month_videos', { p_client: a.clientId, p_month: month }).order('video_id'))
  const companyRows = await selectAll<IdentityRow & { video_id: string }>(() =>
    admin.from('videos').select(IDENTITY).eq('client_id', a.clientId).eq('is_client', true).eq('analyzed_lane', 'full').order('id'))
  // The company's audience's comments dated in the month, by video.
  const dated = new Map<string, number>()
  const byPlatformId = new Map(companyRows.map((r) => [`${r.platform}::${r.video_id}`, String(r.id)]))
  for (const part of chunk([...new Set(companyRows.map((r) => String(r.video_id)))], UUID_IN_CHUNK)) {
    const rows = await selectAll<{ id: string; platform: string; video_id: string }>(() =>
      admin.from('comments').select('id, platform, video_id').eq('client_id', a.clientId).in('video_id', part)
        .gte('comment_date', from).lt('comment_date', to).order('id'))
    for (const c of rows) {
      const id = byPlatformId.get(`${c.platform}::${c.video_id}`)
      if (id) dated.set(id, (dated.get(id) ?? 0) + 1)
    }
  }
  // Whose own post each video is: the market's identity rows, the company's,
  // and every owned row (the accounts the owned read stored).
  const marketRows: IdentityRow[] = []
  for (const part of chunk(market.map((m) => String(m.video_id)), UUID_IN_CHUNK)) {
    marketRows.push(...await selectAll<IdentityRow>(() => admin.from('videos').select(IDENTITY).eq('client_id', a.clientId).in('id', part).order('id')))
  }
  const owned = await selectAll<IdentityRow>(() =>
    admin.from('videos').select(IDENTITY).eq('client_id', a.clientId).in('source', ['owned', 'competitor_owned']).order('id'))
  const ownerOf = ownerOfVideos({
    rows: new Map([...marketRows, ...companyRows].map((r) => [String(r.id), r])),
    owned,
    ownHandles: refs.tracking.own_handles ?? null,
    competitorHandles: refs.tracking.competitor_handles ?? null,
    rivalKey: refs.rivalKeys,
  })
  const videos: NamingVideo[] = [
    ...market.map((m) => ({ id: String(m.video_id), platform: String(m.platform), comments: Number(m.dated_comments) || 0 })),
    ...companyRows.filter((r) => (dated.get(String(r.id)) ?? 0) > 0).map((r) => ({ id: String(r.id), platform: String(r.platform), comments: dated.get(String(r.id)) ?? 0 })),
  ].map((v) => ({ ...v, owner: ownerOf(v.id) }))

  // Every video a brand search of ours found: the rivals' names and the
  // company's own, in turn (one query in flight).
  const rivalFound = await readRivalFound(admin, a.clientId, refs.tracking.competitor_keywords)
  const brandFound = await readRivalFound(admin, a.clientId, refs.tracking.brand_keywords, undefined, 'brand')
  const mentions = await selectAll<MentionRowIn>(() =>
    admin.from('brand_mentions').select('video_id, brand_key, source, comment_id, comment_month, method, rule_version').eq('client_id', a.clientId).order('id'))
  return namingOf({
    month,
    brands: brands.map((b) => ({ brandKey: b.brandKey, label: b.label })),
    videos,
    searched: new Set([...rivalFound.videos, ...brandFound.videos]),
    mentions: countedMentions(mentions),
  })
}
