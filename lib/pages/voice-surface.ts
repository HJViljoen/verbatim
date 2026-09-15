import type { SupabaseClient } from '@supabase/supabase-js'

import { prevalenceTier, type PrevalenceTier } from '../calibration'
import { fmtInt, platformLabel, shortDate, weekdayDate } from '../format'
import { cleanQuote, readTranslations, readingOf } from '../quotes'
import { quoteRef } from '../renderables/quotes-freeze'
import type { Quote, Scope } from '../renderables/types'
import { normalisePersona, type Persona } from '../profile-tiles'
import {
  CLIENT_AUDIENCE,
  INDUSTRY_AUDIENCE,
  isMissingCompetitors,
  loadCompetitors,
  rivalKey,
  type Competitor,
} from '../rivals'
import { audienceLabel } from '../readiness/types'
import { directionWord, monthChange, thinMonth, type Direction, type SeriesPoint } from '../reading/bands'
import { horizonWindow, parseHorizon, sinceStart, type Horizon, type HorizonWindow } from '../reading/horizon'
import { KIND_ORDER, kindShares, redditRead, kindChange, type KindShare, type RedditRead } from '../reading/kinds'
import { freezeStateFor, isMissingMonthTable } from '../reading/monthly'
import { monthStartOf, nextMonth } from '../reading/month-key'
import { isMissingKindMoodAttention } from '../reading/attention'
import { moodChange, moodShares, type MoodShare } from '../reading/mood'
import { loadMonthSeries, loadTopObjects, type ReadingHandle } from '../reading/read'
import { countRefused, howSoundLine, loadRecordInputs, recordLines, refusals } from '../reading/record'
import { pointsByMonth, type DenominatorPoint, type MonthLabel, type MonthPoint, type MonthSeries, type Substrate } from '../reading/series'
import type { MonthStatus } from '../reading/types'
import type { FigureTable, Verdict } from '../reading/verdicts'
import { selectAll } from '../supabase-admin'
import { onCameraNote } from '../voice-tiles'
import {
  firstHeardThisMonth,
  longMonth,
  recordWindow,
  splitMovers,
  type Mover,
  type StoredKindRow,
  type StoredStatsRow,
} from './overview'
import { row, rows as readRows } from './read'
import { fetchRunningRunIds } from './latest-video-run'
import { fetchThemedRunId } from './themed-run'

// Voice — "who is saying what in this category?" (Phase 1 WP13, design §3
// VO1–VO4, decisions Q and W).
//
// FOUR BLOCKS ON THE MONTHLY READING, and a fifth spine that is deliberately
// absent. VO1 is the audience, the kind and the platform the rest of the page
// obeys; VO2 is what moved, on ONE axis; VO3 is a theme in full; VO4 is the
// cast, current state only. The mock draws a fifth band — "what we concluded
// this month" — and decision Q refuses to rebuild it here: Market's MK1 owns
// the list and VO3 carries a LINK to the conclusion drawn from the theme on
// screen. A list of conclusions maintained in two places is two lists.
//
// WHY A SECOND MODULE BESIDE `lib/pages/voice.ts`. That file is the legacy
// Voice of Customer loader and it stays exactly where it is: its renderables
// are registered under the page key `voice` (components/pages/registry.ts) and
// the export route, the share page, the Studio and `lib/reports/build.ts` all
// resolve `voice.<tile>` through it. WP13 replaces the ROUTE — what a reader
// opens at /dashboard/voice — not the module an artefact names, exactly as
// WP11 replaced the Dashboard's route and left `dashboard` registered. The two
// retire together when the block spine reaches reports (WP17/WP19).
//
// WHAT THIS READS AND WHAT IT REFUSES. Every count is a count of VIDEOS off
// the stored month tables through lib/reading — never off a run, never summed
// across months. Three of the four blocks have a half that depends on a
// migration authored and NOT YET APPLIED (kinds and tone on M5; the re-read
// share on M2), and each of those reads is guarded by its own named
// `isMissing*` test and degrades to a sentence naming what is not recorded.
// A direction word is earned only by `directionWord` over three consecutive
// months in one clustering regime, and it travels as a `Direction` beside a
// `Verdict` so the renderer can mark it.

/** An audience under this many videos in the month is shown with its count and
 *  marked thin rather than hidden (design §3 VO1). Both tenants' own brands
 *  carry the mark: Össur reads 19 videos in September and Sealand 3. */
export const THIN_AUDIENCE_VIDEOS = 30

/** Movers here, and movers with the list expanded (design §3 VO2: "three rows
 *  on OV3, six here by default, ten expanded"). */
export const MOVERS_HERE = 6
export const MOVERS_EXPANDED = 10

/** Themes ranked per audience before the bands are drawn over them. Wider than
 *  Overview's pool because this page is the one that shows the whole ladder. */
export const VOICE_MOVER_POOL = 40

/** Quotes in the theme pane (design §3 VO3: "up to six quotes"). */
export const THEME_QUOTES = 6

/** Rows the "have we seen this before?" search returns. */
export const SEARCH_ROWS = 12

/** Cited evidence rows read per theme, and the cap on the ids asked for. */
const EVIDENCE_PER_THEME = 24

/** The tone line needs this many rated videos at a point (design §3 VO3). */
export const TONE_FLOOR = 5

/** Personas are named only where at least this many videos carry them — the
 *  floor Pass E writes under, printed rather than implied (design §3 VO4). */
export const PERSONA_VIDEO_FLOOR = 3

// ---- the shapes ---------------------------------------------------------------

export type VoiceSurfaceParams = {
  horizon?: string
  audience?: string
  kind?: string
  platform?: string
  /** The deep link Market and the old Dashboard draw: theme member slugs. Kept
   *  (the WP's own line) — 32 stored links carry it. */
  themes?: string
  /** `theme_registry.id` — which theme the pane is open on. */
  theme?: string
  /** `'all'` expands VO2 from six rows to ten. */
  movers?: string
  /** The search box in VO3. */
  q?: string
  persona?: string
}

/** One entry in the audience switch. */
export interface AudienceOption {
  audience: string
  label: string
  /** The audience's videos this month, or null where it carried no row. */
  videos: number | null
  comments: number | null
  /** Under THIN_AUDIENCE_VIDEOS — shown with its count, marked, never hidden. */
  thin: boolean
  observed: boolean
  retiredAt: string | null
  selected: boolean
  href: string
}

/** One filter option — a kind or a platform. A filter is a LINK, never a menu:
 *  the selection is in the URL, so it can be shared, exported and frozen into a
 *  snapshot's params (the horizon control's own rule, WP9). */
export interface FilterOption {
  value: string
  label: string
  /** The videos this option would leave, or null where the reading that would
   *  answer it is not recorded. */
  videos: number | null
  active: boolean
  href: string
}

/** The month's replies, counted on the comments themselves.
 *
 * ACROSS EVERY AUDIENCE, AND THE COPY SAYS SO. `comments` carries no audience
 * key — the bucket is a property of the VIDEO, and the two tables are joined
 * on `platform` + `video_id` rather than by a foreign key — so an
 * audience-scoped reply count is a join no page-load can afford and an RPC
 * this work package has no migration for. What IS exact and cheap is the
 * tenant's month, counted with three `head: true` counts and no rows fetched.
 * A number narrower than that would be a guess wearing a denominator. */
export interface RepliesRead {
  /** Comments dated into this month, tenant-wide. */
  comments: number
  /** Of those, the ones that are replies to another comment. */
  replies: number
  pct: number | null
  /** Of the replies, the ones on Reddit — the platform the argument happens on. */
  reddit: number | null
}

export interface AudienceBlock {
  options: AudienceOption[]
  selected: string
  label: string
  videos: number | null
  comments: number | null
  thin: boolean
  /** The month's videos by platform, off `month_denominators.platform_mix`. */
  platformMix: { platform: string; label: string; videos: number; pct: number | null }[]
  /** The platform filter. Empty where the month carried no mix. */
  platforms: FilterOption[]
  platform: string | null
  /** The kind ladder, and the filter over it. Both empty when M5 is unapplied. */
  kinds: KindShare[]
  kindVerdicts: Record<string, Verdict | null>
  kindFilters: FilterOption[]
  kind: string | null
  kindsNote: string | null
  reddit: RedditRead | null
  replies: RepliesRead | null
  repliesNote: string | null
}

/** A theme that has stopped being said — the registry's own dormancy rule, not
 *  a reading of this month (design §3 VO2). */
export interface GoneQuiet {
  id: string
  label: string
  /** The month it was last read in, on this page's own axis. Null where the
   *  axis does not reach back to it. */
  lastHeard: string | null
}

export interface MoversBlock {
  growing: Mover[]
  fading: Mover[]
  /** Read, clearing both floors, and NOT clearing the band. The third arm of
   *  the one axis (design §3 VO2) — a row that sat under "growing" showing a
   *  minus is the shape that arm exists to make impossible. */
  flat: Mover[]
  /** First heard this month. A FLAG on a row, printed with the level, never
   *  with a change: a first month has no baseline to be banded against. */
  newcomers: Mover[]
  goneQuiet: GoneQuiet[]
  shown: number
  expanded: boolean
  expandHref: string
  /** The one sentence when nothing moved, or when the month cannot be read. */
  note: string | null
  /** "Re-read this month — treat the change with care", or the honest absence
   *  of the column that would say so (M2). */
  rereadNote: string | null
}

export interface SpokenLine {
  /** What was said, or what was on the screen. */
  text: string
  /** Platform · date · what kind of video it was. */
  cite: string
  href: string | null
}

export interface SearchRow {
  id: string
  label: string
  firstHeard: string | null
  monthsSeen: number
  active: boolean
  href: string
}

export interface ThemeBlock {
  /** `ready` — a theme is open. `none` — nothing in this audience-month can be
   *  opened, which is a different sentence from "the theme you asked for is
   *  gone". */
  state: 'ready' | 'none'
  id: string | null
  label: string
  description: string | null
  audience: string
  audienceLabel: string
  k: number | null
  n: number | null
  pct: number | null
  prevalence: PrevalenceTier | null
  verdict: Verdict | null
  direction: Direction | null
  /** The month this theme was first read in, on the record — `theme_registry.
   *  first_seen_at`, which reaches back past the drawn axis. */
  firstHeard: string | null
  /** Months on the drawn axis it carried a reading in, and how many were drawn. */
  monthsSeen: number
  monthsDrawn: number
  axis: string[]
  points: MonthPoint[]
  /** The tone line: the four-way distribution of the audience's judged videos,
   *  with the negative share banded (decision T). Null with M5 unapplied. */
  tone: { shares: MoodShare[]; judged: number; verdict: Verdict | null } | null
  toneNote: string | null
  /** "17 said on camera", or null where the theme is comment-only. */
  onCamera: string | null
  quotes: Quote[]
  quoteCites: string[]
  /** The spoken line and the on-screen text behind the strongest evidence. */
  spoken: SpokenLine | null
  onScreen: SpokenLine | null
  /** Cited evidence that describes who the commenters are — counted, never
   *  quoted (the standing rule). */
  withheld: number
  /** Market's conclusion for this theme. A LINK, not a list (decision Q). */
  conclusionHref: string
  videosHref: string
  askHref: string
  /** Null where the theme has no registry identity — there is then nothing
   *  stable to declare a move on. */
  trackRegistryId: string | null
  search: { q: string; rows: SearchRow[]; total: number }
  notes: string[]
}

export interface CastPersona {
  key: string
  name: string
  oneLiner: string
  /** Videos this persona was read on, and the month's audience denominator. */
  videos: number
  denominator: number | null
  pct: number | null
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
  denominator: number | null
  /** The share of the audience's videos no persona was named on. */
  unnamedPct: number | null
  /** The update the stored profile is from, and whether it lags the newest. */
  profileDate: string | null
  stale: boolean
  floorNote: string
  empty: string | null
}

export interface RecordBlock {
  line: string
  lines: string[]
}

export interface VoiceSurfaceData {
  brand: string
  month: string
  monthStatus: MonthStatus
  readingAt: string
  horizon: Horizon
  window: HorizonWindow
  axis: string[]
  substrate: Substrate
  notes: MonthLabel[]
  params: VoiceSurfaceParams
  audience: AudienceBlock
  movers: MoversBlock
  theme: ThemeBlock
  cast: CastBlock
  record: RecordBlock
}

// ---- the pure half ------------------------------------------------------------

const round1 = (n: number): number => Math.round(n * 10) / 10

const pctOf = (k: number | null | undefined, n: number | null | undefined): number | null =>
  k == null || n == null || n <= 0 ? null : round1((k / n) * 100)

/**
 * Every href on this page, with the reader's selection preserved.
 *
 * ONE COMPOSER, AND `?themes=` SURVIVES IT. Thirty-two stored links reach
 * /dashboard/voice and fourteen of them carry `?themes=<slug,slug>` (WP9's
 * link census); a page that dropped the key on the first filter click would
 * silently widen the reading a reader arrived at. `null` drops a key, which is
 * how "clear this filter" is written.
 */
export function voiceSurfaceHref(
  params: VoiceSurfaceParams,
  over: Partial<Record<keyof VoiceSurfaceParams, string | null>> = {},
): string {
  const merged: Record<string, string | null | undefined> = { ...params, ...over }
  const qs = new URLSearchParams()
  for (const key of ['horizon', 'audience', 'kind', 'platform', 'themes', 'theme', 'movers', 'q', 'persona']) {
    const value = merged[key]
    if (value) qs.set(key, value)
  }
  const s = qs.toString()
  return s ? `/dashboard/voice?${s}` : '/dashboard/voice'
}

/**
 * Which audience the page is reading.
 *
 * The category by default, and that is the product's argument rather than a
 * fallback: on both tenants the client's own audience carries fewer than thirty
 * videos a month (Össur 19, Sealand 3) and the category carries hundreds, so a
 * page that opened on "yours" would open on the one audience that can carry
 * almost nothing. An audience the tenant does not have falls back the same way
 * rather than rendering a blank reading of a string from the URL.
 */
export function pickAudience(asked: string | undefined, available: readonly string[]): string {
  if (asked && available.includes(asked)) return asked
  if (available.includes(INDUSTRY_AUDIENCE)) return INDUSTRY_AUDIENCE
  return available[0] ?? INDUSTRY_AUDIENCE
}

/** Is this audience too thin to be read without a mark? Shown with its count
 *  either way — hiding it is the one thing the design refuses. */
export const audienceThin = (videos: number | null): boolean =>
  videos == null || videos < THIN_AUDIENCE_VIDEOS

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
 * The third arm of the one axis: read, floors cleared, band not cleared.
 *
 * `splitMovers` (WP11) answers growing and fading off the same list; flat is
 * what is left when a comparison was actually drawn and came back
 * `no_clear_change`. `too_little_data` is NOT flat — it is a row with no
 * comparison at all, and putting it under a heading that says the conversation
 * held steady would be a claim made out of an absence.
 */
export function flatMovers(movers: readonly Mover[], shown: number): Mover[] {
  return movers
    .filter((m) => m.verdict.state === 'no_clear_change')
    .sort((a, b) => b.k - a.k || a.label.localeCompare(b.label))
    .slice(0, shown)
}

/**
 * The rows that are new rather than moved.
 *
 * A first month has no baseline, so its comparison reads `too_little_data` and
 * it can never be one of the banded movers — which is why the design makes
 * *new* a FLAG and not a direction. The level is real and is printed; the
 * change is not drawn.
 */
export function newMovers(movers: readonly Mover[], shown: number): Mover[] {
  return movers
    .filter((m) => m.isNew)
    .sort((a, b) => b.k - a.k || a.label.localeCompare(b.label))
    .slice(0, shown)
}

/** The sentence VO2 prints when no arm of the axis has a row. */
export function moversNote(input: {
  read: boolean
  thin: boolean
  any: boolean
}): string | null {
  if (!input.read) return 'No theme carried enough of this month to be compared.'
  if (input.thin) return 'Too little conversation this month to say what moved.'
  return input.any ? null : 'Nothing moved clearly this month.'
}

/**
 * "first heard June · seen in 3 of 3 months", as the design writes it.
 *
 * TWO DIFFERENT CLAIMS IN ONE LINE, and they rest on two different records.
 * "First heard" is `theme_registry.first_seen_at` — the day the registry
 * opened the entry — and it reaches back past whatever axis is drawn, which is
 * the point of a registry. "Seen in N of M" counts the DRAWN months, because
 * that is the only span the reader can check against the line beside it.
 */
export function heardLine(input: {
  firstHeard: string | null
  monthsSeen: number
  monthsDrawn: number
}): string {
  const seen = `seen in ${fmtInt(input.monthsSeen)} of ${fmtInt(input.monthsDrawn)} ${input.monthsDrawn === 1 ? 'month' : 'months'} drawn`
  if (!input.firstHeard) return seen
  return `first heard ${longMonth(input.firstHeard)} ${input.firstHeard.slice(0, 4)} · ${seen}`
}

/**
 * What the on-camera row may claim, and what it has to say it left out.
 *
 * Reddit contributes neither speech nor on-screen text — there is no video —
 * so a figure read over an audience whose videos include Reddit threads is
 * read over fewer videos than the denominator beside it. The design asks for
 * that to be said on the row rather than carried in a legend.
 */
export function onCameraReach(input: { videos: number; reddit: number | null }): string | null {
  if (input.reddit == null) return null
  const readable = Math.max(0, input.videos - input.reddit)
  if (input.reddit === 0) return null
  return `read from ${fmtInt(readable)} of ${fmtInt(input.videos)} videos — Reddit carries no speech and no on-screen text`
}

/** The search over the whole registry — "have we seen this before?" Matching is
 *  a plain case-folded substring over the canonical label and its member
 *  slugs; a query of fewer than two characters matches nothing rather than
 *  everything. */
export function searchRegistry<T extends { id: string; canonical_label: string | null; member_slugs: string[] | null }>(
  rows: readonly T[],
  q: string,
  limit: number = SEARCH_ROWS,
): T[] {
  const needle = q.trim().toLowerCase()
  if (needle.length < 2) return []
  return rows
    .filter((r) =>
      (r.canonical_label ?? '').toLowerCase().includes(needle) ||
      (r.member_slugs ?? []).some((s) => s.toLowerCase().includes(needle)))
    .slice(0, limit)
}

/** The cast's "no persona" remainder: the audience's videos no persona was
 *  named on. Null rather than 0 where the denominator is not readable — a
 *  remainder of nothing is not "everyone was named". */
export function unnamedShare(personaVideos: readonly number[], denominator: number | null): number | null {
  if (denominator == null || denominator <= 0) return null
  const named = personaVideos.reduce((n, v) => n + Math.max(0, v), 0)
  if (named > denominator) return null
  return round1(((denominator - named) / denominator) * 100)
}

/** The month a still-filling reading is of, said once for the page. */
export function fillingLine(month: string, status: MonthStatus, daysIn: number | null): string {
  const label = `${longMonth(month)} ${month.slice(0, 4)}`
  if (status === 'frozen') return `${label} · complete`
  return daysIn == null ? `${label} · still filling` : `${label} · still filling · ${fmtInt(daysIn)} days in`
}

/** Days of `month` elapsed at `now`, or null when the month is behind us. */
export function daysInto(month: string, now: string): number | null {
  const start = monthStartOf(month)
  const next = nextMonth(start)
  const at = now.slice(0, 10)
  if (at >= next) return null
  if (at < start) return 0
  return Number(at.slice(8, 10))
}

/** The figures VO1 declares, by token — what a model may name about the
 *  audience on screen. */
export function audienceFigures(block: AudienceBlock): FigureTable {
  const out: FigureTable = {}
  if (block.videos != null) {
    out.audience_videos = { value: block.videos, unit: 'videos', label: `videos read for ${block.label.toLowerCase()} this month` }
  }
  for (const k of block.kinds.slice(0, 3)) {
    if (k.pct == null) continue
    out[`kind_${k.kind}_share`] = { value: k.pct, unit: 'pct', label: `${k.label.toLowerCase()}, share of the month` }
  }
  if (block.replies && block.replies.pct != null) {
    out.replies_share = { value: block.replies.pct, unit: 'pct', label: 'comments this month that were replies to another comment' }
  }
  return out
}

// ---- the reads ----------------------------------------------------------------

type RunRow = { id: string; started_at: string }

/** A stored month table, read straight. Null — never [] — when the migration
 *  that creates it has not been applied here (WP11's own helper, same shape). */
async function readStoredMonths<T>(
  client: SupabaseClient,
  table: string,
  clientId: string,
  months: readonly string[],
  order: readonly string[],
  missing: (error: unknown) => boolean,
): Promise<T[] | null> {
  if (months.length === 0) return []
  try {
    return await selectAll<T>(() => {
      let q = client.from(table).select('*').eq('client_id', clientId)
        .gte('month', months[0]).lte('month', months[months.length - 1])
      for (const col of order) q = q.order(col, { ascending: true })
      return q
    })
  } catch (error) {
    if (missing(error) || isMissingMonthTable(error)) return null
    throw error
  }
}

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

/**
 * The month's replies, in three counts and no rows.
 *
 * `head: true` asks PostgREST for the count alone, so this costs three cheap
 * round trips whatever the month holds — Össur's September is 10,534 comments
 * in the category alone and fetching them to divide two numbers would be a
 * page load measured in seconds. Comment-dated, which is what makes it a month
 * at all (AGENTS.md).
 */
async function readReplies(
  supabase: SupabaseClient,
  clientId: string,
  month: string,
): Promise<RepliesRead | null> {
  const from = monthStartOf(month)
  const to = nextMonth(from)
  const base = () => supabase.from('comments').select('id', { count: 'exact', head: true })
    .eq('client_id', clientId).gte('comment_date', from).lt('comment_date', to)
  const [all, replies, redditReplies] = await Promise.all([
    base(),
    base().eq('is_reply', true),
    base().eq('is_reply', true).eq('platform', 'reddit'),
  ])
  if (all.error || replies.error) return null
  const comments = all.count ?? 0
  const n = replies.count ?? 0
  return {
    comments,
    replies: n,
    pct: pctOf(n, comments),
    reddit: redditReplies.error ? null : redditReplies.count ?? 0,
  }
}

type RegistryRow = {
  id: string
  canonical_label: string | null
  description: string | null
  member_slugs: string[] | null
  status: string | null
  first_seen_at: string | null
  last_seen_at: string | null
  observation_count: number | null
}

type EvidenceRow = {
  id: string
  audience_insight_id: string
  quote: string | null
  relevance_rank: number | null
  redacted: boolean | null
  comment_id: string | null
  source: string | null
}

/**
 * The Voice surface, for one tenant, one horizon and one audience.
 *
 * Null is the first-run empty state: a tenant with no delivered update has no
 * reading of anything, and the page says so rather than drawing four blocks of
 * refusals.
 */
export async function loadVoiceSurface(scope: Scope): Promise<VoiceSurfaceData | null> {
  const supabase = scope.supabase as SupabaseClient
  const { clientId } = scope
  const reading: ReadingHandle = scope.reading
  const params = scope.params as VoiceSurfaceParams
  const readingAt = new Date().toISOString()
  const horizon = parseHorizon(params.horizon)

  // ── wave 1: who this is, and what has been delivered ───────────────────
  const [clientRes, runsRaw, runningIds, rivals] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    selectAll<RunRow>(() =>
      supabase.from('pipeline_runs').select('id, started_at')
        .eq('client_id', clientId).in('status', ['completed', 'partial'])
        .order('started_at', { ascending: true }),
    ),
    fetchRunningRunIds(supabase, clientId, 'voice-surface'),
    loadRivals(supabase, clientId),
  ])
  const client = row<{ company_name: string | null }>(clientRes, 'voice.client')
  const brand = client?.company_name ?? 'Your brand'
  if (runsRaw.length === 0) return null

  const updatesByMonth: Record<string, number> = {}
  for (const r of runsRaw) {
    const m = monthStartOf(r.started_at)
    updatesByMonth[m] = (updatesByMonth[m] ?? 0) + 1
  }
  const firstRunMonth = monthStartOf(runsRaw[0].started_at)

  // ── wave 2: the denominator history, which decides the axis ────────────
  const history = await loadMonthSeries(reading.client, clientId, {
    from: '2019-01-01', to: readingAt, updatesByMonth, firstRunMonth,
  })
  const started = sinceStart(history.denominators.map((d) => ({ month: d.month, videos: d.videos })))
  const window = horizonWindow(horizon, readingAt, started.from)
  const axis = window.months
  const month = axis[axis.length - 1]
  // The page reads one month wider than it draws: "this month" is a one-month
  // axis, and a month-on-month comparison needs the month before it whatever
  // the horizon says (WP11's rule, kept).
  const prevMonth = previousMonthOf(month)
  const readAxis = axis[0] <= prevMonth ? axis : [prevMonth, ...axis]
  const monthStatus = freezeStateFor(month, readingAt)

  const rivalAudiences = rivals.map((r) => rivalKey(r.name))
  const audiences = [CLIENT_AUDIENCE, ...rivalAudiences, INDUSTRY_AUDIENCE]
  // `MonthSeriesSet.denominators` is typed `DenominatorPoint`, which does not
  // name `platform_mix` — but the rows are `select('*')` off
  // `month_denominators`, so the column is there. Widened here, at the one
  // boundary that reads it, rather than in lib/reading (the platform filter is
  // this page's need, not the reading layer's), and read defensively: a row
  // written before the column existed answers `undefined` and the filter
  // simply has no options rather than throwing.
  const denomThisMonth = new Map(
    (history.denominators as readonly (DenominatorPoint & { platform_mix?: Record<string, number> })[])
      .filter((d) => monthStartOf(d.month) === month)
      .map((d) => [d.audience, d] as const),
  )
  const selected = pickAudience(params.audience, audiences)

  const themedRunId = await fetchThemedRunId(supabase, clientId, runningIds, 'voice-surface')

  // ── wave 3: the themes worth drawing, and the registry behind them ──────
  const top = themedRunId
    ? await loadTopObjects(reading.client, clientId, {
        objectKind: 'theme', audiences: [selected], from: readAxis[0], to: month, limit: VOICE_MOVER_POOL,
      })
    : []
  const topIds = top.map((t) => t.objectId)

  const [themeSet, registryAll, kindRows, statsRows, replies, profileRes, newestRunRes] = await Promise.all([
    loadMonthSeries(reading.client, clientId, {
      from: readAxis[0], to: month, audiences: [selected], objectKind: 'theme', objectIds: topIds,
      updatesByMonth, firstRunMonth, changeLogFrom: history.changeLogFrom,
    }),
    selectAll<RegistryRow>(() =>
      supabase.from('theme_registry')
        .select('id, canonical_label, description, member_slugs, status, first_seen_at, last_seen_at, observation_count')
        .eq('client_id', clientId).order('id', { ascending: true }),
    ),
    readStoredMonths<StoredKindRow>(reading.client, 'month_kind_readings', clientId, readAxis, ['month', 'audience', 'kind'], isMissingKindMoodAttention),
    readStoredMonths<StoredStatsRow>(reading.client, 'month_audience_stats', clientId, readAxis, ['month', 'audience'], isMissingKindMoodAttention),
    readReplies(supabase, clientId, month),
    supabase.from('consumer_profiles')
      .select('headline, personas, run_date, run_id, insight_population, theme_population')
      .eq('client_id', clientId).order('run_date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('pipeline_runs').select('id').eq('client_id', clientId)
      .in('status', ['completed', 'partial']).order('started_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const registryById = new Map(registryAll.map((r) => [r.id, r]))

  // The deep link Market and the old Dashboard draw. It narrows the POOL, never
  // the denominator: a reader who arrived from an insight is asking to see the
  // themes behind it, not to be shown a different month.
  const deepSlugs = new Set((params.themes ?? '').split(',').map((s) => s.trim()).filter(Boolean))
  const inDeepLink = (id: string): boolean => {
    if (deepSlugs.size === 0) return true
    const r = registryById.get(id)
    return (r?.member_slugs ?? []).some((s) => deepSlugs.has(s))
  }

  // ── the audience block ──────────────────────────────────────────────────
  const selectedDenom = denomThisMonth.get(selected) ?? null
  const platformMix = platformShares(selectedDenom?.platform_mix, selectedDenom?.videos ?? null)
  const platformParam = params.platform && platformMix.some((p) => p.platform === params.platform) ? params.platform : null
  const audienceVideos = platformParam
    ? platformMix.find((p) => p.platform === platformParam)?.videos ?? null
    : selectedDenom?.videos ?? null

  const options: AudienceOption[] = audiences.map((a) => {
    const d = denomThisMonth.get(a) ?? null
    return {
      audience: a,
      label: audienceLabel(a),
      videos: d?.videos ?? null,
      comments: d?.comments ?? null,
      thin: audienceThin(d?.videos ?? null),
      observed: d != null,
      retiredAt: rivals.find((r) => rivalKey(r.name) === a)?.retiredAt ?? null,
      selected: a === selected,
      href: voiceSurfaceHref(params, { audience: a, theme: null, kind: null, platform: null }),
    }
  })

  const platforms: FilterOption[] = platformMix.map((p) => ({
    value: p.platform,
    label: p.label,
    videos: p.videos,
    active: p.platform === platformParam,
    href: voiceSurfaceHref(params, { platform: p.platform === platformParam ? null : p.platform }),
  }))

  let kinds: KindShare[] = []
  const kindVerdicts: Record<string, Verdict | null> = {}
  let kindFilters: FilterOption[] = []
  let kindsNote: string | null = null
  let reddit: RedditRead | null = null
  const thin = thinMonth(
    { month, videos: selectedDenom?.videos ?? null, k: null },
    history.denominators
      .filter((d) => d.audience === selected && monthStartOf(d.month) < month)
      .map((d) => d.videos),
    { updates: updatesByMonth[month] ?? 0, firstRunMonth },
  )
  if (kindRows == null) {
    kindsNote = 'What kind of thing is being said is not recorded month by month for this workspace yet.'
  } else {
    const thisMonth = kindRows.filter((r) => monthStartOf(r.month) === month && r.audience === selected)
    const last = kindRows.filter((r) => monthStartOf(r.month) === prevMonth && r.audience === selected)
    const all = kindShares(
      thisMonth.map((r) => ({ kind: r.kind, videos: r.videos, comments: r.comments, platform_mix: r.platform_mix ?? {} })),
      selectedDenom?.videos ?? null,
    )
    reddit = redditRead(thisMonth.map((r) => ({ kind: r.kind, videos: r.videos, platform_mix: r.platform_mix ?? {} })))
    // The full ladder, in reading order (KIND_ORDER) — this is the page that
    // shows all ten, where OV3 shows three.
    kinds = [...all].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    if (kinds.length === 0) kindsNote = 'Nothing was read into this month’s kinds yet.'
    for (const k of kinds) {
      const prev = last.find((r) => r.kind === k.kind)
      const prevN = denominatorFor(history, prevMonth, selected)
      kindVerdicts[k.kind] = thin || prev == null || prevN == null || selectedDenom == null
        ? null
        : kindChange({
            kind: k.kind, audience: selected,
            curr: { month, k: k.videos, videos: selectedDenom.videos },
            prev: { month: prevMonth, k: prev.videos, videos: prevN },
          })
    }
    // A FILTER THAT CHANGES NOTHING IS NOT PRINTED. The kind ladder is the only
    // thing on this page a kind can narrow, so the filter exists exactly where
    // the ladder does (WP9's rule: this product does not print controls that do
    // not work).
    kindFilters = kinds.map((k) => ({
      value: k.kind,
      label: k.label,
      videos: k.videos,
      active: k.kind === params.kind,
      href: voiceSurfaceHref(params, { kind: k.kind === params.kind ? null : k.kind }),
    }))
  }
  const activeKind = kindFilters.some((k) => k.active) ? (params.kind as string) : null

  const audienceBlock: AudienceBlock = {
    options,
    selected,
    label: audienceLabel(selected),
    videos: audienceVideos,
    comments: selectedDenom?.comments ?? null,
    thin: audienceThin(selectedDenom?.videos ?? null),
    platformMix,
    platforms,
    platform: platformParam,
    kinds: activeKind ? kinds.filter((k) => k.kind === activeKind) : kinds,
    kindVerdicts,
    kindFilters,
    kind: activeKind,
    kindsNote,
    reddit,
    replies,
    repliesNote: replies
      ? 'Counted across every audience: a comment carries no audience of its own, and replies are materially a Reddit signal.'
      : 'How much of this month was argued rather than said once is not readable here.',
  }

  // ── the movers ──────────────────────────────────────────────────────────
  const expanded = params.movers === 'all'
  const shown = expanded ? MOVERS_EXPANDED : MOVERS_HERE
  const pool: Mover[] = []
  const seriesById = new Map<string, MonthSeries>()
  for (const s of themeSet.series) {
    if (!s.objectId || s.audience !== selected) continue
    if (!inDeepLink(s.objectId)) continue
    seriesById.set(s.objectId, s)
    const byMonth = pointsByMonth(s)
    const curr = byMonth.get(month)
    const prev = byMonth.get(prevMonth)
    if (!curr || curr.k == null || curr.videos == null) continue
    const label = registryById.get(s.objectId)?.canonical_label ?? s.objectLabel ?? s.objectId
    // A month with no row on the other side is not skipped: `monthChange`
    // answers `too_little_data` for it, which is the honest verdict for a
    // theme's first month and is what keeps it out of growing and fading
    // while leaving its LEVEL on the page as a newcomer.
    const before: SeriesPoint = prev ?? { month: prevMonth, videos: null, k: null, audience: s.audience }
    const verdict = monthChange({ object: { kind: 'theme', id: s.objectId, label }, audience: s.audience, curr, prev: before })
    const readable = s.points.filter((p) => p.k != null && p.k > 0)
    pool.push({
      id: s.objectId,
      label,
      k: curr.k,
      n: curr.videos,
      pct: curr.pct,
      verdict,
      direction: thin ? null : directionWord(s.points as readonly SeriesPoint[]),
      isNew: firstHeardThisMonth({
        axisFrom: axis[0] ?? month,
        recordFrom: started.from,
        readableMonths: readable.map((p) => p.month),
        month,
      }),
    })
  }
  const { growing, fading } = thin ? { growing: [], fading: [] } : splitMovers(pool, shown)
  const flat = thin ? [] : flatMovers(pool, shown)
  const newcomers = newMovers(pool, shown)
  // Gone quiet is the REGISTRY's own dormancy rule, already fired by the
  // pipeline over updates that produced theme observations — not a reading of
  // this month. A theme with no rows at all is silence we never heard; a
  // dormant entry that carried a reading on this axis is silence we did.
  const goneQuiet: GoneQuiet[] = [...seriesById.entries()]
    .filter(([id]) => registryById.get(id)?.status === 'dormant')
    .map(([id, s]) => {
      const last = [...s.points].reverse().find((p) => p.k != null && p.k > 0) ?? null
      return { id, label: registryById.get(id)?.canonical_label ?? id, lastHeard: last?.month ?? null }
    })
    .sort((a, b) => (b.lastHeard ?? '').localeCompare(a.lastHeard ?? ''))
    .slice(0, shown)

  const moversBlock: MoversBlock = {
    growing, fading, flat, newcomers, goneQuiet,
    shown,
    expanded,
    expandHref: voiceSurfaceHref(params, { movers: expanded ? null : 'all' }),
    note: moversNote({
      read: pool.length > 0,
      thin: thin,
      any: growing.length + fading.length + flat.length + newcomers.length > 0,
    }),
    // `theme_observations.reread_share` lands with M2. Until then the page
    // cannot tell a theme whose members were re-read this month from one whose
    // conversation moved, and says so once rather than marking nothing.
    rereadNote: 'Whether a theme’s members were re-read this month is not recorded here yet, so a change that is really a re-reading cannot be marked.',
  }

  // ── the theme in full ───────────────────────────────────────────────────
  const openable = pool.length > 0 ? pool : []
  const askedTheme = params.theme && seriesById.has(params.theme) ? params.theme : null
  const openId = askedTheme
    ?? [...growing, ...fading, ...flat, ...openable].map((m) => m.id).find((id) => seriesById.has(id))
    ?? null

  const themeBlock = await buildTheme({
    supabase,
    clientId,
    params,
    axis,
    month,
    openId,
    mover: pool.find((m) => m.id === openId) ?? null,
    series: openId ? seriesById.get(openId) ?? null : null,
    registry: openId ? registryById.get(openId) ?? null : null,
    registryAll,
    audience: selected,
    themedRunId,
    statsRows,
    prevMonth,
    thin: thin,
    denominator: selectedDenom?.videos ?? null,
    redditVideos: platformMix.find((p) => p.platform === 'reddit')?.videos ?? (selectedDenom ? 0 : null),
  })

  // ── the cast ────────────────────────────────────────────────────────────
  const profile = row<{
    personas: Partial<Persona>[]; run_date: string; run_id: string
    insight_population: number | null; theme_population: number | null
  }>(profileRes, 'voice.consumerProfile')
  const newestRun = row<{ id: string }>(newestRunRes, 'voice.newestRun')
  const cast = await buildCast({
    supabase, params, profile, newestRunId: newestRun?.id ?? null,
    denominator: selectedDenom?.videos ?? null,
  })

  // ── the record ──────────────────────────────────────────────────────────
  const pageVerdicts = [
    ...pool.map((m) => m.verdict),
    ...Object.values(kindVerdicts).filter((v): v is Verdict => v != null),
    ...(themeBlock.tone?.verdict ? [themeBlock.tone.verdict] : []),
  ]
  const recordInputs = await loadRecordInputs(
    reading.client,
    clientId,
    recordWindow(month, readingAt),
    { comparisonsRefused: countRefused(pageVerdicts), refusals: refusals(pageVerdicts), now: readingAt },
  )

  return {
    brand,
    month,
    monthStatus,
    readingAt,
    horizon,
    window,
    axis,
    substrate: history.substrate,
    notes: themeSet.notes.length > 0 ? themeSet.notes : history.notes,
    params,
    audience: audienceBlock,
    movers: moversBlock,
    theme: themeBlock,
    cast,
    record: { line: howSoundLine(recordInputs), lines: recordLines(recordInputs) },
  }
}

/** The calendar month before this one. */
function previousMonthOf(month: string): string {
  const d = new Date(`${monthStartOf(month)}T00:00:00.000Z`)
  return monthStartOf(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString())
}

/** The audience's videos in one month, off the history already read. */
function denominatorFor(
  history: { denominators: readonly { month: string; audience: string; videos: number }[] },
  month: string,
  audience: string,
): number | null {
  const d = history.denominators.find((x) => monthStartOf(x.month) === month && x.audience === audience)
  return d?.videos ?? null
}

interface ThemeInput {
  supabase: SupabaseClient
  clientId: string
  params: VoiceSurfaceParams
  axis: string[]
  month: string
  prevMonth: string
  openId: string | null
  mover: Mover | null
  series: MonthSeries | null
  registry: RegistryRow | null
  registryAll: RegistryRow[]
  audience: string
  themedRunId: string | null
  statsRows: StoredStatsRow[] | null
  thin: boolean
  denominator: number | null
  redditVideos: number | null
}

/** VO3 — a theme in full. Everything a reader needs to check the number above
 *  it: the months it was read in, the tone of the audience around it, six
 *  voices, the speech and the on-screen text, and what was counted but not
 *  quoted. */
async function buildTheme(input: ThemeInput): Promise<ThemeBlock> {
  const { params, registryAll, audience, month, axis } = input
  const q = (params.q ?? '').trim()
  const searchHits = searchRegistry(registryAll, q)
  const search = {
    q,
    total: searchHits.length,
    rows: searchHits.map((r) => ({
      id: r.id,
      label: r.canonical_label ?? r.id,
      firstHeard: r.first_seen_at ? monthStartOf(r.first_seen_at) : null,
      monthsSeen: r.observation_count ?? 0,
      active: r.id === input.openId,
      href: voiceSurfaceHref(params, { theme: r.id, q: null }),
    })),
  }

  const empty: ThemeBlock = {
    state: 'none',
    id: null,
    label: 'No theme is open',
    description: null,
    audience,
    audienceLabel: audienceLabel(audience),
    k: null, n: null, pct: null, prevalence: null,
    verdict: null, direction: null,
    firstHeard: null, monthsSeen: 0, monthsDrawn: axis.length,
    axis, points: [],
    tone: null,
    toneNote: null,
    onCamera: null,
    quotes: [], quoteCites: [],
    spoken: null, onScreen: null,
    withheld: 0,
    conclusionHref: '/dashboard/market',
    videosHref: '/dashboard/videos',
    askHref: '/dashboard/agent',
    trackRegistryId: null,
    search,
    notes: [],
  }
  if (!input.openId || !input.series) {
    return { ...empty, notes: ['No theme in this audience carried enough of this month to be opened.'] }
  }

  const label = input.registry?.canonical_label ?? input.series.objectLabel ?? input.openId
  const points = input.series.points
  const readable = points.filter((p) => p.k != null && p.k > 0)

  // ---- the tone line: the audience's mood around this theme ----
  // THE AUDIENCE'S, NOT THE THEME'S, AND THE HEADING SAYS SO. Sentiment is
  // judged per VIDEO and stored per audience-month (`month_audience_stats`);
  // there is no per-theme sentiment row, and inventing one by attributing the
  // audience's distribution to a theme that occupies 9% of it would be a
  // number about the category wearing a theme's name. The mock's own caption
  // is "Tone · category, all judged videos".
  let tone: ThemeBlock['tone'] = null
  let toneNote: string | null = null
  if (input.statsRows == null) {
    toneNote = 'How this audience’s month was received is not recorded month by month for this workspace yet.'
  } else {
    const curr = input.statsRows.find((r) => monthStartOf(r.month) === month && r.audience === audience) ?? null
    const prev = input.statsRows.find((r) => monthStartOf(r.month) === input.prevMonth && r.audience === audience) ?? null
    if (!curr) toneNote = 'Nothing in this month has been judged yet.'
    else if (curr.judged < TONE_FLOOR) toneNote = `Too few videos judged this month to read a tone — ${fmtInt(curr.judged)} of the ${fmtInt(TONE_FLOOR)} a point needs.`
    else {
      const counts = {
        judged: curr.judged, positive: curr.positive, negative: curr.negative,
        neutral: curr.neutral, mixed: curr.mixed, judged_framing: curr.judged_framing ?? 0,
      }
      tone = {
        shares: moodShares(counts),
        judged: curr.judged,
        verdict: input.thin || !prev
          ? null
          : moodChange({
              audience,
              curr: { month, ...counts },
              prev: {
                month: input.prevMonth, judged: prev.judged, positive: prev.positive,
                negative: prev.negative, neutral: prev.neutral, mixed: prev.mixed,
                judged_framing: prev.judged_framing ?? 0,
              },
            }),
      }
    }
  }

  // ---- the voices, the speech and the on-screen text ----
  // Read off the run's own theme row, joined to the registry entry this page is
  // keyed on — `themes.registry_id` is the stable identity and `themes.id` is a
  // per-run row id that must never be a cross-run key (AGENTS.md).
  let quotes: Quote[] = []
  let quoteCites: string[] = []
  let withheld = 0
  let onCamera: string | null = null
  let spoken: SpokenLine | null = null
  let onScreen: SpokenLine | null = null
  let description = input.registry?.description ?? null

  if (input.themedRunId) {
    const themeRes = await input.supabase
      .from('themes')
      .select('id, label, description, supporting_insight_ids, supporting_video_ids, evidence_count, video_evidence_count')
      .eq('client_id', input.clientId).eq('run_id', input.themedRunId).eq('registry_id', input.openId)
      .order('evidence_count', { ascending: false }).limit(1).maybeSingle()
    const themeRow = row<{
      id: string; label: string; description: string | null
      supporting_insight_ids: string[] | null; supporting_video_ids: string[] | null
      evidence_count: number; video_evidence_count: number | null
    }>(themeRes, 'voice.themeRow')
    if (themeRow) {
      description = description ?? themeRow.description
      onCamera = onCameraNote(themeRow.video_evidence_count, themeRow.evidence_count)
      const insightIds = (themeRow.supporting_insight_ids ?? []).slice(0, EVIDENCE_PER_THEME)
      const videoIds = (themeRow.supporting_video_ids ?? []).slice(0, 4)
      const [evidenceRes, videoRes] = await Promise.all([
        insightIds.length
          ? input.supabase.from('insight_evidence')
              .select('id, audience_insight_id, quote, relevance_rank, redacted, comment_id, source')
              .in('audience_insight_id', insightIds)
              .order('relevance_rank', { ascending: true }).order('id')
          : Promise.resolve({ data: null, error: null }),
        videoIds.length
          ? input.supabase.from('videos')
              .select('id, platform, video_id, video_url, transcript, transcript_status, ocr_text, ocr_status, upload_date, is_client, competitor_name')
              .in('id', videoIds)
          : Promise.resolve({ data: null, error: null }),
      ])
      const evidence = readRows<EvidenceRow>(evidenceRes, 'voice.themeEvidence')
      const readings = await readTranslations(input.supabase, evidence.map((e) => e.quote ?? ''))
      const seen = new Set<string>()
      const cites: string[] = []
      const out: Quote[] = []
      for (const ev of evidence) {
        if (ev.redacted || !ev.quote) { withheld++; continue }
        const text = cleanQuote(ev.quote)
        if (!text || seen.has(text.toLowerCase()) || out.length >= THEME_QUOTES) continue
        seen.add(text.toLowerCase())
        out.push({ ref: quoteRef.evidence(ev.id), text, ...readingOf(readings, text) })
        cites.push(ev.source === 'transcript' ? 'said on camera' : ev.source === 'ocr' ? 'on-screen text' : 'in the comments')
      }
      quotes = out
      quoteCites = cites

      const videos = readRows<{
        id: string; platform: string; video_id: string; video_url: string | null
        transcript: string | null; transcript_status: string | null
        ocr_text: string | null; ocr_status: string | null; upload_date: string | null
        is_client: boolean | null; competitor_name: string | null
      }>(videoRes, 'voice.themeVideos')
      const kindOf = (v: { is_client: boolean | null; competitor_name: string | null }): string =>
        v.is_client ? 'your own post' : v.competitor_name ? `a ${v.competitor_name} post` : 'a category video'
      const withTranscript = videos.find((v) => (v.transcript ?? '').trim().length > 0)
      if (withTranscript) {
        spoken = {
          text: firstSentences(withTranscript.transcript as string),
          cite: [platformLabel(withTranscript.platform), withTranscript.upload_date ? shortDate(withTranscript.upload_date) : null, kindOf(withTranscript)]
            .filter(Boolean).join(' · '),
          href: withTranscript.video_url,
        }
      }
      const withOcr = videos.find((v) => (v.ocr_text ?? '').trim().length > 0)
      if (withOcr) {
        onScreen = {
          text: firstSentences(withOcr.ocr_text as string),
          cite: [platformLabel(withOcr.platform), withOcr.upload_date ? shortDate(withOcr.upload_date) : null, kindOf(withOcr)]
            .filter(Boolean).join(' · '),
          href: withOcr.video_url,
        }
      }
    }
  }

  const notes: string[] = []
  if (!input.themedRunId) notes.push('No update has grouped this month’s conversation into themes yet, so the evidence behind this theme cannot be shown.')
  if (!spoken && !onScreen && input.themedRunId) notes.push('No video behind this theme carries readable speech or on-screen text.')
  const reach = onCameraReach({ videos: input.mover?.k ?? 0, reddit: input.redditVideos })
  if (onCamera && reach) notes.push(reach)

  return {
    state: 'ready',
    id: input.openId,
    label,
    description,
    audience,
    audienceLabel: audienceLabel(audience),
    k: input.mover?.k ?? null,
    n: input.mover?.n ?? input.denominator,
    pct: input.mover?.pct ?? null,
    prevalence: input.mover ? prevalenceTier(input.mover.k, input.mover.n) : null,
    verdict: input.mover?.verdict ?? null,
    direction: input.mover?.direction ?? null,
    firstHeard: input.registry?.first_seen_at ? monthStartOf(input.registry.first_seen_at) : null,
    monthsSeen: readable.length,
    monthsDrawn: axis.length,
    axis,
    points,
    tone,
    toneNote,
    onCamera,
    quotes,
    quoteCites,
    spoken,
    onScreen,
    withheld,
    // A LINK, NOT A LIST (decision Q). Market's MK1 owns "what we concluded
    // this month"; this page carries the reader there with the theme selected,
    // so one list is maintained in one place.
    conclusionHref: `/dashboard/market?theme=${encodeURIComponent(input.openId)}`,
    videosHref: `/dashboard/videos?theme=${encodeURIComponent(input.openId)}`,
    askHref: `/dashboard/agent?q=${encodeURIComponent(`What is behind “${label}” this month?`)}`,
    trackRegistryId: input.openId,
    search,
    notes,
  }
}

/** The first two sentences of a transcript or an OCR read — a line, not a
 *  wall. Speech read off a video runs to thousands of characters and a theme
 *  pane that printed all of it would bury the six quotes under it. */
export function firstSentences(text: string, sentences = 2, max = 320): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  const parts = clean.split(/(?<=[.!?])\s+/).slice(0, sentences).join(' ')
  const out = parts || clean
  return out.length > max ? `${out.slice(0, max - 1).trimEnd()}…` : out
}

interface CastInput {
  supabase: SupabaseClient
  params: VoiceSurfaceParams
  profile: {
    personas: Partial<Persona>[]; run_date: string; run_id: string
    insight_population: number | null; theme_population: number | null
  } | null
  newestRunId: string | null
  denominator: number | null
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
  // NOT the mock's "current state, not a trend": "trend" is on the product's
  // own direction-word list (lib/calibration.ts), and rule (c) refuses one
  // outside a node carrying a band. The sentence says the same thing without
  // borrowing the vocabulary of the comparison it is refusing to make.
  const floorNote = `A group is named only where at least ${fmtInt(PERSONA_VIDEO_FLOOR)} videos carry it · this month as it stands, never compared with another month.`
  if (!input.profile) {
    return {
      state: 'not_run', personas: [], selected: null, denominator: input.denominator,
      unnamedPct: null, profileDate: null, stale: false, floorNote,
      empty: 'Reading who is talking is not switched on for this workspace yet.',
    }
  }
  const personas = (input.profile.personas ?? [])
    .map((p) => normalisePersona(p as Partial<Persona>))
    .filter((p): p is Persona => Boolean(p))
  if (personas.length === 0) {
    return {
      state: 'no_personas', personas: [], selected: null, denominator: input.denominator,
      unnamedPct: null, profileDate: input.profile.run_date, stale: false, floorNote,
      empty: 'Too little conversation in this update to describe who is talking.',
    }
  }

  // One voice per persona, from the quote the persona already cites. Read by
  // evidence id off the base table so a row a newer in-flight update has
  // superseded still resolves (AGENTS.md).
  const wanted = personas.map((p) => p.insightIds.slice(0, 4))
  const ids = [...new Set(wanted.flat())]
  const quoteByInsight = new Map<string, { id: string; quote: string; platform: string | null }>()
  if (ids.length > 0) {
    const res = await input.supabase
      .from('insight_evidence')
      .select('id, audience_insight_id, quote, relevance_rank, redacted')
      .in('audience_insight_id', ids)
      .order('relevance_rank', { ascending: true }).order('id')
    for (const ev of readRows<EvidenceRow>(res, 'voice.castEvidence')) {
      if (ev.redacted || !ev.quote) continue
      if (quoteByInsight.has(ev.audience_insight_id)) continue
      quoteByInsight.set(ev.audience_insight_id, { id: ev.id, quote: cleanQuote(ev.quote), platform: null })
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
      denominator: input.denominator,
      pct: pctOf(p.sourceVideoCount, input.denominator),
      wants: p.wants,
      blockers: p.blockers,
      triggers: p.triggers,
      platformMix: platformShares(mix, mixTotal > 0 ? mixTotal : null),
      quote: hit ? { ref: quoteRef.evidence(hit.id), text: hit.quote, ...readingOf(readings, hit.quote) } : null,
      quoteCite: hit ? 'one of this group’s own comments' : null,
      selected: p.key === selectedKey,
      href: voiceSurfaceHref(input.params, { persona: p.key }),
    }
  })

  return {
    state: 'ready',
    personas: cast,
    selected: selectedKey,
    denominator: input.denominator,
    unnamedPct: unnamedShare(cast.map((c) => c.videos), input.denominator),
    profileDate: input.profile.run_date,
    stale: Boolean(input.newestRunId) && input.profile.run_id !== input.newestRunId,
    floorNote,
    empty: null,
  }
}

/** The masthead line under the page — the one place the update's own date is
 *  named, because the cast is dated by an update and the rest of the page is
 *  dated by the comment. */
export function castMasthead(cast: CastBlock): string | null {
  if (!cast.profileDate) return null
  const base = `Who is talking, as read on ${weekdayDate(cast.profileDate)}`
  return cast.stale ? `${base} — a later update has landed since.` : `${base}.`
}
