import type { SupabaseClient } from '@supabase/supabase-js'

import { BRAND_RULE_VERSION, brandRulesFor } from '../brands/aliases'
import { foundOnlyByOf, monthBrandCounts, termBrand, type PlannedMention } from '../brands/mentions'
import { ownerOfVideos, type IdentityRow } from '../brands/owners'
import { chunk, UUID_IN_CHUNK } from '../chunk'
import { monthStartOf, nextMonth } from '../reading/month-key'
import { selectAll } from '../supabase-admin'
import { buildBrandsBlock, type BrandsRead } from './overview-market/brands'

// Your market's brands block, read (market-first WP2.6): the month's market
// videos (MF1 `market_month_videos`), the mention layer (`brand_mentions`, MF2,
// written by scripts/brand-mentions.ts), whose own posts the matched videos
// are, and how each matched video was first found. The counts are the
// script's own (`monthBrandCounts`), so the page and the script's report print
// one figure. The block decides what prints (`buildBrandsBlock`).
//
// THE READS (Sealand): the market (1), the mention rows (1), tracking_configs
// (1), competitors (1), the own posts' accounts (1), and per 250 matched
// videos their identity (1) and their first-found terms (1): about 7.
//
// FAILS CLOSED, NEVER A 0. A tenant with no brand rules (Össur) or a month
// whose market cannot be read gets no block (the page keeps deploy 2's line).
// A mention layer that cannot be read (MF2 not applied) reads as no rows, so
// every brand prints "not counted yet".

export const TABLE_BRAND_MENTIONS = 'brand_mentions'

interface MentionRow {
  video_id: string
  brand_key: string
  source: 'content' | 'comment'
  comment_month: string | null
}

const norm = (s: string): string => s.trim().toLowerCase()

const missing = (error: unknown, name: string): boolean => {
  const text = error instanceof Error ? error.message : String((error as { message?: string } | null)?.message ?? error)
  return text.includes(name) && /schema cache|does not exist|Could not find/i.test(text)
}

const say = (what: string, error: unknown): void => {
  console.error(`[overview] brands ${what}: ${(error as { message?: string } | null)?.message ?? String(error)}`)
}

async function marketIds(client: SupabaseClient, clientId: string, month: string): Promise<string[] | null> {
  try {
    const rows = await selectAll<{ video_id: string }>(() =>
      client.rpc('market_month_videos', { p_client: clientId, p_month: month }).order('video_id'))
    return rows.map((r) => String(r.video_id))
  } catch (error) {
    if (!missing(error, 'market_month_videos')) say('market_month_videos', error)
    return null
  }
}

async function mentionRows(client: SupabaseClient, clientId: string): Promise<MentionRow[]> {
  try {
    const rows = await selectAll<MentionRow>(() =>
      client.from(TABLE_BRAND_MENTIONS).select('video_id, brand_key, source, comment_month')
        .eq('client_id', clientId).eq('rule_version', BRAND_RULE_VERSION).order('id'))
    return rows.map((r) => ({ ...r, video_id: String(r.video_id), comment_month: r.comment_month ? monthStartOf(String(r.comment_month)) : null }))
  } catch (error) {
    if (!missing(error, TABLE_BRAND_MENTIONS)) say(TABLE_BRAND_MENTIONS, error)
    return []
  }
}

const IDENTITY = 'id, platform, source, account_name, is_client, is_competitor, competitor_name, upload_date'
type Identity = IdentityRow & { upload_date: string | null }

/** Identity and upload date of the matched videos. */
async function identities(client: SupabaseClient, clientId: string, ids: readonly string[]): Promise<Map<string, Identity>> {
  const out = new Map<string, Identity>()
  for (const part of chunk(ids, UUID_IN_CHUNK)) {
    const res = await client.from('videos').select(IDENTITY).eq('client_id', clientId).in('id', part)
    if (res.error) throw new Error(`videos: ${res.error.message}`)
    for (const r of (res.data ?? []) as Identity[]) out.set(String(r.id), r)
  }
  return out
}

/** The matched videos' first-found terms (MF1 `video_provenance`); an empty
 *  map where the table is not there (every video then reads as organic). */
async function firstTerms(client: SupabaseClient, clientId: string, ids: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  try {
    for (const part of chunk(ids, UUID_IN_CHUNK)) {
      const res = await client.from('video_provenance').select('video_id, first_terms').eq('client_id', clientId).in('video_id', part)
      if (res.error) throw res.error
      for (const r of (res.data ?? []) as { video_id: string; first_terms: string[] | null }[]) out.set(String(r.video_id), r.first_terms ?? [])
    }
  } catch (error) {
    if (!missing(error, 'video_provenance')) say('video_provenance', error)
    return new Map()
  }
  return out
}

/**
 * The block for the reading month, or null where the page keeps deploy 2's
 * line: a tenant with no brand rules, or a month whose market cannot be read.
 */
export async function loadBrandsBlock(client: SupabaseClient, clientId: string, month: string): Promise<BrandsRead | null> {
  const rules = brandRulesFor(clientId)
  if (rules.length === 0) return null
  const m = monthStartOf(month)
  const [market, mentions, tcRes, compRes, owned] = await Promise.all([
    marketIds(client, clientId, m),
    mentionRows(client, clientId),
    client.from('tracking_configs').select('competitor_names, own_handles, competitor_handles').eq('client_id', clientId).maybeSingle(),
    client.from('competitors').select('id, name, retired_at').eq('client_id', clientId),
    selectAll<IdentityRow>(() => client.from('videos').select('id, platform, source, account_name, is_client, is_competitor, competitor_name')
      .eq('client_id', clientId).in('source', ['owned', 'competitor_owned']).order('id')),
  ])
  if (market == null) return null
  if (tcRes.error) throw new Error(`tracking_configs: ${tcRes.error.message}`)
  if (compRes.error && !missing(compRes.error, 'competitors')) throw new Error(`competitors: ${compRes.error.message}`)
  const tc = (tcRes.data ?? {}) as { competitor_names?: string[] | null; own_handles?: Record<string, string> | null; competitor_handles?: Record<string, Record<string, string>> | null }

  // The tracked rivals, by identity (`competitors.id`), in the tenant's order;
  // a rival with no rule is still listed, and prints "not counted yet".
  const live = new Map(((compRes.data ?? []) as { id: string; name: string; retired_at: string | null }[])
    .filter((c) => !c.retired_at).map((c) => [norm(c.name), String(c.id)]))
  const rivals = (tc.competitor_names ?? []).flatMap((name) => {
    const id = live.get(norm(name))
    return id ? [{ name, brandKey: id }] : []
  })
  const ruleOf = new Map(rules.filter((r) => r.key.kind === 'rival').map((r) => [norm((r.key as { name: string }).name), r]))
  const clientRule = rules.find((r) => r.key.kind === 'client') ?? null
  const ruled = [
    ...(clientRule ? [{ rule: clientRule, brandKey: 'client' }] : []),
    ...rivals.flatMap((r) => (ruleOf.get(norm(r.name)) ? [{ rule: ruleOf.get(norm(r.name))!, brandKey: r.brandKey }] : [])),
  ]

  // Whose own post each matched video is, and how it was first found.
  const matched = [...new Set(mentions.map((r) => r.video_id))].sort()
  const [rows, terms] = await Promise.all([identities(client, clientId, matched), firstTerms(client, clientId, matched)])
  const ownerOf = ownerOfVideos({
    rows,
    owned,
    ownHandles: tc.own_handles ?? null,
    competitorHandles: tc.competitor_handles ?? null,
    rivalKey: new Map(rivals.map((r) => [norm(r.name), r.brandKey])),
  })
  const allTerms = new Set([...terms.values()].flat().map(norm))
  const foundOnlyBy = foundOnlyByOf(terms, new Map([...allTerms].map((t) => [t, termBrand(t, ruled)])))

  // The month's counts, by the script's own function.
  const planned: PlannedMention[] = mentions.map((r) => ({
    brand: r.brand_key,
    excerpt: null,
    row: { client_id: clientId, video_id: r.video_id, brand_key: r.brand_key, source: r.source, field: null, comment_id: null, comment_month: r.comment_month, method: 'rule', rule_version: BRAND_RULE_VERSION },
  }))
  const counts = monthBrandCounts(planned, rivals.map((r) => ({ brand: r.name, brandKey: r.brandKey })), {
    markets: new Map([[m, market]]),
    ownerOf,
    foundOnlyBy,
  })
  const withRows = new Set(mentions.map((r) => r.brand_key))

  // Your name: the market's videos naming you, and your own posts dated in the
  // month that name you (uploaded in it, or named in a comment dated in it).
  const inMarket = new Set(market)
  const mine = mentions.filter((r) => r.brand_key === 'client' && (r.source === 'content' || r.comment_month === m))
  const outside = [...new Set(mine.filter((r) => inMarket.has(r.video_id) && ownerOf(r.video_id) !== 'client').map((r) => r.video_id))].sort()
  const commentedIn = new Set(mine.filter((r) => r.source === 'comment').map((r) => r.video_id))
  const inMonth = (id: string): boolean => {
    const up = rows.get(id)?.upload_date
    return commentedIn.has(id) || (up != null && up >= m && up < nextMonth(m))
  }
  const ownPosts = new Set(mine.filter((r) => ownerOf(r.video_id) === 'client' && inMonth(r.video_id)).map((r) => r.video_id)).size

  return buildBrandsBlock({
    clientId,
    month: m,
    n: market.length,
    rivals: rivals.map((r) => {
      const c = counts.find((x) => x.brandKey === r.brandKey)
      return { brandKey: r.brandKey, label: r.name, hasRows: withRows.has(r.brandKey), kAny: c?.kAny ?? 0, kOrganic: c?.kOrganic ?? 0 }
    }),
    name: { hasRows: withRows.has('client'), outside, ownPosts },
  })
}
