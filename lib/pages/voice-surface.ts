import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk, UUID_IN_CHUNK } from '../chunk'
import { fmtInt, longMonth, platformLabel } from '../format'
import { cleanQuote, fetchInsightsByIds, readTranslations, readingOf } from '../quotes'
import { quoteRef } from '../renderables/quotes-freeze'
import type { Quote, Scope } from '../renderables/types'
import { normalisePersona, type Persona } from '../profile-tiles'
import { INDUSTRY_AUDIENCE, isMissingCompetitors, loadCompetitors, type Competitor } from '../rivals'
import { horizonWindow, parseHorizon, sinceStart, type Horizon, type HorizonWindow } from '../reading/horizon'
import { TABLE_EVIDENCE_REFS } from '../reading/evidence-refs'
import { loadAppPairOn } from '../reading/gather-flags'
import { pooledDenominators } from '../reading/market'
import { freezeStateFor, isMissingMonthTable } from '../reading/monthly'
import { MONTH_PARAM, readingAnchor, windowEnd, type ReadingMonth } from '../reading/reading-month'
import { loadDeliveredRuns, loadReadingSchedule, marketRivalAudiences, readingViewFrom, type OtherMonth } from '../reading/reading-view'
import { monthStartOf } from '../reading/month-key'
import { loadMonthSeries, type ReadingHandle } from '../reading/read'
import type { MonthLabel, Substrate } from '../reading/series'
import { TABLE_THEME_READINGS, type MonthStatus } from '../reading/types'
import {
  addedSearchesRead,
  loadBoardObservations,
  loadLeadExclusions,
  loadRegimeOpened,
  loadThemeEvidence,
  loadThemeQuotes,
  loadThemeSegmentRows,
  makerRuleEnabled,
  markVideoSegments,
  pairChip,
  themeSegmentsOf,
  voiceOf,
  type Voice,
} from './overview'
import {
  MAKER_GROUP_SHARE,
  THEME_FLOOR,
  POOL_FLOOR,
  buildConversationBoard,
  buildThemeBoard,
  heroLead,
  makerShareSentence,
  marketKindLabel,
  mayLead,
  namesABrand,
  pickQuotes,
  stripUnevidencedBrand,
  themeFlags,
  themeProvenance,
  type ConversationBoard,
  type MarketTheme,
  type ThemeBoard,
  type ThemeFlag,
} from './overview-market'
import { row, rows as readRows } from './read'
import { readConversationView, viewParams } from '../views/conversation'
import type { ViewState } from '../views/state'
import { VIEW_PARAM } from '../views/view'
import { fetchRunningRunIds } from './latest-video-run'
import { fetchThemedRunId } from './themed-run'
import { buildWords, loadKindRows, loadWordsCandidates, marketKindVideos, shortlistWords, type WordsBlock } from './voice-surface-words'
import { buildWhere, loadEarlierMonths, loadMemory, loadMonthVideos, memoryMonths, type WhereBlock } from './voice-surface-where'
import { brandNamed, loadBrandView, type BrandView } from './voice-surface-brand'
import { ninetyDays } from './brands'

// Conversation — "everything your market talked about, in full" (market-first
// WP2.4, plan §2.4 C1–C4; the page was Voice, Phase 1 WP13, and keeps its key,
// its address and its page key `voice`).
//
// FOUR BLOCKS, ALL ON THE READING MONTH (decision A):
//
//   C1 `voice.audience` — the market in the month: its size, the category
//      where themes are grouped, what the themes at 10+ hold, and where it was
//      said;
//   C2 `voice.board`    — every category theme at 10 videos or more, biggest
//      first and NOTHING SKIPPED (§5.9), with the month before beside it as a
//      level, its maker share at a fifth or more, its New or Now 10+ flag, and
//      how many of its videos came from searches added in the month;
//   C3 `voice.theme`    — one theme in full: the lead theme unless the reader
//      opened another, with its voices and the Ask link;
//   C4 `voice.cast`     — who is talking, grouped at an update;
//   C5 `voice.words`    — the market's words: a bank of real quotes, per kind,
//      from the board's themes (WP3.8, `./voice-surface-words.ts`);
//   C6 `voice.where`    — where your market talks: the accounts behind the
//      category's videos, with a floor and a memory (WP3.8,
//      `./voice-surface-where.ts`).
//
// THE MOVERS ARMS ARE GONE (§2.4 C2 "replaces the movers arms on this page").
// They drew only the themes at 10+ in BOTH months, which on staging's
// September was 7 of 21: fourteen themes the market talked about printed
// nowhere (GR F30). The board prints them all, as levels. Nothing on this page
// compares two months: a flag is a level against the floor, "too few last
// month to call it a change".
//
// THEMES ARE THE CATEGORY'S (decision E): a theme's k and n are the category's
// videos in the month, never the pooled market's. The market's size prints once,
// at the top, with the category named beside it.
//
// PURE HALF FIRST, THEN THE READS. Every figure is a count of videos off the
// stored month tables, never off a run and never summed across months.

/** How many voices the theme pane prints (the preview's three). */
export const THEME_VOICES = 3

/** The Ask box takes 300 characters of `?ask=` (app/dashboard/agent/page.tsx). */
const ASK_MAX = 300

// ---- the shapes ---------------------------------------------------------------

export type VoiceSurfaceParams = {
  /** `?month=` (MONTH_PARAM): the month the page reads, where the reader chose one. */
  month?: string
  /** `?view=` (VIEW_PARAM, WP3.3): Everything, Buyers or Makers, where the views are live (lib/views). */
  view?: string
  /** `theme_registry.id` — which theme the pane is open on. */
  theme?: string
  /** `'all'` lists the themes at 3 to 9 under the board. */
  board?: string
  persona?: string
  /** The deep link Market and the old Dashboard draw: theme member slugs. A
   *  stored link still lands (32 carry the address, 14 of them this key); it
   *  opens the biggest theme it names, and narrows nothing. */
  themes?: string
  /** Kept only so a stored link parses: the page reads one month and the
   *  category's themes, so neither narrows anything any more. */
  horizon?: string
  audience?: string
  /** `'all'` lists every account at the floor in "Where your market talks". */
  accounts?: string
  /** A tracked brand's name: the board lists that brand's videos over the
   *  ninety days the Brands page reads (`./voice-surface-brand.ts`), and
   *  `board=all` lists every one of its themes. */
  brand?: string
}

/** C1, the market in the month (plan §2.4 C1). */
export interface ConversationMarket {
  /** The pooled market's videos and comments (decision E): the category plus
   *  the videos filed under a brand you track. */
  videos: number | null
  comments: number | null
  /** The category, where themes are grouped, and the rival-filed videos. */
  category: number | null
  rivalFiled: number | null
  /** The category's videos in the month by platform, largest first. */
  platformMix: { platform: string; label: string; videos: number; pct: number | null }[]
}

/** C3, one theme in full (plan §2.4 C3, the preview's pane). */
export interface ThemeBlock {
  /** `ready` — a theme is open. `none` — nothing in the month can be opened. */
  state: 'ready' | 'none'
  id: string | null
  label: string
  kind: string | null
  /** The kind in the market's words ("Asking how it works"). */
  kindLabel: string | null
  /** "fewer than a fifth of its videos are makers' own"; null where the share
   *  was not measured or the tenant has no maker rule. */
  makerSentence: string | null
  flags: ThemeFlag[]
  /** The reading month's category videos in the theme, and the category's n. */
  k: number | null
  n: number | null
  /** The month before, as a level of its own. */
  prev: { month: string; k: number; n: number } | null
  provenance: { fromNewSearches: number; of: number } | null
  /** What people did in its comments: for each kind, how many of the theme's
   *  videos in the month carry an insight of that kind in this theme. Null
   *  where it was not read. */
  kinds: { kind: string; label: string; videos: number }[] | null
  /** Evidence quotes of the theme's own insights, of its kind, dated in the
   *  month, never from the video's own account (plan §4.0 "Quotes"). */
  voices: Voice[]
  /** The themes view's month-pair chip, or null. */
  chip: string | null
  /** The theme is the lead: the front page's lead rule picked it. */
  isLead: boolean
  videosHref: string
  askHref: string
  /** Why nothing is open, where nothing is. */
  notes: string[]
}

export interface CastPersona {
  key: string
  name: string
  oneLiner: string
  /**
   * Videos this group was read on, as Pass E counted them — A COUNT, AND NO
   * SHARE.
   *
   * The design asks for "38 of 469": the group against the month's analysed
   * population. There is no such denominator to divide by, and the first cut
   * of this block invented one and printed nonsense. A stored profile is
   * written over the RUN's whole insight population, across every audience and
   * across whatever months that run had read — Össur's five groups sum to 674
   * videos against a September category of 388 — and the groups overlap, so
   * they do not partition anything either. Dividing a run-wide, multi-month,
   * overlapping count by one audience's month gave "First-time buyer 59.3%"
   * beside "Caretaker 59.5%", two numbers that cannot both be shares of the
   * same thing.
   *
   * A per-month persona reading would fix it and is a Pass E change this phase
   * does not make — the same boundary decision W draws around `dropped`. Until
   * then the count is printed and the share is not, and the block says which
   * update the count was read on.
   */
  videos: number
  wants: string
  blockers: string
  triggers: string
  platformMix: { platform: string; label: string; videos: number; pct: number | null }[]
  quote: Quote | null
  quoteCite: string | null
  selected: boolean
  href: string
}

export interface CastBlock {
  /** `ready` · `no_personas` — too little conversation to describe who is
   *  talking · `not_run` — Pass E has never written a profile here. The design
   *  asks for the two to be told apart and they are different facts. */
  state: 'ready' | 'no_personas' | 'not_run'
  personas: CastPersona[]
  selected: string | null
  /** The points Pass A extracted that the workspace currently holds, which is
   *  what the profile was read over (`consumer_profiles.insight_population`).
   *  NOT a comment count — Össur's is 3,129 against 10,534 comments in the
   *  September category, and "comments" has a fixed meaning in this product's
   *  copy. Null on a profile written before the column existed. */
  population: number | null
  /** Said on the block: these groups overlap, so their counts do not add up to
   *  a whole and no remainder can be taken from them. The mock's "No persona
   *  16%" line is exactly that remainder, and it is omitted for the same
   *  reason the share is. */
  overlapNote: string
  /** The update the stored profile is from, and whether it lags the newest. */
  profileDate: string | null
  stale: boolean
  floorNote: string
  empty: string | null
}

export interface VoiceSurfaceData {
  brand: string
  month: string
  monthStatus: MonthStatus
  readingAt: string
  /** The reading month (market-first decision A) and the bar's other months
   *  (default M-d), newest first. Always set by the loader; optional because a
   *  stored snapshot taken before WP1.2 has neither. */
  reading?: ReadingMonth
  otherMonths?: OtherMonth[]
  /** The page reads one month; the window is kept for a brief that asks the
   *  surface which span it read. */
  horizon: Horizon
  window: HorizonWindow
  axis: string[]
  substrate: Substrate
  notes: MonthLabel[]
  params: VoiceSurfaceParams
  market: ConversationMarket
  board: ConversationBoard
  theme: ThemeBlock
  cast: CastBlock
  /** C5 and C6 (WP3.8, deploy 5). Always set by the loader, null where they
   *  could not be read; optional because a stored snapshot taken before them
   *  has neither. */
  words?: WordsBlock | null
  where?: WhereBlock | null
  /** The view the page reads and its pill (WP3.3, lib/views). Absent where no
   *  view is live for the tenant, and on a copy stored before it. */
  view?: ViewState
  /** One brand's videos in place of the market's board (`?brand=`); null or
   *  absent where the page reads the market. */
  brandView?: BrandView | null
}

// ---- the pure half ------------------------------------------------------------

const round1 = (n: number): number => Math.round(n * 10) / 10

const pctOf = (k: number | null | undefined, n: number | null | undefined): number | null =>
  k == null || n == null || n <= 0 ? null : round1((k / n) * 100)

/**
 * Every href on this page, with the reader's month kept.
 *
 * `?month=` travels (the bar's month selector wrote it, and a click on a
 * theme must not jump the page back to the reading month), and so do the brand
 * the board is filtered to, the open theme, the expanded board and the
 * persona. `?themes=`, `?horizon=` and
 * `?audience=` are a stored link's and do not: the page reads none of them
 * beyond the first load. `null` drops a key.
 */
export function voiceSurfaceHref(
  params: VoiceSurfaceParams,
  over: Partial<Record<keyof VoiceSurfaceParams, string | null>> = {},
): string {
  const merged: Record<string, string | null | undefined> = { ...params, ...over }
  const qs = new URLSearchParams()
  for (const key of [MONTH_PARAM, 'brand', 'theme', 'board', 'persona', 'accounts', VIEW_PARAM]) {
    const value = merged[key]
    if (value) qs.set(key, value)
  }
  const s = qs.toString()
  return s ? `/dashboard/voice?${s}` : '/dashboard/voice'
}

/** The platform mix of one month, largest first, with a share each. */
export function platformShares(
  mix: Readonly<Record<string, number>> | null | undefined,
  videos: number | null,
): { platform: string; label: string; videos: number; pct: number | null }[] {
  if (!mix) return []
  return Object.entries(mix)
    .filter(([, n]) => Number(n) > 0)
    .map(([platform, n]) => ({ platform, label: platformLabel(platform), videos: Number(n), pct: pctOf(Number(n), videos) }))
    .sort((a, b) => b.videos - a.videos || a.platform.localeCompare(b.platform))
}

/**
 * The question "Ask about this" pre-fills (plan §2.8 D3): `?ask=`, which the
 * Ask box reads (app/dashboard/agent/page.tsx), where the pane sent `?q=`,
 * which Ask ignores (`lib/pages/voice-surface.ts:1883` before WP2.4). The
 * month by name, never "this month": on 1 to 15 Oct the page reads an ended
 * September (the lead's R6).
 */
export function askAboutTheme(label: string, month: string): string {
  const q = `What is behind “${label}” in ${longMonth(month)}?`
  return `/dashboard/agent?ask=${encodeURIComponent(q.slice(0, ASK_MAX))}`
}

/**
 * What people did in a theme's comments (the preview's pane): for each kind,
 * how many of the theme's videos in the month carry an insight of that kind
 * among the theme's own insights. Biggest first, then by kind; a kind on no
 * video is left out. Counts of videos, never of insights, so they sit on the
 * same base as the theme's k.
 */
export function themeKindCounts(
  insights: readonly { category: string | null; source_video_id: string | null }[],
  monthVideos: ReadonlySet<string>,
): { kind: string; label: string; videos: number }[] {
  const byKind = new Map<string, Set<string>>()
  for (const i of insights) {
    if (!i.category || !i.source_video_id || !monthVideos.has(i.source_video_id)) continue
    const set = byKind.get(i.category) ?? new Set<string>()
    set.add(i.source_video_id)
    byKind.set(i.category, set)
  }
  return [...byKind.entries()]
    .map(([kind, videos]) => ({ kind, label: marketKindLabel(kind), videos: videos.size }))
    .sort((a, b) => b.videos - a.videos || a.kind.localeCompare(b.kind))
}

/**
 * Which theme the pane opens (plan §2.4 C3: "Opens the lead theme").
 *
 * The one the reader asked for (`?theme=`), where the month holds it; else the
 * biggest theme a stored `?themes=` link names; else the LEAD, by the front
 * page's own rule (`heroLead`: the largest of its ten rows whose maker share
 * is measured at a quarter or less, whose label names no unevidenced brand,
 * whose identity is not new this update, and which is not excluded); else the
 * biggest theme on the board. Null only when the month holds none.
 */
export function openThemeId(input: {
  asked: string | null
  linked: string | null
  lead: string | null
  board: Pick<ConversationBoard, 'rows' | 'makers' | 'setAside' | 'below'>
}): string | null {
  const listed = [...input.board.rows, ...(input.board.makers ?? []), ...(input.board.setAside ?? []), ...(input.board.below.rows ?? [])]
  const has = (id: string | null): id is string => id != null && listed.some((t) => t.registryId === id)
  if (has(input.asked)) return input.asked
  if (has(input.linked)) return input.linked
  if (has(input.lead)) return input.lead
  return input.board.rows[0]?.registryId ?? input.board.makers?.[0]?.registryId ?? input.board.setAside?.[0]?.registryId ?? null
}

/** Why no theme is open: the month's own words, never a blank. */
export function noThemeOpen(month: string): string {
  return `No theme carried 3 videos or more in ${longMonth(month)} yet, so there is nothing to open.`
}

// ---- the reads ----------------------------------------------------------------

async function loadRivals(supabase: SupabaseClient, clientId: string): Promise<{ name: string; retiredAt: string | null }[]> {
  let stored: Competitor[] = []
  try {
    stored = await loadCompetitors(supabase, clientId)
  } catch (error) {
    if (!isMissingCompetitors(error)) throw error
  }
  if (stored.length > 0) return stored.map((r) => ({ name: r.name, retiredAt: r.retired_at }))
  const res = await supabase.from('tracking_configs').select('competitor_names').eq('client_id', clientId).maybeSingle()
  const tc = row<{ competitor_names: string[] | null }>(res, 'voice.rivals')
  return (tc?.competitor_names ?? []).map((name) => ({ name, retiredAt: null }))
}

/** A read that answers "not there yet" (a missing month table) as empty. */
function monthRows<T>(res: { data: unknown; error: unknown }, label: string): T[] {
  if (res.error && isMissingMonthTable(res.error)) return []
  return readRows<T>(res as never, label)
}

/**
 * THE POOL (WP2.4): every category theme the reading month read on 3 videos
 * or more, not the top 40 by comments. One read; Sealand's September on
 * staging is 104 rows.
 */
async function loadThemePool(client: SupabaseClient, clientId: string, month: string): Promise<{ id: string; k: number }[]> {
  const res = await client
    .from(TABLE_THEME_READINGS)
    .select('theme_id, videos')
    .eq('client_id', clientId)
    .eq('month', month)
    .eq('audience', INDUSTRY_AUDIENCE)
    .gte('videos', POOL_FLOOR)
    .order('videos', { ascending: false })
    .order('theme_id', { ascending: true })
    .limit(1000)
  return monthRows<{ theme_id: string; videos: number }>(res, 'voice.pool').map((r) => ({ id: String(r.theme_id), k: Number(r.videos) }))
}

/** Last month's category k for these themes (a theme absent from it is 0). */
async function loadPrevK(client: SupabaseClient, clientId: string, prevMonth: string, ids: readonly string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  for (const part of chunk(ids, UUID_IN_CHUNK)) {
    const res = await client
      .from(TABLE_THEME_READINGS)
      .select('theme_id, videos')
      .eq('client_id', clientId)
      .eq('month', prevMonth)
      .eq('audience', INDUSTRY_AUDIENCE)
      .in('theme_id', part)
    for (const r of monthRows<{ theme_id: string; videos: number }>(res, 'voice.prevK')) out.set(String(r.theme_id), Number(r.videos))
  }
  return out
}

/**
 * Which of these themes carry a row with videos in any month before `month`,
 * in any audience ("New = no row for the registry id in any earlier month").
 * Asked only for the themes last month's category did not hold, which is a
 * handful (two on staging's September).
 */
async function loadHeardBefore(client: SupabaseClient, clientId: string, month: string, ids: readonly string[]): Promise<Set<string>> {
  const out = new Set<string>()
  if (ids.length === 0) return out
  const res = await client
    .from(TABLE_THEME_READINGS)
    .select('theme_id')
    .eq('client_id', clientId)
    .lt('month', month)
    .gt('videos', 0)
    .in('theme_id', [...ids])
    .limit(1000)
  for (const r of monthRows<{ theme_id: string }>(res, 'voice.heardBefore')) out.add(String(r.theme_id))
  return out
}

/**
 * The identities among these that an update opening a new clustering regime
 * minted (WP1.9's rule, `opensClusteringRegime`): each theme's minting update
 * is the one whose observation of it is `match_kind` 'new', and the regime is
 * read per distinct update (two reads each, `loadRegimeOpened`). Read only for
 * themes no earlier month holds, so it costs nothing on most months.
 */
async function loadRegrouped(
  supabase: SupabaseClient,
  clientId: string,
  ids: readonly string[],
  latest: { runId: string | null; minted: ReadonlySet<string>; opened: () => Promise<boolean> },
): Promise<Set<string>> {
  const out = new Set<string>()
  if (ids.length === 0) return out
  const byLatest = ids.filter((id) => latest.minted.has(id))
  if (byLatest.length > 0 && await latest.opened()) for (const id of byLatest) out.add(id)
  const rest = ids.filter((id) => !latest.minted.has(id))
  if (rest.length === 0) return out
  const res = await supabase
    .from('theme_observations')
    .select('theme_id, run_id')
    .eq('client_id', clientId)
    .eq('match_kind', 'new')
    .in('theme_id', rest)
  const mintedBy = new Map<string, string[]>()
  for (const r of readRows<{ theme_id: string; run_id: string | null }>(res, 'voice.minted')) {
    if (!r.run_id || r.run_id === latest.runId) continue
    mintedBy.set(r.run_id, [...(mintedBy.get(r.run_id) ?? []), String(r.theme_id)])
  }
  for (const [runId, themeIds] of mintedBy) {
    if (await loadRegimeOpened(supabase, clientId, runId)) for (const id of themeIds) out.add(id)
  }
  return out
}

/** Each theme's videos in the month (`month_evidence_refs`, the category's
 *  theme rows), by registry id. Empty where the table is not there. The same
 *  rows' comment ids go into `comments`, where given: the quote bank's anchor
 *  (WP3.8), at no extra read. */
async function loadThemeRefs(client: SupabaseClient, clientId: string, month: string, ids: readonly string[], comments?: Map<string, Set<string>>): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  for (const part of chunk(ids, UUID_IN_CHUNK)) {
    const res = await client
      .from(TABLE_EVIDENCE_REFS)
      .select(comments ? 'object_id, video_ids, comment_ids' : 'object_id, video_ids')
      .eq('client_id', clientId)
      .eq('month', month)
      .eq('audience', INDUSTRY_AUDIENCE)
      .eq('object_kind', 'theme')
      .in('object_id', part)
    for (const r of monthRows<{ object_id: string; video_ids: string[] | null; comment_ids?: string[] | null }>(res, 'voice.refs')) {
      out.set(String(r.object_id), (r.video_ids ?? []).map(String))
      comments?.set(String(r.object_id), new Set((r.comment_ids ?? []).map(String)))
    }
  }
  return out
}

/** The biggest theme a stored `?themes=` link names (its member slugs), among
 *  these, in the order given. One read, only when such a link arrived. */
async function loadLinkedTheme(supabase: SupabaseClient, clientId: string, slugs: ReadonlySet<string>, ordered: readonly string[]): Promise<string | null> {
  if (slugs.size === 0 || ordered.length === 0) return null
  const res = await supabase.from('theme_registry').select('id, member_slugs').eq('client_id', clientId).in('id', [...ordered])
  const named = new Set(
    readRows<{ id: string; member_slugs: string[] | null }>(res, 'voice.linkedTheme')
      .filter((r) => (r.member_slugs ?? []).some((s) => slugs.has(s)))
      .map((r) => String(r.id)),
  )
  return ordered.find((id) => named.has(id)) ?? null
}

/**
 * What people did in one theme's comments (`themeKindCounts`): the themed
 * update's supporting insights for the theme, every one of them, and each
 * insight's kind and video. Read off the BASE table by id, so an insight a
 * newer update superseded still resolves (AGENTS.md). Null where it cannot be
 * read.
 */
async function loadThemeKinds(
  supabase: SupabaseClient,
  clientId: string,
  themedRunId: string | null,
  registryId: string,
  monthVideos: readonly string[],
): Promise<{ kind: string; label: string; videos: number }[] | null> {
  if (!themedRunId || monthVideos.length === 0) return null
  const res = await supabase
    .from('themes')
    .select('supporting_insight_ids')
    .eq('client_id', clientId)
    .eq('run_id', themedRunId)
    .eq('registry_id', registryId)
    .limit(1)
    .maybeSingle()
  const themeRow = row<{ supporting_insight_ids: string[] | null }>(res, 'voice.themeInsights')
  const ids = themeRow?.supporting_insight_ids ?? []
  if (ids.length === 0) return null
  const insights = await fetchInsightsByIds<{ category: string | null; source_video_id: string | null }>(supabase, ids, 'id, category, source_video_id')
  return themeKindCounts(insights, new Set(monthVideos))
}

/**
 * Conversation, for one tenant, on its reading month.
 *
 * Null is the first-run empty state: a tenant with no delivered update has no
 * reading of anything, and the page says so rather than drawing four blocks of
 * refusals.
 */
export async function loadVoiceSurface(scope: Scope): Promise<VoiceSurfaceData | null> {
  const supabase = scope.supabase as SupabaseClient
  const { clientId } = scope
  const reading: ReadingHandle = scope.reading
  // `?view=` is kept only where it names a view this tenant reads (lib/views).
  const params = viewParams(clientId, scope.params as VoiceSurfaceParams)
  const readingAt = new Date().toISOString()
  // ONE MONTH, NO HORIZON (the nav offers none, `lib/nav.ts`): the board, the
  // pane and the market line all read the reading month.
  const horizon = parseHorizon(null)

  // ── wave 1: who this is, and what has been delivered ───────────────────
  const [clientRes, runsRaw, rivals, schedule] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    loadDeliveredRuns(supabase, clientId),
    loadRivals(supabase, clientId),
    loadReadingSchedule(supabase, clientId),
  ])
  const client = row<{ company_name: string | null }>(clientRes, 'voice.client')
  const brand = client?.company_name ?? 'Your brand'
  if (runsRaw.length === 0) return null

  // The themed run is started here and taken in wave 3: it waits on the
  // running-run ids alone, so it overlaps wave 2 (WP23).
  const themedRunAhead = fetchRunningRunIds(supabase, clientId, 'voice-surface').then((ids) =>
    fetchThemedRunId(supabase, clientId, ids, 'voice-surface'),
  )
  themedRunAhead.catch(() => {})

  const updatesByMonth: Record<string, number> = {}
  for (const r of runsRaw) {
    const m = monthStartOf(r.started_at)
    updatesByMonth[m] = (updatesByMonth[m] ?? 0) + 1
  }
  const firstRunMonth = monthStartOf(runsRaw[0].started_at)

  // ── wave 2: the denominators, which decide the reading month ───────────
  const history = await loadMonthSeries(reading.client, clientId, {
    from: '2019-01-01', to: readingAt, updatesByMonth, firstRunMonth,
  })
  const started = sinceStart(history.denominators.map((d) => ({ month: d.month, videos: d.videos })))
  const marketRivals = marketRivalAudiences(rivals)
  const view = readingViewFrom({
    now: readingAt,
    runs: runsRaw,
    denominators: history.denominators,
    rivalAudiences: marketRivals,
    schedule,
    explicit: scope.params[MONTH_PARAM] ?? null,
  })
  const rm = view.reading
  const window = horizonWindow(horizon, readingAnchor(rm), started.from)
  const axis = window.months
  const month = axis[axis.length - 1]
  const prevMonth = previousMonthOf(month)
  // Frozen once an UPDATE has passed its freeze line, not the clock.
  const monthStatus = freezeStateFor(month, rm.asAt ?? readingAt)

  // THE MONTH-PAIR JUDGE (decision D, WP1.3): the board's and the pane's one
  // chip is the themes view's refusal (decision E: themes are the category's).
  const judgeAhead = loadAppPairOn(reading, readingAt)
  const db = reading.client
  const addedAhead = addedSearchesRead(db, clientId, month)()
  // THE VIEW (WP3.3, lib/views): one lens read, and none while no view is live.
  const viewAhead = readConversationView(db, clientId, params, month, prevMonth)

  // C5 AND C6 START HERE (WP3.8): they read the reading month alone, so they
  // run beside everything below. The month's category videos, with their
  // accounts and segments, serve both: every quote the bank prints is under
  // one of them.
  const makerRule = makerRuleEnabled(clientId)
  const monthVideosAhead = loadMonthVideos(db, clientId, month, makerRule)
  monthVideosAhead.catch(() => {})
  const kindRowsAhead = loadKindRows(db, clientId, month, marketRivals)
  kindRowsAhead.catch(() => {})
  // The memory's months are known now, and so are their reads.
  const remembered = memoryMonths(month, history.denominators.filter((d) => d.audience === INDUSTRY_AUDIENCE).map((d) => monthStartOf(d.month)))
  const earlierAhead = loadEarlierMonths(db, clientId, month, remembered)
  earlierAhead.catch(() => {})
  const whereAhead = (async (): Promise<WhereBlock | null> => {
    const mv = await monthVideosAhead
    if (!mv) return null
    const base = { month, videos: mv.videos, segments: mv.segments, segmentsState: mv.segmentsState }
    // Every listed account first (the memory reads their videos), then the
    // block as the reader asked for it.
    const listed = buildWhere({ ...base, memory: null, expanded: true }).rows
    const memory = listed.length > 0
      ? await loadMemory(db, clientId, month, remembered, mv.videos, listed.map((a) => ({ platform: a.platform, name: a.name })), earlierAhead)
      : null
    return buildWhere({ ...base, memory, expanded: params.accounts === 'all' })
  })()
  whereAhead.catch(() => {})

  // ONE BRAND'S VIDEOS (`?brand=`), IN THE BOARD'S PLACE: the ninety days the
  // Brands page reads, started here beside everything else. A page without
  // the parameter reads nothing more (`./voice-surface-brand.ts`).
  const brandName = brandNamed(params.brand, rivals)
  const brandAhead = brandName
    ? themedRunAhead.then((themedRunId) => loadBrandView(db, clientId, { name: brandName, window: ninetyDays(windowEnd(rm)), themedRunId, all: params.board === 'all' }))
    : Promise.resolve(null)
  brandAhead.catch(() => {})

  // ── wave 3: the pool, the segments, the overrides, the cast ────────────
  const [themedRunId, cv] = await Promise.all([themedRunAhead, viewAhead])
  const [pool, segmentRows, excluded, profileRes, newestRunRes] = await Promise.all([
    cv.lens ? cv.pool([], POOL_FLOOR) : loadThemePool(db, clientId, month),
    loadThemeSegmentRows(db, clientId, month, themedRunId),
    loadLeadExclusions(db, clientId),
    supabase.from('consumer_profiles')
      .select('headline, personas, run_date, run_id, insight_population, theme_population')
      .eq('client_id', clientId).order('run_date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('pipeline_runs').select('id').eq('client_id', clientId)
      .in('status', ['completed', 'partial']).order('started_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  // Under a brand, `board=all` is the brand's list, not the market's pool.
  const expanded = params.board === 'all' && !brandName
  const atTenIds = pool.filter((r) => r.k >= THEME_FLOOR).map((r) => r.id)
  const shownIds = expanded ? pool.map((r) => r.id) : atTenIds
  const kById = new Map(pool.map((r) => [r.id, r.k]))

  // On a view (WP3.3) the segments and shares are the view's (`cv`, an
  // identity while no view is live).
  const segments: ThemeBoard['segments'] = cv.segments(!makerRule ? 'no_rule' : segmentRows ? 'measured' : 'unknown')
  const shares = cv.shares(segmentRows ? themeSegmentsOf(segmentRows) : null)

  // ── wave 4: last month, the labels and kinds, and each theme's videos ──
  // The refs' comment ids ride the same read: the bank's anchor (C5).
  const refComments = new Map<string, Set<string>>()
  const wave4 = Promise.all([
    cv.lens ? cv.prevK(new Map()) : loadPrevK(db, clientId, prevMonth, shownIds),
    loadBoardObservations(db, clientId, themedRunId, shownIds),
    loadThemeRefs(db, clientId, month, shownIds, refComments),
  ])
  wave4.catch(() => {})

  // THE BANK (C5), STARTED BESIDE WAVE 4: its themes are the board's rows,
  // every theme at 10+ not led by makers or by off-topic videos
  // (`buildThemeBoard`'s rule), known from the pool and the segments alone.
  // The shortlist waits for wave 4 (the themes' kinds, the refs' anchors) and
  // the month's segments, its translations follow, and the labels join at
  // the end, after the brand check.
  const bankIds = atTenIds.filter((id) => segments !== 'measured'
    || ((shares?.maker.get(id) ?? 0) < MAKER_GROUP_SHARE && (shares?.noise.get(id) ?? 0) < MAKER_GROUP_SHARE))
  const wordsReadAhead = (async () => {
    const [candidates, mv, [, obs]] = await Promise.all([
      loadWordsCandidates(supabase, clientId, themedRunId, bankIds, month),
      monthVideosAhead.catch(() => null),
      wave4,
    ])
    if (!candidates) return null
    const segmentOf = mv?.segments ?? null
    const anchors = refComments.size > 0 ? refComments : null
    const known = new Map(bankIds.map((id) => [id, { kind: obs.get(id)?.kind ?? null, k: kById.get(id) ?? 0 }]))
    const short = shortlistWords(candidates.map((c) => ({ ...c, segment: c.videoId ? segmentOf?.get(c.videoId) ?? null : null })), month, anchors, known)
    const translations = await readTranslations(supabase, short.map((c) => c.quote))
    return {
      candidates: short.map((c) => ({ ...c, ...readingOf(translations, c.quote) })),
      anchors,
      segments: (mv?.segmentsState ?? (makerRule ? 'unknown' : 'no_rule')) as WordsBlock['segments'],
    }
  })()
  wordsReadAhead.catch(() => {})

  const [prevK, obs, refs] = await wave4
  const denom = (m: string, audience: string) =>
    history.denominators.find((d) => monthStartOf(d.month) === m && d.audience === audience) ?? null
  const n = cv.n(denom(month, INDUSTRY_AUDIENCE)?.videos ?? 0)
  const prevN = cv.prevN(denom(prevMonth, INDUSTRY_AUDIENCE)?.videos ?? null)

  // FOUR THINGS NOW RUN BESIDE EACH OTHER, because none waits on another: the
  // flags' reads, where each theme's videos came from, the cast, and the lead
  // with its quotes. The page's wall time is its longest chain, not its sum.

  // THE CAST (C4): its profile was read in wave 3.
  const castAhead = buildCast({
    supabase,
    params,
    profile: row<{ personas: Partial<Persona>[]; run_date: string; run_id: string; insight_population: number | null; theme_population: number | null }>(profileRes, 'voice.consumerProfile'),
    newestRunId: row<{ id: string }>(newestRunRes, 'voice.newestRun')?.id ?? null,
  })
  castAhead.catch(() => {})

  // THE FLAGS (WP2.4). A theme last month's category held is heard before;
  // for the rest, one read for any earlier row in any audience, and the regime
  // rule for those no earlier month holds (WP1.9).
  let latestOpened: Promise<boolean> | null = null
  const openedByLatest = (): Promise<boolean> =>
    (latestOpened ??= themedRunId ? loadRegimeOpened(supabase, clientId, themedRunId) : Promise.resolve(false))
  const mintedByLatest = new Set(shownIds.filter((id) => obs.get(id)?.matchKind === 'new'))
  const unheard = shownIds.filter((id) => (kById.get(id) ?? 0) >= THEME_FLOOR && !((prevK.get(id) ?? 0) > 0))
  const flagsAhead = (async () => {
    const heardBefore = await loadHeardBefore(db, clientId, month, unheard)
    const regrouped = prevN == null
      ? new Set<string>()
      : await loadRegrouped(supabase, clientId, unheard.filter((id) => !heardBefore.has(id)), { runId: themedRunId, minted: mintedByLatest, opened: openedByLatest })
    return { heardBefore, regrouped }
  })()
  flagsAhead.catch(() => {})

  // WHERE EACH THEME'S VIDEOS CAME FROM (WP2.4, the 26 Sep ruling). The added
  // searches first: in a month where none was added every count is 0 and no
  // video's evidence is read.
  const provenanceAhead = (async () => {
    const added = await addedAhead
    const shownVideos = [...new Set(shownIds.flatMap((id) => refs.get(id) ?? []))]
    const evidence = added && added.size > 0 && shownVideos.length > 0 ? await loadThemeEvidence(db, clientId, shownVideos) : null
    return { added, evidence }
  })()
  provenanceAhead.catch(() => {})

  const build = (regimeOpened: boolean): MarketTheme[] => shownIds.flatMap((id) => {
    const o = obs.get(id)
    const k = kById.get(id) ?? 0
    if (!o?.label) return []
    const pk = prevN != null ? prevK.get(id) ?? 0 : null
    return [{
      registryId: id,
      label: o.label,
      labelStripped: false,
      kind: o.kind,
      k,
      n,
      prev: pk != null && prevN != null ? { month: prevMonth, k: pk, n: prevN } : null,
      makerShare: shares?.maker.get(id) ?? null,
      noiseShare: shares?.noise.get(id) ?? null,
      identityNewThisRun: o.matchKind === 'new' && !regimeOpened,
      // Set below, once the flags' reads are in.
      flags: [],
      provenance: null,
    }]
  })

  // THE LEAD, BY THE FRONT PAGE'S RULE (`heroLead` over its ten rows, WP1.6's
  // `loadMarketReads`), with the regime read only where it can decide it: a
  // theme the latest update minted that would otherwise lead.
  const atTen = (ts: readonly MarketTheme[]) => ts.filter((t) => t.k >= THEME_FLOOR)
  const naive = buildThemeBoard(atTen(build(true)), n, month, segments, null)
  const wouldLead = naive.rows.find((t) => mayLead(t, segments, excluded))
  const regimeOpened = wouldLead != null && mintedByLatest.has(wouldLead.registryId) ? await openedByLatest() : false
  let themes = build(regimeOpened)

  // THE QUOTES, ONE READ SET: the pane's theme (the one asked for or linked;
  // else the two lead candidates, since a stripped label moves the lead to the
  // second, and the biggest theme, which the pane opens where nothing may
  // lead), and every label naming a brand, whose evidence decides whether the
  // name stays (`stripUnevidencedBrand`, §5.3). What people did in the pane's
  // theme's comments is read beside them, for the theme it will most likely
  // open.
  const brandNames = [brand, ...rivals.map((r) => r.name)].filter(Boolean)
  const deepSlugs = new Set((params.themes ?? '').split(',').map((s) => s.trim()).filter(Boolean))
  const asked = params.theme && themes.some((t) => t.registryId === params.theme) ? params.theme : null
  const byK = [...themes].sort((a, b) => b.k - a.k || a.registryId.localeCompare(b.registryId))
  const linked = deepSlugs.size > 0 && !asked ? await loadLinkedTheme(supabase, clientId, deepSlugs, byK.map((t) => t.registryId)) : null
  const tenBoard = buildThemeBoard(atTen(themes), n, month, segments, null)
  const candidates = tenBoard.rows.filter((t) => mayLead(t, segments, excluded)).slice(0, 2).map((t) => t.registryId)
  const paneIds = asked ? [asked] : linked ? [linked] : [...new Set([...candidates, ...(tenBoard.rows[0] ? [tenBoard.rows[0].registryId] : [])])]
  const kindOf = (id: string) => themes.find((t) => t.registryId === id)?.kind ?? null
  const wanted = new Map<string, string | null>(paneIds.map((id) => [id, kindOf(id)]))
  const branded = themes.filter((t) => namesABrand(t.label, brandNames)).map((t) => t.registryId)
  for (const id of branded) if (!wanted.has(id)) wanted.set(id, null)
  const likelyOpen = paneIds[0] ?? null
  const kindsFor = (id: string) => loadThemeKinds(supabase, clientId, themedRunId, id, refs.get(id) ?? [])
  const likelyKinds = likelyOpen ? kindsFor(likelyOpen) : Promise.resolve(null)
  likelyKinds.catch(() => {})
  const quotes = await loadThemeQuotes(supabase, clientId, themedRunId, wanted, month, new Set(paneIds))
  if (branded.length > 0) {
    themes = themes.map((t) => {
      if (!branded.includes(t.registryId)) return t
      const stripped = stripUnevidencedBrand(t.label, brandNames, quotes.get(t.registryId)?.texts ?? [])
      return stripped.stripped ? { ...t, label: stripped.label, labelStripped: true } : t
    })
  }
  const hero = heroLead(buildThemeBoard(atTen(themes), n, month, segments, null), [], excluded)
  const leadId = hero.kind === 'themes' ? hero.lead?.registryId ?? null : null

  // THE FLAGS AND THE PROVENANCE, IN.
  const [{ heardBefore, regrouped }, { added, evidence }] = await Promise.all([flagsAhead, provenanceAhead])
  themes = themes.map((t) => ({
    ...t,
    flags: themeFlags({ k: t.k, prevK: t.prev?.k ?? null, heardBefore: (t.prev?.k ?? 0) > 0 || heardBefore.has(t.registryId), regrouped: regrouped.has(t.registryId) }),
    provenance: cv.provenance(themeProvenance(refs.get(t.registryId) ?? [], evidence, added), t.k),
  }))

  // THE CATEGORY'S VIDEOS IN A THEME AT 10+ (C1's second line): the union of
  // their videos, where every one of them was read.
  const tenIds = themes.filter((t) => t.k >= THEME_FLOOR).map((t) => t.registryId)
  const inThemes = cv.inThemes(tenIds.length > 0 && tenIds.every((id) => refs.has(id))
    ? new Set(tenIds.flatMap((id) => refs.get(id) ?? [])).size
    : null)
  const pair = await judgeAhead
  const chip = pairChip(pair(prevMonth, month, INDUSTRY_AUDIENCE))
  const board = buildConversationBoard(themes, n, month, segments, prevN != null ? { month: prevMonth, n: prevN } : null, {
    expanded,
    belowCount: pool.length - atTenIds.length,
    inThemes,
    chip,
  })

  // ── the theme in full ───────────────────────────────────────────────────
  const openId = openThemeId({ asked, linked, lead: leadId, board })
  const open = openId ? themes.find((t) => t.registryId === openId) ?? null : null
  // Where stripping moved the lead past the candidates read above, its quotes
  // are read now: the pane never opens a theme it has no voices read for.
  const openQuotes = open && !paneIds.includes(open.registryId)
    ? loadThemeQuotes(supabase, clientId, themedRunId, new Map([[open.registryId, open.kind]]), month, new Set([open.registryId]))
    : Promise.resolve(quotes)
  const [kinds, cast, voicesRead] = await Promise.all([
    !open ? Promise.resolve(null) : open.registryId === likelyOpen ? likelyKinds : kindsFor(open.registryId),
    castAhead,
    openQuotes,
  ])
  // DECISION F ON THE LEAD'S VOICES, AS ON THE FRONT PAGE: the lead may be up
  // to a quarter makers, and its voices come only from a video the reader
  // precedence marks 'market' (one `segments_for_videos` call), so the pane
  // prints the headline's own voices. A theme the reader opened keeps its own
  // evidence, makers' included.
  const isLead = open != null && open.registryId === leadId
  const marketVoicesOnly = isLead && segments === 'measured'
  const openCandidates = open ? voicesRead.get(open.registryId)?.candidates ?? [] : []
  if (marketVoicesOnly || cv.readsSegments) await markVideoSegments(db, clientId, openCandidates)
  const theme: ThemeBlock = open
    ? {
        state: 'ready',
        id: open.registryId,
        label: open.label,
        kind: open.kind,
        kindLabel: open.kind ? marketKindLabel(open.kind) : null,
        makerSentence: segments === 'measured' ? makerShareSentence(open.makerShare) : null,
        flags: open.flags,
        k: open.k,
        n: open.n,
        prev: open.prev,
        provenance: open.provenance,
        kinds: cv.kinds(kinds),
        // Never a sale offer or an ad (default M-c): the next eligible voice.
        voices: pickQuotes(cv.voices(openCandidates), { month, kind: open.kind, count: THEME_VOICES, marketVideosOnly: marketVoicesOnly, skipOffers: true })
          .map((c) => voiceOf(c as Parameters<typeof voiceOf>[0])),
        chip,
        isLead,
        videosHref: `/dashboard/videos?theme=${encodeURIComponent(open.registryId)}`,
        askHref: askAboutTheme(open.label, month),
        notes: [],
      }
    : {
        state: 'none', id: null, label: 'No theme is open', kind: null, kindLabel: null, makerSentence: null,
        flags: [], k: null, n: null, prev: null, provenance: null, kinds: null, voices: [], chip,
        isLead: false, videosHref: '/dashboard/videos', askHref: '/dashboard/agent', notes: [noThemeOpen(month)],
      }

  // ── the market in the month ─────────────────────────────────────────────
  const pooled = pooledDenominators(history.denominators, marketRivals)
  const counts = pooled.get(month) ?? null
  const categoryDenom = denom(month, INDUSTRY_AUDIENCE) as (ReturnType<typeof denom> & { platform_mix?: Record<string, number> }) | null
  const market: ConversationMarket = {
    videos: counts?.videos ?? null,
    comments: counts?.comments ?? null,
    category: counts?.category ?? null,
    rivalFiled: counts?.rivalFiled ?? null,
    // `month_denominators` is read with `select('*')`, so `platform_mix` is
    // there although `DenominatorPoint` does not name it.
    platformMix: platformShares(categoryDenom?.platform_mix, categoryDenom?.videos ?? null),
  }
  const viewed = cv.finish(market, { month, rivalAudiences: marketRivals, params })

  // ── C5 and C6, in ──────────────────────────────────────────────────────
  // A failure here costs its block, never the page: each block then says it
  // was not read.
  const quiet = <T,>(p: Promise<T>, label: string): Promise<T | null> => p.catch((error: unknown) => {
    console.error(`[pages] ${label}: ${(error as Error)?.message ?? String(error)}; not read`)
    return null
  })
  const [wordsRead, kindRows, where, brandView] = await Promise.all([
    quiet(wordsReadAhead, 'voice.words'),
    quiet(kindRowsAhead, 'voice.words.kinds'),
    quiet(whereAhead, 'voice.where'),
    quiet(brandAhead, 'voice.brand'),
  ])
  const bankThemes = new Map(themes.filter((t) => bankIds.includes(t.registryId)).map((t) => [t.registryId, { label: t.label, kind: t.kind, k: t.k }]))
  const words: WordsBlock | null = wordsRead && kindRows
    ? buildWords({
        month,
        candidates: wordsRead.candidates,
        kindVideos: marketKindVideos(kindRows, pooled, month, marketRivals),
        themes: bankThemes,
        anchors: wordsRead.anchors,
        segments: wordsRead.segments,
      })
    : null

  return {
    brand,
    month,
    monthStatus,
    readingAt,
    reading: rm,
    otherMonths: view.others,
    horizon,
    window,
    axis,
    substrate: history.substrate,
    notes: history.notes,
    params,
    market: viewed.market,
    board,
    theme,
    cast,
    words,
    where,
    ...(viewed.view ? { view: viewed.view } : {}),
    brandView,
  }
}

/** The calendar month before this one. */
function previousMonthOf(month: string): string {
  const d = new Date(`${monthStartOf(month)}T00:00:00.000Z`)
  return monthStartOf(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString())
}

// ---- C4, who is talking ---------------------------------------------------------

/** Personas are named only where at least this many videos carry them — the
 *  floor Pass E writes under (design §3 VO4). */
export const PERSONA_VIDEO_FLOOR = 3

type EvidenceRow = {
  id: string
  audience_insight_id: string
  quote: string | null
  relevance_rank: number | null
  redacted: boolean | null
}

interface CastInput {
  supabase: SupabaseClient
  params: VoiceSurfaceParams
  profile: {
    personas: Partial<Persona>[]; run_date: string; run_id: string
    insight_population: number | null; theme_population: number | null
  } | null
  newestRunId: string | null
}

/**
 * VO4 — who is talking, current state only.
 *
 * THREE THINGS ARE CUT AND NOT REBUILT (decision W and design §3 VO4): the
 * connector lines, "how the mix has moved" — it read the oldest twelve
 * profiles, survivor-only and index-spaced, and there is no sound persona
 * series to draw — and the dropped-groups line, which needs a Pass E prompt
 * change this phase does not make. The crowd figure is KEPT, at the owner's
 * call, as the page's one piece of decoration.
 */
async function buildCast(input: CastInput): Promise<CastBlock> {
  // TWO HALVES, BECAUSE THE ARTBOARD'S FOOTER HAS TWO ENDS (Block D wave 2).
  // The floor is a fact about which groups are named; the state is a fact about
  // what the whole block is a reading of, and it belongs in the mono note at
  // the right-hand end rather than trailing a sentence about the floor.
  // The floor in the artboard's two words (copy de-clutter B38); the rule
  // itself is written once in Settings › How to read.
  const floorNote = `${fmtInt(PERSONA_VIDEO_FLOOR)}-video floor`
  const overlapNote = 'A video can carry more than one group, so these counts overlap and do not add up to a whole.'
  if (!input.profile) {
    return {
      state: 'not_run', personas: [], selected: null, population: null,
      overlapNote, profileDate: null, stale: false, floorNote,
      empty: 'Reading who is talking is not switched on for this workspace yet.',
    }
  }
  const personas = (input.profile.personas ?? [])
    .map((p) => normalisePersona(p as Partial<Persona>))
    .filter((p): p is Persona => Boolean(p))
  if (personas.length === 0) {
    return {
      state: 'no_personas', personas: [], selected: null,
      population: input.profile.insight_population ?? null,
      overlapNote, profileDate: input.profile.run_date, stale: false, floorNote,
      empty: 'Too little conversation in this update to describe who is talking.',
    }
  }

  // One voice per group, from the evidence the group already cites. Read by
  // evidence id off the BASE table so a row a newer in-flight update has
  // superseded still resolves (AGENTS.md).
  const ids = [...new Set(personas.flatMap((p) => p.insightIds.slice(0, 4)))]
  const quoteByInsight = new Map<string, { id: string; quote: string }>()
  if (ids.length > 0) {
    const res = await input.supabase
      .from('insight_evidence')
      .select('id, audience_insight_id, quote, relevance_rank, redacted')
      .in('audience_insight_id', ids)
      .order('relevance_rank', { ascending: true }).order('id')
    for (const ev of readRows<EvidenceRow>(res, 'voice.castEvidence')) {
      if (ev.redacted || !ev.quote) continue
      if (quoteByInsight.has(ev.audience_insight_id)) continue
      quoteByInsight.set(ev.audience_insight_id, { id: ev.id, quote: cleanQuote(ev.quote) })
    }
  }
  const readings = await readTranslations(input.supabase, [...quoteByInsight.values()].map((q) => q.quote))

  const selectedKey = personas.find((p) => p.key === input.params.persona)?.key ?? personas[0].key
  const cast: CastPersona[] = personas.map((p) => {
    const hit = p.insightIds.map((id) => quoteByInsight.get(id)).find(Boolean) ?? null
    const mix = p.platformMix ?? null
    const mixTotal = mix ? Object.values(mix).reduce((n, v) => n + Number(v), 0) : 0
    return {
      key: p.key,
      name: p.name,
      oneLiner: p.oneLiner,
      videos: p.sourceVideoCount,
      wants: p.wants,
      blockers: p.blockers,
      triggers: p.triggers,
      platformMix: platformShares(mix, mixTotal > 0 ? mixTotal : null),
      quote: hit ? { ref: quoteRef.evidence(hit.id), text: hit.quote, ...readingOf(readings, hit.quote) } : null,
      quoteCite: hit ? 'one of this group\u2019s own comments' : null,
      selected: p.key === selectedKey,
      href: voiceSurfaceHref(input.params, { persona: p.key }),
    }
  })

  return {
    state: 'ready',
    personas: cast,
    selected: selectedKey,
    population: input.profile.insight_population ?? null,
    overlapNote,
    profileDate: input.profile.run_date,
    stale: Boolean(input.newestRunId) && input.profile.run_id !== input.newestRunId,
    floorNote,
    empty: null,
  }
}

