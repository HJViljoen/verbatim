import { runActor } from './apify'
import { createAdminClient } from '../supabase-admin'
import { APIFY_ACTORS, COMMENT_THRESHOLD, transcriptsEnabled } from '../config'
import { inWindow } from './gather'
import type { RawItem, VideoInsert } from './types'
import { getPath, first, num, str } from './util'

// Owned-account scrape interim (Wave 2, 2026-08-11). Official platform APIs
// need Business Verification we don't have, so the client's OWN public
// profiles are scraped like any other account — with guards, because scraped
// numbers glitch in ways analytics APIs don't. Verified live 2026-08-11:
//   IG  flagship actor, resultsType 'details' → exact followersCount/postsCount
//       + latestPosts[12]
//   TT  clockworks actor, startUrls profile mode + maxItems → channel.followers
//       (exact int) + recent videos
//   YT  free Data API: channels.list → uploads playlist → playlistItems →
//       videos.list (all ~1 quota unit; subscriberCount ROUNDS to 3 sig figs)
// Pure guards below are tested in owned.test.ts; fetchers are I/O.

/** Platforms with a meaningful "the client's own account" to read.
 *
 *  Reddit is deliberately absent (Wave 3). A subreddit is a community, not a
 *  brand-owned account — nobody's follower count on r/amputee belongs to Össur,
 *  and Reddit presence is other people talking ABOUT the brand, which is the
 *  discovered corpus by definition. So an own_handles.reddit entry is a
 *  known-unsupported key, not an error: callers filter on this and log a skip.
 *  fetchOwnProfile still throws for a genuinely unknown platform — that is a
 *  programming error and should stay loud. */
export const OWNED_PROFILE_PLATFORMS = ['tiktok', 'youtube', 'instagram'] as const

export function supportsOwnedProfile(platform: string): boolean {
  return (OWNED_PROFILE_PLATFORMS as readonly string[]).includes(platform)
}

/**
 * Whose account is being read. The owned layer was written for the client and
 * hardcoded that identity into every row it produced; a competitor's own posts
 * are the same read with a different name on the result, and they are the only
 * way a competitor page can quote what the competitor actually claims.
 */
export type OwnedEntity = { kind: 'client' } | { kind: 'competitor'; name: string }

/** The identity columns an entity's rows carry. One place, so a row can never
 *  be stamped 'competitor_owned' while claiming to be the client's. */
export function entityIdentity(entity: OwnedEntity): {
  source: 'owned' | 'competitor_owned'
  is_client: boolean
  is_competitor: boolean
  competitor_name: string | null
} {
  return entity.kind === 'client'
    ? { source: 'owned', is_client: true, is_competitor: false, competitor_name: null }
    : { source: 'competitor_owned', is_client: false, is_competitor: true, competitor_name: entity.name }
}

/** An entity's stable step-id segment. Inngest step ids must be stable strings,
 *  and a competitor name is free text ("Topo Designs") — this is the slug. */
export function entitySlug(entity: OwnedEntity): string {
  if (entity.kind === 'client') return 'client'
  const slug = entity.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return slug || 'competitor'
}

/** One platform's profile read: the snapshot numbers + recent own posts
 *  (already shaped as VideoInsert rows, WITHOUT source — the orchestrator
 *  stamps source:'owned' + is_client:true on write). */
export interface OwnProfile {
  handle: string
  followers: number | null
  postsCount: number | null
  recentPosts: VideoInsert[]
  /** How many posts the read parsed BEFORE the census window was applied. The
   *  empty-profile glitch guard has to judge the READ, not the window: a brand
   *  that genuinely published nothing this month is not a scrape failure. */
  postsSeen?: number
  /** Raw item per recent post (video_id → item), for the transcript layer
   *  (Brand Voice, 2026-08-16). Own posts used to bypass `video_raw` and so
   *  were never transcribed on any platform — the client's own words were
   *  invisible to say-vs-hear. YT: the Data API item · TT: the profile item
   *  (media/caption fields kept via customMapFunction) · IG: the full post
   *  from a posts-mode refetch (the profile read returns summaries only). */
  raws?: Record<string, RawItem>
  /** Non-fatal problems worth a run error (e.g. the IG transcript refetch failed). */
  warnings?: string[]
}

/**
 * Runaway guard on a census read, NOT a sample size. The client's own post
 * count for the window has to be EXACT — it is the denominator behind "you
 * published n posts this update", and a top-12 slice silently understated
 * every brand that posts more than that (Sealand: 28 Instagram posts in 30
 * days against a ceiling of 12). The window is what bounds the read; this only
 * stops a misconfigured handle from pulling a decade of posts.
 */
export const OWN_POSTS_CEILING = 200

/** A read with no window (the daily follower snapshot) wants numbers, not the
 *  census — one small page is enough and costs a fraction as much. */
export const OWN_POSTS_SNAPSHOT = 12

// ---- Snapshot sanity guards (pure) ------------------------------------------

/**
 * Accept or reject a freshly scraped follower count against the previous
 * snapshot. Scraper glitches read as 0/null (blocked page) or wild jumps
 * (logged-out variant, wrong account); a real brand account does not gain or
 * lose 20% of its followers in one step. Rejected reads keep the prior point
 * — a missing day is honest, a fake cliff is not.
 */
export function acceptSnapshot(
  prev: number | null,
  next: number | null | undefined,
): { ok: boolean; reason?: string } {
  if (next == null || !Number.isFinite(next)) return { ok: false, reason: 'no-count' }
  if (next <= 0) return { ok: false, reason: 'zero-count' }
  if (prev != null && prev > 0) {
    const step = Math.abs(next - prev) / prev
    if (step > 0.2) return { ok: false, reason: `jump-${(step * 100).toFixed(0)}pct` }
  }
  return { ok: true }
}

/**
 * Did a profile read come back empty because the account IS empty, or because
 * the scrape glitched?
 *
 * The IG details actor intermittently returns a live profile (followers present)
 * with `latestPosts: []`. That reads as "no recent posts", so the step writes
 * nothing, raises nothing, and the week's owned layer silently vanishes — which
 * is what happened on 2026-08-16.
 *
 * The glitch does NOT present consistently: on the failed run the same handle
 * reported postsCount 1,494 with no posts; an hour later it returned 12 posts;
 * an hour after that, postsCount null with no posts. So postsCount cannot be
 * the tell — it is itself part of what glitches (a known Wave 2 finding: IG
 * details-mode postsCount is nullable).
 *
 * Hence the rule is inverted: zero recent posts is a glitch UNLESS the platform
 * explicitly says the account has zero posts. Only `postsCount === 0` is real
 * emptiness; null is a scrape that didn't answer the question and gets retried.
 * The cost of being wrong is a non-fatal step error on a genuinely empty
 * account — loud and recorded, which beats losing a week of owned data silently.
 *
 * `recentPosts` must be the count BEFORE the census window is applied (see
 * OwnProfile.postsSeen): an account that simply didn't post this month is not
 * a glitch, and once the read is windowed the two are indistinguishable here.
 */
export function emptyProfileIsGlitch(postsCount: number | null, recentPosts: number): boolean {
  if (recentPosts > 0) return false
  return postsCount !== 0
}

/**
 * Give EVERY owned-post row an explicit `source`, preserving what a already-known
 * post already had.
 *
 * Two constraints collide here. (a) A client post the keyword gather already
 * discovered must stay 'discovered' — it has been in the SoV series since it was
 * found, and flipping it out would fake a share decline (metric continuity beats
 * layer purity); a post already stored as 'owned' must likewise stay 'owned'.
 * (b) PostgREST takes the UNION of keys across a bulk upsert and sends NULL for
 * any row missing one — it does not fall back to the column default. So the old
 * "omit source on known rows" approach sent `source: NULL` the moment one row in
 * the batch carried the key, and the NOT NULL constraint rejected the whole
 * statement (23502, YouTube, 2026-08-16 — 2 of 12 posts already known).
 *
 * Setting every row explicitly satisfies both: known rows echo their stored
 * value back unchanged, new rows get 'owned'.
 */
export function stampOwnedSource<T extends { video_id: string }>(
  posts: T[],
  existing: { video_id: string; source: string | null }[],
  fresh: 'owned' | 'competitor_owned' = 'owned',
): (T & { source: string })[] {
  const stored = new Map(existing.map((r) => [r.video_id, r.source]))
  return posts.map((p) => ({ ...p, source: stored.get(p.video_id) ?? fresh }))
}

/**
 * Platform-aware minimum % floor for a follower event. YouTube's public
 * subscriberCount rounds to 3 significant figures, so one rounding step on a
 * small channel can fake a move — the floor must clear TWO rounding steps.
 * Exact-count platforms (IG/TT scrapes) keep the base floor.
 */
export function followerFloorPct(platform: string, followers: number, basePct: number): number {
  if (platform !== 'youtube' || followers <= 0) return basePct
  const magnitude = Math.pow(10, Math.max(0, Math.floor(Math.log10(followers)) - 2))
  return Math.max(basePct, (2 * magnitude * 100) / followers)
}

/**
 * The census cut: own posts that belong to the window, exactly.
 *
 * A FILTER, not a walk that stops at the first old post. A profile feed is
 * roughly newest-first but not reliably so — Instagram and TikTok both let a
 * brand pin an old post to the top of its grid, and a walk would end on it and
 * report zero. The ceiling, not the ordering, is what bounds the read.
 *
 * Undated posts are dropped here, unlike the discovery window (inWindow keeps
 * them so a patchy platform can't be blanked). A census is a count: a post we
 * cannot date cannot be counted as published in a window.
 */
export function ownPostsInWindow<T extends { upload_date: string | null }>(posts: T[], since: string | null): T[] {
  if (!since) return posts
  return posts.filter((p) => p.upload_date != null && inWindow(p.upload_date, since))
}

/**
 * Has the YouTube uploads walk seen enough? Uploads come back newest-first one
 * page at a time, so the walk ends when a WHOLE page falls before the window
 * (one stray old item mid-page must not end it) or the ceiling is reached.
 * With no window there is nothing to walk toward — one page is the snapshot.
 */
export function stopUploadsWalk(
  pageDates: (string | null)[],
  since: string | null,
  collected: number,
  ceiling: number = OWN_POSTS_CEILING,
): boolean {
  if (!since) return true
  if (collected >= ceiling) return true
  return pageDates.length > 0 && pageDates.every((d) => d != null && d < since)
}

/** One account's census entry: how many posts it published in the window, and
 *  the window and handle the count is true for. */
export interface OwnedCensusEntry {
  posts: number
  since: string
  until: string
  handle: string
}

/**
 * The run's account census. The client's own accounts are the number the share
 * tile speaks ("you published n posts this update"); competitors are kept in
 * their own branch, keyed by the exact competitor_names entry, so a competitor
 * posting daily can never be summed into the client's own count.
 */
export interface OwnedCensus {
  client: Record<string, OwnedCensusEntry>
  competitors: Record<string, Record<string, OwnedCensusEntry>>
}

interface CensusRow {
  platform: string
  source?: string | null
  is_client?: boolean | null
  is_competitor?: boolean | null
  competitor_name?: string | null
  account_name?: string | null
  upload_date?: string | null
}

/** How an account name is compared everywhere the census rule is applied.
 *  Deliberately NOT gather/util `fold`, which also strips diacritics: both
 *  sides of a comparison must normalise identically, and "Össur" folded is
 *  "ossur" while normalised it stays "össur". Exported so no caller can pick
 *  the other one by accident. */
export const normAccount = (x: string | null | undefined) => (x ?? '').trim().toLowerCase()
const norm = normAccount

/**
 * The EXACT own-post count per account for the window — the number behind "you
 * published n posts this update", and the same fact for every tracked
 * competitor. Built from stored rows so an analysis-only resume reports the
 * same census a full run does.
 *
 * `is_client` alone is not the test: it is true for any video ABOUT the brand,
 * including a stranger's review. Authorship is the ACCOUNT, so the count is
 * over the configured handle plus whatever account_name the owned reads
 * themselves stored for that platform (YouTube's handle is a channel id, but
 * its rows carry the channel's title).
 *
 * That second half also fixes the undercount `source = 'owned'` alone would
 * cause: a post the keyword gather discovered first keeps source 'discovered'
 * forever (metric continuity, stampOwnedSource), and it is still a post that
 * account published.
 *
 * Undated rows are excluded: a census is a count, and a post we cannot date
 * cannot be counted into a window.
 */
export function buildOwnedCensus(
  rows: CensusRow[],
  opts: {
    handles: Record<string, string>
    competitorHandles?: Record<string, Record<string, string>>
    since: string
    until: string
  },
): OwnedCensus {
  const census: OwnedCensus = { client: {}, competitors: {} }
  countAccounts(rows, opts.handles, { source: 'owned' }, opts, census.client)
  for (const [name, handles] of Object.entries(opts.competitorHandles ?? {})) {
    const entry: Record<string, OwnedCensusEntry> = {}
    countAccounts(rows, handles ?? {}, { source: 'competitor_owned', competitorName: name }, opts, entry)
    census.competitors[name] = entry
  }
  return census
}

/** The account names that ARE this entity, per platform: the configured handle
 *  plus every account name the owned read itself stored for it. That second
 *  half is the bridge to rows the keyword gather found FIRST and therefore left
 *  on source 'discovered' forever (stampOwnedSource keeps source stable for
 *  metric continuity). Identity, not source, is what makes a post the brand's.
 *
 *  Exported so every surface that asks "is this ours" asks it the same way.
 *  Three different answers used to exist — a source string, a brand-keyword
 *  fold, and this — and they disagreed on screen. */
export function ownAccountNames(
  rows: CensusRow[],
  handles: Record<string, string>,
  who: { source: string; competitorName?: string },
): Map<string, Set<string>> {
  const ownNames = new Map<string, Set<string>>()
  for (const [platform, handle] of Object.entries(handles)) {
    if (!handle) continue
    ownNames.set(platform, new Set([norm(handle)]))
  }
  for (const r of rows) {
    if (r.source !== who.source || !ownNames.has(r.platform)) continue
    if (who.competitorName && norm(r.competitor_name) !== norm(who.competitorName)) continue
    if (r.account_name) ownNames.get(r.platform)!.add(norm(r.account_name))
  }
  return ownNames
}

/** Every row this entity published inside the window — the exact set the census
 *  counts, returned as rows.
 *
 *  Undated rows are excluded: a census is a count, and a post we cannot date
 *  cannot be counted into a window. */
export function ownedPostsIn<T extends CensusRow>(
  rows: T[],
  handles: Record<string, string>,
  who: { source: string; competitorName?: string },
  window: { since: string; until: string },
): T[] {
  const ownNames = ownAccountNames(rows, handles, who)
  return rows.filter((r) => {
    if (!ownNames.has(r.platform)) return false
    const belongs = who.competitorName
      ? r.is_competitor && norm(r.competitor_name) === norm(who.competitorName)
      : r.is_client
    if (!belongs) return false
    if (!r.upload_date || r.upload_date < window.since || r.upload_date > window.until) return false
    return ownNames.get(r.platform)!.has(norm(r.account_name))
  })
}

/** One entity's per-platform counts, written into `into`. */
function countAccounts(
  rows: CensusRow[],
  handles: Record<string, string>,
  who: { source: string; competitorName?: string },
  window: { since: string; until: string },
  into: Record<string, OwnedCensusEntry>,
): void {
  // A configured handle always gets an entry, even at zero posts: "you posted
  // nothing this window" is a fact worth printing.
  for (const [platform, handle] of Object.entries(handles)) {
    if (!handle) continue
    into[platform] = { posts: 0, since: window.since, until: window.until, handle }
  }
  for (const r of ownedPostsIn(rows, handles, who, window)) {
    const entry = into[r.platform]
    if (entry) entry.posts++
  }
}

/** The window a stored census was computed for. Every platform entry carries
 *  the same one; the first that exists answers. Null when there is no census. */
export function censusWindow(
  census: OwnedCensus | null | undefined,
): { since: string; until: string } | null {
  for (const e of Object.values(census?.client ?? {})) {
    if (e?.since && e?.until) return { since: e.since, until: e.until }
  }
  return null
}

/** The client's own posts across every platform — the share tile's headline
 *  number. Competitors are deliberately not in it. */
export function ownedCensusTotal(census: OwnedCensus | null | undefined): number | null {
  const client = census?.client
  if (!client || !Object.keys(client).length) return null
  return Object.values(client).reduce((n, e) => n + (e?.posts ?? 0), 0)
}

// ---- Per-platform profile fetchers (I/O) ------------------------------------

/** One Instagram post item (details-mode summary or posts-mode full item) as a
 *  VideoInsert. Both shapes carry the same field names for what we store. */
function igPost(post: RawItem, handle: string, followers: number, ctx: Ctx): VideoInsert | null {
  const shortCode = str(first(post.shortCode, post.shortcode, post.code))
  if (!shortCode) return null
  return {
    client_id: ctx.clientId,
    run_id: ctx.runId,
    platform: 'instagram' as const,
    video_id: shortCode,
    video_url: str(post.url) || `https://www.instagram.com/p/${shortCode}/`,
    account_name: handle,
    account_followers: followers,
    caption: str(first(post.caption, post.text) ?? ''),
    hashtags: (Array.isArray(post.hashtags) ? post.hashtags : []).map(String),
    content_format: str(first(post.productType, post.type)),
    // -1 is "likes hidden", a state and not a count (platforms/instagram.ts).
    views: Math.max(0, num(first(post.videoPlayCount, post.videoViewCount))),
    likes: Math.max(0, num(first(post.likesCount, post.likes))),
    shares: 0,
    comments_count: Math.max(0, num(first(post.commentsCount, post.commentCount))),
    engagement_rate: null,
    upload_date: str(post.timestamp).slice(0, 10) || null,
    audio_name: '',
    is_sponsored: Boolean(post.paidPartnership),
    duration_seconds: Math.round(num(first(post.videoDuration, post.duration))),
    ...identityOf(ctx),
  }
}

function igProfile(handle: string, raw: RawItem[], posts: RawItem[], ctx: Ctx): OwnProfile {
  const p = (raw[0] ?? {}) as RawItem
  const followers = num(p.followersCount)
  const recentPosts: VideoInsert[] = []
  for (const post of posts) {
    const row = igPost(post, handle, followers, ctx)
    if (row) recentPosts.push(row)
  }
  return {
    handle,
    followers: p.followersCount == null ? null : followers,
    postsCount: p.postsCount == null ? null : num(p.postsCount),
    recentPosts,
    // Either read answering is proof the account was reachable: the census call
    // is windowed, the details summary is not.
    postsSeen: Math.max(recentPosts.length, latestPostsOf(raw).length),
  }
}

function ttProfile(handle: string, raw: RawItem[], ctx: Ctx): OwnProfile {
  const channel = (raw[0] as RawItem | undefined)?.channel as RawItem | undefined
  const recentPosts: VideoInsert[] = []
  const raws: Record<string, RawItem> = {}
  for (const item of raw) {
    const v = item as RawItem
    const id = str(v.id)
    const url = str(getPath(v, ['postPage']))
    if (!id || !url) continue
    raws[id] = v
    const views = num(v.views)
    const likes = num(v.likes)
    const comments = num(v.comments)
    const shares = num(v.shares)
    recentPosts.push({
      client_id: ctx.clientId,
      run_id: ctx.runId,
      platform: 'tiktok' as const,
      video_id: id,
      video_url: url,
      account_name: handle,
      account_followers: num(getPath(v, ['channel', 'followers'])),
      caption: str(v.title),
      hashtags: (Array.isArray(v.hashtags) ? v.hashtags : []).map((h) => str((h as RawItem)?.name ?? h) ?? '').filter(Boolean),
      content_format: '',
      views,
      likes,
      shares,
      comments_count: comments,
      engagement_rate: views > 0 ? Number((((likes + comments + shares) / views) * 100).toFixed(2)) : null,
      upload_date: str(v.uploadedAtFormatted).slice(0, 10) || null,
      audio_name: str(getPath(v, ['song', 'title'])),
      is_sponsored: false,
      // Math.round, matching the discovered path (platforms/tiktok.ts): TikTok
      // reports fractional seconds (35.029) and videos.duration_seconds is an
      // integer column. Sending the float rejected the whole upsert with 22P02
      // on every retry — the deterministic half of the 2026-08-16 failure.
      duration_seconds: Math.round(num(getPath(v, ['video', 'duration']))),
      ...identityOf(ctx),
    })
  }
  const followers = channel?.followers == null ? null : num(channel.followers)
  return {
    handle,
    followers,
    postsCount: channel?.videos == null ? null : num(channel.videos),
    recentPosts,
    // The profile read is unwindowed (the actor's dateRange is search-only), so
    // what it parsed is what the account has — the honest glitch signal.
    postsSeen: recentPosts.length,
    raws,
  }
}

interface Ctx {
  clientId: string
  runId: string
  /** Whose account this read belongs to. Absent = the client's (every caller
   *  before competitors existed). */
  entity?: OwnedEntity
}

/** The is_client / is_competitor / competitor_name a read's rows carry. */
const identityOf = (ctx: Ctx) => {
  const { is_client, is_competitor, competitor_name } = entityIdentity(ctx.entity ?? { kind: 'client' })
  return { is_client, is_competitor, competitor_name }
}

async function ytProfile(channelId: string, ctx: Ctx, since: string | null): Promise<OwnProfile> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) throw new Error('YOUTUBE_API_KEY not set')
  const base = 'https://www.googleapis.com/youtube/v3'
  const chRes = await fetch(`${base}/channels?part=statistics,contentDetails&id=${channelId}&key=${key}`)
  if (!chRes.ok) throw new Error(`yt channels.list ${chRes.status}`)
  const ch = (await chRes.json()) as { items?: RawItem[] }
  const channel = ch.items?.[0]
  if (!channel) throw new Error(`yt channel not found: ${channelId}`)
  const stats = channel.statistics as RawItem
  const uploads = str(getPath(channel, ['contentDetails', 'relatedPlaylists', 'uploads']))

  const raws: Record<string, RawItem> = {}
  const recentPosts: VideoInsert[] = []
  if (uploads) {
    // Walk the uploads playlist page by page until it drops out of the window.
    // One page (the old behaviour) is a sample; the census needs every upload
    // in the period, and playlistItems costs 1 quota unit a page.
    const pageSize = since ? 50 : OWN_POSTS_SNAPSHOT
    let pageToken: string | undefined
    const videoIds: string[] = []
    for (;;) {
      const url = `${base}/playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=${pageSize}&key=${key}` +
        (pageToken ? `&pageToken=${pageToken}` : '')
      const plRes = await fetch(url)
      // A first page that fails is a read that answered nothing — it must not
      // pass as "the channel published nothing this window".
      if (!plRes.ok) {
        if (!pageToken) throw new Error(`yt playlistItems ${plRes.status}`)
        break
      }
      const pl = (await plRes.json()) as { items?: RawItem[]; nextPageToken?: string }
      const items = pl.items ?? []
      for (const i of items) {
        const id = str(getPath(i, ['contentDetails', 'videoId']))
        if (id) videoIds.push(id)
      }
      const pageDates = items.map((i) => str(getPath(i, ['contentDetails', 'videoPublishedAt'])).slice(0, 10) || null)
      pageToken = pl.nextPageToken
      if (!pageToken || stopUploadsWalk(pageDates, since, videoIds.length)) break
    }
    // videos.list takes 50 ids a call and costs 1 unit each.
    for (let i = 0; i < videoIds.length; i += 50) {
      const vRes = await fetch(`${base}/videos?part=snippet,statistics,contentDetails&id=${videoIds.slice(i, i + 50).join(',')}&key=${key}`)
      if (!vRes.ok) continue
      const vs = (await vRes.json()) as { items?: RawItem[] }
      for (const v of vs.items ?? []) {
        const id = str(v.id)
        if (!id) continue
        raws[id] = v
        const vStats = (v.statistics ?? {}) as RawItem
        const snippet = (v.snippet ?? {}) as RawItem
        const views = num(vStats.viewCount)
        const likes = num(vStats.likeCount)
        const comments = num(vStats.commentCount)
        recentPosts.push({
          client_id: ctx.clientId,
          run_id: ctx.runId,
          platform: 'youtube' as const,
          video_id: id,
          video_url: `https://www.youtube.com/watch?v=${id}`,
          account_name: str(snippet.channelTitle) || channelId,
          account_followers: num(stats.subscriberCount),
          caption: [str(snippet.title), str(snippet.description)].filter(Boolean).join('\n\n'),
          hashtags: [],
          content_format: '',
          views,
          likes,
          shares: 0,
          comments_count: comments,
          engagement_rate: views > 0 ? Number((((likes + comments) / views) * 100).toFixed(2)) : null,
          upload_date: str(getPath(snippet, ['publishedAt'])).slice(0, 10) || null,
          audio_name: '',
          is_sponsored: false,
          duration_seconds: 0,
          ...identityOf(ctx),
        })
      }
    }
  }
  return {
    handle: channelId,
    followers: stats.subscriberCount == null ? null : num(stats.subscriberCount),
    postsCount: stats.videoCount == null ? null : num(stats.videoCount),
    recentPosts,
    raws,
  }
}

/**
 * Fetch one platform's own-profile read. Throws on hard failure — callers
 * decide non-fatality.
 *
 * `since` decides what kind of read this is. With a window it is a CENSUS: every
 * post the account published in the period, up to OWN_POSTS_CEILING. Without one
 * it is the daily follower snapshot, which wants the numbers and one cheap page.
 */
export async function fetchOwnProfile(
  platform: string,
  handle: string,
  ctx: Ctx,
  since: string | null = null,
): Promise<OwnProfile> {
  if (platform === 'youtube') return ytProfile(handle, ctx, since)
  if (platform === 'instagram') {
    // Two reads, because one actor mode cannot answer both questions. `details`
    // is the only mode that returns followersCount/postsCount (the snapshot and
    // the empty-profile guard), and it caps latestPosts at 12 with no date
    // input — useless as a census. `posts` mode on the same profile URL takes
    // `onlyPostsNewerThan` and returns FULL items, verified live on
    // @sealandgear 2026-09-09: 28 posts for a 30-day window, reels included
    // (12 of the 28 were productType 'clips'), so there is no separate reels
    // call to make. Those full items also carry the media URLs, which is what
    // the transcript refetch used to cost a third actor run to go and get.
    const details = await runActor(APIFY_ACTORS.instagram.post, {
      directUrls: [`https://www.instagram.com/${handle}/`],
      resultsType: 'details',
      resultsLimit: 1,
    }, { timeoutSecs: 120 })
    if (!since) return igProfile(handle, details, latestPostsOf(details), ctx)

    const census = await runActor(APIFY_ACTORS.instagram.post, {
      directUrls: [`https://www.instagram.com/${handle}/`],
      resultsType: 'posts',
      resultsLimit: OWN_POSTS_CEILING,
      onlyPostsNewerThan: since,
    }, { timeoutSecs: 300 })
    const profile = igProfile(handle, details, census, ctx)
    if (transcriptsEnabled()) profile.raws = igRawsByShortcode(census)
    // The census read is what the count rests on, so a details read that
    // disagrees with it (the known latestPosts glitch) must not be the thing
    // that decides. Fall back to the details posts only when the census came
    // back empty AND the account claims posts — that is the glitch signature.
    if (profile.recentPosts.length === 0) {
      const fallback = igProfile(handle, details, latestPostsOf(details), ctx)
      if (fallback.recentPosts.length > 0) {
        profile.recentPosts = ownPostsInWindow(fallback.recentPosts, since)
        profile.warnings = [`instagram census read returned 0 posts; fell back to the profile summary (${profile.recentPosts.length} in window)`]
      }
    }
    return profile
  }
  if (platform === 'tiktok') {
    // The actor's `dateRange` is search-only (confirmed against its input
    // schema 2026-09-09), so a profile census is "pull the ceiling, then cut to
    // the window" — the one platform where the window costs items we discard.
    const read = (timeoutSecs: number) => runActor(APIFY_ACTORS.tiktok.video, {
      startUrls: [`https://www.tiktok.com/@${handle}`],
      maxItems: since ? OWN_POSTS_CEILING : OWN_POSTS_SNAPSHOT,
      // Keep the media + caption fields — without the passthrough the actor
      // trims them and the transcript layer has nothing to resolve.
      customMapFunction: '(object) => { return {...object} }',
    }, { timeoutSecs })
    let raw = await read(300)
    // "Succeeded with zero items" is a flake signature runActor's retry cannot
    // see: fetchWithRetry only retries transport errors, and this run reports
    // success. Instagram has had a fallback for it since 0762f66 (a second read
    // mode); TikTok has no second mode, so the guard is one retry. A Rareform
    // census came back empty exactly this way on 2026-09-09.
    //
    // The retry gets a SHORTER timeout on purpose: both reads live in one
    // Inngest step and the route's maxDuration is 300s, so two full-length
    // attempts could outlive the function that is awaiting them.
    if (since && raw.length === 0) {
      const retried = await read(120)
      if (retried.length > 0) {
        // The reads disagree, which is proof the first one flaked. Worth saying.
        console.warn(`[owned] tiktok census for @${handle} returned 0 then ${retried.length} on retry — first read flaked`)
        raw = retried
      } else {
        // Both empty. This is NOT raised as a run warning: a zero-item profile
        // read is indistinguishable from an account that genuinely has no
        // videos, and a registered-but-unused handle would then alert every
        // week forever. Logged, not alarmed.
        console.warn(`[owned] tiktok census for @${handle} returned 0 posts twice — empty account or an unrecoverable read`)
      }
    }
    return ttProfile(handle, raw, ctx)
  }
  throw new Error(`no own-profile fetcher for platform: ${platform}`)
}

/** The post summaries an IG `details` read carries (capped at 12 by the actor). */
function latestPostsOf(details: RawItem[]): RawItem[] {
  const p = (details[0] ?? {}) as RawItem
  return (Array.isArray(p.latestPosts) ? p.latestPosts : []) as RawItem[]
}

/** Posts-mode items keyed by shortcode (the IG video_id). Pure; exported for tests. */
export function igRawsByShortcode(items: RawItem[]): Record<string, RawItem> {
  const out: Record<string, RawItem> = {}
  for (const it of items) {
    if (!it || typeof it !== 'object') continue
    const code = str(first(it.shortCode, it.shortcode, it.code)) || (str(it.url).match(/\/(?:p|reel|tv)\/([^/?]+)/)?.[1] ?? '')
    if (code && !out[code]) out[code] = it
  }
  return out
}

/** video_raw rows for this run's own posts that have a raw item — the pool
 *  the transcribe planner reads. Pure; exported for tests. */
export function ownedRawRows(
  posts: VideoInsert[],
  raws: Record<string, RawItem> | undefined,
  ctx: Ctx,
): { client_id: string; run_id: string; platform: string; video_id: string; raw: RawItem }[] {
  if (!raws) return []
  return posts
    .filter((p) => raws[p.video_id])
    .map((p) => ({ client_id: ctx.clientId, run_id: ctx.runId, platform: p.platform, video_id: p.video_id, raw: raws[p.video_id] }))
}

/** Own posts new/fresh enough to be worth a paid comment scrape this run:
 *  in the report window (or undated), above the comment threshold. Pure.
 *  Shares `inWindow` with the gather filter — this had its own inline copy of
 *  the rule, and two copies of a window rule eventually disagree. */
export function ownedCommentRefs(
  posts: VideoInsert[],
  opts: { windowStart: string | null; threshold: number | null },
): { video_id: string; video_url: string; comments_count: number }[] {
  const since = opts.windowStart ? opts.windowStart.slice(0, 10) : null
  return posts
    .filter((p) => {
      if (opts.threshold != null && p.comments_count < opts.threshold) return false
      return inWindow(p.upload_date, since)
    })
    .map((p) => ({ video_id: p.video_id, video_url: p.video_url, comments_count: p.comments_count }))
}

/**
 * Weekly own-post ingestion for one platform (pipeline step body): profile
 * read → upsert recent posts stamped source:'owned' (sticky — a discovered
 * re-gather never touches the column) → return the refs worth a comment
 * scrape this window. YouTube's comment fetch is quota-cheap, so it takes
 * every commented post; TT/IG apply the paid-scrape threshold.
 */
export async function ingestOwnedPosts(opts: {
  clientId: string
  runId: string
  platform: string
  handle: string
  windowStart: string | null
  /** Whose account this is. Absent = the client's. */
  entity?: OwnedEntity
}): Promise<{
  refs: { video_id: string; video_url: string; comments_count: number }[]
  /** How many in-window posts this read stored — the census figure for this
   *  platform, reported so a run's log says what it counted. */
  posts: number
  /** Non-fatal degradations the caller should count as run errors. */
  warnings: string[]
}> {
  const since = opts.windowStart ? opts.windowStart.slice(0, 10) : null
  const entity = opts.entity ?? { kind: 'client' as const }
  const identity = entityIdentity(entity)
  const label = `${opts.platform}:${entitySlug(entity)}`
  const profile = await fetchOwnProfile(opts.platform, opts.handle, {
    clientId: opts.clientId,
    runId: opts.runId,
    entity,
  }, since)
  const postsSeen = profile.postsSeen ?? profile.recentPosts.length
  // The census cut. TikTok has no date filter at the source and Instagram's
  // date bound is the actor's word, so the window is applied here as well —
  // one rule, whatever the platform did or didn't honour.
  profile.recentPosts = ownPostsInWindow(profile.recentPosts, since)
  if (profile.recentPosts.length >= OWN_POSTS_CEILING) {
    warnCeiling(label, opts.handle, profile.recentPosts.length)
  }
  const warnings: string[] = [...(profile.warnings ?? [])]
  // Judge the READ, not the window. A brand that published nothing this month
  // is a fact to report, not a glitch to retry — and once the read is windowed,
  // `recentPosts.length` stops being evidence either way (Sealand's YouTube:
  // 146 uploads, none in the last 30 days). YouTube is exempt entirely: it is
  // the official API, where a failed page throws and an empty window is true.
  if (opts.platform !== 'youtube' && emptyProfileIsGlitch(profile.postsCount, postsSeen)) {
    throw new Error(
      `owned profile (${label} @${opts.handle}) returned 0 posts at all but reports ${profile.postsCount} posts — scrape glitch, retrying`,
    )
  }
  if (profile.recentPosts.length) {
    const admin = createAdminClient()
    // A client post the keyword gather ALREADY discovered stays 'discovered' —
    // it has been part of the SoV series since it was found, and flipping it
    // out would fake a share decline (metric continuity beats layer purity).
    // Only posts new to us get source:'owned'.
    const { data: existing, error: exErr } = await admin
      .from('videos')
      .select('video_id, source')
      .eq('client_id', opts.clientId)
      .eq('platform', opts.platform)
      .in('video_id', profile.recentPosts.map((p) => p.video_id))
    if (exErr) throw new Error(`owned posts existing check (${opts.platform}): ${exErr.message}`)
    const rows = stampOwnedSource(
      profile.recentPosts,
      (existing ?? []) as { video_id: string; source: string | null }[],
      identity.source,
    )
    const { error } = await admin
      .from('videos')
      .upsert(rows, { onConflict: 'client_id,platform,video_id' })
    if (error) throw new Error(`owned posts upsert (${opts.platform}): ${error.message}`)

    // Transcript layer (Brand Voice): file the raw items so this run's
    // transcribe planner picks the own posts up like any kept video (the
    // owned block runs BEFORE plan-transcribe for exactly this reason). Own
    // posts already known as 'discovered' are included too — harmless upsert,
    // and their NULL status makes them eligible if never transcribed.
    // NON-FATAL (like gather.ts's own video_raw write): a transcript-layer
    // hiccup must never take the owned comment layer down with it.
    if (transcriptsEnabled()) {
      const rawRows = ownedRawRows(profile.recentPosts, profile.raws, { clientId: opts.clientId, runId: opts.runId })
      if (rawRows.length) {
        const { error: rawErr } = await admin
          .from('video_raw')
          .upsert(rawRows, { onConflict: 'client_id,platform,video_id,run_id' })
        if (rawErr) warnings.push(`video_raw upsert failed: ${rawErr.message}`)
      }
      console.log(`[owned-posts:${label}] transcript raws filed: ${rawRows.length}/${profile.recentPosts.length}`)
    }
  }
  console.log(`[owned-posts:${label}] census: ${profile.recentPosts.length} post(s) in window since ${since ?? 'all time'}`)
  return {
    refs: ownedCommentRefs(profile.recentPosts, {
      windowStart: opts.windowStart,
      threshold: opts.platform === 'youtube' ? 1 : COMMENT_THRESHOLD,
    }),
    posts: profile.recentPosts.length,
    warnings,
  }
}

/** A census that hits the ceiling is no longer exact — say so loudly. */
function warnCeiling(label: string, handle: string, n: number): void {
  console.warn(`[owned-posts:${label}] @${handle} hit the ${OWN_POSTS_CEILING}-post ceiling (${n}) — the census for this window may be short`)
}
