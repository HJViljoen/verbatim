import { BRAND_RULE_VERSION, brandRulesFor, WATCHED_RULE_VERSION, watchedKey } from '../brands/aliases'
import { ownerOfVideos, type IdentityRow } from '../brands/owners'
import { brandCountState, type BrandCountState } from '../brands/precision'
import { readRivalFound } from '../brands/rival-searches'
import { chunk, mapWithLimit, READ_CONCURRENCY, UUID_IN_CHUNK } from '../chunk'
import { platformLabel } from '../format'
import { normalisePersona, type Persona } from '../profile-tiles'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, loadTrackedRivals } from '../rivals'
import { selectAll } from '../supabase-admin'
import { monthChange } from './bands'
import { TABLE_EVIDENCE_REFS } from './evidence-refs'
import { marketAudiences } from './market'
import { monthStartOf, nextMonth, prevMonth } from './month-key'
import { BRANDS_PANEL, refusedSteps, type PairOn } from './pairs'
import { loadMonthSeries, loadPairOn, type ReadingHandle } from './read'
import { marketRivalAudiences } from './reading-view'
import type { MonthLabel, MonthSeries, MonthState } from './series'
import { TABLE_THEME_READINGS, type PlatformMix } from './types'
import { priorPrintable, type Verdict } from './verdicts'

// THE CROSS READS (depth v2, T16): two things the month tables each count
// alone, counted together. Brand × kind, brand × subject, creator ×
// conversation, group × subject, a conversation's platforms and its month
// line. Pure functions over rows first, then the thin loaders that fetch
// those rows on the service role (`ReadingHandle`, decision N's pairing).
//
// THE RULES EVERY ONE OF THEM KEEPS (AGENTS.md):
//  · A PERIOD IS DATED BY THE COMMENT. Every count here is one calendar month,
//    read through the comment-dated evidence: `month_evidence_refs` (theme
//    rows), `lens_readings` (the month functions' own rule, restricted to a
//    video set), the stored month tables, or, for groups only, evidence
//    comments dated in the month. Never a run date.
//  · DISTINCT VIDEOS, OVER A STATED BASE. Every level is `k of n` videos, and
//    each function's doc says what n is. Audiences of ONE month are disjoint
//    and add up; nothing here adds two months together.
//  · A MOVEMENT CLAIM IS A `Verdict`, through the existing band helpers
//    (`monthChange`), judged by the month-pair rule where a judge is given.
//    No direction word is produced here: none of these surfaces has earned
//    one (`directionWord` stays with the readers whose series it is).
//
// WHAT THE PLAN ASKED FOR AND WHAT PRODUCTION HOLDS. The plan reads brand ×
// kind and brand × subject off `month_evidence_refs` kind and subject rows.
// Production holds THEME rows only (the freeze writes nothing else;
// `themeRefsToFacts` is its one writer, checked on both tenants 13 Oct). So
// those two crosses go through `lens_readings(p_video_ids)` (MF2): the month
// functions' own subject and kind rule, cut to the brand's videos, which is
// exactly what the pipeline's lens step already asks of it. One call per
// brand per month, live.
//
// ============================================================================
// THE PINNED INTERFACE (the page builders, T3/T4/T5, build against this)
// ============================================================================
//
// Shared
//   type Level = { k: number; n: number }                      distinct videos
//   type BrandBase = 'organic' | 'any'
//   loadMarketAudiences(handle: ReadingHandle): Promise<string[]>
//       the category and the live tracked rivals' audiences (client out)
//   loadMarketVideos(handle, month: string, audiences: readonly string[]): Promise<MarketVideo[]>
//       market_month_videos (full lane, a comment dated in the month, client
//       arm dropped) for those audiences, with each video's identity columns
//
// Brands (Sealand only until T15 gives Össur rules; a tenant with no brand
// rules gets null from every brand loader)
//   countedMentions(rows: readonly MentionRowIn[]): CrossMention[]
//   brandMonthVideos(input: {
//     month: string; brands: readonly BrandRef[]; mentions: readonly CrossMention[]
//     market: readonly { videoId: string; audience: string }[]
//     ownerOf: (videoId: string) => string | null; rivalFound: ReadonlySet<string>
//   }): BrandMonthVideos[]
//   brandKinds(month: string, lens: readonly BrandLens[]): BrandCrossRow[]
//   brandSubjects(month: string, lens: readonly BrandLens[], subjects: ReadonlyMap<string, string>): BrandCrossRow[]
//   brandMonthPair(input: {
//     month: string; brands: readonly BrandRef[]; rows: readonly StoredBrandMonthRow[]
//     audiences: readonly string[]; pair: PairOn | null
//   }): BrandPair[]
//   loadBrandMonthVideos(handle, input: { month: string; audiences?: readonly string[] }): Promise<BrandMonthVideos[] | null>
//   loadBrandCrosses(handle, input: { month: string; base?: BrandBase; brandKeys?: readonly string[]; audiences?: readonly string[] }):
//       Promise<{ videos: BrandMonthVideos[]; kinds: BrandCrossRow[]; subjects: BrandCrossRow[] } | null>
//   loadBrandMonthPairs(handle, input: { month: string; now: string; pair?: PairOn; audiences?: readonly string[] }): Promise<BrandPair[] | null>
//
// Creators
//   creatorThemes(input: { month: string; videos: readonly CreatorVideo[]; refs: readonly ThemeRef[]; audiences?: readonly string[] }): CreatorThemes
//   creatorFollowers(videos: readonly CreatorVideo[]): Map<string, number | null>
//   loadCreatorThemes(handle, input: { month: string; audiences?: readonly string[] }): Promise<CreatorThemes>
//
// Groups (personas: today's groups, this month's videos; never a series)
//   groupMonthVideos(input: { month: string; personas: readonly GroupPersona[]; evidence: readonly GroupEvidence[]; market: ReadonlyMap<string, string> }): GroupMonthVideos[]
//   groupSubjects(input: { month: string; personas: readonly GroupPersona[]; evidence: readonly GroupEvidence[];
//     memberships: readonly GroupMembership[]; subjects: ReadonlyMap<string, string>; market: ReadonlyMap<string, string> }): GroupSubjectRow[]
//   loadGroupSubjects(handle, input: { month: string; audiences?: readonly string[] }):
//       Promise<{ runId: string | null; runDate: string | null; videos: GroupMonthVideos[]; groups: GroupSubjectRow[] } | null>
//
// Conversations (a theme registry id)
//   themePlatforms(input: { themeId: string; month: string; rows: readonly ThemePlatformRow[]; audiences?: readonly string[] }): ThemePlatforms | null
//   themeMonthLine(series: MonthSeries, month: string, pair: PairOn | null): ThemeMonthLine
//   loadThemePlatforms(handle, input: { themeId: string; month: string; audiences?: readonly string[] }): Promise<ThemePlatforms | null>
//   loadThemeMonthLine(handle, input: { themeId: string; month: string; now: string; months?: number; audience?: string; pair?: PairOn }):
//       Promise<ThemeMonthLine | null>
//
// The shapes are declared below, each beside the function that returns it.
// ============================================================================

/** k of n, both distinct videos. */
export interface Level {
  k: number
  n: number
}

const asNumber = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : 0
  return Number.isFinite(n) ? n : 0
}

const byCount = <T extends { k: number; id: string }>(a: T, b: T): number => b.k - a.k || a.id.localeCompare(b.id)

// ---- Brands ------------------------------------------------------------------------

/** Which of a brand's month videos a cross is read over. `organic` is
 *  `k_organic`'s set (named in the market, its own posts out, and none our
 *  rival searches found: "named unprompted"); `any` is `k_any`'s. */
export type BrandBase = 'organic' | 'any'

/** A tracked brand: 'client', a competitors.id, or 'watched:<slug>'. */
export interface BrandRef {
  brandKey: string
  label: string
  /** The hand check's answer for the name (lib/brands/precision.ts). A page
   *  prints no cross for a brand whose naming is mostly another word. */
  countState?: BrandCountState
}

/** A `brand_mentions` row as read. */
export interface MentionRowIn {
  video_id: string
  brand_key: string
  source: string
  comment_id: string | null
  comment_month: string | null
  method: string
  rule_version: string
}

/** A counted naming. */
export interface CrossMention {
  videoId: string
  brandKey: string
  source: 'content' | 'comment'
  /** The comment's month (`YYYY-MM-01`); null on a content row. */
  commentMonth: string | null
}

const hitKey = (r: Pick<MentionRowIn, 'video_id' | 'brand_key' | 'comment_id'>): string => `${r.video_id}|${r.brand_key}|${r.comment_id ?? ''}`

/**
 * The namings that count: the rules' own versions (`brands_v1`,
 * `watched_v1`), never a hit a confirm rejected (the brand-readings step's
 * `countedUnlessRejected`), each hit once. A confirmed row only repeats a rule
 * row's hit and adds nothing. Pure.
 */
export function countedMentions(rows: readonly MentionRowIn[]): CrossMention[] {
  const rejected = new Set(rows.filter((r) => r.method === 'rejected').map(hitKey))
  const seen = new Set<string>()
  const out: CrossMention[] = []
  for (const r of rows) {
    if (r.method === 'rejected') continue
    if (r.rule_version !== BRAND_RULE_VERSION && r.rule_version !== WATCHED_RULE_VERSION) continue
    if (r.source !== 'content' && r.source !== 'comment') continue
    const key = hitKey(r)
    if (rejected.has(key) || seen.has(key)) continue
    seen.add(key)
    out.push({
      videoId: String(r.video_id),
      brandKey: String(r.brand_key),
      source: r.source,
      commentMonth: r.source === 'comment' && r.comment_month ? monthStartOf(String(r.comment_month)) : null,
    })
  }
  return out
}

/** One brand's videos in one month, as `month_brand_readings` counts them. */
export interface BrandMonthVideos extends BrandRef {
  month: string
  /** `k_any`'s set: the market's videos this month that name the brand (in
   *  the content, ever, or in a comment dated this month), the brand's own
   *  posts out. Sorted. */
  any: string[]
  /** `k_organic`'s set: `any` less every video our rival searches found. */
  organic: string[]
  /** The market's videos this month (`n`), and those our rival searches did
   *  not find (`n_organic`). */
  n: number
  nOrganic: number
}

/**
 * Each brand's month video sets, by `brandReadingRows`' rule (lib/brands/
 * readings.ts), so `any.length` and `organic.length` are the pooled `k_any`
 * and `k_organic` the step stores for the same inputs. The market is the
 * month's `market_month_videos` over the audiences asked for; the client arm
 * is dropped here too. Pure.
 */
export function brandMonthVideos(input: {
  month: string
  brands: readonly BrandRef[]
  mentions: readonly CrossMention[]
  market: readonly { videoId: string; audience: string }[]
  ownerOf: (videoId: string) => string | null
  rivalFound: ReadonlySet<string>
}): BrandMonthVideos[] {
  const month = monthStartOf(input.month)
  const market = [...new Set(input.market.filter((v) => v.audience !== CLIENT_AUDIENCE).map((v) => v.videoId))].sort()
  const organic = (v: string): boolean => !input.rivalFound.has(v)
  return input.brands.map((b) => {
    const mine = input.mentions.filter((m) => m.brandKey === b.brandKey)
    const named = new Set(mine.filter((m) => m.source === 'content' || m.commentMonth === month).map((m) => m.videoId))
    const any = market.filter((v) => named.has(v) && input.ownerOf(v) !== b.brandKey)
    return {
      ...b,
      month,
      any,
      organic: any.filter(organic),
      n: market.length,
      nOrganic: market.filter(organic).length,
    }
  })
}

/** One row of `lens_readings` (MF2), per audience. */
export interface LensRowIn {
  audience: string
  object_kind: string
  object_id: string
  k: number
  n: number
}

/** One brand's `lens_readings` answer over its month videos. */
export interface BrandLens {
  brandKey: string
  label: string
  base: BrandBase
  rows: readonly LensRowIn[]
}

/** One kind or subject among a brand's videos: k of the brand's n. */
export interface BrandCrossCell {
  /** The kind's enum value, or the subject's id. */
  id: string
  /** The subject's name; the kind's enum value (the page words a kind with
   *  `talkKindLabel`, which needs the tenant's noun). */
  label: string
  k: number
  n: number
}

export interface BrandCrossRow {
  brandKey: string
  label: string
  month: string
  base: BrandBase
  /** The brand's videos this month that the cross is read over: the lens
   *  denominator, pooled over the market's audiences. Equals the length of the
   *  base set (every video in it is a full-lane market video of the month). */
  n: number
  /** Largest first; only objects on at least one video. */
  cells: BrandCrossCell[]
}

/** Pool one brand's lens rows over every audience but the client's: the
 *  denominator's videos, and k per object of one kind. Audiences of one month
 *  are disjoint, so the sum is a count of distinct videos. */
function pooledLens(rows: readonly LensRowIn[], objectKind: string): { n: number; k: Map<string, number> } {
  const seen = new Set<string>()
  let n = 0
  const k = new Map<string, number>()
  for (const r of rows) {
    if (r.audience === CLIENT_AUDIENCE) continue
    const key = `${r.audience}\u0000${r.object_kind}\u0000${r.object_id}`
    if (seen.has(key)) continue
    seen.add(key)
    if (r.object_kind === 'denominator' && r.object_id === 'videos') n += asNumber(r.k)
    else if (r.object_kind === objectKind) k.set(String(r.object_id), (k.get(String(r.object_id)) ?? 0) + asNumber(r.k))
  }
  return { n, k }
}

function brandCross(month: string, lens: readonly BrandLens[], objectKind: 'kind' | 'subject', labelOf: (id: string) => string | null): BrandCrossRow[] {
  const m = monthStartOf(month)
  return lens.map((b) => {
    const { n, k } = pooledLens(b.rows, objectKind)
    const cells = [...k.entries()]
      .filter(([, count]) => count > 0)
      .flatMap(([id, count]) => {
        const label = labelOf(id)
        return label == null ? [] : [{ id, label, k: count, n }]
      })
      .sort(byCount)
    return { brandKey: b.brandKey, label: b.label, month: m, base: b.base, n, cells }
  })
}

/**
 * Brand × kind: of the brand's n videos this month, how many carry each kind
 * of comment (praise, a pain point, a question …) by the month rule: an
 * insight of that kind cited on a comment dated in the month, or an on-camera
 * insight on a video that occupies the month (`lens_readings`). A kind belongs
 * to an INSIGHT, not to the brand: "praised" on a video that names Cotopaxi is
 * praise in that video's comments, which may be about something else. Every
 * kind the lens returns is kept; the page picks which to print. No verdict: a
 * brand's month holds tens of videos, under the band's floor of 100, and a
 * comparison would cost a second live call per brand to say "too few". Pure.
 */
export function brandKinds(month: string, lens: readonly BrandLens[]): BrandCrossRow[] {
  return brandCross(month, lens, 'kind', (id) => id)
}

/**
 * Brand × subject: of the brand's n videos this month, how many carry each
 * active subject (the subject month rule, through `lens_readings`). That rule
 * reads members over the BASE insights table, as `month_subject_readings`
 * does, so a member a newer update superseded and the prune has not yet taken
 * still counts (Sealand, Patagonia, September: 3 of 8 subjects one video
 * higher than over `audience_insights_current`). Subjects not in `subjects`
 * (retired, or not named) are left out; largest first, the page takes the
 * top. No verdict, for the reason `brandKinds` gives. Pure.
 */
export function brandSubjects(month: string, lens: readonly BrandLens[], subjects: ReadonlyMap<string, string>): BrandCrossRow[] {
  return brandCross(month, lens, 'subject', (id) => subjects.get(id) ?? null)
}

/** A `month_brand_readings` row as read. */
export interface StoredBrandMonthRow {
  month: string
  audience: string
  brand_key: string
  k_any: number
  k_organic: number
  n: number
  n_organic: number
}

export interface BrandPair extends BrandRef {
  month: string
  prevMonth: string
  /** Named unprompted this month: `k_organic` of `n_organic`, pooled over the
   *  market's audiences. Null where the brand has no row this month. */
  curr: Level | null
  /** Last month's, the same way. Null where there is none, AND wherever the
   *  verdict is refused: a refused comparison prints this month alone (T0a). */
  prev: Level | null
  /** Named at all (`k_any` of `n`) this month, for a page that wants it. */
  currAny: Level | null
  /** This month against last, banded (`monthChange`). Null where this month
   *  has no row. No direction word. */
  verdict: Verdict | null
}

/** The pooled organic and any sides of one brand in one month. */
function pooledBrand(rows: readonly StoredBrandMonthRow[], month: string, brandKey: string, audiences: ReadonlySet<string>): { organic: Level; any: Level } | null {
  const seen = new Set<string>()
  const mine = rows.filter((r) => {
    if (monthStartOf(String(r.month)) !== month || r.brand_key !== brandKey || !audiences.has(r.audience)) return false
    if (seen.has(r.audience)) return false
    seen.add(r.audience)
    return true
  })
  if (mine.length === 0) return null
  const sum = (key: 'k_any' | 'k_organic' | 'n' | 'n_organic'): number => mine.reduce((s, r) => s + asNumber(r[key]), 0)
  return { organic: { k: sum('k_organic'), n: sum('n_organic') }, any: { k: sum('k_any'), n: sum('n') } }
}

/** What a brand pair's two sides count, in the reader's words. */
const ORGANIC_POPULATION = 'the market’s videos our rival searches did not find'

/**
 * A brand's named-unprompted level this month and last (`k_organic` of
 * `n_organic` off `month_brand_readings`, pooled over `audiences`, the
 * brands page's own pooling), with this month against last as a `Verdict`:
 * `monthChange` under the month-pair rule on the brands view (the
 * `BRANDS_PANEL` key, as Ask's brand topics are judged). `pair: null` means no
 * month pair applies (a fixture). Pure.
 */
export function brandMonthPair(input: {
  month: string
  brands: readonly BrandRef[]
  rows: readonly StoredBrandMonthRow[]
  audiences: readonly string[]
  pair: PairOn | null
}): BrandPair[] {
  const month = monthStartOf(input.month)
  const before = prevMonth(month)
  const audiences = new Set(input.audiences)
  return input.brands.map((b) => {
    const c = pooledBrand(input.rows, month, b.brandKey, audiences)
    const p = pooledBrand(input.rows, before, b.brandKey, audiences)
    const base: BrandPair = { ...b, month, prevMonth: before, curr: c?.organic ?? null, prev: p?.organic ?? null, currAny: c?.any ?? null, verdict: null }
    if (!c) return base
    const verdict: Verdict = {
      ...monthChange({
        object: { kind: 'rival', id: b.brandKey, label: b.label },
        audience: 'market',
        curr: { month, videos: c.organic.n, k: c.organic.k, audience: 'market', regime: 'n/a' },
        prev: { month: before, videos: p?.organic.n ?? null, k: p?.organic.k ?? null, audience: 'market', regime: 'n/a' },
        comparability: input.pair ? input.pair(before, month, BRANDS_PANEL) : null,
      }),
      countedOver: { measure: 'videos', population: ORGANIC_POPULATION },
    }
    return { ...base, prev: priorPrintable(verdict) ? base.prev : null, verdict }
  })
}

// ---- Creators ----------------------------------------------------------------------

/** One market video of the month with its account (`market_month_videos` and
 *  the video's own row). */
export interface CreatorVideo {
  videoId: string
  audience: string
  platform: string
  account: string | null
  /** `videos.account_followers`: a per-video snapshot taken at gather. */
  followers: number | null
  /** When that snapshot was taken (`videos.scraped_at`). */
  scrapedAt: string | null
}

/** A `month_evidence_refs` theme row of the month. */
export interface ThemeRef {
  themeId: string
  audience: string
  videoIds: readonly string[]
}

export interface CreatorThemeCell {
  themeId: string
  /** The creator's videos this month in the conversation. */
  k: number
  /** "6 of the creator's 9 videos". */
  ofCreator: number
  /** "6 of the 24 videos in the conversation". */
  ofTheme: number
}

export interface CreatorRow {
  /** `platform|account`: one creator per platform. */
  key: string
  account: string
  platform: string
  /** The creator's market videos this month. */
  videos: number
  /** Followers by the newest snapshot; null on Reddit (the field holds the
   *  subreddit's subscribers there) and where no snapshot is above zero. */
  followers: number | null
  /** Conversations the creator's videos are in, largest first. */
  themes: CreatorThemeCell[]
}

export interface CreatorThemes {
  month: string
  /** The market's videos this month over the audiences read (the base the
   *  creators' counts sit in). */
  videos: number
  /** Each conversation's videos this month over the same audiences. */
  themeVideos: Record<string, number>
  /** Most videos first, then by name. Every account with a video; a page
   *  applies its own floor. */
  creators: CreatorRow[]
}

const creatorKey = (platform: string, account: string): string => `${platform}|${account}`

/**
 * Each creator's followers: the count on the most recently gathered of THE
 * VIDEOS GIVEN (the month's, in `creatorThemes`) that carries one above zero
 * (0 is the column's default, "not read"), the larger on a tie. A snapshot on
 * one of the creator's videos outside the month is not read, so the figure is
 * as of the month's videos, not the account's latest. Reddit is left out
 * whatever it holds: there the field is the subreddit's subscribers (r/onebag
 * stores about 951,600), not a person's following. Pure.
 */
export function creatorFollowers(videos: readonly CreatorVideo[]): Map<string, number | null> {
  const best = new Map<string, { at: string; n: number } | null>()
  for (const v of videos) {
    if (!v.account) continue
    const key = creatorKey(v.platform, v.account)
    if (!best.has(key)) best.set(key, null)
    if (v.platform === 'reddit') continue
    const n = v.followers ?? 0
    if (!(n > 0)) continue
    const at = v.scrapedAt ?? ''
    const held = best.get(key)
    if (!held || at > held.at || (at === held.at && n > held.n)) best.set(key, { at, n })
  }
  return new Map([...best.entries()].map(([key, b]) => [key, b ? b.n : null]))
}

/**
 * Creator × conversation for one month: each creator's market videos this
 * month, and of those, how many are in each conversation's month evidence
 * (`month_evidence_refs` theme rows, the comment-dated videos the theme's
 * reading rested on). Both the creator's videos and the conversation's are
 * counted over `audiences` (all given when omitted), each video once. Pure.
 */
export function creatorThemes(input: {
  month: string
  videos: readonly CreatorVideo[]
  refs: readonly ThemeRef[]
  audiences?: readonly string[]
}): CreatorThemes {
  const month = monthStartOf(input.month)
  const keep = input.audiences ? new Set(input.audiences) : null
  const inScope = (audience: string): boolean => !keep || keep.has(audience)
  const videos = new Map<string, CreatorVideo>()
  for (const v of input.videos) if (inScope(v.audience) && !videos.has(v.videoId)) videos.set(v.videoId, v)

  const themeSets = new Map<string, Set<string>>()
  for (const r of input.refs) {
    if (!inScope(r.audience)) continue
    const set = themeSets.get(r.themeId) ?? new Set<string>()
    for (const id of r.videoIds) set.add(String(id))
    themeSets.set(r.themeId, set)
  }

  const byCreator = new Map<string, { account: string; platform: string; ids: string[] }>()
  for (const v of videos.values()) {
    if (!v.account) continue
    const key = creatorKey(v.platform, v.account)
    const held = byCreator.get(key) ?? { account: v.account, platform: v.platform, ids: [] }
    held.ids.push(v.videoId)
    byCreator.set(key, held)
  }
  const followers = creatorFollowers([...videos.values()])

  const creators: CreatorRow[] = [...byCreator.entries()].map(([key, c]) => {
    const themes: CreatorThemeCell[] = []
    for (const [themeId, set] of themeSets) {
      const k = c.ids.filter((id) => set.has(id)).length
      if (k > 0) themes.push({ themeId, k, ofCreator: c.ids.length, ofTheme: set.size })
    }
    themes.sort((a, b) => b.k - a.k || b.ofTheme - a.ofTheme || a.themeId.localeCompare(b.themeId))
    return { key, account: c.account, platform: c.platform, videos: c.ids.length, followers: followers.get(key) ?? null, themes }
  }).sort((a, b) => b.videos - a.videos || a.account.localeCompare(b.account) || a.platform.localeCompare(b.platform))

  return {
    month,
    videos: videos.size,
    themeVideos: Object.fromEntries([...themeSets.entries()].map(([id, set]) => [id, set.size])),
    creators,
  }
}

// ---- Groups ------------------------------------------------------------------------
//
// TODAY'S GROUPS, THIS MONTH'S VIDEOS (decision 2). A group is a persona of
// the LATEST `consumer_profiles` row, and that row is rebuilt every update
// over all-time insights: its membership and even its key can change from one
// update to the next. So a group's count here is "this month's videos for
// today's groups", never a point on a month-over-month series, and nothing
// here compares two months of a group. A per-month persona reading is a
// follow-up (a Pass E change and a migration).

/** A persona, as the cross needs it. */
export interface GroupPersona {
  key: string
  name: string
  insightIds: readonly string[]
}

/** An evidence comment of one of the groups' insights. */
export interface GroupEvidence {
  insightId: string
  commentId: string
  /** The comment's platform and the platform's own video id (`comments`),
   *  which is how a comment finds its video. */
  platform: string
  platformVideoId: string
  commentDate: string | null
}

/** A subject membership of one insight (`subject_memberships`, member). */
export interface GroupMembership {
  subjectId: string
  insightId: string
}

export interface GroupMonthVideos {
  key: string
  name: string
  month: string
  /** The market's videos this month with a comment, dated this month, that one
   *  of the group's insights cites. Sorted. */
  videoIds: string[]
  n: number
}

export interface GroupSubjectRow {
  key: string
  name: string
  month: string
  /** The group's videos this month (`groupMonthVideos`). */
  n: number
  /** Of those, the videos where the group's own insights that belong to the
   *  subject are cited on a comment dated this month. Largest first; only
   *  subjects on at least one video. */
  subjects: { subjectId: string; label: string; k: number; n: number }[]
}

/** `platform|platformVideoId`: how a comment names its video. */
export const commentVideoKey = (platform: string, platformVideoId: string): string => `${platform}|${platformVideoId}`

/** The videos one set of insights' evidence lands on this month, in the
 *  market. */
function videosOf(insights: ReadonlySet<string>, evidence: readonly GroupEvidence[], month: string, market: ReadonlyMap<string, string>): Set<string> {
  const out = new Set<string>()
  for (const e of evidence) {
    if (!insights.has(e.insightId) || !e.commentDate) continue
    const d = Date.parse(e.commentDate)
    if (!Number.isFinite(d) || monthStartOf(e.commentDate) !== month) continue
    const video = market.get(commentVideoKey(e.platform, e.platformVideoId))
    if (video) out.add(video)
  }
  return out
}

/**
 * Each group's videos this month: the market's videos (`market`, the month's
 * `market_month_videos` keyed `platform|platformVideoId`) carrying a comment,
 * dated in the month, that one of the group's insights cites. Comment evidence
 * only: an insight spoken on camera has no date of its own. A video counts
 * once however many of the group's comments it carries. Pure.
 */
export function groupMonthVideos(input: {
  month: string
  personas: readonly GroupPersona[]
  evidence: readonly GroupEvidence[]
  market: ReadonlyMap<string, string>
}): GroupMonthVideos[] {
  const month = monthStartOf(input.month)
  return input.personas.map((p) => {
    const videoIds = [...videosOf(new Set(p.insightIds), input.evidence, month, input.market)].sort()
    return { key: p.key, name: p.name, month, videoIds, n: videoIds.length }
  })
}

/**
 * Group × subject: of each group's videos this month, how many carry the
 * group's own talk about each subject (its insights that are members of the
 * subject, cited on a comment dated in the month). A subject is counted only
 * where `subjects` names it (active ones). No share of the month and no
 * comparison with last month (decision 2). Pure.
 */
export function groupSubjects(input: {
  month: string
  personas: readonly GroupPersona[]
  evidence: readonly GroupEvidence[]
  memberships: readonly GroupMembership[]
  subjects: ReadonlyMap<string, string>
  market: ReadonlyMap<string, string>
}): GroupSubjectRow[] {
  const month = monthStartOf(input.month)
  const membersOf = new Map<string, Set<string>>()
  for (const m of input.memberships) {
    if (!input.subjects.has(m.subjectId)) continue
    const set = membersOf.get(m.subjectId) ?? new Set<string>()
    set.add(m.insightId)
    membersOf.set(m.subjectId, set)
  }
  const groups = groupMonthVideos({ month, personas: input.personas, evidence: input.evidence, market: input.market })
  return input.personas.map((p, i) => {
    const mine = new Set(p.insightIds)
    const n = groups[i].n
    const subjects = [...membersOf.entries()]
      .map(([subjectId, members]) => {
        const insights = new Set([...members].filter((id) => mine.has(id)))
        const k = insights.size === 0 ? 0 : videosOf(insights, input.evidence, month, input.market).size
        return { subjectId, label: input.subjects.get(subjectId) as string, k, n }
      })
      .filter((s) => s.k > 0)
      .sort((a, b) => b.k - a.k || a.subjectId.localeCompare(b.subjectId))
    return { key: p.key, name: p.name, month, n, subjects }
  })
}

// ---- Conversations -----------------------------------------------------------------

/** A `month_theme_readings` row of one theme and month. */
export interface ThemePlatformRow {
  audience: string
  videos: number
  platform_mix: PlatformMix | null
}

export interface ThemePlatforms {
  themeId: string
  month: string
  /** The conversation's videos this month over the audiences read. */
  n: number
  /** Largest first; each k is the conversation's videos on that platform. The
   *  k sum to n: a video is on one platform. */
  platforms: { platform: string; label: string; k: number; n: number }[]
}

/**
 * A conversation's platform split for one month, off the stored
 * `platform_mix` (distinct videos per platform, per audience), pooled over
 * `audiences` (all rows given when omitted). Null where the month holds no
 * video of it. Pure.
 */
export function themePlatforms(input: {
  themeId: string
  month: string
  rows: readonly ThemePlatformRow[]
  audiences?: readonly string[]
}): ThemePlatforms | null {
  const keep = input.audiences ? new Set(input.audiences) : null
  const seen = new Set<string>()
  let n = 0
  const byPlatform = new Map<string, number>()
  for (const r of input.rows) {
    if ((keep && !keep.has(r.audience)) || seen.has(r.audience)) continue
    seen.add(r.audience)
    n += asNumber(r.videos)
    for (const [platform, count] of Object.entries(r.platform_mix ?? {})) {
      const c = asNumber(count)
      if (c > 0) byPlatform.set(platform, (byPlatform.get(platform) ?? 0) + c)
    }
  }
  if (n <= 0) return null
  const platforms = [...byPlatform.entries()]
    .map(([platform, k]) => ({ platform, label: platformLabel(platform), k, n }))
    .sort((a, b) => b.k - a.k || a.platform.localeCompare(b.platform))
  return { themeId: input.themeId, month: monthStartOf(input.month), n, platforms }
}

/** How the step INTO a month sits against the clustering: `same` (one known
 *  regime), `changed` (two known regimes), `unknown` (either side carries no
 *  key, which no reader may call one regime), null (first point, or the months
 *  are not consecutive). */
export type RegimeStep = 'same' | 'changed' | 'unknown' | null

export interface ThemeLinePoint {
  month: string
  state: MonthState
  /** The conversation's videos and the audience's, this month. Null where the
   *  month has no row (never 0 for a month nobody read). */
  k: number | null
  n: number | null
  pct: number | null
  clusteringKey: string | null
  regimeStep: RegimeStep
  /** The month-pair rule's sentence where the step into this month is refused
   *  (a chart draws that step broken); null otherwise. */
  refusedStep: string | null
}

export interface ThemeMonthLine {
  themeId: string
  label: string | null
  audience: string
  month: string
  /** Oldest first, up to and including `month`. */
  points: ThemeLinePoint[]
  /** `month` against the month before, banded (`monthChange`): carries the
   *  `clustering_changed` / `clustering_unknown` flag where the two months were
   *  grouped differently or one carries no key. Null where `month` has no
   *  denominator. No direction word. */
  verdict: Verdict | null
  /** The series' own caveats (clustering stretches, still filling, thin …),
   *  said once. */
  notes: MonthLabel[]
}

/** `sameRegime`'s rule, told apart: two unknown keys are never one regime. */
function regimeStepOf(prev: { clusteringKey: string | null } | null, curr: { clusteringKey: string | null }): RegimeStep {
  if (!prev) return null
  if (!prev.clusteringKey || !curr.clusteringKey) return 'unknown'
  return prev.clusteringKey === curr.clusteringKey ? 'same' : 'changed'
}

/**
 * A conversation's month-by-month share line, from one `loadMonthSeries`
 * series (objectKind 'theme', one audience). THE CLUSTERING CAVEAT IS KEPT,
 * NOT SMOOTHED: each step says whether the two months were grouped under one
 * regime (`regimeStep`), the series' notes come through, and the verdict on
 * the newest month carries the clustering flag `monthChange` gives it
 * (decision L: a re-grouping is a caveat, not a refusal). Refused steps are
 * named per the month-pair rule where a judge is given. Pure.
 */
export function themeMonthLine(series: MonthSeries, month: string, pair: PairOn | null): ThemeMonthLine {
  const m = monthStartOf(month)
  const before = prevMonth(m)
  const pts = series.points.filter((p) => monthStartOf(p.month) <= m)
  const refused = pair ? refusedSteps(pts.map((p) => p.month), (a, b) => pair(a, b, series.audience)) : {}
  const points: ThemeLinePoint[] = pts.map((p, i) => {
    const prior = i > 0 ? pts[i - 1] : null
    const consecutive = prior != null && monthStartOf(p.month) === nextMonth(prior.month)
    return {
      month: monthStartOf(p.month),
      state: p.state,
      k: p.k,
      n: p.videos,
      pct: p.pct,
      clusteringKey: p.clusteringKey,
      regimeStep: consecutive ? regimeStepOf(prior, p) : null,
      refusedStep: refused[monthStartOf(p.month)] ?? null,
    }
  })
  const curr = pts.find((p) => monthStartOf(p.month) === m) ?? null
  const prev = pts.find((p) => monthStartOf(p.month) === before) ?? null
  const verdict = curr && curr.videos != null
    ? monthChange({
      object: { kind: 'theme', id: series.objectId ?? '', label: series.objectLabel ?? series.objectId ?? '' },
      audience: series.audience,
      curr,
      prev: prev ?? { month: before, videos: null, k: null, audience: series.audience },
      comparability: pair ? pair(before, m, series.audience) : null,
    })
    : null
  return { themeId: series.objectId ?? '', label: series.objectLabel, audience: series.audience, month: m, points, verdict, notes: series.notes }
}

// ---- The reads ---------------------------------------------------------------------
//
// Thin: each reads rows and hands them to the pure half. A read that fails
// throws with its table named, and the caller decides what its block loses;
// a tenant with nothing to read (no brand rules, no profile) gets null.

const RPC_MARKET_MONTH_VIDEOS = 'market_month_videos'
const RPC_LENS_READINGS = 'lens_readings'
/** Brands' lens calls in flight at once: each is a month aggregation over the
 *  tenant's insights, so a few, never the general read concurrency. */
const LENS_CONCURRENCY = 3

const fail = (what: string, error: unknown): Error =>
  new Error(`[reading] cross.${what}: ${(error as { message?: string } | null)?.message ?? String(error)}`)

/** The market's audiences: the category and the live tracked rivals'. */
export async function loadMarketAudiences(handle: ReadingHandle): Promise<string[]> {
  return marketAudiences(marketRivalAudiences(await loadTrackedRivals(handle.client, handle.clientId)))
}

/** A market video of the month with what the crosses need of its row. */
export interface MarketVideo extends CreatorVideo, IdentityRow {
  id: string
  /** The platform's own video id, which a comment names its video by. */
  platformVideoId: string
}

type VideoRow = {
  id: string; platform: string; video_id: string; account_name: string | null; account_followers: number | null; scraped_at: string | null
  source: string | null; is_client: boolean | null; is_competitor: boolean | null; competitor_name: string | null
}

/**
 * The month's market videos (`market_month_videos`: full lane, a comment
 * dated in the month, the client arm dropped) over `audiences`, each with its
 * account, follower snapshot and identity columns. Paged past 1,000 rows.
 */
export async function loadMarketVideos(handle: ReadingHandle, month: string, audiences: readonly string[]): Promise<MarketVideo[]> {
  const { client, clientId } = handle
  const keep = new Set(audiences)
  const rows = await selectAll<{ video_id: string; audience: string; platform: string }>(() =>
    client.rpc(RPC_MARKET_MONTH_VIDEOS, { p_client: clientId, p_month: monthStartOf(month) }).order('video_id'),
  ).catch((e: unknown) => { throw fail('marketVideos', e) })
  const inMarket = rows.filter((r) => keep.has(String(r.audience)))
  const audienceOf = new Map(inMarket.map((r) => [String(r.video_id), String(r.audience)]))
  const pages = await mapWithLimit(chunk([...audienceOf.keys()], UUID_IN_CHUNK), READ_CONCURRENCY, (part) =>
    selectAll<VideoRow>(() =>
      client.from('videos')
        .select('id, platform, video_id, account_name, account_followers, scraped_at, source, is_client, is_competitor, competitor_name')
        .eq('client_id', clientId).in('id', part).order('id'),
    ),
  ).catch((e: unknown) => { throw fail('marketVideos.rows', e) })
  return pages.flat().map((v) => ({
    id: String(v.id),
    videoId: String(v.id),
    audience: audienceOf.get(String(v.id)) ?? INDUSTRY_AUDIENCE,
    platform: v.platform,
    platformVideoId: String(v.video_id),
    account: v.account_name || null,
    account_name: v.account_name,
    followers: v.account_followers ?? null,
    scrapedAt: v.scraped_at ?? null,
    source: v.source,
    is_client: v.is_client,
    is_competitor: v.is_competitor,
    competitor_name: v.competitor_name,
  }))
}

/** The month's theme evidence rows over `audiences`. */
async function loadThemeRefs(handle: ReadingHandle, month: string, audiences: readonly string[]): Promise<ThemeRef[]> {
  const { client, clientId } = handle
  if (audiences.length === 0) return []
  const rows = await selectAll<{ audience: string; object_id: string; video_ids: string[] | null }>(() =>
    client.from(TABLE_EVIDENCE_REFS).select('audience, object_id, video_ids')
      .eq('client_id', clientId).eq('month', monthStartOf(month)).eq('object_kind', 'theme').in('audience', [...audiences])
      .order('audience').order('object_id'),
  ).catch((e: unknown) => { throw fail('themeRefs', e) })
  return rows.map((r) => ({ themeId: String(r.object_id), audience: String(r.audience), videoIds: (r.video_ids ?? []).map(String) }))
}

/** The tenant's active subjects, id → name. */
async function loadSubjectNames(handle: ReadingHandle): Promise<Map<string, string>> {
  const rows = await selectAll<{ id: string; name: string | null; status: string | null }>(() =>
    handle.client.from('subjects').select('id, name, status').eq('client_id', handle.clientId).order('id'),
  ).catch((e: unknown) => { throw fail('subjects', e) })
  return new Map(rows.filter((r) => r.status === 'active' && r.name).map((r) => [String(r.id), String(r.name)]))
}

/** Creator × conversation for one month, over the market's audiences unless
 *  others are named. */
export async function loadCreatorThemes(handle: ReadingHandle, input: { month: string; audiences?: readonly string[] }): Promise<CreatorThemes> {
  const audiences = input.audiences ?? (await loadMarketAudiences(handle))
  const [videos, refs] = await Promise.all([
    loadMarketVideos(handle, input.month, audiences),
    loadThemeRefs(handle, input.month, audiences),
  ])
  return creatorThemes({ month: input.month, videos, refs, audiences })
}

type Tracking = {
  competitor_names?: string[] | null
  competitor_keywords?: string[] | null
  own_handles?: Record<string, string> | null
  competitor_handles?: Record<string, Record<string, string>> | null
  watched_brands?: string[] | null
}

const norm = (s: string): string => s.trim().toLowerCase()

/** The tenant's brands as the brand read names them: the client (where it has
 *  a rule), each live tracked rival with a competitors row, each watched brand
 *  not already tracked. Null where the tenant has no brand rules. */
async function loadBrandRefs(handle: ReadingHandle): Promise<{ brands: BrandRef[]; tracking: Tracking; rivalKeys: Map<string, string> } | null> {
  const { client, clientId } = handle
  const rules = brandRulesFor(clientId)
  if (rules.length === 0) return null
  // `select('*')`: `watched_brands` arrives with MF3 and is an absent key, not
  // a 42703, where it has not.
  const [tcRes, compRes, nameRes] = await Promise.all([
    client.from('tracking_configs').select('*').eq('client_id', clientId).maybeSingle(),
    client.from('competitors').select('id, name, retired_at').eq('client_id', clientId),
    client.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
  ])
  if (tcRes.error) throw fail('tracking', tcRes.error)
  if (compRes.error) throw fail('competitors', compRes.error)
  if (nameRes.error) throw fail('clients', nameRes.error)
  const tracking = (tcRes.data ?? {}) as Tracking
  const live = new Map(((compRes.data ?? []) as { id: string; name: string; retired_at: string | null }[])
    .filter((c) => !c.retired_at).map((c) => [norm(c.name), String(c.id)]))
  const company = ((nameRes.data as { company_name?: string | null } | null)?.company_name ?? '').trim()
  const clientRule = rules.find((r) => r.key.kind === 'client')
  // The hand check is keyed by the name the rule reads ("Sealand"), which is
  // not always the company's name as stored.
  const brands: BrandRef[] = []
  if (clientRule) brands.push({ brandKey: 'client', label: company || clientRule.brand, countState: brandCountState(clientId, clientRule.brand) })
  const rivalKeys = new Map<string, string>()
  for (const name of tracking.competitor_names ?? []) {
    const id = live.get(norm(name))
    if (!id || rivalKeys.has(norm(name))) continue
    rivalKeys.set(norm(name), id)
    brands.push({ brandKey: id, label: name, countState: brandCountState(clientId, name) })
  }
  for (const name of [...new Set((tracking.watched_brands ?? []).map((n) => n.trim()).filter(Boolean))]) {
    if (rivalKeys.has(norm(name))) continue
    brands.push({ brandKey: watchedKey(name), label: name, countState: brandCountState(clientId, name) })
  }
  return { brands, tracking, rivalKeys }
}

/**
 * Each brand's month video sets (`brandMonthVideos`) off the stored mention
 * rows, the month's market, whose own posts each video is, and what our rival
 * searches found: the reads Competitive's live count makes. Null where the
 * tenant has no brand rules (Össur until T15).
 */
export async function loadBrandMonthVideos(handle: ReadingHandle, input: { month: string; audiences?: readonly string[] }): Promise<BrandMonthVideos[] | null> {
  const { client, clientId } = handle
  const refs = await loadBrandRefs(handle)
  if (!refs) return null
  const audiences = input.audiences ?? (await loadMarketAudiences(handle))
  const [mentions, market, owned, rivalFound] = await Promise.all([
    selectAll<MentionRowIn>(() =>
      client.from('brand_mentions').select('video_id, brand_key, source, comment_id, comment_month, method, rule_version')
        .eq('client_id', clientId).order('id'),
    ).catch((e: unknown) => { throw fail('brandMentions', e) }),
    loadMarketVideos(handle, input.month, audiences),
    selectAll<IdentityRow>(() =>
      client.from('videos').select('id, platform, source, account_name, is_client, is_competitor, competitor_name')
        .eq('client_id', clientId).in('source', ['owned', 'competitor_owned']).order('id'),
    ).catch((e: unknown) => { throw fail('ownedVideos', e) }),
    readRivalFound(client, clientId, refs.tracking.competitor_keywords),
  ])
  const ownerOf = ownerOfVideos({
    rows: new Map(market.map((v) => [v.id, v])),
    owned,
    ownHandles: refs.tracking.own_handles ?? null,
    competitorHandles: refs.tracking.competitor_handles ?? null,
    rivalKey: refs.rivalKeys,
  })
  return brandMonthVideos({
    month: input.month,
    brands: refs.brands,
    mentions: countedMentions(mentions),
    market: market.map((v) => ({ videoId: v.id, audience: v.audience })),
    ownerOf,
    rivalFound: rivalFound.videos,
  })
}

/**
 * Brand × kind and brand × subject for one month: each brand's month videos
 * (`base`, organic by default: the videos that named it unprompted), read
 * through `lens_readings` cut to those videos, one call per brand
 * (`brandKeys` narrows them, e.g. to the one brand a panel opens). A brand
 * with no video this month is not called and reads n 0. Null where the tenant
 * has no brand rules.
 */
export async function loadBrandCrosses(
  handle: ReadingHandle,
  input: { month: string; base?: BrandBase; brandKeys?: readonly string[]; audiences?: readonly string[] },
): Promise<{ videos: BrandMonthVideos[]; kinds: BrandCrossRow[]; subjects: BrandCrossRow[] } | null> {
  const base: BrandBase = input.base ?? 'organic'
  const month = monthStartOf(input.month)
  const all = await loadBrandMonthVideos(handle, { month, audiences: input.audiences })
  if (!all) return null
  const wanted = input.brandKeys ? new Set(input.brandKeys) : null
  const videos = all.filter((b) => !wanted || wanted.has(b.brandKey))
  const [lens, subjectNames] = await Promise.all([
    mapWithLimit([...videos], LENS_CONCURRENCY, async (b): Promise<BrandLens> => {
      const ids = b[base]
      // NEVER an empty or null set: `p_video_ids` null reads the whole market.
      if (ids.length === 0) return { brandKey: b.brandKey, label: b.label, base, rows: [] }
      const rows = await selectAll<LensRowIn>(() =>
        handle.client.rpc(RPC_LENS_READINGS, {
          p_client: handle.clientId, p_month: month, p_run: null, p_video_ids: ids, p_min_dated_comments: 1, p_captured_before: null,
        }).order('audience').order('object_kind').order('object_id'),
      ).catch((e: unknown) => { throw fail('lens', e) })
      return { brandKey: b.brandKey, label: b.label, base, rows }
    }),
    loadSubjectNames(handle),
  ])
  return { videos, kinds: brandKinds(month, lens), subjects: brandSubjects(month, lens, subjectNames) }
}

/**
 * Each brand's named-unprompted level this month and last, with its verdict
 * (`brandMonthPair`), off `month_brand_readings`. The month-pair judge is the
 * page's (`loadPairOn`) unless one is passed. Null where the tenant has no
 * brand rules.
 */
export async function loadBrandMonthPairs(
  handle: ReadingHandle,
  input: { month: string; now: string; pair?: PairOn; audiences?: readonly string[] },
): Promise<BrandPair[] | null> {
  const refs = await loadBrandRefs(handle)
  if (!refs) return null
  const month = monthStartOf(input.month)
  const [audiences, rows, pair] = await Promise.all([
    input.audiences ? Promise.resolve([...input.audiences]) : loadMarketAudiences(handle),
    selectAll<StoredBrandMonthRow>(() =>
      handle.client.from('month_brand_readings').select('month, audience, brand_key, k_any, k_organic, n, n_organic')
        .eq('client_id', handle.clientId).in('month', [prevMonth(month), month]).order('month').order('audience').order('brand_key'),
    ).catch((e: unknown) => { throw fail('brandReadings', e) }),
    input.pair ? Promise.resolve(input.pair) : loadPairOn(handle, input.now),
  ])
  return brandMonthPair({ month, brands: refs.brands, rows, audiences, pair })
}

type EvidenceRow = {
  id: string
  audience_insight_id: string
  comment_id: string | null
  comments: { comment_date: string | null; platform: string; video_id: string } | { comment_date: string | null; platform: string; video_id: string }[] | null
}

/**
 * Group × subject for one month: the latest profile's groups, their evidence
 * comments dated in the month (the month filter is the database's, on the
 * embedded comment), their insights' subject memberships, the active
 * subjects' names, and the month's market videos (the base). Null where the
 * tenant has no profile. Today's groups, this month's videos: see the Groups
 * section above.
 */
export async function loadGroupSubjects(
  handle: ReadingHandle,
  input: { month: string; audiences?: readonly string[] },
): Promise<{ runId: string | null; runDate: string | null; videos: GroupMonthVideos[]; groups: GroupSubjectRow[] } | null> {
  const { client, clientId } = handle
  const month = monthStartOf(input.month)
  const profileRes = await client.from('consumer_profiles').select('personas, run_id, run_date')
    .eq('client_id', clientId).order('run_date', { ascending: false }).limit(1).maybeSingle()
  if (profileRes.error) throw fail('profile', profileRes.error)
  const profile = profileRes.data as { personas: unknown; run_id: string | null; run_date: string | null } | null
  if (!profile) return null
  const personas: GroupPersona[] = (Array.isArray(profile.personas) ? profile.personas : [])
    .map((p) => normalisePersona(p as Partial<Persona>))
    .filter((p): p is Persona => p != null)
    .map((p) => ({ key: p.key, name: p.name, insightIds: [...new Set(p.insightIds)] }))
  const ids = [...new Set(personas.flatMap((p) => p.insightIds))]
  const audiences = input.audiences ?? (await loadMarketAudiences(handle))
  const from = `${month}T00:00:00.000Z`
  const to = `${nextMonth(month)}T00:00:00.000Z`
  const parts = chunk(ids, UUID_IN_CHUNK)
  const [evidencePages, membershipPages, subjects, market] = await Promise.all([
    mapWithLimit(parts, READ_CONCURRENCY, (part) =>
      selectAll<EvidenceRow>(() =>
        client.from('insight_evidence')
          .select('id, audience_insight_id, comment_id, comments!inner(comment_date, platform, video_id)')
          .in('audience_insight_id', part).eq('source', 'comment')
          .gte('comments.comment_date', from).lt('comments.comment_date', to)
          .order('id'),
      ),
    ).catch((e: unknown) => { throw fail('groupEvidence', e) }),
    mapWithLimit(parts, READ_CONCURRENCY, (part) =>
      selectAll<{ subject_id: string; audience_insight_id: string }>(() =>
        client.from('subject_memberships').select('subject_id, audience_insight_id')
          .eq('client_id', clientId).eq('member', true).in('audience_insight_id', part)
          .order('subject_id').order('audience_insight_id'),
      ),
    ).catch((e: unknown) => { throw fail('groupMemberships', e) }),
    loadSubjectNames(handle),
    loadMarketVideos(handle, month, audiences),
  ])
  const evidence: GroupEvidence[] = evidencePages.flat().flatMap((r) => {
    const c = Array.isArray(r.comments) ? r.comments[0] : r.comments
    if (!c || !r.comment_id) return []
    return [{ insightId: String(r.audience_insight_id), commentId: String(r.comment_id), platform: c.platform, platformVideoId: String(c.video_id), commentDate: c.comment_date }]
  })
  const memberships: GroupMembership[] = membershipPages.flat().map((r) => ({ subjectId: String(r.subject_id), insightId: String(r.audience_insight_id) }))
  const marketMap = new Map(market.map((v) => [commentVideoKey(v.platform, v.platformVideoId), v.id]))
  return {
    runId: profile.run_id,
    runDate: profile.run_date,
    videos: groupMonthVideos({ month, personas, evidence, market: marketMap }),
    groups: groupSubjects({ month, personas, evidence, memberships, subjects, market: marketMap }),
  }
}

/** A conversation's platform split for one month (`themePlatforms`), off the
 *  stored month row, over the category unless other audiences are named
 *  (themes are grouped within the category, lib/reading/market.ts). */
export async function loadThemePlatforms(
  handle: ReadingHandle,
  input: { themeId: string; month: string; audiences?: readonly string[] },
): Promise<ThemePlatforms | null> {
  const audiences = input.audiences ?? [INDUSTRY_AUDIENCE]
  const res = await handle.client.from(TABLE_THEME_READINGS).select('audience, videos, platform_mix')
    .eq('client_id', handle.clientId).eq('month', monthStartOf(input.month)).eq('theme_id', input.themeId).in('audience', [...audiences])
  if (res.error) throw fail('themePlatforms', res.error)
  return themePlatforms({ themeId: input.themeId, month: input.month, rows: (res.data ?? []) as ThemePlatformRow[], audiences })
}

/** Months a conversation's line reads back, `month` included. */
export const THEME_LINE_MONTHS = 12

/**
 * A conversation's month line (`themeMonthLine`) over one audience, the
 * category unless another is named, read through `loadMonthSeries`. The
 * month-pair judge is the page's (`loadPairOn`) unless one is passed. Null
 * where the month tables are not there or not seeded, which is "not
 * recorded", never "nothing was said".
 */
export async function loadThemeMonthLine(
  handle: ReadingHandle,
  input: { themeId: string; month: string; now: string; months?: number; audience?: string; pair?: PairOn },
): Promise<ThemeMonthLine | null> {
  const month = monthStartOf(input.month)
  let from = month
  for (let i = 1; i < (input.months ?? THEME_LINE_MONTHS); i++) from = prevMonth(from)
  const audience = input.audience ?? INDUSTRY_AUDIENCE
  const [set, pair] = await Promise.all([
    loadMonthSeries(handle.client, handle.clientId, { audiences: [audience], objectKind: 'theme', objectIds: [input.themeId], from, to: month }),
    input.pair ? Promise.resolve(input.pair) : loadPairOn(handle, input.now),
  ])
  if (set.substrate !== 'seeded' || set.numeratorSubstrate !== 'seeded') return null
  const series = set.series.find((s) => s.objectId === input.themeId)
  return series ? themeMonthLine(series, month, pair) : null
}
