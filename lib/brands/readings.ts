import type { SupabaseClient } from '@supabase/supabase-js'

import { normAccount, ownAccountNames } from '../gather/owned'
import type { MonthVideo } from '../provenance/searches'
import { chunkByAudienceMonth, mergeMonthRows, monthStartOf, type MergeResult } from '../reading/monthly'
import type { StoredFreeze } from '../reading/types'
import { selectAll } from '../supabase-admin'
import {
  barePattern, BRAND_RULE_VERSION, brandPattern, brandRulesFor, WATCHED_RULE_VERSION, watchedKey, watchedRule,
  type BrandRule, type RegexEngine,
} from './aliases'
import {
  monthBrandCounts, ownPostMentions, planMentions,
  type BrandCandidates, type Candidate, type MentionPlan, type MentionRow, type MonthBrandCount, type PlannedMention,
} from './mentions'

// Brand topics as month rows (market-first decision E; plan WP3.5, deploy 4).
// ONE COPY of the brand read, shared by scripts/brand-mentions.ts (the paste,
// and the one back-read of June to September) and the pipeline's
// `brand-readings` step: which brands a tenant has (its tracked rivals with a
// rule, the client, and the operator's watched brands), their candidates
// (brand_mention_candidates, MF2), the rows the rules give (lib/brands/mentions.ts
// planMentions), whose own posts each video is, and each month's market.
//
// month_brand_readings (MF3), per month, audience and brand: of the market's
// videos in that audience-month (n), those the brand comes up in (k_any), in
// the content (k_content), in a comment dated in the month (k_comment), and
// k_any and n leaving out every video ANY of our rival searches found, current
// and retired (k_organic, n_organic): one base for every brand in the month,
// as the page and scripts/brand-mentions.ts count it (decision E, the
// research's F37, the 27 Sep ruling; lib/brands/rival-searches.ts). The
// brand's own posts are its posts, never the market naming it: they sit in n
// and never in k. Per audience; the reader pools (decision E), and the pooled
// rows equal monthBrandCounts.

export const BRAND_READINGS_TABLE = 'month_brand_readings'
export const BRAND_READINGS_ON_CONFLICT = 'client_id,month,audience,brand_key'

export interface Tracking {
  competitor_names: string[] | null
  competitor_keywords: string[] | null
  competitor_handles: Record<string, Record<string, string>> | null
  own_handles: Record<string, string> | null
  brand_keywords: string[] | null
  /** MF3's operator column; absent before MF3. */
  watched_brands?: string[] | null
}

export interface IdentityRow {
  id: string; platform: string; video_id: string; source: string | null; account_name: string | null
  is_client: boolean | null; is_competitor: boolean | null; competitor_name: string | null
}

export interface ReadBrand { rule: BrandRule; brandKey: string; ruleVersion: string }

const norm = (s: string) => s.trim().toLowerCase()

/** The tenant's brands: the client, each tracked rival with a live
 *  competitors row and a rule, and each watched brand; and a line for each
 *  one skipped. PURE. */
export function brandsOf(clientId: string, tracking: Tracking, competitors: readonly { id: string; name: string; retired_at: string | null }[]): { brands: ReadBrand[]; lines: string[] } {
  const rules = brandRulesFor(clientId)
  const lines: string[] = []
  const tracked = new Set((tracking.competitor_names ?? []).map(norm))
  const live = new Map(competitors.filter((c) => !c.retired_at).map((c) => [norm(c.name), c.id]))
  const brands: ReadBrand[] = []
  for (const rule of rules) {
    if (rule.key.kind === 'client') { brands.push({ rule, brandKey: 'client', ruleVersion: BRAND_RULE_VERSION }); continue }
    const id = live.get(norm(rule.key.name))
    if (!id || !tracked.has(norm(rule.key.name))) {
      lines.push(`  ${rule.brand}: not a tracked rival with a live competitors row here; skipped`)
      continue
    }
    brands.push({ rule, brandKey: id, ruleVersion: BRAND_RULE_VERSION })
  }
  const ruled = new Set(rules.filter((r) => r.key.kind === 'rival').map((r) => norm(r.key.kind === 'rival' ? r.key.name : '')))
  for (const name of tracking.competitor_names ?? []) {
    if (!ruled.has(norm(name))) lines.push(`  ${name}: tracked, but lib/brands/aliases.ts has no rule for it: not counted`)
  }
  // A tenant with no rules at all reads no watched brand either: the rules
  // are switched on per tenant (Össur, paused, has none).
  if (rules.length > 0) {
    const named = new Set([...brands.map((b) => norm(b.rule.brand)), ...(tracking.competitor_names ?? []).map(norm)])
    for (const name of [...new Set((tracking.watched_brands ?? []).map((n) => n.trim()).filter(Boolean))]) {
      if (named.has(norm(name))) { lines.push(`  ${name}: watched, but already counted as a tracked brand; skipped`); continue }
      const rule = watchedRule(name)
      if (!rule) { lines.push(`  ${name}: watched, but not a name the matcher can read as it stands; skipped`); continue }
      brands.push({ rule, brandKey: watchedKey(name), ruleVersion: WATCHED_RULE_VERSION })
    }
  }
  return { brands, lines }
}

/** Whose own post each video is ('client' | a rival's brand key | null): by
 *  source, then by the account the census reads (lib/gather/owned.ts). */
export function ownerOfFrom(args: {
  owned: IdentityRow[]
  rowsById: ReadonlyMap<string, IdentityRow>
  tracking: Tracking
  brands: readonly ReadBrand[]
}): (videoId: string) => string | null {
  const keyOfRival = new Map(args.brands.filter((b) => b.rule.key.kind === 'rival').map((b) => [norm(b.rule.brand), b.brandKey]))
  const clientNames = ownAccountNames(args.owned, args.tracking.own_handles ?? {}, { source: 'owned' })
  const rivalNames = Object.entries(args.tracking.competitor_handles ?? {}).map(([name, handles]) =>
    ({ key: keyOfRival.get(norm(name)) ?? null, names: ownAccountNames(args.owned, handles ?? {}, { source: 'competitor_owned', competitorName: name }) }))
  return (videoId: string): string | null => {
    const r = args.rowsById.get(videoId)
    if (!r) return null
    if (r.source === 'owned') return 'client'
    if (r.source === 'competitor_owned') return keyOfRival.get(norm(r.competitor_name ?? '')) ?? null
    const account = normAccount(r.account_name)
    if (!account) return null
    if (clientNames.get(r.platform)?.has(account)) return 'client'
    return rivalNames.find((x) => x.names.get(r.platform)?.has(account))?.key ?? null
  }
}

/** The reads the brand read makes. `engine` says which pattern the
 *  candidates take: 'are' for MF2's function, 'js' for the staging stand-in. */
export interface BrandReadIO {
  engine: RegexEngine
  tracking(): Promise<Tracking>
  competitors(): Promise<{ id: string; name: string; retired_at: string | null }[]>
  candidates(pattern: string, what: string): Promise<Candidate[]>
  ownedVideos(): Promise<IdentityRow[]>
  videosById(ids: readonly string[]): Promise<IdentityRow[]>
  monthVideos(month: string): Promise<MonthVideo[] | null>
  /** Our rival searches, current and retired, and the videos they found
   *  (lib/brands/rival-searches.ts readRivalFound, the read the page makes):
   *  every brand's organic count leaves those videos out. `configured` is the
   *  tenant's competitor_keywords now. */
  rivalFound(configured: readonly string[] | null | undefined): Promise<{ terms: ReadonlySet<string>; videos: ReadonlySet<string> }>
}

export interface BrandRead {
  brands: ReadBrand[]
  perBrand: BrandCandidates[]
  plan: MentionPlan
  ownerOf: (videoId: string) => string | null
  markets: Map<string, MonthVideo[]>
  /** Our rival searches, current and retired (trimmed, lowercased). */
  rivalTerms: ReadonlySet<string>
  /** The videos any of them found: out of every brand's organic base. */
  rivalFound: ReadonlySet<string>
  counts: MonthBrandCount[]
  own: Map<string, number>
  lines: string[]
}

const monthsIn = (from: string, to: string): string[] => {
  const out: string[] = []
  const d = new Date(`${from.slice(0, 7)}-01T00:00:00Z`)
  while (d.toISOString().slice(0, 10) < to) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCMonth(d.getUTCMonth() + 1)
  }
  return out
}

/** Read the brands over the window [from, to) (firsts of months). */
export async function readBrands(clientId: string, io: BrandReadIO, window: { from: string; to: string }): Promise<BrandRead | null> {
  if (brandRulesFor(clientId).length === 0) return null
  const tracking = await io.tracking()
  const { brands, lines } = brandsOf(clientId, tracking, await io.competitors())
  const perBrand: BrandCandidates[] = []
  for (const b of brands) {
    const hits = await io.candidates(brandPattern(b.rule, io.engine), `${b.rule.brand}'s candidates`)
    const bareP = barePattern(b.rule, io.engine)
    const bare = bareP ? await io.candidates(bareP, `${b.rule.brand}'s bare name`) : null
    perBrand.push({ rule: b.rule, brandKey: b.brandKey, hits, bare })
  }
  // One plan per rule version: a watched brand's rows carry its own.
  const versions = [...new Set(brands.map((b) => b.ruleVersion))]
  const plans = versions.map((v) => planMentions(clientId, v, perBrand.filter((p) => brands.find((b) => b.brandKey === p.brandKey)?.ruleVersion === v)))
  const plan: MentionPlan = {
    mentions: plans.flatMap((p) => p.mentions),
    homonymVideos: new Map(plans.flatMap((p) => [...p.homonymVideos])),
    dropped: plans.flatMap((p) => p.dropped),
  }

  const matched = [...new Set(plan.mentions.map((m) => m.row.video_id))]
  const owned = await io.ownedVideos()
  const rowsById = new Map<string, IdentityRow>()
  for (let i = 0; i < matched.length; i += 100) for (const r of await io.videosById(matched.slice(i, i + 100))) rowsById.set(r.id, r)
  const ownerOf = ownerOfFrom({ owned, rowsById, tracking, brands })

  const markets = new Map<string, MonthVideo[]>()
  for (const m of monthsIn(window.from, window.to)) {
    const set = await io.monthVideos(m)
    if (set) markets.set(m, set)
  }
  const rival = await io.rivalFound(tracking.competitor_keywords)
  const counts = monthBrandCounts(plan.mentions, brands.map((b) => ({ brand: b.rule.brand, brandKey: b.brandKey })), {
    markets: new Map([...markets].map(([m, vs]) => [m, vs.map((v) => v.id)])), ownerOf, rivalFound: rival.videos,
  })
  return { brands, perBrand, plan, ownerOf, markets, rivalTerms: rival.terms, rivalFound: rival.videos, counts, own: ownPostMentions(plan.mentions, ownerOf), lines }
}

// ---- the month rows -------------------------------------------------------------

export interface BrandReadingRow {
  client_id: string
  month: string
  audience: string
  brand_key: string
  k_any: number
  k_content: number
  k_comment: number
  k_organic: number
  n: number
  n_organic: number
  rule_version: string
}

/**
 * The month_brand_readings rows of a read: for every month, every audience
 * of its market and every brand, including the zeros (so n pools whole).
 * `counted` drops a mention a confirm rejected (BRAND_CONFIRM_ENABLED; with it
 * off every rule match counts). PURE.
 */
export function brandReadingRows(clientId: string, read: Pick<BrandRead, 'brands' | 'plan' | 'ownerOf' | 'markets' | 'rivalFound'>, counted: (m: PlannedMention) => boolean = () => true): BrandReadingRow[] {
  const out: BrandReadingRow[] = []
  const mentions = read.plan.mentions.filter(counted)
  for (const [month, videos] of [...read.markets].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const audiences = [...new Set(videos.map((v) => v.audience))].sort()
    for (const b of read.brands) {
      const mine = mentions.filter((m) => m.row.brand_key === b.brandKey)
      const content = new Set(mine.filter((m) => m.row.source === 'content').map((m) => m.row.video_id))
      const comment = new Set(mine.filter((m) => m.row.source === 'comment' && m.row.comment_month === month).map((m) => m.row.video_id))
      for (const audience of audiences) {
        const ids = videos.filter((v) => v.audience === audience).map((v) => v.id)
        const notOwn = ids.filter((v) => read.ownerOf(v) !== b.brandKey)
        const any = notOwn.filter((v) => content.has(v) || comment.has(v))
        const organic = (v: string) => !read.rivalFound.has(v)
        out.push({
          client_id: clientId, month: monthStartOf(month), audience, brand_key: b.brandKey,
          k_any: any.length,
          k_content: notOwn.filter((v) => content.has(v)).length,
          k_comment: notOwn.filter((v) => comment.has(v)).length,
          k_organic: any.filter(organic).length,
          n: ids.length,
          n_organic: ids.filter(organic).length,
          rule_version: b.ruleVersion,
        })
      }
    }
  }
  return out
}

/** Pool a brand's month over the market's audiences. */
export function pooledBrandMonth(rows: readonly BrandReadingRow[], month: string, brandKey: string): Omit<BrandReadingRow, 'audience' | 'client_id' | 'rule_version'> {
  const mine = rows.filter((r) => r.brand_key === brandKey && monthStartOf(r.month) === monthStartOf(month) && r.audience !== 'client')
  const sum = (k: keyof BrandReadingRow) => mine.reduce((s, r) => s + (r[k] as number), 0)
  return {
    month: monthStartOf(month), brand_key: brandKey,
    k_any: sum('k_any'), k_content: sum('k_content'), k_comment: sum('k_comment'), k_organic: sum('k_organic'), n: sum('n'), n_organic: sum('n_organic'),
  }
}

export const brandReadingKey = (r: { month: string; audience: string; brand_key: string }): string => `${monthStartOf(r.month)}|${r.audience}|${r.brand_key}`

type StoredBrand = { month: string; audience: string; brand_key: string; status: 'filling' | 'frozen'; origin: 'live' | 'back_read'; frozen_at: string | null }

export const toStoredBrand = (rows: readonly StoredBrand[]): StoredFreeze[] =>
  rows.map((r) => ({ key: brandReadingKey(r), month: monthStartOf(r.month), audience: r.audience, objectId: r.brand_key, status: r.status, origin: r.origin, frozen_at: r.frozen_at ?? null }))

/** The month tables' merge (lib/reading/monthly.ts): a frozen row kept, a
 *  month that freezes now written frozen, a stale filling row dropped, and a
 *  new key in a closed audience-month that already holds brand rows refused. */
export function mergeBrandRows(args: { months: readonly string[]; fresh: readonly BrandReadingRow[]; stored: readonly StoredFreeze[]; now: string; runId: string | null; closedAudienceMonths?: readonly string[] }): MergeResult<BrandReadingRow> {
  return mergeMonthRows<BrandReadingRow>({ ...args, keyOf: brandReadingKey })
}

export function isMissingBrandReadings(e: unknown): boolean {
  const text = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)
  return text.includes(BRAND_READINGS_TABLE) && /schema cache|does not exist|Could not find/i.test(text)
}

export async function storedBrandRows(admin: SupabaseClient, clientId: string, months: readonly string[]): Promise<StoredFreeze[] | null> {
  if (months.length === 0) return []
  try {
    const rows = await selectAll<StoredBrand>(() => admin.from(BRAND_READINGS_TABLE)
      .select('month, audience, brand_key, status, origin, frozen_at').eq('client_id', clientId).in('month', [...months])
      .order('month').order('audience').order('brand_key'))
    return toStoredBrand(rows)
  } catch (e) {
    if (isMissingBrandReadings(e)) return null
    throw e
  }
}

export async function writeBrandRows(admin: SupabaseClient, clientId: string, merged: MergeResult<BrandReadingRow>): Promise<{ written: number; deleted: number }> {
  let written = 0
  for (const part of chunkByAudienceMonth(merged.writes, 500)) {
    const { error } = await admin.from(BRAND_READINGS_TABLE).upsert(part, { onConflict: BRAND_READINGS_ON_CONFLICT })
    if (error) throw new Error(`${BRAND_READINGS_TABLE} upsert: ${(error as { message?: string }).message ?? String(error)}`)
    written += part.length
  }
  let deleted = 0
  for (const s of merged.stale) {
    const { error } = await admin.from(BRAND_READINGS_TABLE).delete()
      .eq('client_id', clientId).eq('month', s.month).eq('audience', s.audience).eq('brand_key', s.objectId ?? '').eq('status', 'filling')
    if (error) throw new Error(`${BRAND_READINGS_TABLE} stale delete: ${error.message}`)
    deleted++
  }
  return { written, deleted }
}

/** The brand_mentions rows a read plans that the table does not hold yet
 *  (PostgREST cannot target the unique index's coalesce, MF2 seam). */
export const heldMentionFilter = (held: ReadonlySet<string>, keyOf: (r: MentionRow) => string) => (r: MentionRow): boolean => !held.has(keyOf(r))
