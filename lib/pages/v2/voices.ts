import type { SupabaseClient } from '@supabase/supabase-js'

import { nameChecked, NAME_READS, noiseWords, NOT_COUNTED_YET } from '../../brands/precision'
import { fmtInt, longMonth, platformLabel, shortDate } from '../../format'
import { gateFor } from '../../quote-context'
import { readingOf, readTranslations } from '../../quotes'
import { ASKED_SHOWN, FINDING_KINDS_HELD, findingKindWords, ninetyDays, quoteWords } from '../brands'
import { readFindings, readQuestions, readSaidAbout, type FindingRead } from '../brands-load'
import { fetchRunningRunIds } from '../latest-video-run'
import { loadVoicesMany } from '../subjects'
import { ACCOUNT_FLOOR } from '../voice-surface-where'
import { talkKindLabel } from '../overview-market/kinds'
import { WHAT_THEY_SELL } from '../market-frame'
import { surface } from '../../nav'
import { normalisePersona, type Persona } from '../../profile-tiles'
import { CLIENT_AUDIENCE, rivalKey } from '../../rivals'
import { FLAGGED_KIND, KIND_ORDER } from '../../reading/kinds'
import {
  creatorThemes, loadBrandCrosses, loadBrandMonthPairs, loadGroupSubjects, loadLatestProfile, loadMarketAudiences,
  loadMarketVideos, loadThemeRefs,
  type BrandCrossRow, type BrandMonthVideos, type BrandPair, type CreatorThemes, type GroupMonthVideos,
  type GroupProfileRow, type GroupSubjectRow, type MarketVideo, type ThemeRef,
} from '../../reading/cross'
import { monthStartOf, prevMonth } from '../../reading/month-key'
import { refuseEveryPair } from '../../reading/pairs'
import { loadPairOn, type ReadingHandle } from '../../reading/read'
import { loadReadingMonth } from '../../reading/reading-view'
import { windowEnd, type ReadingMonth } from '../../reading/reading-month'
import type { Verdict } from '../../reading/verdicts'

// VOICES (depth v2, T4; boards E3-Voices and E3-Voices-Open): who is saying
// it, and who matters. Three sections, all on the reading month (decision A,
// `loadReadingMonth`, so the page reads the month every reading page reads):
//
//   1. THE GROUPS. Today's groups (the latest `consumer_profiles` row) with
//      THIS MONTH'S videos (`loadGroupSubjects`, comment-dated evidence on
//      the month's market videos). DECISION 2: a count of videos and no share
//      of the market, no month-on-month change and no mix-change card. A
//      profile is rebuilt every update over all-time insights, so a group's
//      count here is "this month's videos for today's groups", never a point
//      on a series. The groups overlap (a video can hold several), so no
//      remainder ("Other") is taken from them either.
//   2. THE BRANDS. Named unprompted (`k_organic` of `n_organic`, this month
//      and last, judged as a `Verdict` by the month-pair rule:
//      `loadBrandMonthPairs`), and, over every video naming the brand (base
//      `any`, `loadBrandCrosses`), what people did in those videos' comments
//      and what they talked about. The crosses carry no verdict: each brand's
//      month is tens of videos, far under the band's floor of 100, and the
//      page says so where a change would be read. Pass C's weightiest finding
//      is the card's note (stored prose, `pass_c_finding`).
//   3. THE CREATORS. The month's market videos by account
//      (`market_month_videos` + `account_name`), at the floor of three
//      (`ACCOUNT_FLOOR`, as Conversation's "Where your market talks"), with
//      followers as of the month's videos (`creatorFollowers`: Reddit is
//      never a following) and the conversation each one made most of
//      (`month_evidence_refs` theme rows).
//
// A click opens one panel in place, under the item (`?group=`, `?brand=`,
// `?creator=`): the group's triggers, how they talk, who they say they are,
// the conversations they are in and three of their comments; the brand's
// comments in full and the Competitive pane's own content; the creator's
// conversations and the brands named in their videos. No quote is printed at
// level 1 (Heinrich's v2 rule); quotes are the panels'.
//
// BRANDS STAY HONEST FOR A TENANT WITH NO ROWS. Össur has brand rules since
// T15 but no `brand_mentions` and no `month_brand_readings` until its
// back-read: the brands card then says the brands are not counted yet, and
// fills on its own once the month rows exist.
//
// PURE HALF FIRST (every builder is tested over fixtures), THEN THE READS.

// ---- the address -------------------------------------------------------------------

/** The page's own address. */
export const VOICES_HREF = surface('voices').href

export interface VoicesParams {
  /** A group's key (`consumer_profiles.personas[].key`). `persona` is the old
   *  Conversation link's name for it. */
  group?: string
  persona?: string
  /** A brand: its name, its key ('client', a `competitors.id`,
   *  'watched:<slug>') or its audience (`competitor:<name>`), as an old
   *  Competitive `?vs=` link carried it (lib/nav.ts `redirectFor`). */
  brand?: string
  /** A creator: the account's name, or `platform|account`. */
  creator?: string
  /** `all` lists every account at the floor. */
  creators?: string
  /** `?month=YYYY-MM`, as every reading page takes it. */
  month?: string
}

type Param = keyof VoicesParams
const KEPT: readonly Param[] = ['month', 'creators']

/** One query value: the first of a repeated key, trimmed; empty is absent. */
export function paramValue(raw: string | string[] | undefined | null): string | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw
  const t = typeof v === 'string' ? v.trim() : ''
  return t === '' ? undefined : t
}

/** The page's params from a request's search params. */
export function parseVoicesParams(raw: Record<string, string | string[] | undefined> | null | undefined): VoicesParams {
  const sp = raw ?? {}
  const out: VoicesParams = {}
  const group = paramValue(sp.group) ?? paramValue(sp.persona)
  if (group) out.group = group
  for (const k of ['brand', 'creator', 'creators', 'month'] as const) {
    const v = paramValue(sp[k])
    if (v) out[k] = v
  }
  return out
}

/**
 * The page's address with the month and the creators' expansion kept, and at
 * most one item open: `open` names it, and null opens nothing. The hash is the
 * open panel's anchor, so the browser lands on it.
 */
export function voicesHref(params: VoicesParams, open: { kind: OpenKind; key: string } | null = null, over: Partial<Record<Param, string | null>> = {}): string {
  const q = new URLSearchParams()
  for (const k of KEPT) {
    const v = k in over ? over[k] : params[k]
    if (v) q.set(k, v)
  }
  if (open) q.set(open.kind, open.key)
  const s = q.toString()
  return `${VOICES_HREF}${s ? `?${s}` : ''}${open ? `#${PANEL_ID[open.kind]}` : ''}`
}

export type OpenKind = 'group' | 'brand' | 'creator'

/** Each panel's anchor id. */
export const PANEL_ID: Readonly<Record<OpenKind, string>> = {
  group: 'group-panel',
  brand: 'brand-panel',
  creator: 'creator-panel',
}

/** Where a question to the Agent goes, prefilled. */
export function askHref(question: string): string {
  return `${surface('ask').href}?ask=${encodeURIComponent(question.slice(0, 300))}`
}

/** A conversation opens in Market (T3's `?conv=`, a registry id). */
export const conversationHref = (registryId: string): string =>
  `${surface('market').href}?conv=${encodeURIComponent(registryId)}#conversation-panel`

// ---- small helpers -----------------------------------------------------------------

/** The first sentence of a stored line, for a card ("Wants: …"); the whole of
 *  it opens in the panel. */
export function firstSentence(s: string): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return ''
  const m = /^(.+?[.!?])(\s|$)/.exec(t)
  return (m ? m[1] : t).trim()
}

/** "September", or "October so far" while the month is still being read. */
export const monthWordsOf = (month: string, soFar: boolean): string => `${longMonth(month)}${soFar ? ' so far' : ''}`

/** A creator's two letters for the avatar: "SB" for "@stepbystep.amp". */
export function initialsOf(account: string): string {
  const words = account.replace(/^r\//i, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const letters = words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? account).slice(0, 2)
  return letters.toUpperCase()
}

/** A platform's own word for a following. */
export const followerWord = (platform: string): string => (platform === 'youtube' ? 'subscribers' : 'followers')

const byNumberThenLabel = <T extends { k: number; label: string }>(a: T, b: T): number => b.k - a.k || a.label.localeCompare(b.label)

/** Count of each platform among a set of videos. */
function platformsOf(ids: readonly string[], platformOf: ReadonlyMap<string, string>): VoicesPlatform[] {
  const counts = new Map<string, number>()
  for (const id of ids) {
    const p = platformOf.get(id)
    if (p) counts.set(p, (counts.get(p) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([platform, k]) => ({ platform, label: platformLabel(platform), k }))
    .sort((a, b) => b.k - a.k || a.platform.localeCompare(b.platform))
}

// ---- the shapes --------------------------------------------------------------------

export interface VoicesPlatform {
  platform: string
  label: string
  /** Videos on the platform. A video is on one platform, so these add up. */
  k: number
}

export interface VoicesGroupCard {
  key: string
  name: string
  /** Stored Pass E prose (`pass_e_persona`). */
  oneLiner: string
  /** The month's market videos the group's own comments are on. */
  videos: number
  /** The group's talk about each subject: of `videos`, largest first, three. */
  subjects: { id: string; label: string; k: number }[]
  /** The platforms of those videos (this month's, never the profile's
   *  all-time mix). */
  platforms: VoicesPlatform[]
  /** The first sentence of each, stored Pass E prose. */
  wants: string
  stops: string
  href: string
  selected: boolean
}

export interface VoicesGroups {
  state: 'ready' | 'not_run' | 'no_personas' | 'unread'
  /** The update the groups were described at (`consumer_profiles.run_date`). */
  profileDate: string | null
  cards: VoicesGroupCard[]
  empty: string | null
}

export type BrandRowState = 'counted' | 'not_yet' | 'noise' | 'none'

export interface Level {
  k: number
  n: number
}

export interface VoicesBrandRow {
  brandKey: string
  /** What `?brand=` carries for it: its name. */
  param: string
  label: string
  you: boolean
  state: BrandRowState
  /** Named unprompted this month: `k_organic` of `n_organic`. */
  named: Level | null
  /** Last month's, where the verdict lets it print. */
  prevNamed: (Level & { month: string }) | null
  /** This month against last (`brandMonthPair`): no direction word. */
  verdict: Verdict | null
  /** Named at all this month (`k_any` of `n`): the base of the crosses. */
  any: Level | null
  /** Of the videos naming it, those whose comments praised, and complained
   *  (the kinds `praise` and `pain_point`). A kind belongs to a comment, not
   *  to the brand: the words say "in the videos naming it". */
  praised: Level | null
  complained: Level | null
  /** The subject most of its videos carry. */
  topSubject: { id: string; label: string; k: number; n: number } | null
  href: string
  selected: boolean
}

export interface VoicesBrands {
  /** `ready` · `not_read` (no brand rule for this workspace) · `not_counted`
   *  (rules, but no month row yet: Össur until its back-read) · `unread`
   *  (the reads failed). */
  state: 'ready' | 'not_read' | 'not_counted' | 'unread'
  month: string
  prevMonth: string
  /** Brands named unprompted this month, you first, then most named. */
  rows: VoicesBrandRow[]
  /** Counted, and not named unprompted this month. */
  notNamed: string[]
  /** Tracked and not counted: their words ("not counted yet", "mostly the
   *  German word for Friday"). */
  notCounted: { label: string; words: string }[]
  /** Every brand the page tracks (you included), for the empty state and the
   *  bar's count. */
  tracked: string[]
  /** Pass C's weightiest finding of the latest update, the card's note. */
  note: { rival: string; title: string; href: string } | null
  empty: string | null
}

export interface VoicesCreatorRow {
  /** `platform|account`. */
  key: string
  param: string
  account: string
  platform: string
  platformLabel: string
  initials: string
  videos: number
  followers: number | null
  followerWord: string
  /** The conversation this creator made most of: its videos in it this month,
   *  of the conversation's. */
  top: { registryId: string; label: string; k: number; ofTheme: number } | null
  /** The brand named in most of the creator's videos this month. */
  brand: { label: string; k: number; you: boolean } | null
  href: string
  selected: boolean
}

export interface VoicesCreators {
  month: string
  /** Accounts with a market video this month. */
  accounts: number
  /** Of them, at the floor. */
  atFloor: number
  floor: number
  rows: VoicesCreatorRow[]
  expanded: boolean
  /** At the floor and not listed. */
  more: number
  toggleHref: string
  empty: string | null
}

export interface GroupPanel {
  kind: 'group'
  key: string
  name: string
  oneLiner: string
  videos: number
  /** The market's videos this month. */
  n: number | null
  subjects: { id: string; label: string; k: number }[]
  platforms: VoicesPlatform[]
  wants: string
  stops: string
  triggers: string
  /** Who they say they are: each signal and how often it came up in what the
   *  group said (Pass E's count of its demographic points, not videos). */
  who: { label: string; count: number }[]
  /** The conversations the group is in: its videos this month in each. */
  conversations: { registryId: string; label: string; k: number; href: string }[]
  /** Real phrases (Pass A checked each against a comment), short ones
   *  only, with their English where the comment was not. */
  phrases: { text: string; english: string | null }[]
  /** Three of the group's comments this month, through the quote gate. */
  quotes: VoicesQuote[]
  askHref: string
  closeHref: string
  notchAt: number
}

export interface VoicesQuote {
  ref: string
  text: string
  english: string | null
  lang: string | null
  platform: string | null
  cite: string
}

export interface BrandPanel {
  kind: 'brand'
  brandKey: string
  label: string
  you: boolean
  state: BrandRowState
  named: Level | null
  prevNamed: (Level & { month: string }) | null
  verdict: Verdict | null
  any: Level | null
  /** What people did in the comments of the videos naming it (base `any`). */
  kinds: { kind: string; label: string; k: number; n: number }[]
  subjects: { id: string; label: string; k: number; n: number }[]
  /** The Competitive pane, a rival's alone: over the ninety days ending at
   *  the reading month's last update. */
  window: { from: string; to: string } | null
  /** The question conversations under its own content, by videos. */
  asked: { themes: { registryId: string; label: string; videos: number; href: string }[] } | null
  said: VoicesQuote[]
  findings: { id: string; kindWords: string; title: string; body: string | null }[]
  askHref: string
  closeHref: string
  notchAt: number
}

export interface CreatorPanel {
  kind: 'creator'
  key: string
  account: string
  platform: string
  platformLabel: string
  followers: number | null
  followerWord: string
  videos: number
  n: number | null
  conversations: { registryId: string; label: string; k: number; ofTheme: number; href: string }[]
  brands: { label: string; k: number; you: boolean }[]
  askHref: string
  closeHref: string
  notchAt: number
}

export type VoicesPanel = GroupPanel | BrandPanel | CreatorPanel

export interface VoicesData {
  /** The workspace's name ("Össur"). */
  client: string
  month: string
  soFar: boolean
  monthWords: string
  /** The market's videos this month (`market_month_videos` over the market's
   *  audiences); null where they could not be read. */
  videos: number | null
  groups: VoicesGroups
  brands: VoicesBrands
  creators: VoicesCreators
  params: VoicesParams
  open: { kind: OpenKind; key: string } | null
  panel: VoicesPanel | null
}

// ---- 1. the groups -------------------------------------------------------------------

/** A stored persona with the two fields `normalisePersona` drops: its
 *  conversations (`registryIds`, stable across updates) and nothing else. */
export interface VoicesPersona extends Persona {
  registryIds: string[]
}

/** The latest profile's personas, read defensively (a Pass E jsonb). */
export function personasOf(profile: GroupProfileRow | null): VoicesPersona[] {
  const raw = Array.isArray(profile?.personas) ? (profile!.personas as unknown[]) : []
  return raw.flatMap((p) => {
    const n = normalisePersona(p as Partial<Persona>)
    if (!n) return []
    const ids = (p as { registryIds?: unknown }).registryIds
    return [{ ...n, registryIds: Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [] }]
  })
}

export const GROUPS_NOT_RUN = 'Reading who is talking is not switched on for this workspace yet.'
export const GROUPS_NONE = 'Too little conversation in the latest update to describe who is talking.'
export const GROUPS_UNREAD = 'Who is talking could not be read just now.'

export function buildGroups(input: {
  profile: GroupProfileRow | null
  /** `loadGroupSubjects`' answer; null where it was not read. */
  read: { videos: GroupMonthVideos[]; groups: GroupSubjectRow[] } | null
  platformOf: ReadonlyMap<string, string>
  params: VoicesParams
  failed?: boolean
}): VoicesGroups {
  if (input.failed) return { state: 'unread', profileDate: null, cards: [], empty: GROUPS_UNREAD }
  if (!input.profile) return { state: 'not_run', profileDate: null, cards: [], empty: GROUPS_NOT_RUN }
  const personas = personasOf(input.profile)
  if (personas.length === 0) return { state: 'no_personas', profileDate: input.profile.run_date, cards: [], empty: GROUPS_NONE }
  const videosOf = new Map((input.read?.videos ?? []).map((g) => [g.key, g.videoIds]))
  const subjectsOf = new Map((input.read?.groups ?? []).map((g) => [g.key, g.subjects]))
  const cards: VoicesGroupCard[] = personas.map((p) => {
    const ids = videosOf.get(p.key) ?? []
    const selected = p.key === input.params.group
    return {
      key: p.key,
      name: p.name,
      oneLiner: p.oneLiner,
      videos: ids.length,
      subjects: (subjectsOf.get(p.key) ?? []).slice(0, 3).map((s) => ({ id: s.subjectId, label: s.label, k: s.k })),
      platforms: platformsOf(ids, input.platformOf),
      wants: firstSentence(p.wants),
      stops: firstSentence(p.blockers),
      href: selected ? voicesHref(input.params) : voicesHref(input.params, { kind: 'group', key: p.key }),
      selected,
    }
  })
  // Most videos first; equals keep the profile's own order (a stable sort).
  const order = new Map(personas.map((p, i) => [p.key, i]))
  cards.sort((a, b) => b.videos - a.videos || (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0))
  return { state: 'ready', profileDate: input.profile.run_date, cards, empty: null }
}

/** The cards the grid lays out three to a row (the board's), in rows, so a
 *  group's panel can open directly under the row its card is in. */
export function groupRows<T>(cards: readonly T[], perRow = 3): T[][] {
  const out: T[][] = []
  for (let i = 0; i < cards.length; i += perRow) out.push(cards.slice(i, i + perRow))
  return out
}

/** The registry ids each conversation's month videos sit under, pooled over
 *  the audiences read. */
export function themeVideoSets(refs: readonly ThemeRef[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const r of refs) {
    const set = out.get(r.themeId) ?? new Set<string>()
    for (const v of r.videoIds) set.add(String(v))
    out.set(r.themeId, set)
  }
  return out
}

/** How many conversations a panel lists. */
export const PANEL_CONVERSATIONS = 6
/** How many of a group's phrases its panel prints, and the longest phrase
 *  in words: a longer one is a whole comment, which is a quote's job. */
export const PANEL_PHRASES = 8
export const PHRASE_MAX_WORDS = 10

/** A group's phrases as the panel prints them: each once, short, at most
 *  `PANEL_PHRASES`, each with its English where there is one. */
export function phrasesOf(raw: readonly string[], englishOf: (text: string) => string | null = () => null): { text: string; english: string | null }[] {
  const seen = new Set<string>()
  const out: { text: string; english: string | null }[] = []
  for (const r of raw) {
    const text = r.replace(/\s+/g, ' ').trim()
    const key = text.toLowerCase()
    if (!text || seen.has(key) || text.split(' ').length > PHRASE_MAX_WORDS) continue
    seen.add(key)
    const english = englishOf(text)
    out.push({ text, english: english && english.trim() && english.trim() !== text ? english.trim() : null })
    if (out.length >= PANEL_PHRASES) break
  }
  return out
}
/** How many of a group's comments its panel prints. */
export const GROUP_QUOTES = 3

export function buildGroupPanel(input: {
  persona: VoicesPersona
  card: VoicesGroupCard
  index: number
  perRow: number
  n: number | null
  subjects: { id: string; label: string; k: number }[]
  videoIds: readonly string[]
  themeSets: ReadonlyMap<string, ReadonlySet<string>>
  labels: ReadonlyMap<string, string>
  quotes: VoicesQuote[]
  params: VoicesParams
  /** A phrase's English, where the comment it came from was not. */
  englishOf?: (text: string) => string | null
}): GroupPanel {
  const mine = new Set(input.videoIds)
  const conversations = [...new Set(input.persona.registryIds)]
    .map((id) => {
      const set = input.themeSets.get(id)
      const k = set ? [...set].filter((v) => mine.has(v)).length : 0
      return { registryId: id, label: input.labels.get(id) ?? '', k, href: conversationHref(id) }
    })
    .filter((c) => c.k > 0 && c.label)
    .sort(byNumberThenLabel)
    .slice(0, PANEL_CONVERSATIONS)
  const col = input.index % input.perRow
  return {
    kind: 'group',
    key: input.persona.key,
    name: input.persona.name,
    oneLiner: input.persona.oneLiner,
    videos: input.card.videos,
    n: input.n,
    subjects: input.subjects,
    platforms: input.card.platforms,
    wants: input.persona.wants,
    stops: input.persona.blockers,
    triggers: input.persona.triggers,
    who: input.persona.who.map((w) => ({ label: whoLabel(w.signal), count: w.count })).filter((w) => w.label),
    conversations,
    phrases: phrasesOf(input.persona.howTheyTalk, input.englishOf),
    quotes: input.quotes.slice(0, GROUP_QUOTES),
    askHref: askHref(`What does the group "${input.persona.name}" in my market want, and what stops them?`),
    closeHref: voicesHref(input.params),
    notchAt: (col + 0.5) / input.perRow,
  }
}

/** A demographic signal's slug in words: "parent-of-amputee" → "Parent of
 *  amputee". */
export function whoLabel(signal: string): string {
  const t = signal.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return t ? t[0].toUpperCase() + t.slice(1) : ''
}

// ---- 2. the brands -------------------------------------------------------------------

export const BRANDS_NOT_READ = 'Brands are not read for this workspace yet.'
export const BRANDS_NOT_COUNTED = 'Brands are not counted for this workspace yet.'
export const BRANDS_UNREAD = 'Brands could not be read just now.'

const cellOf = (row: BrandCrossRow | undefined, id: string): Level | null => {
  if (!row || row.n <= 0) return null
  return { k: row.cells.find((c) => c.id === id)?.k ?? 0, n: row.n }
}

/**
 * May the client's own row print? Its name is counted only once production
 * has checked it and every match of it outside its own posts in the month has
 * been read by hand and found to be the client (WP2.6, the Competitive page's
 * `buildNameBlock` rule): a match nobody has read keeps the row at "not
 * counted yet".
 */
export function clientNameCounts(clientId: string, month: string, any: readonly string[], reads: typeof NAME_READS = NAME_READS): boolean {
  if (!nameChecked(clientId)) return false
  const m = monthStartOf(month)
  const read = new Map((reads[clientId] ?? []).filter((r) => r.where === 'production' && monthStartOf(r.month) === m).map((r) => [r.videoId, r.brand]))
  return any.every((id) => read.get(id) === true)
}

export function buildBrands(input: {
  clientId: string
  month: string
  /** Null: the tenant has no brand rules. */
  pairs: BrandPair[] | null
  crosses: { videos: BrandMonthVideos[]; kinds: BrandCrossRow[]; subjects: BrandCrossRow[] } | null
  note: { rival: string; title: string } | null
  params: VoicesParams
  failed?: boolean
  nameReads?: typeof NAME_READS
}): VoicesBrands {
  const month = monthStartOf(input.month)
  const before = prevMonth(month)
  const base = { month, prevMonth: before, rows: [], notNamed: [], notCounted: [], tracked: [], note: null } as Omit<VoicesBrands, 'state' | 'empty'>
  if (input.failed) return { ...base, state: 'unread', empty: BRANDS_UNREAD }
  if (!input.pairs) return { ...base, state: 'not_read', empty: BRANDS_NOT_READ }
  const tracked = input.pairs.map((p) => p.label)
  const videosOf = new Map((input.crosses?.videos ?? []).map((b) => [b.brandKey, b]))
  const kindsOf = new Map((input.crosses?.kinds ?? []).map((b) => [b.brandKey, b]))
  const subjectsOf = new Map((input.crosses?.subjects ?? []).map((b) => [b.brandKey, b]))
  if (!input.pairs.some((p) => p.curr != null)) {
    return { ...base, tracked, state: 'not_counted', empty: BRANDS_NOT_COUNTED }
  }
  const all: VoicesBrandRow[] = input.pairs.map((p) => {
    const you = p.brandKey === 'client'
    const sets = videosOf.get(p.brandKey)
    const gate = !you || clientNameCounts(input.clientId, month, sets?.any ?? [], input.nameReads)
    const measured = p.countState ?? 'not_yet'
    const state: BrandRowState =
      measured === 'counted' && p.curr != null && gate ? 'counted'
        : measured === 'noise' ? 'noise'
          : measured === 'none' && (p.curr == null || p.curr.k === 0) ? 'none'
            : 'not_yet'
    const counted = state === 'counted'
    const top = subjectsOf.get(p.brandKey)?.cells[0]
    const selected = matchesBrand(p, input.params.brand)
    return {
      brandKey: p.brandKey,
      param: p.label,
      label: p.label,
      you,
      state,
      named: counted ? p.curr : null,
      prevNamed: counted && p.prev ? { ...p.prev, month: before } : null,
      verdict: counted ? p.verdict : null,
      any: counted ? p.currAny : null,
      praised: counted ? cellOf(kindsOf.get(p.brandKey), 'praise') : null,
      complained: counted ? cellOf(kindsOf.get(p.brandKey), 'pain_point') : null,
      topSubject: counted && top ? { id: top.id, label: top.label, k: top.k, n: top.n } : null,
      href: selected ? voicesHref(input.params) : voicesHref(input.params, { kind: 'brand', key: p.label }),
      selected,
    }
  })
  const rows = all
    .filter((r) => r.state === 'counted' && (r.named?.k ?? 0) > 0)
    .sort((a, b) => Number(b.you) - Number(a.you) || (b.named?.k ?? 0) - (a.named?.k ?? 0) || (b.any?.k ?? 0) - (a.any?.k ?? 0) || a.label.localeCompare(b.label))
  const notNamed = all.filter((r) => (r.state === 'counted' && (r.named?.k ?? 0) === 0) || r.state === 'none').map((r) => r.label)
  const notCounted = all
    .filter((r) => r.state === 'not_yet' || r.state === 'noise')
    .map((r) => ({ label: r.label, words: r.state === 'noise' ? noiseWords(r.label) : NOT_COUNTED_YET }))
  const noteRow = input.note ? all.find((r) => r.label.trim().toLowerCase() === input.note!.rival.trim().toLowerCase()) : undefined
  return {
    ...base,
    tracked,
    state: 'ready',
    rows,
    notNamed,
    notCounted,
    note: input.note && noteRow ? { rival: noteRow.label, title: input.note.title, href: voicesHref(input.params, { kind: 'brand', key: noteRow.param }) } : null,
    empty: null,
  }
}

/** Does a `?brand=` value name this brand? Its name, its key, its audience,
 *  or, for the client, "client" or "you". */
export function matchesBrand(b: { brandKey: string; label: string }, raw: string | null | undefined): boolean {
  const w = (raw ?? '').trim().toLowerCase()
  if (!w) return false
  if (w === b.brandKey.toLowerCase() || w === b.label.trim().toLowerCase()) return true
  if (b.brandKey === 'client') return w === 'you' || w === CLIENT_AUDIENCE
  return w === rivalKey(b.label).toLowerCase()
}

/** Pass C's weightiest finding of the latest update, for a tracked brand, in
 *  the Competitive page's order (impact, then the kinds' order), the held
 *  kinds left out. Pure over the rows read. */
export function topFinding(rows: readonly { competitor_name: string | null; category: string; title: string; impact_level: string | null }[], tracked: readonly string[]): { rival: string; title: string } | null {
  const names = new Set(tracked.map((t) => t.trim().toLowerCase()))
  const IMPACT: Record<string, number> = { high: 0, medium: 1, low: 2 }
  const top = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.competitor_name && names.has(r.competitor_name.trim().toLowerCase()) && !FINDING_KINDS_HELD.has(r.category) && r.title?.trim())
    .sort((a, b) => (IMPACT[a.r.impact_level ?? ''] ?? 3) - (IMPACT[b.r.impact_level ?? ''] ?? 3) || a.i - b.i)[0]
  return top ? { rival: String(top.r.competitor_name), title: top.r.title.trim() } : null
}

/** How many subjects a brand's panel lists. */
export const PANEL_SUBJECTS = 6
/** How many of what is said about a rival its panel prints. */
export const BRAND_QUOTES = 2

export function buildBrandPanel(input: {
  row: VoicesBrandRow
  kinds: BrandCrossRow | undefined
  subjects: BrandCrossRow | undefined
  noun: string | null
  window: { from: string; to: string } | null
  asked: { themes: { registryId: string; label: string; videos: number }[] } | null
  said: VoicesQuote[]
  findings: readonly Pick<FindingRead, 'id' | 'category' | 'title' | 'body'>[]
  params: VoicesParams
}): BrandPanel {
  const r = input.row
  const counted = r.state === 'counted'
  const kinds = counted && input.kinds && input.kinds.n > 0
    ? input.kinds.cells
      .filter((c) => c.id !== FLAGGED_KIND && c.k > 0)
      .map((c) => ({ kind: c.id, label: talkKindLabel(c.id, input.noun), k: c.k, n: c.n }))
      .sort((a, b) => b.k - a.k || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    : []
  const subjects = counted && input.subjects ? input.subjects.cells.slice(0, PANEL_SUBJECTS).map((c) => ({ id: c.id, label: c.label, k: c.k, n: c.n })) : []
  return {
    kind: 'brand',
    brandKey: r.brandKey,
    label: r.label,
    you: r.you,
    state: r.state,
    named: r.named,
    prevNamed: r.prevNamed,
    verdict: r.verdict,
    any: r.any,
    kinds,
    subjects,
    window: input.window,
    asked: input.asked && input.asked.themes.length > 0
      ? { themes: input.asked.themes.map((t) => ({ ...t, href: conversationHref(t.registryId) })) }
      : null,
    said: input.said.slice(0, BRAND_QUOTES),
    findings: input.findings
      .filter((f) => !FINDING_KINDS_HELD.has(f.category))
      .map((f) => ({ id: f.id, kindWords: findingKindWords(f.category), title: f.title, body: f.body ?? null })),
    askHref: askHref(r.you ? 'What does my market say about us?' : `What does my market say about ${r.label}?`),
    closeHref: voicesHref(input.params),
    // The brands card is the first of the two columns (7 of 12).
    notchAt: 0.29,
  }
}

// ---- 3. the creators -----------------------------------------------------------------

/** Rows the creators card lists before "All N accounts". */
export const CREATOR_ROWS = 5
/** Rows it lists at most, expanded. */
export const CREATOR_ROWS_MAX = 40

const creatorKeyOf = (platform: string, account: string): string => `${platform}|${account}`

/** Does a `?creator=` value name this creator? `platform|account`, or the
 *  account's name alone (the first, by videos, where two platforms share it). */
export function resolveCreator<T extends { key: string; account: string }>(rows: readonly T[], raw: string | null | undefined): T | null {
  const w = (raw ?? '').trim()
  if (!w) return null
  return rows.find((r) => r.key === w) ?? rows.find((r) => r.account.toLowerCase() === w.toLowerCase()) ?? null
}

/** Each counted brand's month video set, for the creators' chips. */
export interface BrandSet {
  label: string
  you: boolean
  any: ReadonlySet<string>
}

/** The brand named in most of a set of videos, or null. */
function topBrandIn(ids: readonly string[], brands: readonly BrandSet[]): { label: string; k: number; you: boolean } | null {
  const hits = brands
    .map((b) => ({ label: b.label, you: b.you, k: ids.filter((id) => b.any.has(id)).length }))
    .filter((b) => b.k > 0)
    .sort((a, b) => b.k - a.k || Number(b.you) - Number(a.you) || a.label.localeCompare(b.label))
  return hits[0] ?? null
}

/** Every brand named in a set of videos, most first. */
function brandsIn(ids: readonly string[], brands: readonly BrandSet[]): { label: string; k: number; you: boolean }[] {
  return brands
    .map((b) => ({ label: b.label, you: b.you, k: ids.filter((id) => b.any.has(id)).length }))
    .filter((b) => b.k > 0)
    .sort((a, b) => b.k - a.k || Number(b.you) - Number(a.you) || a.label.localeCompare(b.label))
}

/** A creator's market videos this month, by its key. */
export function creatorVideoIds(market: readonly Pick<MarketVideo, 'id' | 'platform' | 'account'>[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const v of market) {
    if (!v.account) continue
    const key = creatorKeyOf(v.platform, v.account)
    out.set(key, [...(out.get(key) ?? []), v.id])
  }
  return out
}

export function buildCreators(input: {
  month: string
  read: CreatorThemes | null
  labels: ReadonlyMap<string, string>
  videoIds: ReadonlyMap<string, readonly string[]>
  brands: readonly BrandSet[]
  params: VoicesParams
}): VoicesCreators {
  const month = monthStartOf(input.month)
  const expanded = input.params.creators === 'all'
  const toggleHref = voicesHref(input.params, null, { creators: expanded ? null : 'all' })
  if (!input.read) {
    return { month, accounts: 0, atFloor: 0, floor: ACCOUNT_FLOOR, rows: [], expanded, more: 0, toggleHref, empty: 'Creators could not be read just now.' }
  }
  const atFloor = input.read.creators.filter((c) => c.videos >= ACCOUNT_FLOOR)
  const shown = atFloor.slice(0, expanded ? CREATOR_ROWS_MAX : CREATOR_ROWS)
  const unique = (account: string): boolean => atFloor.filter((c) => c.account.toLowerCase() === account.toLowerCase()).length === 1
  const picked = resolveCreator(atFloor, input.params.creator)?.key ?? null
  const rows: VoicesCreatorRow[] = shown.map((c) => {
    const top = c.themes.find((t) => input.labels.has(t.themeId))
    const param = unique(c.account) ? c.account : c.key
    const selected = c.key === picked
    return {
      key: c.key,
      param,
      account: c.account,
      platform: c.platform,
      platformLabel: platformLabel(c.platform),
      initials: initialsOf(c.account),
      videos: c.videos,
      followers: c.followers,
      followerWord: followerWord(c.platform),
      top: top ? { registryId: top.themeId, label: input.labels.get(top.themeId) as string, k: top.k, ofTheme: top.ofTheme } : null,
      brand: topBrandIn(input.videoIds.get(c.key) ?? [], input.brands),
      href: selected ? voicesHref(input.params) : voicesHref(input.params, { kind: 'creator', key: param }),
      selected,
    }
  })
  return {
    month,
    accounts: input.read.creators.length,
    atFloor: atFloor.length,
    floor: ACCOUNT_FLOOR,
    rows,
    expanded,
    more: Math.max(0, atFloor.length - rows.length),
    toggleHref,
    empty: atFloor.length === 0
      ? `No account made ${fmtInt(ACCOUNT_FLOOR)} or more of the market’s videos in ${longMonth(month)}.`
      : null,
  }
}

export function buildCreatorPanel(input: {
  creator: CreatorThemes['creators'][number]
  n: number | null
  labels: ReadonlyMap<string, string>
  videoIds: readonly string[]
  brands: readonly BrandSet[]
  params: VoicesParams
}): CreatorPanel {
  const c = input.creator
  return {
    kind: 'creator',
    key: c.key,
    account: c.account,
    platform: c.platform,
    platformLabel: platformLabel(c.platform),
    followers: c.followers,
    followerWord: followerWord(c.platform),
    videos: c.videos,
    n: input.n,
    conversations: c.themes
      .filter((t) => input.labels.has(t.themeId))
      .slice(0, PANEL_CONVERSATIONS + 2)
      .map((t) => ({ registryId: t.themeId, label: input.labels.get(t.themeId) as string, k: t.k, ofTheme: t.ofTheme, href: conversationHref(t.themeId) })),
    brands: brandsIn(input.videoIds, input.brands),
    askHref: askHref(`What do people say under ${c.account}'s videos?`),
    closeHref: voicesHref(input.params),
    // The creators card is the second of the two columns (5 of 12).
    notchAt: 0.79,
  }
}

// ---- the Dashboard's tile (T8) ---------------------------------------------------------

export interface TopVoices {
  month: string
  monthWords: string
  /** The market's videos this month. */
  videos: number | null
  /** The group with the most videos this month, and its panel. */
  group: { key: string; name: string; oneLiner: string; videos: number; href: string } | null
  /** Every group's videos this month, most first (they overlap: never a
   *  share, never stacked). */
  groups: { key: string; name: string; videos: number }[]
  /** Named most this month, unprompted: the two brands named in most videos
   *  (you only where your name is counted), each with its panel. */
  named: { label: string; k: number; n: number; you: boolean; href: string }[]
  href: string
}

/** How many brands the tile's "Named most" lists (the board's two). */
export const NAMED_MOST = 2

export function topVoicesOf(input: {
  month: string
  soFar: boolean
  videos: number | null
  groups: VoicesGroups
  brands: VoicesBrands
}): TopVoices {
  const lead = input.groups.cards.find((c) => c.videos > 0) ?? null
  return {
    month: input.month,
    monthWords: monthWordsOf(input.month, input.soFar),
    videos: input.videos,
    group: lead ? { key: lead.key, name: lead.name, oneLiner: lead.oneLiner, videos: lead.videos, href: voicesHref({}, { kind: 'group', key: lead.key }) } : null,
    groups: input.groups.cards.map((c) => ({ key: c.key, name: c.name, videos: c.videos })),
    named: input.brands.rows
      .filter((r) => r.named && r.named.k > 0)
      .sort((a, b) => (b.named?.k ?? 0) - (a.named?.k ?? 0) || Number(b.you) - Number(a.you) || a.label.localeCompare(b.label))
      .slice(0, NAMED_MOST)
      .map((r) => ({ label: r.label, k: r.named!.k, n: r.named!.n, you: r.you, href: voicesHref({}, { kind: 'brand', key: r.param }) })),
    href: VOICES_HREF,
  }
}

// ---- the reads -----------------------------------------------------------------------

export interface VoicesLoadInput {
  /** The session's client (runs, schedule, rivals: what the reading month
   *  reads on it, as every page does). */
  supabase: SupabaseClient
  clientId: string
  reading: ReadingHandle
  params: VoicesParams
  now?: string
}

const say = (what: string, error: unknown): void => {
  console.error(`[pages] voices.${what}: ${(error as { message?: string } | null)?.message ?? String(error)}`)
}

/** What the panels need of the level-1 reads. */
export interface VoicesContext {
  input: VoicesLoadInput
  month: string
  reading: ReadingMonth | null
  audiences: string[]
  profile: GroupProfileRow | null
  personas: VoicesPersona[]
  market: MarketVideo[]
  refs: ThemeRef[]
  groupRead: { videos: GroupMonthVideos[]; groups: GroupSubjectRow[] } | null
  crosses: { videos: BrandMonthVideos[]; kinds: BrandCrossRow[]; subjects: BrandCrossRow[] } | null
  creators: CreatorThemes | null
  labels: Map<string, string>
  brandSets: BrandSet[]
  client: string
}

/** Theme labels (`theme_registry.canonical_label`) by registry id. */
async function readLabels(handle: ReadingHandle, ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const want = [...new Set(ids)].filter(Boolean)
  for (let i = 0; i < want.length; i += 200) {
    const res = await handle.client.from('theme_registry').select('id, canonical_label').eq('client_id', handle.clientId).in('id', want.slice(i, i + 200))
    if (res.error) throw new Error(`theme_registry: ${res.error.message}`)
    for (const r of (res.data ?? []) as { id: string; canonical_label: string | null }[]) {
      const label = (r.canonical_label ?? '').trim()
      if (label) out.set(String(r.id), label)
    }
  }
  return out
}

/** The latest update's Pass C findings, light: the rows the note needs. */
async function readNote(supabase: SupabaseClient, handle: ReadingHandle, tracked: readonly string[]): Promise<{ rival: string; title: string } | null> {
  if (tracked.length === 0) return null
  const [running, res] = await Promise.all([
    fetchRunningRunIds(supabase, handle.clientId, 'voices'),
    handle.client.from('competitive_insights').select('run_id, category, competitor_name, title, impact_level, created_at')
      .eq('client_id', handle.clientId).order('created_at', { ascending: false }).limit(60),
  ])
  if (res.error) throw new Error(`competitive_insights: ${res.error.message}`)
  const rows = ((res.data ?? []) as { run_id: string | null; category: string; competitor_name: string | null; title: string; impact_level: string | null }[])
    .filter((r) => r.run_id && !running.includes(r.run_id))
  const runId = rows[0]?.run_id
  return runId ? topFinding(rows.filter((r) => r.run_id === runId), tracked) : null
}

/**
 * Level 1: every read the page makes before a panel, in two waves (the month
 * and the market's audiences, then everything the month's market feeds), each
 * section failing alone.
 */
export async function loadVoicesBase(input: VoicesLoadInput): Promise<{ data: VoicesData; ctx: VoicesContext }> {
  const { supabase, clientId, reading: handle, params } = input
  const now = input.now ?? new Date().toISOString()

  const [rm, audiences, profile, company, pair] = await Promise.all([
    loadReadingMonth(supabase, handle, now, { explicit: params.month ?? null }).catch((e: unknown) => { say('month', e); return null }),
    loadMarketAudiences(handle).catch((e: unknown) => { say('audiences', e); return null }),
    loadLatestProfile(handle).catch((e: unknown) => { say('profile', e); return undefined }),
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    loadPairOn(handle, now),
  ])
  const month = monthStartOf(rm?.month ?? now)
  const soFar = rm ? rm.state === 'so_far' : true
  const client = ((company.data as { company_name?: string | null } | null)?.company_name ?? '').trim() || 'You'
  const aud = audiences ?? []

  const [market, refs] = await Promise.all([
    audiences ? loadMarketVideos(handle, month, aud).catch((e: unknown) => { say('market', e); return null }) : Promise.resolve(null),
    audiences ? loadThemeRefs(handle, month, aud).catch((e: unknown) => { say('refs', e); return [] as ThemeRef[] }) : Promise.resolve([] as ThemeRef[]),
  ])

  // undefined: not read (or failed); the profile's own absence is `profile === null`.
  const groupAhead = market && profile
    ? loadGroupSubjects(handle, { month, audiences: aud, market, profile }).catch((e: unknown) => { say('groups', e); return undefined })
    : Promise.resolve(undefined)
  const crossesAhead = market
    ? loadBrandCrosses(handle, { month, base: 'any', audiences: aud, market }).catch((e: unknown) => { say('crosses', e); return undefined })
    : Promise.resolve(undefined)
  const pairsAhead = audiences
    ? loadBrandMonthPairs(handle, { month, now, pair, audiences: aud }).catch((e: unknown) => { say('pairs', e); return undefined })
    : Promise.resolve(undefined)
  const creatorsRead = market ? creatorThemes({ month, videos: market, refs, audiences: aud }) : null
  const topThemes = (creatorsRead?.creators ?? []).filter((c) => c.videos >= ACCOUNT_FLOOR).slice(0, CREATOR_ROWS_MAX).flatMap((c) => c.themes.slice(0, 3).map((t) => t.themeId))
  const labelsAhead = readLabels(handle, topThemes).catch((e: unknown) => { say('labels', e); return new Map<string, string>() })

  const [groupRead, crosses, pairs, labels] = await Promise.all([groupAhead, crossesAhead, pairsAhead, labelsAhead])
  const note = pairs ? await readNote(supabase, handle, pairs.filter((p) => p.brandKey !== 'client').map((p) => p.label)).catch((e: unknown) => { say('note', e); return null }) : null

  const platformOf = new Map((market ?? []).map((v) => [v.id, v.platform]))
  const groups = buildGroups({
    profile: profile ?? null,
    read: groupRead ?? null,
    platformOf,
    params,
    failed: profile === undefined || (profile != null && (market == null || groupRead == null)),
  })
  const brands = buildBrands({
    clientId,
    month,
    pairs: pairs === undefined ? [] : pairs,
    crosses: crosses ?? null,
    note,
    params,
    failed: pairs === undefined,
  })
  const counted = new Set(brands.rows.map((r) => r.brandKey))
  const brandSets: BrandSet[] = brands.state === 'ready'
    ? (crosses?.videos ?? [])
      .filter((b) => counted.has(b.brandKey))
      .map((b) => ({ label: b.label, you: b.brandKey === 'client', any: new Set(b.any) }))
    : []
  const videoIds = creatorVideoIds(market ?? [])
  const creators = buildCreators({ month, read: creatorsRead, labels, videoIds, brands: brandSets, params })

  const data: VoicesData = {
    client,
    month,
    soFar,
    monthWords: monthWordsOf(month, soFar),
    videos: market ? new Set(market.map((v) => v.id)).size : null,
    groups,
    brands,
    creators,
    params,
    open: null,
    panel: null,
  }
  const ctx: VoicesContext = {
    input: { ...input, now },
    month,
    reading: rm,
    audiences: aud,
    profile: profile ?? null,
    personas: personasOf(profile ?? null),
    market: market ?? [],
    refs,
    groupRead: groupRead ?? null,
    crosses: crosses ?? null,
    creators: creatorsRead,
    labels,
    brandSets,
    client,
  }
  return { data, ctx }
}

/** Which item `params` opens, in the page's order: a group, a brand, a
 *  creator. One at a time; an item that is not on the page opens nothing. */
export function openOf(data: Pick<VoicesData, 'groups' | 'brands' | 'creators'>, params: VoicesParams, ctx?: Pick<VoicesContext, 'creators'>): { kind: OpenKind; key: string } | null {
  if (params.group) {
    const card = data.groups.cards.find((c) => c.key === params.group)
    if (card) return { kind: 'group', key: card.key }
  }
  if (params.brand && data.brands.state === 'ready') {
    const all = [...data.brands.rows]
    const row = all.find((r) => matchesBrand(r, params.brand))
    if (row) return { kind: 'brand', key: row.brandKey }
  }
  if (params.creator) {
    const pool: readonly { key: string; account: string }[] = ctx?.creators?.creators.filter((c) => c.videos >= ACCOUNT_FLOOR) ?? data.creators.rows
    const hit = resolveCreator(pool, params.creator)
    if (hit) return { kind: 'creator', key: hit.key }
  }
  return null
}

/** A quote of a group's, as the panel prints it. */
function groupQuote(v: { quote: { ref: string; text: string; lang?: string | null; english?: string | null }; cite: string; platform: string | null }): VoicesQuote {
  return {
    ref: v.quote.ref,
    text: v.quote.text,
    english: v.quote.english ?? null,
    lang: v.quote.lang ?? null,
    platform: v.platform,
    cite: [v.platform ? platformLabel(v.platform) : null, v.cite].filter(Boolean).join(' · '),
  }
}

/** The open panel's own reads, and the panel. */
export async function openPanel(ctx: VoicesContext, data: VoicesData, params: VoicesParams): Promise<VoicesData> {
  const open = openOf(data, params, ctx)
  if (!open) return { ...data, params, open: null, panel: null }
  const { supabase, clientId, reading: handle } = ctx.input
  try {
    if (open.kind === 'group') {
      const index = data.groups.cards.findIndex((c) => c.key === open.key)
      const card = data.groups.cards[index]
      const persona = ctx.personas.find((p) => p.key === open.key)
      if (!card || !persona) return { ...data, open: null, panel: null }
      const videoIds = ctx.groupRead?.videos.find((g) => g.key === open.key)?.videoIds ?? []
      const subjects = (ctx.groupRead?.groups.find((g) => g.key === open.key)?.subjects ?? []).map((s) => ({ id: s.subjectId, label: s.label, k: s.k }))
      const phrases = phrasesOf(persona.howTheyTalk).map((p) => p.text)
      const [labels, readings, voices] = await Promise.all([
        readLabels(handle, persona.registryIds).catch((e: unknown) => { say('group.labels', e); return new Map<string, string>() }),
        phrases.length > 0 ? readTranslations(handle.client, phrases) : Promise.resolve(new Map<string, { lang: string; english: string | null }>()),
        loadVoicesMany(handle.client, clientId, [{ key: persona.key, insightIds: persona.insightIds }], {
          month: ctx.month.slice(0, 7), marketFirst: true, gate: gateFor(clientId, {}),
        }).catch((e: unknown) => { say('group.voices', e); return null }),
      ])
      const quotes = (voices?.get(persona.key)?.voices ?? []).map(groupQuote)
      const panel = buildGroupPanel({
        persona, card, index, perRow: 3, n: data.videos, subjects, videoIds,
        themeSets: themeVideoSets(ctx.refs), labels, quotes, params,
        englishOf: (text) => readingOf(readings, text).english ?? null,
      })
      return { ...data, open, panel }
    }
    if (open.kind === 'brand') {
      const row = data.brands.rows.find((r) => r.brandKey === open.key)
      if (!row) return { ...data, open: null, panel: null }
      const rival = !row.you && !row.brandKey.startsWith('watched:') ? { name: row.label, audience: rivalKey(row.label) } : null
      const window = rival && ctx.reading ? ninetyDays(windowEnd(ctx.reading)) : null
      const running = rival ? await fetchRunningRunIds(supabase, clientId, 'voices').catch(() => [] as string[]) : []
      const [said, questions, findings] = await Promise.all([
        rival && window ? readSaidAbout(handle.client, clientId, rival, window).catch((e: unknown) => { say('brand.said', e); return null }) : Promise.resolve(null),
        rival && window ? readQuestions(handle.client, clientId, ctx.month, window, [rival], running).catch((e: unknown) => { say('brand.asked', e); return null }) : Promise.resolve(null),
        rival ? readFindings(handle.client, clientId, ctx.month, [rival], running).catch((e: unknown) => { say('brand.findings', e); return [] as FindingRead[] }) : Promise.resolve([] as FindingRead[]),
      ])
      const themes = questions?.themes.get(rival?.audience ?? '') ?? []
      const panel = buildBrandPanel({
        row,
        kinds: ctx.crosses?.kinds.find((k) => k.brandKey === row.brandKey),
        subjects: ctx.crosses?.subjects.find((k) => k.brandKey === row.brandKey),
        noun: WHAT_THEY_SELL[clientId] ?? null,
        window,
        asked: themes.length > 0
          ? { themes: [...themes].sort((a, b) => b.videos - a.videos || a.label.localeCompare(b.label)).slice(0, ASKED_SHOWN) }
          : null,
        said: (said?.quotes ?? []).map((q) => ({
          ref: q.ref, text: quoteWords(q), english: q.english, lang: q.lang, platform: q.platform,
          cite: [q.platform ? platformLabel(q.platform) : null, q.date ? shortDate(q.date) : null].filter(Boolean).join(' · '),
        })),
        findings,
        params,
      })
      return { ...data, open, panel }
    }
    const creator = ctx.creators?.creators.find((c) => c.key === open.key)
    if (!creator) return { ...data, open: null, panel: null }
    const labels = await readLabels(handle, creator.themes.slice(0, PANEL_CONVERSATIONS + 6).map((t) => t.themeId)).catch((e: unknown) => { say('creator.labels', e); return new Map<string, string>() })
    const panel = buildCreatorPanel({
      creator, n: data.videos, labels, videoIds: creatorVideoIds(ctx.market).get(creator.key) ?? [], brands: ctx.brandSets, params,
    })
    return { ...data, open, panel }
  } catch (e) {
    say('panel', e)
    return { ...data, open: null, panel: null }
  }
}

/** The page: level 1, then the panel `params` opens. */
export async function loadVoices(input: VoicesLoadInput): Promise<VoicesData> {
  const { data, ctx } = await loadVoicesBase(input)
  return openPanel(ctx, data, input.params)
}

/**
 * The Dashboard's Voices tile (T8): the group with the most videos this month
 * and its panel, every group's videos, and the two brands named most. One wave
 * after the month: the profile, the month's market, the groups' evidence and
 * the brands' month rows. No verdict is printed on the tile, so no month-pair
 * judge is read (every pair refused: the levels stand alone).
 */
export async function topVoices(input: { supabase: SupabaseClient; clientId: string; reading: ReadingHandle; now?: string }): Promise<TopVoices | null> {
  const { supabase, clientId, reading: handle } = input
  const now = input.now ?? new Date().toISOString()
  const [rm, audiences, profile] = await Promise.all([
    loadReadingMonth(supabase, handle, now).catch((e: unknown) => { say('top.month', e); return null }),
    loadMarketAudiences(handle).catch((e: unknown) => { say('top.audiences', e); return null }),
    loadLatestProfile(handle).catch((e: unknown) => { say('top.profile', e); return undefined }),
  ])
  if (!audiences) return null
  const month = monthStartOf(rm?.month ?? now)
  const soFar = rm ? rm.state === 'so_far' : true
  const market = await loadMarketVideos(handle, month, audiences).catch((e: unknown) => { say('top.market', e); return null })
  const [groupRead, pairs] = await Promise.all([
    market && profile ? loadGroupSubjects(handle, { month, audiences, market, profile }).catch((e: unknown) => { say('top.groups', e); return undefined }) : Promise.resolve(undefined),
    loadBrandMonthPairs(handle, { month, now, pair: refuseEveryPair, audiences }).catch((e: unknown) => { say('top.pairs', e); return undefined }),
  ])
  const groups = buildGroups({
    profile: profile ?? null,
    read: groupRead ?? null,
    platformOf: new Map((market ?? []).map((v) => [v.id, v.platform])),
    params: {},
    failed: profile === undefined || (profile != null && (market == null || groupRead == null)),
  })
  // THE CLIENT'S NAME GATE ON THE TILE IS READ OFF THE COUNTS, not the video
  // set (which would cost the mention layer's read): your row stands where
  // every name read of the month is a yes and they cover the month's videos
  // naming you (`clientNameCountsByCount`). Where the read set and the month's
  // set are the same videos, which is the only way they are written, this is
  // the page's rule.
  const gated = pairs?.map((p) => (p.brandKey === 'client' && !clientNameCountsByCount(clientId, month, p.currAny?.k ?? 0) ? { ...p, countState: 'not_yet' as const } : p))
  const brands = buildBrands({
    clientId, month, pairs: gated === undefined ? [] : gated,
    crosses: null, note: null, params: {}, failed: gated === undefined,
    // The gate is applied above; the builder's own set-based gate passes an
    // empty set.
  })
  return topVoicesOf({ month, soFar, videos: market ? new Set(market.map((v) => v.id)).size : null, groups, brands })
}

/** The client's name gate from counts: production checked the name, no read
 *  of the month found another word, and the month's reads cover `kAny`
 *  videos. */
export function clientNameCountsByCount(clientId: string, month: string, kAny: number, reads: typeof NAME_READS = NAME_READS): boolean {
  if (!nameChecked(clientId)) return false
  const m = monthStartOf(month)
  const mine = (reads[clientId] ?? []).filter((r) => r.where === 'production' && monthStartOf(r.month) === m)
  if (mine.some((r) => !r.brand)) return false
  return new Set(mine.map((r) => r.videoId)).size >= kAny
}
