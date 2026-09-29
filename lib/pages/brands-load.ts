import type { SupabaseClient } from '@supabase/supabase-js'

import { BRAND_RULE_VERSION, brandRulesFor, WATCHED_RULE_VERSION, watchedKey } from '../brands/aliases'
import { monthBrandCounts, type PlannedMention } from '../brands/mentions'
import { ownerOfVideos, type IdentityRow } from '../brands/owners'
import { BRAND_READINGS_TABLE, isMissingBrandReadings } from '../brands/readings'
import { readRivalFound, withoutRivalSearches } from '../brands/rival-searches'
import { chunk, UUID_IN_CHUNK } from '../chunk'
import { COMPETITIVE_MIN_VIDEOS } from '../config'
import { readingOf, readTranslations } from '../quotes'
import { freezeBoundary } from '../reading/monthly'
import { monthStartOf, nextMonth, prevMonth } from '../reading/month-key'
import { BRANDS_PANEL, type PairOn } from '../reading/pairs'
import { nextSlot, scheduledUpdateAfter, windowEnd, type ReadingMonth } from '../reading/reading-month'
import { marketAudiences } from '../reading/market'
import { ownPostCensus, type OwnPostCensus } from '../reading/own-posts'
import { RPC_WINDOW_DENOMINATORS, RPC_WINDOW_KIND_READINGS, RPC_WINDOW_THEME_READINGS } from '../reading/types'
import type { ScheduleConfig } from '../pipeline/schedule-due'
import type { Quote } from '../renderables/types'
import { quoteRef } from '../renderables/quotes-freeze'
import { INDUSTRY_AUDIENCE, rivalKey } from '../rivals'
import { selectAll } from '../supabase-admin'
import {
  ASKED_PARAM, buildAsked, buildContent, buildFindings, buildInFull, buildNameBlock, buildPosts, buildShare, buildTopics,
  leadTheme, ninetyDays, recurrenceMonths,
  type BrandMonthIn, type BrandsPageData,
} from './brands'
import { fetchRunningRunIds } from './latest-video-run'
import { marketMonthIds } from './overview-brands'
import { pickQuotes, type QuoteCandidate } from './overview-market/voices'
import { gateFor, readQuoteContext } from '../quote-context'
import { pairChip } from './overview'
import type { PlaybookBlock } from './playbook'
import { fetchThemedRunId } from './themed-run'

// The Brands page's reads (market-first WP3.5, deploy 5). Everything the page
// adds to Competitive's loader, on the reading client (the service role, the
// tenant named on every read), each section failing on its own: a read that
// errors costs its block its figures and never the page.
//
// THE READS, per section (Sealand):
//   B1 the name and the brands: tracking_configs (2: the rivals, then MF3's
//      watched list, which fails soft before MF3), competitors, brand_mentions,
//      the reading month's and the month before's market (market_month_videos,
//      paged), month_brand_readings (MF3; the month rows deploy 4's
//      `brand-readings` step writes, read first), the own posts' identities,
//      the matched videos' identities per 250, and the rival searches and
//      what they found (3): about 12;
//   B2 window_denominators and window_kind_readings over the ninety days (2);
//   B3 month_kind_readings (1), the running and themed runs (2),
//      window_theme_readings (1), the run's observations of those themes (1);
//   B4 competitive_insights (1), the run's observations each finding cites
//      (one per finding), their audiences (1), month_evidence_refs (1), and the
//      reading month's quotes (insight_evidence, comments, videos,
//      translations: 4);
//   B5 the month's claims on the brands' own posts (1; the posts are
//      Competitive's census read, handed in);
//   B7 month_audience_stats (1) and attention_panels (1).
// B6 is the playbook Competitive already reads.

const say = (what: string, error: unknown): void => {
  console.error(`[pages] brands.${what}: ${(error as { message?: string } | null)?.message ?? String(error)}`)
}

const missing = (error: unknown, name: string): boolean => {
  const text = error instanceof Error ? error.message : String((error as { message?: string } | null)?.message ?? error)
  return text.includes(name) && /schema cache|does not exist|Could not find/i.test(text)
}

const norm = (s: string): string => s.trim().toLowerCase()

export interface BrandsLoadInput {
  db: SupabaseClient
  clientId: string
  reading: ReadingMonth
  now: string
  /** The tracked rivals (`competitors`, or the tracked list), retired ones
   *  included; only live ones are read. */
  rivals: readonly { name: string; retiredAt: string | null }[]
  /** Every stored `month_denominators` row, for the month the first panel
   *  freezes with. */
  denominators: readonly { month: string; audience: string; status: string }[]
  schedule: ScheduleConfig | null
  pair: PairOn | null
  params: Record<string, string | undefined>
  /** Competitive's census read of the month's own posts (every live rival's). */
  ownPosts: Promise<readonly OwnPostCensusInput[]>
  /** The month's playbook; B6 reads its category column. */
  playbook: Promise<PlaybookBlock | null>
  hrefFor: (rival: string) => string
}

/** One rival's census input, as Competitive's own-post read built it: the
 *  month's posts and the accounts they were read from. */
export type OwnPostCensusInput = Parameters<typeof ownPostCensus>[0]

export async function loadBrandsPage(input: BrandsLoadInput): Promise<BrandsPageData> {
  const month = monthStartOf(input.reading.month)
  const prev = prevMonth(month)
  const live = input.rivals.filter((r) => !r.retiredAt).map((r) => ({ name: r.name, audience: rivalKey(r.name) }))
  const window = ninetyDays(windowEnd(input.reading))

  // EVERY SECTION'S READS START TOGETHER. B3's question themes are a live
  // window reading (`window_theme_readings`, about four seconds a page on
  // staging), so they are read for every live brand at once, one page, beside
  // the rest, and the selected brand's list is taken after.
  const running = fetchRunningRunIds(input.db, input.clientId, 'brands').catch((e: unknown) => { say('running', e); return [] as string[] })
  const [b1, windowReads, findingsRaw, claims, share, questions] = await Promise.all([
    readBrandCounts(input, month, prev, live).catch((e: unknown) => { say('topics', e); return null }),
    readWindow(input.db, input.clientId, window).catch((e: unknown) => { say('window', e); return null }),
    running.then((r) => readFindings(input.db, input.clientId, month, live, r)).catch((e: unknown) => { say('findings', e); return [] as FindingRead[] }),
    readClaims(input.db, input.clientId, input.ownPosts).catch((e: unknown) => { say('claims', e); return null }),
    readShare(input, month, live).catch((e: unknown) => { say('share', e); return buildShare({ month, stats: null, rivals: live, startsWith: null }) }),
    running.then((r) => readQuestions(input.db, input.clientId, month, window, live, r)).catch((e: unknown) => { say('asked', e); return null }),
  ])

  const inFull = buildInFull({
    window,
    rivals: live,
    denominators: windowReads?.denominators ?? [],
    kinds: windowReads?.kinds ?? [],
    wanted: input.params.vs ?? null,
    hrefFor: input.hrefFor,
  })
  const selected = inFull.selected ? { name: inFull.selected.label, audience: inFull.selected.audience } : null
  const asked = selected && windowReads && questions
    ? buildAsked({
        rival: selected,
        window,
        month,
        questionVideos: windowReads.kinds.find((k) => k.audience === selected.audience && k.kind === 'question')?.videos ?? 0,
        months: questions.months.get(selected.audience) ?? [],
        themes: questions.themes.get(selected.audience) ?? [],
        all: input.params[ASKED_PARAM] === 'all',
      })
    : null

  const videosIn = new Map(inFull.rows.map((r) => [r.label, r.videos]))
  const findings = buildFindings({
    rivals: inFull.rows.map((r) => r.label),
    findings: findingsRaw,
    videos: videosIn,
    floor: COMPETITIVE_MIN_VIDEOS,
  })

  const [ownInputs, playbook] = await Promise.all([
    input.ownPosts.catch((e: unknown) => { say('posts', e); return [] as OwnPostCensusInput[] }),
    input.playbook.catch((e: unknown) => { say('playbook', e); return null }),
  ])
  const censuses: OwnPostCensus[] = ownInputs.map((ci) => ownPostCensus({ ...ci, claims: claims?.get(ci.audience) ?? [] }))

  return {
    month,
    prevMonth: b1?.topics.prevMonth ?? null,
    name: b1?.name ?? null,
    topics: b1?.topics ?? null,
    inFull,
    asked,
    findings,
    posts: buildPosts({ month, censuses }),
    content: playbook ? buildContent({ month, formats: playbook.formats, hooks: playbook.hooks, audience: INDUSTRY_AUDIENCE }) : null,
    share,
  }
}

// ---- B1 ------------------------------------------------------------------------

interface MentionRow {
  video_id: string
  brand_key: string
  source: 'content' | 'comment'
  comment_id: string | null
  comment_month: string | null
  rule_version: string
}

interface StoredBrandRow {
  month: string
  audience: string
  brand_key: string
  k_any: number
  k_organic: number
  n: number
  n_organic: number
}

type Tracking = {
  competitor_names?: string[] | null
  competitor_keywords?: string[] | null
  own_handles?: Record<string, string> | null
  competitor_handles?: Record<string, Record<string, string>> | null
}

async function readWatched(db: SupabaseClient, clientId: string): Promise<string[] | null> {
  const res = await db.from('tracking_configs').select('watched_brands').eq('client_id', clientId).maybeSingle()
  if (res.error) {
    if (!missing(res.error, 'watched_brands')) say('watched', res.error)
    return null
  }
  const list = ((res.data ?? {}) as { watched_brands?: string[] | null }).watched_brands ?? []
  const names = [...new Set(list.map((n) => n.trim()).filter(Boolean))]
  return names.length > 0 ? names : null
}

async function readMentions(db: SupabaseClient, clientId: string): Promise<MentionRow[] | null> {
  try {
    const rows = await selectAll<MentionRow>(() =>
      db.from('brand_mentions').select('video_id, brand_key, source, comment_id, comment_month, rule_version')
        .eq('client_id', clientId).in('rule_version', [BRAND_RULE_VERSION, WATCHED_RULE_VERSION]).order('id'))
    return rows.map((r) => ({ ...r, video_id: String(r.video_id), comment_month: r.comment_month ? monthStartOf(String(r.comment_month)) : null }))
  } catch (error) {
    if (!missing(error, 'brand_mentions')) say('brand_mentions', error)
    return null
  }
}

async function readStoredBrands(db: SupabaseClient, clientId: string, months: readonly string[]): Promise<StoredBrandRow[] | null> {
  try {
    const rows = await selectAll<StoredBrandRow>(() =>
      db.from(BRAND_READINGS_TABLE).select('month, audience, brand_key, k_any, k_organic, n, n_organic')
        .eq('client_id', clientId).in('month', [...months]).order('month').order('audience').order('brand_key'))
    return rows.map((r) => ({ ...r, month: monthStartOf(String(r.month)) }))
  } catch (error) {
    if (!isMissingBrandReadings(error)) say(BRAND_READINGS_TABLE, error)
    return null
  }
}

const IDENTITY = 'id, platform, source, account_name, is_client, is_competitor, competitor_name, upload_date'
type Identity = IdentityRow & { upload_date: string | null }

async function identities(db: SupabaseClient, clientId: string, ids: readonly string[]): Promise<Map<string, Identity>> {
  const out = new Map<string, Identity>()
  for (const part of chunk(ids, UUID_IN_CHUNK)) {
    const res = await db.from('videos').select(IDENTITY).eq('client_id', clientId).in('id', part)
    if (res.error) throw new Error(`videos: ${res.error.message}`)
    for (const r of (res.data ?? []) as Identity[]) out.set(String(r.id), r)
  }
  return out
}

/** A brand's month, pooled over the market's audiences (decision E). */
function pooled(rows: readonly StoredBrandRow[], month: string, brandKey: string, audiences: ReadonlySet<string>): { kAny: number; kOrganic: number; n: number; nOrganic: number } | null {
  const mine = rows.filter((r) => r.month === month && r.brand_key === brandKey && audiences.has(r.audience))
  if (mine.length === 0) return null
  return mine.reduce((s, r) => ({ kAny: s.kAny + r.k_any, kOrganic: s.kOrganic + r.k_organic, n: s.n + r.n, nOrganic: s.nOrganic + r.n_organic }), { kAny: 0, kOrganic: 0, n: 0, nOrganic: 0 })
}

async function readBrandCounts(
  input: BrandsLoadInput,
  month: string,
  prev: string,
  live: readonly { name: string; audience: string }[],
): Promise<{ name: BrandsPageData['name']; topics: NonNullable<BrandsPageData['topics']> } | null> {
  const { db, clientId } = input
  if (brandRulesFor(clientId).length === 0) return null
  const audiences = marketAudiences(live.map((r) => r.audience))
  const [tcRes, compRes, watched, mentions, market, prevMarket, stored, owned] = await Promise.all([
    db.from('tracking_configs').select('competitor_names, competitor_keywords, own_handles, competitor_handles').eq('client_id', clientId).maybeSingle(),
    db.from('competitors').select('id, name, retired_at').eq('client_id', clientId),
    readWatched(db, clientId),
    readMentions(db, clientId),
    marketMonthIds(db, clientId, month, audiences),
    marketMonthIds(db, clientId, prev, audiences),
    readStoredBrands(db, clientId, [prev, month]),
    selectAll<IdentityRow>(() => db.from('videos').select('id, platform, source, account_name, is_client, is_competitor, competitor_name')
      .eq('client_id', clientId).in('source', ['owned', 'competitor_owned']).order('id')),
  ])
  if (market == null) return null
  if (tcRes.error) throw new Error(`tracking_configs: ${tcRes.error.message}`)
  if (compRes.error && !missing(compRes.error, 'competitors')) throw new Error(`competitors: ${compRes.error.message}`)
  const tc = (tcRes.data ?? {}) as Tracking

  // The tracked brands, by identity (`competitors.id`), in the tenant's order;
  // a brand with no rule is listed, and prints "not counted yet".
  const ids = new Map(((compRes.data ?? []) as { id: string; name: string; retired_at: string | null }[])
    .filter((c) => !c.retired_at).map((c) => [norm(c.name), String(c.id)]))
  const tracked = (tc.competitor_names ?? []).flatMap((name) => {
    const id = ids.get(norm(name))
    return id ? [{ brand: name, brandKey: id }] : []
  })
  const trackedNames = new Set(tracked.map((t) => norm(t.brand)))
  const watchedBrands = (watched ?? []).filter((n) => !trackedNames.has(norm(n))).map((n) => ({ brand: n, brandKey: watchedKey(n) }))

  const rows = mentions ?? []
  const matched = [...new Set(rows.map((r) => r.video_id))].sort()
  const [byId, rivalFound] = await Promise.all([identities(db, clientId, matched), readRivalFound(db, clientId, tc.competitor_keywords)])
  const ownerOf = ownerOfVideos({
    rows: byId,
    owned,
    ownHandles: tc.own_handles ?? null,
    competitorHandles: tc.competitor_handles ?? null,
    rivalKey: new Map(tracked.map((t) => [norm(t.brand), t.brandKey])),
  })
  const withRows = new Set(rows.map((r) => r.brand_key))

  // THE MONTH ROWS FIRST (MF3, written by deploy 4's step and the one
  // back-read), where they hold the reading month; else the mention layer,
  // counted live exactly as scripts/brand-mentions.ts and Your market count it.
  const marketSet = new Set(audiences)
  const storedHere = stored != null && stored.some((r) => r.month === month)
  const brands = [...tracked, ...watchedBrands]
  let counts: Map<string, { curr: BrandMonthIn['curr']; prev: BrandMonthIn['prev'] }>
  let n: number | null
  let nOrganic: number | null
  let prevN: number | null
  if (storedHere && stored) {
    counts = new Map(brands.map((b) => {
      const c = pooled(stored, month, b.brandKey, marketSet)
      const p = pooled(stored, prev, b.brandKey, marketSet)
      return [b.brandKey, { curr: c ? { kAny: c.kAny, kOrganic: c.kOrganic } : null, prev: p ? { kAny: p.kAny } : null }]
    }))
    const any = brands.map((b) => pooled(stored, month, b.brandKey, marketSet)).find((x) => x != null)
    const anyPrev = brands.map((b) => pooled(stored, prev, b.brandKey, marketSet)).find((x) => x != null)
    n = any?.n ?? market.length
    nOrganic = any?.nOrganic ?? withoutRivalSearches(market, rivalFound.videos).length
    prevN = anyPrev?.n ?? prevMarket?.length ?? null
  } else {
    const planned: PlannedMention[] = rows.map((r) => ({
      brand: r.brand_key,
      excerpt: null,
      row: { client_id: clientId, video_id: r.video_id, brand_key: r.brand_key, source: r.source, field: null, comment_id: r.comment_id, comment_month: r.comment_month, method: 'rule', rule_version: r.rule_version },
    }))
    const markets = new Map<string, readonly string[]>([[month, market]])
    if (prevMarket) markets.set(prev, prevMarket)
    const monthCounts = monthBrandCounts(planned, brands, { markets, ownerOf, rivalFound: rivalFound.videos })
    counts = new Map(brands.map((b) => {
      const c = monthCounts.find((x) => x.brandKey === b.brandKey && x.month === month)
      const p = monthCounts.find((x) => x.brandKey === b.brandKey && x.month === prev)
      // A brand with no mention row has no count, never a 0.
      return [b.brandKey, { curr: c && mentions ? { kAny: c.kAny, kOrganic: c.kOrganic } : null, prev: p && mentions ? { kAny: p.kAny } : null }]
    }))
    n = market.length
    nOrganic = withoutRivalSearches(market, rivalFound.videos).length
    prevN = prevMarket?.length ?? null
  }
  const monthIn = (b: { brand: string; brandKey: string }): BrandMonthIn => ({
    brandKey: b.brandKey,
    label: b.brand,
    hasRows: withRows.has(b.brandKey),
    curr: counts.get(b.brandKey)?.curr ?? null,
    prev: counts.get(b.brandKey)?.prev ?? null,
  })

  // YOUR NAME: the market's videos naming you, your own posts dated in the
  // month that name you, and the comments dated in the month naming you under
  // them (the front page's rule, lib/pages/overview-brands.ts).
  const inMarket = new Set(market)
  const mine = rows.filter((r) => r.brand_key === 'client' && (r.source === 'content' || r.comment_month === month))
  const outside = [...new Set(mine.filter((r) => inMarket.has(r.video_id) && ownerOf(r.video_id) !== 'client').map((r) => r.video_id))].sort()
  const commentedIn = new Set(mine.filter((r) => r.source === 'comment').map((r) => r.video_id))
  const uploadedIn = (id: string): boolean => {
    const up = byId.get(id)?.upload_date
    return up != null && up >= month && up < nextMonth(month)
  }
  const own = mine.filter((r) => ownerOf(r.video_id) === 'client')
  const ownPosts = new Set(own.filter((r) => commentedIn.has(r.video_id) || uploadedIn(r.video_id)).map((r) => r.video_id)).size
  const ownComments = own.filter((r) => r.source === 'comment' && r.comment_month === month)

  const chip = input.pair ? pairChip(input.pair(prev, month, BRANDS_PANEL)) : null
  return {
    name: buildNameBlock({
      clientId,
      month,
      n: market.length,
      hasRows: withRows.has('client'),
      mentionsRead: mentions != null,
      outside,
      ownPosts,
      ownPostComments: {
        comments: new Set(ownComments.map((r) => r.comment_id ?? `${r.video_id}`)).size,
        posts: new Set(ownComments.map((r) => r.video_id)).size,
      },
    }),
    topics: buildTopics({
      clientId,
      month,
      prevMonth: prevN != null ? prev : null,
      n,
      nOrganic,
      prevN,
      tracked: tracked.map(monthIn),
      watched: watched ? watchedBrands.map(monthIn) : null,
      chip,
      read: storedHere ? 'stored' : 'live',
      mentionsRead: mentions != null,
    }),
  }
}

// ---- B2 -------------------------------------------------------------------------

interface WindowReads {
  denominators: { audience: string; videos: number; comments: number }[]
  kinds: { audience: string; kind: string; videos: number }[]
}

async function readWindow(db: SupabaseClient, clientId: string, window: { from: string; to: string }): Promise<WindowReads> {
  const [den, kinds] = await Promise.all([
    db.rpc(RPC_WINDOW_DENOMINATORS, { p_client: clientId, p_from: window.from, p_to: window.to }),
    db.rpc(RPC_WINDOW_KIND_READINGS, { p_client: clientId, p_from: window.from, p_to: window.to }),
  ])
  if (den.error) throw new Error(`${RPC_WINDOW_DENOMINATORS}: ${den.error.message}`)
  if (kinds.error) throw new Error(`${RPC_WINDOW_KIND_READINGS}: ${kinds.error.message}`)
  return {
    denominators: ((den.data ?? []) as { audience: string; videos: number; comments: number }[])
      .map((r) => ({ audience: String(r.audience), videos: Number(r.videos) || 0, comments: Number(r.comments) || 0 })),
    kinds: ((kinds.data ?? []) as { audience: string; kind: string; videos: number }[])
      .map((r) => ({ audience: String(r.audience), kind: String(r.kind), videos: Number(r.videos) || 0 })),
  }
}

// ---- B3 -------------------------------------------------------------------------

/** B3's reads for every live brand: the question videos month by month
 *  (`month_kind_readings`) and the question themes over the window
 *  (`window_theme_readings`, filtered to the brands' audiences so it is one
 *  page, on the latest themed update; each theme's kind and label from that
 *  update's observations). */
async function readQuestions(
  db: SupabaseClient,
  clientId: string,
  month: string,
  window: { from: string; to: string },
  live: readonly { name: string; audience: string }[],
  running: readonly string[],
): Promise<{ months: Map<string, { month: string; videos: number }[]>; themes: Map<string, { registryId: string; label: string; videos: number }[]> }> {
  const audiences = live.map((r) => r.audience)
  const months: string[] = []
  for (let m = monthStartOf(window.from); m <= month; m = nextMonth(m)) months.push(m)
  const out = { months: new Map<string, { month: string; videos: number }[]>(), themes: new Map<string, { registryId: string; label: string; videos: number }[]>() }
  if (audiences.length === 0) return out
  const [mk, runId] = await Promise.all([
    db.from('month_kind_readings').select('month, audience, videos').eq('client_id', clientId).eq('kind', 'question').in('audience', audiences).in('month', months),
    fetchThemedRunId(db, clientId, running, 'brands'),
  ])
  if (mk.error) throw new Error(`month_kind_readings: ${mk.error.message}`)
  for (const r of (mk.data ?? []) as { month: string; audience: string; videos: number }[]) {
    out.months.set(r.audience, [...(out.months.get(r.audience) ?? []), { month: String(r.month), videos: Number(r.videos) || 0 }])
  }
  if (!runId) return out
  const wt = await selectAll<{ audience: string; theme_id: string; videos: number }>(() =>
    db.rpc(RPC_WINDOW_THEME_READINGS, { p_client: clientId, p_run: runId, p_from: window.from, p_to: window.to })
      .in('audience', audiences).gt('videos', 0).order('audience').order('theme_id'))
  if (wt.length === 0) return out
  const obs = await selectAll<{ theme_id: string; category: string | null; label: string }>(() =>
    db.from('theme_observations').select('theme_id, category, label').eq('client_id', clientId).eq('run_id', runId)
      .eq('category', 'question').in('theme_id', [...new Set(wt.map((r) => r.theme_id))]).order('theme_id'))
  const byId = new Map(obs.map((o) => [String(o.theme_id), o]))
  for (const r of wt) {
    const o = byId.get(String(r.theme_id))
    if (!o) continue
    out.themes.set(r.audience, [...(out.themes.get(r.audience) ?? []), { registryId: String(r.theme_id), label: o.label, videos: Number(r.videos) }])
  }
  return out
}

// ---- B4 -------------------------------------------------------------------------

interface FindingRead {
  id: string
  rival: string
  category: string
  impact: string | null
  title: string
  quote: Quote | null
  seen: { months: number; of: number } | null
}

async function readFindings(db: SupabaseClient, clientId: string, month: string, live: readonly { name: string; audience: string }[], running: readonly string[]): Promise<FindingRead[]> {
  const res = await db.from('competitive_insights').select('id, run_id, category, competitor_name, title, evidence, impact_level, created_at')
    .eq('client_id', clientId).order('created_at', { ascending: false }).limit(60)
  if (res.error) throw new Error(`competitive_insights: ${res.error.message}`)
  type Row = { id: string; run_id: string | null; category: string; competitor_name: string | null; title: string; evidence: { supporting_theme_ids?: string[] } | null; impact_level: string | null; created_at: string }
  const all = ((res.data ?? []) as Row[]).filter((r) => r.run_id && !running.includes(r.run_id))
  const runId = all[0]?.run_id ?? null
  if (!runId) return []
  const byName = new Map(live.map((r) => [norm(r.name), r]))
  const rows = all.filter((r) => r.run_id === runId && r.competitor_name && byName.has(norm(r.competitor_name)))
  if (rows.length === 0) return []

  // EACH FINDING'S LEAD THEME, BY REGISTRY ID (S14): the run's observations
  // its cited insights fall in. `theme_observations` keeps the ids a run
  // grouped, so this holds after the insights themselves are pruned.
  const leads = new Map<string, { registryId: string; audience: string }>()
  const buckets = new Map<string, string>()
  const observed: { finding: string; obs: { themeId: string; members: string[] }[] }[] = []
  for (const f of rows) {
    const cited = [...new Set(f.evidence?.supporting_theme_ids ?? [])]
    if (cited.length === 0) { observed.push({ finding: f.id, obs: [] }); continue }
    const found: { themeId: string; members: string[] }[] = []
    for (const part of chunk(cited, 100)) {
      const o = await db.from('theme_observations').select('theme_id, member_insight_ids').eq('client_id', clientId).eq('run_id', runId)
        .overlaps('member_insight_ids', part)
      if (o.error) throw new Error(`theme_observations: ${o.error.message}`)
      for (const r of (o.data ?? []) as { theme_id: string; member_insight_ids: string[] | null }[]) {
        found.push({ themeId: String(r.theme_id), members: (r.member_insight_ids ?? []).map(String) })
      }
    }
    observed.push({ finding: f.id, obs: found })
  }
  const themeIds = [...new Set(observed.flatMap((o) => o.obs.map((x) => x.themeId)))]
  for (const part of chunk(themeIds, UUID_IN_CHUNK)) {
    const reg = await db.from('theme_registry').select('id, bucket').eq('client_id', clientId).in('id', part)
    if (reg.error) throw new Error(`theme_registry: ${reg.error.message}`)
    for (const r of (reg.data ?? []) as { id: string; bucket: string }[]) buckets.set(String(r.id), String(r.bucket))
  }
  for (const f of rows) {
    const cited = new Set(f.evidence?.supporting_theme_ids ?? [])
    const obs = (observed.find((o) => o.finding === f.id)?.obs ?? []).map((o) => ({ ...o, bucket: buckets.get(o.themeId) ?? '' }))
    const lead = leadTheme(cited, obs, byName.get(norm(f.competitor_name ?? ''))?.audience ?? '')
    if (lead) leads.set(f.id, lead)
  }

  // THE MONTHS AND THE QUOTE, FROM THE MONTH READINGS: where the lead theme
  // was read in the last six months, and one voice from its reading month's
  // own evidence (dated in the month, never the video's own account).
  const firstMonth = await firstMonthWithRows(db, clientId)
  const span = recurrenceMonths(month, firstMonth)
  const leadIds = [...new Set([...leads.values()].map((l) => l.registryId))]
  const refs = leadIds.length > 0
    ? await selectAll<{ month: string; audience: string; object_id: string; video_ids: string[] | null; comment_ids: string[] | null }>(() =>
        db.from('month_evidence_refs').select('month, audience, object_id, video_ids, comment_ids').eq('client_id', clientId)
          .eq('object_kind', 'theme').in('object_id', leadIds).in('month', span).order('month').order('audience').order('object_id'))
    : []
  const refOf = (l: { registryId: string; audience: string }, m: string) =>
    refs.find((r) => monthStartOf(String(r.month)) === m && r.audience === l.audience && r.object_id === l.registryId)
  const quotes = await readQuotes(db, clientId, [...leads.values()].flatMap((l) => (refOf(l, month)?.comment_ids ?? []).map(String)))
  // THE QUOTE GATE (walkthrough, 29 Sep; lib/quote-gate.ts): each finding's
  // voice is the rival's own (under a video filed under it, or naming it, and
  // never naming only another brand), speaks to the finding ("What kind of
  // bag is thatttt" does not illustrate "Organization, measurements, and
  // packing proof"), and is readable and on the market.
  const ctx = await readQuoteContext(db, clientId, { commentIds: quotes.map((q) => q.commentId) }, db)
  for (const q of quotes) q.context = ctx.forComment(q.commentId)

  // ONE VOICE PER CARD, NEVER THE SAME ONE TWICE: two findings may share a
  // lead theme, and the second takes the next eligible voice.
  const used = new Set<string>()
  return rows.map((f) => {
    const lead = leads.get(f.id) ?? null
    const seen = lead
      ? { months: span.filter((m) => (refOf(lead, m)?.video_ids ?? []).length > 0).length, of: span.length }
      : null
    const comments = lead ? new Set((refOf(lead, month)?.comment_ids ?? []).map(String)) : new Set<string>()
    const rival = live.find((r) => norm(r.name) === norm(f.competitor_name ?? ''))?.name ?? String(f.competitor_name)
    const eligible = pickQuotes(quotes.filter((q) => q.commentId != null && comments.has(q.commentId)), {
      month, kind: null, count: comments.size,
      gate: gateFor(clientId, { brand: rival, claim: String(f.title), requireRelevance: true }),
    })
    const picked = eligible.find((q) => q.commentId != null && !used.has(q.commentId)) ?? null
    if (picked?.commentId) used.add(picked.commentId)
    return {
      id: String(f.id),
      rival,
      category: String(f.category),
      impact: f.impact_level ?? null,
      title: String(f.title),
      quote: picked && picked.commentId
        ? { ref: quoteRef.comment(picked.commentId), text: picked.quote, lang: picked.lang ?? null, english: picked.english ?? null }
        : null,
      seen: seen && seen.months > 0 ? seen : null,
    }
  })
}

async function firstMonthWithRows(db: SupabaseClient, clientId: string): Promise<string | null> {
  const res = await db.from('month_denominators').select('month').eq('client_id', clientId).order('month', { ascending: true }).limit(1)
  if (res.error) return null
  const m = ((res.data ?? []) as { month: string }[])[0]?.month
  return m ? monthStartOf(String(m)) : null
}

/** The quote candidates behind a set of comments: their evidence (never a
 *  redacted row), the comment's date and author, and the video's own account. */
async function readQuotes(db: SupabaseClient, clientId: string, commentIds: readonly string[]): Promise<QuoteCandidate[]> {
  const ids = [...new Set(commentIds)]
  if (ids.length === 0) return []
  const evidence: { id: string; comment_id: string | null; quote: string | null; relevance_rank: number | null }[] = []
  // `comments.video_id` is the platform's own id, so the video is found by
  // (platform, video_id), as Your market's voices find it.
  type CommentMeta = { id: string; platform: string | null; comment_date: string | null; author: string | null; video_id: string | null }
  const comments = new Map<string, CommentMeta>()
  for (const part of chunk(ids, UUID_IN_CHUNK)) {
    const [ev, cm] = await Promise.all([
      db.from('insight_evidence').select('id, comment_id, quote, relevance_rank').in('comment_id', part).eq('redacted', false).order('id'),
      db.from('comments').select('id, platform, comment_date, author, video_id').eq('client_id', clientId).in('id', part),
    ])
    if (ev.error) throw new Error(`insight_evidence: ${ev.error.message}`)
    if (cm.error) throw new Error(`comments: ${cm.error.message}`)
    evidence.push(...((ev.data ?? []) as typeof evidence))
    for (const c of (cm.data ?? []) as CommentMeta[]) comments.set(String(c.id), c)
  }
  const nativeIds = [...new Set([...comments.values()].map((c) => c.video_id).filter((v): v is string => !!v))]
  const accounts = new Map<string, string | null>()
  for (const part of chunk(nativeIds, UUID_IN_CHUNK)) {
    const v = await db.from('videos').select('platform, video_id, account_name').eq('client_id', clientId).in('video_id', part)
    if (v.error) throw new Error(`videos: ${v.error.message}`)
    for (const r of (v.data ?? []) as { platform: string | null; video_id: string | null; account_name: string | null }[]) accounts.set(`${r.platform}::${r.video_id}`, r.account_name)
  }
  const translations = await readTranslations(db, evidence.map((e) => e.quote ?? ''))
  return evidence
    .filter((e) => e.quote && e.comment_id)
    .map((e) => {
      const c = comments.get(String(e.comment_id))
      return {
        evidenceId: String(e.id),
        quote: String(e.quote),
        rank: e.relevance_rank ?? 99,
        ...readingOf(translations, String(e.quote)),
        insightKind: null,
        commentId: String(e.comment_id),
        commentDate: c?.comment_date ?? null,
        author: c?.author ?? null,
        videoAccount: c?.video_id ? accounts.get(`${c.platform}::${c.video_id}`) ?? null : null,
      }
    })
}

// ---- B5 -------------------------------------------------------------------------

/** The month's claims on the brands' own posts, by audience (`video_claims`,
 *  read on the reading client). */
async function readClaims(
  db: SupabaseClient,
  clientId: string,
  own: BrandsLoadInput['ownPosts'],
): Promise<Map<string, { id: string; source_video_id: string; entity: string; claim: string; quote: string }[]> | null> {
  const inputs = await own
  const audienceOf = new Map<string, string>()
  for (const ci of inputs) for (const v of ci.videos) audienceOf.set(v.id, ci.audience)
  const ids = [...audienceOf.keys()]
  const out = new Map<string, { id: string; source_video_id: string; entity: string; claim: string; quote: string }[]>()
  for (const part of chunk(ids, UUID_IN_CHUNK)) {
    const res = await db.from('video_claims').select('id, source_video_id, entity, claim, quote').eq('client_id', clientId).eq('entity', 'competitor').in('source_video_id', part).order('id')
    if (res.error) throw new Error(`video_claims: ${res.error.message}`)
    for (const r of (res.data ?? []) as { id: string; source_video_id: string; entity: string; claim: string; quote: string }[]) {
      const audience = audienceOf.get(String(r.source_video_id))
      if (!audience) continue
      out.set(audience, [...(out.get(audience) ?? []), { id: String(r.id), source_video_id: String(r.source_video_id), entity: r.entity, claim: r.claim, quote: r.quote ?? '' }])
    }
  }
  return out
}

// ---- B7 -------------------------------------------------------------------------

async function readShare(input: BrandsLoadInput, month: string, live: readonly { name: string; audience: string }[]): Promise<BrandsPageData['share']> {
  const { db, clientId } = input
  const [stats, panels] = await Promise.all([
    db.from('month_audience_stats').select('audience, panel_videos').eq('client_id', clientId).eq('month', month).not('panel_videos', 'is', null),
    db.from('attention_panels').select('id').eq('client_id', clientId).limit(1),
  ])
  if (stats.error && !missing(stats.error, 'month_audience_stats')) throw new Error(`month_audience_stats: ${stats.error.message}`)
  const statsRows = stats.error
    ? null
    : ((stats.data ?? []) as { audience: string; panel_videos: number }[]).map((r) => ({ audience: String(r.audience), panelVideos: Number(r.panel_videos) || 0 }))
  const hasPanel = !panels.error && (panels.data ?? []).length > 0
  return buildShare({
    month,
    stats: statsRows,
    rivals: live,
    startsWith: hasPanel || input.reading.paused ? null : firstPanelUpdate(input),
  })
}

/** The update the first attention panel freezes with: the first scheduled
 *  update after the oldest filling month's freeze line (the panel freezes
 *  with the first month that closes, as Sealand's did with the 4 Oct run). */
export function firstPanelUpdate(input: Pick<BrandsLoadInput, 'denominators' | 'schedule' | 'now' | 'rivals'>): string | null {
  if (!input.schedule) return null
  const market = new Set(marketAudiences(input.rivals.filter((r) => !r.retiredAt).map((r) => rivalKey(r.name))))
  const filling = [...new Set(input.denominators.filter((d) => market.has(d.audience) && d.status !== 'frozen').map((d) => monthStartOf(d.month)))].sort()
  const oldest = filling[0]
  if (!oldest) return null
  return nextSlot(freezeBoundary(oldest), Date.parse(input.now), scheduledUpdateAfter(input.schedule))
}
