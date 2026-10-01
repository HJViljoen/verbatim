import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk, mapWithLimit, READ_CONCURRENCY, UUID_IN_CHUNK } from '../chunk'
import { monthStartOf } from '../reading/month-key'
import { WHAT_THEY_SELL } from '../pages/market-frame'
import { audienceOf, CLIENT_AUDIENCE, rivalNameOf } from '../rivals'
import { selectAll } from '../supabase-admin'
import { BRAND_RULE_VERSION } from './aliases'
import { brandCountState } from './precision'

// Who an item of talk is about (the pages build, 1 Oct; brief client rule 6):
// "About Sealand", "About {Rival}", or "Other bags in your market". Every item
// of talk on a page carries it, and a mixed item shows the split.
//
// ONE BRAND PER VIDEO, SO A SPLIT ADDS UP. Each video is filed once:
//  · by its audience first: the client's own posts are the client's, a video
//    filed under a tracked rival (`competitor:<name>`, a video ABOUT that
//    rival, found by search, not only the rival's own posts) is that rival's,
//    and everything else is the market's (`industry-other`);
//  · overridden by a tracked brand NAMED in the talk's own comments: the
//    product's brand matcher (`brand_mentions`, comment rows, the rules'
//    version, never a mention a confirm rejected), restricted to the comments
//    the item rests on where the caller knows them. Two brands named on one
//    video: the alphabetically first (Cotopaxi < Patagonia < Sealand < The
//    North Face), so a video is never counted twice.
//
// NEVER A GUESS. A brand's naming counts only where production's hand check
// passed it (`brandCountState` is 'counted', lib/brands/precision.ts): a name
// that is mostly another word (Freitag is Friday) files nothing. `watched:`
// keys are not tracked brands and are ignored, and so is a key no tracked
// brand has. Nothing is ever read from a label or a caption here.
//
// PURE HALF FIRST; THEN THE READS: `loadAttribution` (the videos' entity tags
// and the brand_mentions comment rows of those videos, side by side) and
// `loadCommentNamings` (the same rows by comment, for a caller that holds the
// comments rather than the videos: the long-run read, Your market's
// conversations). Both apply the same gates.
//
// THE ONE MODULE (integration, lead's ruling 4). MARKET's `lib/written/who.ts`
// stated this rule a second time with fewer gates (no hand check, no rule
// version) and is folded in here; MOVES's statements file their videos
// through it at measure time; and every page names the market with
// `marketLabels` ("Other bags in your market" / "other bags").
//
// ONE ORDER (the design's, `who_of_theme` in the generator): the client
// first, then the rivals by videos (ties by name), the market last. A kind's
// split by audience prints most first, so the market leads it (the caller
// re-sorts, as the artboard draws "other bags 599 · Patagonia 11").

/** Who an item is about: the client, one tracked rival by name, or the market. */
export type About = 'client' | `rival:${string}` | 'market'

/** One part of a split: who, and how many distinct videos. */
export interface AboutPart {
  about: About
  videos: number
}

/** A brand_mentions comment row, as the split reads it. */
export interface Naming {
  brandKey: string
  commentId: string | null
  /** The comment's month (`YYYY-MM-01`). */
  month: string | null
}

/** The tracked brands, as a naming resolves them. */
export interface TrackedBrands {
  /** The client's own brand name ("Sealand"). */
  client: string
  /** competitors.id → name, every rival the tenant has had. */
  rivals: ReadonlyMap<string, string>
  /** Whether a brand's naming may file a video (the hand-check gate). */
  counts: (name: string) => boolean
}

/** What the split reads, per video. */
export interface AttributionInputs {
  /** videos.id → audience (`client`, `competitor:<name>`, `industry-other`). */
  audiences: ReadonlyMap<string, string>
  /** videos.id → the brand_mentions comment rows on it. */
  namings: ReadonlyMap<string, readonly Naming[]>
  brands: TrackedBrands
}

/** Narrow the namings to one item's talk. */
export interface TalkScope {
  /** The comments the item rests on (`month_evidence_refs.comment_ids`, an
   *  evidence row's comment): a naming on any other comment files nothing. */
  comments?: ReadonlySet<string> | null
  /** The months the item covers (`YYYY-MM-01`): a naming dated outside them
   *  files nothing. */
  months?: ReadonlySet<string> | null
}

const rival = (name: string): About => `rival:${name}`

/** The market's own label, long ("Other bags in your market", a lone
 *  label), short ("other bags", inside a split) and inline ("other bags in
 *  your market", inside a sentence), from the product's noun for what the
 *  tenant sells (lib/pages/market-frame.ts). THE one wording: every page that
 *  names the market takes it from here. */
export function marketLabels(clientId: string): MarketLabels {
  return marketLabelsOf(WHAT_THEY_SELL[clientId])
}

export interface MarketLabels {
  long: string
  short: string
  inline: string
}

/** The same, from the noun itself (a caller that already holds it). */
export function marketLabelsOf(noun: string | null | undefined): MarketLabels {
  const n = (noun ?? '').trim()
  return n
    ? { long: `Other ${n} in your market`, short: `other ${n}`, inline: `other ${n} in your market` }
    : { long: 'Others in your market', short: 'others', inline: 'others in your market' }
}

/** The printed name an `About` stands for (the market is the caller's). */
export function aboutName(about: About, brands: Pick<TrackedBrands, 'client'>): string | null {
  if (about === 'client') return brands.client
  if (about === 'market') return null
  return about.slice('rival:'.length)
}

/** The brand a naming names, as an `About`; null where it is not a tracked
 *  brand whose naming counts. */
function namedAbout(brandKey: string, brands: TrackedBrands): { about: About; name: string } | null {
  if (brandKey === 'client') return brands.counts(brands.client) ? { about: 'client', name: brands.client } : null
  if (brandKey.startsWith('watched:')) return null
  const name = brands.rivals.get(brandKey)
  if (!name || !brands.counts(name)) return null
  return { about: rival(name), name }
}

/** The audience's own answer: the client's posts, a rival-filed video, or
 *  the market. An unread video is the market's (never a guessed brand). */
export function aboutAudience(audience: string | null | undefined): About {
  if (audience === CLIENT_AUDIENCE) return 'client'
  const name = rivalNameOf(audience)
  return name ? rival(name) : 'market'
}

/** Of the tracked brands a video's talk names, the one it is filed under:
 *  the alphabetically first, so a video is never counted twice. */
function firstNamed(named: readonly { about: About; name: string }[]): About | null {
  const sorted = [...named].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
  return sorted[0]?.about ?? null
}

/** Who one video is about, by the rule in the header. */
export function aboutVideo(videoId: string, inputs: AttributionInputs, scope: TalkScope = {}): About {
  const named = (inputs.namings.get(videoId) ?? [])
    .filter((n) => !scope.comments || (n.commentId != null && scope.comments.has(n.commentId)))
    .filter((n) => !scope.months || (n.month != null && scope.months.has(n.month)))
    .map((n) => namedAbout(n.brandKey, inputs.brands))
    .filter((x): x is { about: About; name: string } => x != null)
  return firstNamed(named) ?? aboutAudience(inputs.audiences.get(videoId))
}

/**
 * One video as a caller that read the namings by comment holds it
 * (`loadCommentNamings`): its audience, and the tracked brands its counted
 * comments name, by display name (already gated).
 */
export interface WhoVideo {
  id: string
  audience: string
  named: readonly string[]
}

/** Who such a video is about: the same rule as `aboutVideo`. */
export function aboutNamed(v: Pick<WhoVideo, 'audience' | 'named'>, client: string): About {
  const own = client.trim().toLowerCase()
  const named = [...new Set(v.named.map((n) => n.trim()).filter(Boolean))]
    .map((name): { about: About; name: string } => ({ about: name.toLowerCase() === own ? 'client' : rival(name), name }))
  return firstNamed(named) ?? aboutAudience(v.audience)
}

/** The same video seen through several pieces of talk, once: the named
 *  brands of every sighting count. */
export function mergeWhoVideos(videos: readonly WhoVideo[]): WhoVideo[] {
  const byId = new Map<string, { audience: string; named: Set<string> }>()
  for (const v of videos) {
    const held = byId.get(v.id)
    if (held) for (const n of v.named) held.named.add(n)
    else byId.set(v.id, { audience: v.audience, named: new Set(v.named) })
  }
  return [...byId.entries()].map(([id, v]) => ({ id, audience: v.audience, named: [...v.named] }))
}

/** The split of such videos, one brand per video, in the one order. Sums to
 *  the number of distinct videos. */
export function whoSplit(videos: readonly WhoVideo[], client: string): AboutPart[] {
  const counts = new Map<About, number>()
  for (const v of mergeWhoVideos(videos)) {
    const about = aboutNamed(v, client)
    counts.set(about, (counts.get(about) ?? 0) + 1)
  }
  return sortParts([...counts.entries()].map(([about, videos]) => ({ about, videos })), { client })
}

/**
 * The split of a set of videos: each distinct video once, the tracked brands
 * by videos (most first, then by name), the market last. Empty for no videos.
 */
export function attributeVideos(videoIds: Iterable<string>, inputs: AttributionInputs, scope: TalkScope = {}): AboutPart[] {
  const counts = new Map<About, number>()
  for (const id of new Set(videoIds)) {
    const about = aboutVideo(id, inputs, scope)
    counts.set(about, (counts.get(about) ?? 0) + 1)
  }
  return sortParts([...counts.entries()].map(([about, videos]) => ({ about, videos })), inputs.brands)
}

/** The one order (the design's): the client first, then the rivals by
 *  videos (most first, then by name), the market last. */
export function sortParts(parts: readonly AboutPart[], brands: Pick<TrackedBrands, 'client'>): AboutPart[] {
  const rank = (p: AboutPart): number => (p.about === 'client' ? 0 : p.about === 'market' ? 2 : 1)
  return [...parts]
    .filter((p) => p.videos > 0)
    .sort((a, b) => rank(a) - rank(b) || b.videos - a.videos || (aboutName(a.about, brands) ?? '').localeCompare(aboutName(b.about, brands) ?? ''))
}

/** The split of an audience reading (a kind's videos by audience): the
 *  audiences' own answer, no naming read. The client's own posts are never
 *  in the market, so a caller passes market audiences only. */
export function attributeAudiences(rows: readonly { audience: string; videos: number }[], brands: Pick<TrackedBrands, 'client'>): AboutPart[] {
  const counts = new Map<About, number>()
  for (const r of rows) {
    const about = aboutAudience(r.audience)
    counts.set(about, (counts.get(about) ?? 0) + Math.max(0, r.videos))
  }
  return sortParts([...counts.entries()].map(([about, videos]) => ({ about, videos })), brands)
}

/** The months a window covers, `[from, to)`, as `YYYY-MM-01`. */
export function windowMonths(window: { from: string; to: string }): Set<string> {
  const out = new Set<string>()
  const end = Date.parse(window.to)
  let m = monthStartOf(window.from)
  for (let guard = 0; guard < 240; guard++) {
    out.add(m)
    const next = new Date(`${m}T00:00:00.000Z`)
    next.setUTCMonth(next.getUTCMonth() + 1)
    if (!Number.isFinite(end) || next.getTime() >= end) break
    m = next.toISOString().slice(0, 10)
  }
  return out
}

// ---- the read ----------------------------------------------------------------

interface MentionRow {
  video_id: string
  brand_key: string
  comment_id: string | null
  comment_month: string | null
  method: string
  rule_version: string
}

/** A hit's identity across rule versions (lib/brands/confirm.ts `hitKey`,
 *  comment rows only). */
const hitKey = (r: Pick<MentionRow, 'video_id' | 'brand_key' | 'comment_id'>): string => `${r.video_id}|${r.brand_key}|${r.comment_id ?? ''}`

/** The rows that count: the rules' version, never a hit a confirm rejected. */
export function countedNamings(rows: readonly MentionRow[]): Map<string, Naming[]> {
  const rejected = new Set(rows.filter((r) => r.method === 'rejected').map(hitKey))
  const out = new Map<string, Naming[]>()
  for (const r of rows) {
    const ours = r.rule_version === BRAND_RULE_VERSION || r.rule_version.startsWith(`${BRAND_RULE_VERSION}+`)
    if (r.method === 'rejected' || !ours || rejected.has(hitKey(r))) continue
    const video = String(r.video_id)
    const list = out.get(video) ?? []
    if (!list.some((n) => n.brandKey === r.brand_key && n.commentId === r.comment_id)) {
      list.push({ brandKey: r.brand_key, commentId: r.comment_id ? String(r.comment_id) : null, month: r.comment_month ? monthStartOf(String(r.comment_month)) : null })
    }
    out.set(video, list)
  }
  return out
}

/** The tracked brands for a tenant: its own name and every rival it has had,
 *  each naming gated by the hand check. */
export function trackedBrands(clientId: string, client: string, rivals: readonly { id: string; name: string }[]): TrackedBrands {
  return {
    client,
    rivals: new Map(rivals.map((r) => [String(r.id), r.name])),
    counts: (name) => brandCountState(clientId, name) === 'counted',
  }
}

/**
 * THE ONE READ: the videos' entity tags and the comment namings on them, in
 * one wave (chunked by id). Null where either cannot be read (a page then
 * prints no split rather than a guessed one).
 */
export async function loadAttribution(
  db: SupabaseClient,
  a: { clientId: string; videoIds: Iterable<string>; brands: TrackedBrands },
): Promise<AttributionInputs | null> {
  const ids = [...new Set(a.videoIds)].filter(Boolean)
  if (ids.length === 0) return { audiences: new Map(), namings: new Map(), brands: a.brands }
  try {
    const parts = chunk(ids, UUID_IN_CHUNK)
    const [videos, mentions] = await Promise.all([
      Promise.all(parts.map((part) => selectAll<{ id: string; is_client: boolean | null; is_competitor: boolean | null; competitor_name: string | null }>(() =>
        db.from('videos').select('id, is_client, is_competitor, competitor_name').eq('client_id', a.clientId).in('id', part).order('id')))),
      Promise.all(parts.map((part) => selectAll<MentionRow>(() =>
        db.from('brand_mentions').select('video_id, brand_key, comment_id, comment_month, method, rule_version')
          .eq('client_id', a.clientId).eq('source', 'comment').in('video_id', part).order('id')))),
    ])
    return {
      audiences: new Map(videos.flat().map((v) => [String(v.id), audienceOf(v)])),
      namings: countedNamings(mentions.flat()),
      brands: a.brands,
    }
  } catch (error) {
    console.error(`[brands] attribution not read: ${(error as Error)?.message ?? String(error)}`)
    return null
  }
}

/** A tracked brand named in one counted comment, on its video. */
export interface CommentNaming {
  commentId: string
  videoId: string
  /** The brand's display name ("Sealand", "Cotopaxi"). */
  name: string
}

/**
 * The tracked brands these comments name, by the same gates as
 * `loadAttribution` (the rules' version, never a hit a confirm rejected, the
 * hand check; `watched:` and unknown keys name nothing). For a caller that
 * holds the comments an item rests on. Throws on a failed read: the caller
 * prints no split rather than a guessed one.
 */
export async function loadCommentNamings(
  db: SupabaseClient,
  a: { clientId: string; commentIds: Iterable<string>; brands: TrackedBrands },
): Promise<CommentNaming[]> {
  const ids = [...new Set(a.commentIds)].filter(Boolean)
  if (ids.length === 0) return []
  const pages = await mapWithLimit(chunk(ids, UUID_IN_CHUNK), READ_CONCURRENCY, (part) => selectAll<MentionRow>(() =>
    db.from('brand_mentions').select('video_id, brand_key, comment_id, comment_month, method, rule_version')
      .eq('client_id', a.clientId).eq('source', 'comment').in('comment_id', part).order('id')))
  const out: CommentNaming[] = []
  for (const [videoId, namings] of countedNamings(pages.flat())) {
    for (const n of namings) {
      const named = n.commentId ? namedAbout(n.brandKey, a.brands) : null
      if (named) out.push({ commentId: n.commentId as string, videoId, name: named.name })
    }
  }
  return out
}

/** Comment id → the brands it names, each once. */
export function namesByComment(namings: readonly CommentNaming[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const n of namings) {
    const held = out.get(n.commentId) ?? []
    if (!held.includes(n.name)) held.push(n.name)
    out.set(n.commentId, held)
  }
  return out
}
