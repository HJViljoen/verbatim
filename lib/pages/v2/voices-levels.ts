import type { SupabaseClient } from '@supabase/supabase-js'

import { loadObjectReadings, type MarketObjectRef } from '../../agent/movement'
import { NOT_COUNTED_YET } from '../../brands/precision'
import { chunk, mapWithLimit, READ_CONCURRENCY, UUID_IN_CHUNK } from '../../chunk'
import { fmtInt, longMonth, platformLabel, shortDate } from '../../format'
import { gateFor, readQuoteContext } from '../../quote-context'
import { pickEligible, type GateOptions, type QuoteVideo } from '../../quote-gate'
import { cleanQuote, fetchQuoteCitationsByAudience, readingOf, readsAsHeroQuote, readTranslations } from '../../quotes'
import { quoteRef } from '../../renderables/quotes-freeze'
import {
  brandKinds, brandMonthPair, brandSubjects, creatorThemes, loadBrandMonthVideos, loadBrandRefs, loadGroupSubjects, loadLatestProfile, loadMarketAudiences,
  loadMarketVideos,
  type BrandCrossRow, type BrandLens, type BrandMonthVideos, type BrandPair, type CreatorRow, type CreatorThemes, type GroupMonthVideos, type GroupProfileRow,
  type GroupSubjectRow, type LensRowIn, type MarketVideo, type StoredBrandMonthRow,
} from '../../reading/cross'
import { marketAudiences } from '../../reading/market'
import { monthStartOf, nextMonth, prevMonth } from '../../reading/month-key'
import { barMonth, readingMonthLabel } from '../../reading/month-label'
import { refuseEveryPair, type PairOn } from '../../reading/pairs'
import { loadPairOn, type ReadingHandle } from '../../reading/read'
import { loadMarketRivalAudiences, loadReadingMonth } from '../../reading/reading-view'
import { windowEnd, type ReadingMonth } from '../../reading/reading-month'
import type { Verdict } from '../../reading/verdicts'
import { rivalKey } from '../../rivals'
import { FAILED_EXPLAINED, SUBJECT_NOT_MEASURED } from '../../subjects/calibration-state'
import { selectAll } from '../../supabase-admin'
import { marketConversationHref, marketSubjectHref } from '../../nav'
import { ASKED_SHOWN, findingKindWords, FINDING_KINDS_HELD, ninetyDays, windowWords } from '../brands'
import { readQuestions } from '../brands-load'
import type { Crumb, CrumbItem, CrumbMenu } from '../crumbs'
import { fetchRunningRunIds } from '../latest-video-run'
import { WHAT_THEY_SELL } from '../market-frame'
import { readsAsOffer } from '../overview-market/offers'
import { talkKindLabel } from '../overview-market/kinds'
import { accountKey } from '../overview-market/voices'
import { loadVoicesMany } from '../subjects'
import { loadSubjectPlacement, placeSubject, type PlacedSubjectRow, type SubjectPlacement } from '../subject-place'
import { fetchThemedRunId } from '../themed-run'
import { ACCOUNT_FLOOR } from '../voice-surface-where'
import { FLAGGED_KIND, KIND_ORDER } from '../../reading/kinds'
import {
  MARKET_CONV_VIDEOS, MARKET_CONV_VIDEOS_MAX, MARKET_CONV_VIDEOS_PHONE, MARKET_VIDEO_COMMENTS_MAX, MARKET_VIDEO_QUOTES,
  convVideoOrder, insightThemes, isRegistryId, quotesAcrossConversations, shownConvVideos,
  type ConvEvidenceRow, type ConvVideoRow, type RunTheme,
} from './market'
import {
  askHref, brandTable, buildBrands, buildGroups, clientCountsOf, COMMUNITY_PLATFORMS, creatorsOf, crossKeys, followerWord, GROUP_NO_WHO, GROUP_NOT_DESCRIBED, groupProducts,
  initialsOf, matchesBrand, mergeWho, monthWordsOf, paramValue, personasOf, phrasesOf, readGroupProducts, readLatestFindings, readLabels, resolveCreator,
  themeVideoSets, voicesHref, whoLabel, WHO_SHOWN,
  type BrandRowState, type FindingRow, type GroupProducts, type Level, type VoicesBrandRow, type VoicesBrands, type VoicesGroups, type VoicesPersona, type VoicesPlatform,
} from './voices'
import { VOICES_PATH, voicesBrandHref, voicesCreatorHref, voicesGroupHref, voicesMonthQuery } from './voices-address'

// VOICES' LEVEL PAGES (depth as pages, 17 Oct; the G3 boards, approved by
// Heinrich with every recommendation in the board report). A GROUP and a BRAND
// are hubs (a header card that leads, then their parts); a CREATOR is the
// evidence (a flat header, their videos and what was said under them). Each
// reads only what it prints, on the reading month Voices reads (decision A,
// `loadReadingMonth`, `?month=` as the root takes it):
//
//   GROUP `/dashboard/voices/groups/<key>`: who they are (the stored
//     one-liner, Pass E), the count and its four figures, what they want,
//     stop at and tip on, who they say they are and how they talk; its parts
//     are MARKET'S levels (D3): the subjects their videos sit in, each with the
//     conversations inside it for them (`placeSubject`, the one rule), every
//     conversation they are in, the brands and products in their videos,
//     where they comment, and three of their comments, each from its
//     conversation.
//   BRAND `/dashboard/voices/brands/<key>`: Pass C's latest finding leads (a
//     rival's), named without being asked with its `Verdict`, named at all,
//     praised and complained; its parts are VOICES' levels (D3): the groups
//     commenting on its videos and the creators it comes up with (D2: no
//     videos on a hub); its numbers month by month; and a rival's ninety-day
//     section under its own heading and window chip (D4).
//   CREATOR `/dashboard/voices/creators/<platform>/<account>`: one line code
//     builds from figures, the brands in their videos, their videos with what
//     was counted under each (every comment naming the conversation it is in),
//     a small facts rail and the other creators. Never Reddit.
//
// DECISION 2 holds on a group: today's groups with this month's videos, a
// count and never a share, never compared ("Not compared yet"). RULING U6
// holds everywhere: a subject whose check has not passed prints no figure
// resting on its membership (its name, and a conversation's own count, are
// not such figures: lib/pages/subject-place.ts). A TRACKED SUBJECT IS NEVER
// HIDDEN: every active subject is carded, listed or named on a group page.
//
// PURE HALF FIRST (every builder is tested over fixtures), THEN THE READS.

// ---- the params -----------------------------------------------------------------------

export interface LevelParams {
  /** `?month=YYYY-MM`, as the root takes it. */
  month?: string
  /** A creator's page only: one of their videos opened (`videos.id`), and every
   *  video listed. Honoured only for the creator's own videos in the month. */
  video?: string
  videos?: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A level page's params from a request's search params. `?video=` must be a
 *  row id (a UUID, lowercased); anything else names nothing. */
export function levelParams(raw: Record<string, string | string[] | undefined> | null | undefined): LevelParams {
  const sp = raw ?? {}
  const out: LevelParams = {}
  const month = paramValue(sp.month)
  if (month && /^\d{4}-\d{2}(-\d{2})?$/.test(month)) out.month = month.slice(0, 7)
  const video = paramValue(sp.video)
  if (video && UUID_RE.test(video)) out.video = video.toLowerCase()
  if (paramValue(sp.videos) === 'all') out.videos = true
  return out
}

/** The root, the chosen month kept. */
export const voicesRootHref = (p: Pick<LevelParams, 'month'>): string => `${VOICES_PATH}${voicesMonthQuery(p.month)}`

/** A level page's link into Market: the conversation's or subject's page on
 *  This month, for the month Voices reads, so its counts and Market's agree. */
export const marketConvHref = (id: string, month: string): string => marketConversationHref(id, { period: 'month', month })
export const marketSubjHref = (id: string, month: string): string => marketSubjectHref(id, { period: 'month', month })

// ---- shared shapes --------------------------------------------------------------------

/** The month a level page reads, and the market's videos in it. */
export interface LevelMonth {
  month: string
  soFar: boolean
  /** "October so far", "September". */
  monthWords: string
  /** Decision 3: "the last full month" where the month is not the current
   *  calendar month (`readingMonthLabel`), else null. */
  monthLabel: string | null
  /** The market's videos this month (`market_month_videos` over the market's
   *  audiences), null where they could not be read. */
  n: number | null
}

/** "this month" while the month is the one under way, else "in September":
 *  the month inside a sentence. */
export const inMonthWords = (m: Pick<LevelMonth, 'month' | 'soFar'>): string => (m.soFar ? 'this month' : `in ${longMonth(m.month)}`)

/** The bar's month: "October so far", or "September · the last full month". */
export const levelBarMonth = (m: Pick<LevelMonth, 'monthWords' | 'monthLabel'>): string => barMonth(m.monthWords, m.monthLabel ?? null)

/** One comment on a level page: the commenter's words (resolved at render, as
 *  every quote's are), its English where it has one, where and when, and the
 *  conversation it is in where the page names one. */
export interface LevelQuote {
  ref: string
  text: string
  lang: string | null
  english: string | null
  /** "Instagram · 4 Oct". */
  cite: string
  from: { id: string; label: string; href: string } | null
}

/** A page whose address names nothing Voices follows: its one calm line. */
export type LevelMissing = { kind: 'missing'; level: 'group' | 'brand' | 'creator'; line: string }

export const GROUP_MISSING = 'Voices has no group at this address.'
export const BRAND_MISSING = 'Voices does not track a brand at this address.'
export const CREATOR_MISSING = 'Voices lists no creator at this address.'
export const CREATOR_REDDIT = 'Reddit is left out: there a post’s account is the community it was posted in, not who made it.'
export const creatorBelowFloor = (monthText: string): string =>
  `No creator at this address made ${fmtInt(ACCOUNT_FLOOR)} or more of your market’s videos in ${monthText}.`
export const BACK_TO_VOICES = 'Back to Voices'
/** Why a brand's or a creator's week and over time are shown and not offered
 *  (the boards' own words; a group's page says the groups' reason in full,
 *  `VOICES_ONE_MONTH`). */
export const VOICES_ONE_MONTH_SHORT = 'Voices reads one month at a time.'

/** The crumb the path starts with: Voices, the month kept. */
const voicesCrumb = (p: Pick<LevelParams, 'month'>): Crumb => ({ label: 'Voices', href: voicesRootHref(p) })

/** One to twelve in words, as the boards write a small count in a sentence
 *  ("one more of their conversations"); a digit past that. */
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
export const countWords = (n: number): string => (n >= 0 && n < WORDS.length ? WORDS[n] : fmtInt(n))

const byKThenLabel = <T extends { k: number; label: string }>(a: T, b: T): number => b.k - a.k || a.label.localeCompare(b.label)

/** Count of each platform among a set of videos, biggest first. */
export function platformsOfSet(ids: Iterable<string>, platformOf: ReadonlyMap<string, string>): VoicesPlatform[] {
  const counts = new Map<string, number>()
  for (const id of ids) {
    const p = platformOf.get(id)
    if (p) counts.set(p, (counts.get(p) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([platform, k]) => ({ platform, label: platformLabel(platform), k }))
    .sort((a, b) => b.k - a.k || a.platform.localeCompare(b.platform))
}

// =========================================================================================
// THE GROUP (a hub)
// =========================================================================================

/** A subject as a group's page reads it: its state, and (ready only) the
 *  group's videos in it. */
export type SubjectState = 'ready' | 'provisional' | 'failed'

export interface GroupConversation {
  id: string
  label: string
  description: string | null
  /** The subject `placeSubject` puts it in (a name, never a figure). */
  subject: { id: string; name: string; state: SubjectState } | null
  /** The group's videos this month in it, of `GroupPage.videos`. */
  k: number
  /** Every video in it this month (its `month_evidence_refs`, the market's
   *  audiences), or null where not read. */
  all: number | null
  href: string
}

export interface GroupSubjectCard {
  id: string
  name: string
  state: SubjectState
  /** Ready only: the group's videos about it (`groupSubjects`, the group's own
   *  insights that are members of it). Null under U6. */
  k: number | null
  /** Up to two of the group's conversations inside it, most of their videos
   *  first: a conversation's own count, never the subject's. */
  inside: { id: string; label: string; k: number; href: string }[]
  /** Ready only: the subject's level on the market this month (its Market
   *  page's), where read. */
  market: Level | null
  href: string
}

export interface GroupBrandRows {
  /** `ready`: counted rows; `not_counted` / `not_read` / `unread`: names only. */
  state: 'ready' | 'not_counted' | 'not_read' | 'unread'
  rows: { key: string; label: string; you: boolean; k: number | null; href: string }[]
  /** The column's one line where it counts nothing. */
  line: string | null
}

export interface GroupPage {
  kind: 'group'
  month: LevelMonth
  key: string
  name: string
  oneLiner: string
  /** The update the groups were described at (`consumer_profiles.run_date`). */
  profileDate: string | null
  /** The group's videos this month (decision 2: a count, never a share). */
  videos: number
  platforms: VoicesPlatform[]
  wants: string
  stops: string
  triggers: string
  who: { label: string; count: number }[]
  phrases: { text: string; english: string | null }[]
  /** The tenant's subjects: `none` where none is named; `none_ready` where
   *  some are and none has passed its check. */
  subjectsState: 'ready' | 'none_ready' | 'none'
  /** The READY subject most of their videos carry, on at least one. */
  topSubject: { id: string; label: string; k: number } | null
  cards: GroupSubjectCard[]
  /** Ready subjects not carded, on at least one of their videos ("Also in
   *  their videos"), and those on none of them (listed by name, never hidden). */
  alsoIn: { id: string; label: string; k: number; href: string }[]
  inNone: { id: string; label: string; href: string }[]
  /** Every subject whose check has not passed, open or failed, by name. */
  notMeasured: { id: string; label: string; state: 'provisional' | 'failed' }[]
  /** Subjects not carded that hold some of their conversations: "Look &
   *  style holds one more of their conversations, in the list below". */
  holdsMore: { id: string; label: string; convs: number }[]
  conversations: GroupConversation[]
  brands: GroupBrandRows
  products: GroupProducts
  quotes: LevelQuote[]
  /** Their comments could not be read (the card says so, never "none"). */
  quotesUnread?: boolean
  askHref: string
  crumbs: Crumb[]
}

/** Words the group page says in its own frames. */
export const GROUP_NOT_COMPARED_TITLE = 'Not compared yet'
export const GROUP_AFRESH = 'Each update describes the groups afresh'
export const HOW_THEY_TALK_NONE = 'No phrasing of theirs could be checked against a comment yet.'
export const GROUP_NO_SUBJECTS = 'No subject is tracked for this workspace yet.'
export const groupNoConversationsIn = (monthWords: string): string => `None of their videos in ${monthWords} is in a named conversation.`
/** Why a counted comment may not print on a level page: what the quote gate
 *  tests there (readable, a person's own words, not the account's own reply,
 *  not an offer). No relevance to a claim is required on these pages, so the
 *  words claim none (Market's conversation page, which does, says "speaks to
 *  this"). */
export const LEVEL_QUOTE_RULE = 'a comment prints only where it reads clearly in the commenter’s own words'
/** "In their words" with no comment to print (the parity rule: the card keeps
 *  its frame and says why in one line). */
export const groupQuotesNone = (monthWords: string, videos: number): string =>
  videos === 0 ? `None of their comments in ${monthWords}.` : `None of their comments in ${monthWords} can be quoted: ${LEVEL_QUOTE_RULE}.`
export const GROUP_QUOTES_UNREAD = 'Their comments could not be read just now.'
export const GROUP_BRANDS_SHOWN = 4

/** What a group's page reads, handed to its builder. */
export interface GroupInput {
  month: LevelMonth
  persona: VoicesPersona
  profileDate: string | null
  /** Every group of the month in the root's order (`buildGroups`), for the
   *  switcher. */
  groups: VoicesGroups
  read: { videos: GroupMonthVideos[]; groups: GroupSubjectRow[] } | null
  platformOf: ReadonlyMap<string, string>
  /** The tenant's active subjects with their checks (`loadSubjectPlacement`). */
  subjects: readonly PlacedSubjectRow[]
  placed: SubjectPlacement | null
  /** The persona's conversations on the themed run (labels and members). */
  themes: ReadonlyMap<string, RunTheme>
  labels: ReadonlyMap<string, string>
  descriptions: ReadonlyMap<string, string>
  /** Each conversation's month videos (refs over the market's audiences). */
  themeSets: ReadonlyMap<string, ReadonlySet<string>>
  /** The ready subjects' market levels this month. */
  levels: ReadonlyMap<string, Level>
  brands: GroupBrandRows
  products: GroupProducts
  /** Null where they could not be read. */
  quotes: LevelQuote[] | null
  englishOf?: (text: string) => string | null
  params: LevelParams
}

const stateOf = (calibration: string): SubjectState => (calibration === 'ready' ? 'ready' : calibration === 'failed' ? 'failed' : 'provisional')

/** The group switcher (board: the month's groups in the root's order). */
export function groupMenu(groups: VoicesGroups, currentKey: string, p: Pick<LevelParams, 'month'>): CrumbMenu | null {
  const items: CrumbItem[] = groups.cards.map((c) => ({ key: c.key, label: c.name, href: voicesGroupHref(c.key, p), current: c.key === currentKey, slot: 'pass_e_persona' }))
  return items.length > 1 || (items.length === 1 && !items[0].current)
    ? { label: 'Groups in your market', switchLabel: 'Switch to another group', items }
    : null
}

/**
 * A GROUP'S PAGE, from what it read. Its conversations are the persona's own
 * (`registryIds`) with any of its videos this month; each placed in a subject
 * by the one rule (`placeSubject` over its members on the themed run). Its
 * subject cards, at most three: the READY subjects on their videos, most
 * first; where fewer than three, the subjects whose check has not passed that
 * hold some of their conversations, by the biggest of those (the thin board).
 * Every other subject keeps its place: ready ones in "Also in their videos"
 * (or, on none of them, by name), the rest named as not measured. PURE.
 */
export function buildGroupPage(input: GroupInput): GroupPage {
  const { persona, month, params } = input
  const m = month.month
  const mine = new Set(input.read?.videos.find((g) => g.key === persona.key)?.videoIds ?? [])
  const videos = mine.size
  const readyK = new Map((input.read?.groups.find((g) => g.key === persona.key)?.subjects ?? []).map((s) => [s.subjectId, s.k]))
  const subjectRows = input.subjects.map((s) => ({ id: s.subject.id, name: s.subject.name, state: stateOf(s.calibration) }))
  const subjectOf = new Map(subjectRows.map((s) => [s.id, s]))

  // THE CONVERSATIONS: the persona's own, with any of their videos this month.
  const conversations: GroupConversation[] = [...new Set(persona.registryIds)]
    .map((id) => {
      const set = input.themeSets.get(id)
      const k = set ? [...set].filter((v) => mine.has(v)).length : 0
      const label = (input.labels.get(id) ?? input.themes.get(id)?.label ?? '').trim()
      const members = input.themes.get(id)?.memberIds ?? []
      const placedId = input.placed && members.length > 0 ? placeSubject(members, input.placed) : null
      const subject = placedId ? subjectOf.get(placedId) ?? null : null
      return { id, label, description: input.descriptions.get(id) ?? null, subject, k, all: set ? set.size : null, href: marketConvHref(id, m) }
    })
    .filter((c) => c.k > 0 && c.label)
    .sort(byKThenLabel)

  // THE SUBJECTS.
  const ready = subjectRows.filter((s) => s.state === 'ready')
  const unready = subjectRows.filter((s) => s.state !== 'ready')
  const insideOf = (id: string) => conversations.filter((c) => c.subject?.id === id)
  const readyOn = ready
    .map((s) => ({ ...s, k: readyK.get(s.id) ?? 0 }))
    .filter((s) => s.k > 0)
    .sort((a, b) => b.k - a.k || a.name.localeCompare(b.name))
  const unreadyHolding = unready
    .map((s) => ({ ...s, convs: insideOf(s.id) }))
    .filter((s) => s.convs.length > 0)
    .sort((a, b) => (b.convs[0]?.k ?? 0) - (a.convs[0]?.k ?? 0) || a.name.localeCompare(b.name))
  const carded = [
    ...readyOn.slice(0, 3).map((s) => ({ id: s.id, name: s.name, state: s.state, k: s.k as number | null })),
    ...unreadyHolding.slice(0, Math.max(0, 3 - Math.min(3, readyOn.length))).map((s) => ({ id: s.id, name: s.name, state: s.state, k: null as number | null })),
  ]
  const cardedIds = new Set(carded.map((c) => c.id))
  const cards: GroupSubjectCard[] = carded.map((c) => ({
    id: c.id,
    name: c.name,
    state: c.state,
    k: c.state === 'ready' ? c.k : null,
    inside: insideOf(c.id).slice(0, 2).map((x) => ({ id: x.id, label: x.label, k: x.k, href: x.href })),
    market: c.state === 'ready' ? input.levels.get(c.id) ?? null : null,
    href: marketSubjHref(c.id, m),
  }))
  const top = readyOn[0] ?? null
  return {
    kind: 'group',
    month,
    key: persona.key,
    name: persona.name,
    oneLiner: persona.oneLiner,
    profileDate: input.profileDate,
    videos,
    platforms: platformsOfSet(mine, input.platformOf),
    wants: persona.wants,
    stops: persona.blockers,
    triggers: persona.triggers,
    // Decision 8: near-repeats are one self-description (`mergeWho`).
    who: mergeWho(persona.who.map((w) => ({ label: whoLabel(w.signal), count: w.count })).filter((w) => w.label)).slice(0, WHO_SHOWN),
    phrases: phrasesOf(persona.howTheyTalk, input.englishOf),
    subjectsState: subjectRows.length === 0 ? 'none' : ready.length === 0 ? 'none_ready' : 'ready',
    topSubject: top ? { id: top.id, label: top.name, k: top.k } : null,
    cards,
    alsoIn: readyOn.filter((s) => !cardedIds.has(s.id)).map((s) => ({ id: s.id, label: s.name, k: s.k, href: marketSubjHref(s.id, m) })),
    inNone: videos > 0 ? ready.filter((s) => !readyK.get(s.id)).map((s) => ({ id: s.id, label: s.name, href: marketSubjHref(s.id, m) })) : [],
    notMeasured: unready.map((s) => ({ id: s.id, label: s.name, state: s.state as 'provisional' | 'failed' })),
    holdsMore: subjectRows
      .filter((s) => !cardedIds.has(s.id))
      .map((s) => ({ id: s.id, label: s.name, convs: insideOf(s.id).length }))
      .filter((s) => s.convs > 0),
    conversations,
    brands: input.brands,
    products: input.products,
    quotes: input.quotes ?? [],
    ...(input.quotes === null ? { quotesUnread: true } : {}),
    askHref: askHref(`What does the group "${persona.name}" in my market want, and what stops them?`),
    crumbs: [voicesCrumb(params), { label: persona.name, href: null, slot: 'pass_e_persona', menu: groupMenu(input.groups, persona.key, params) }],
  }
}

/** The group's line for the conversations card's foot: whether their
 *  conversations' counts add up past their own videos. Pure. */
export const conversationsOverlap = (page: Pick<GroupPage, 'conversations' | 'videos'>): boolean =>
  page.conversations.reduce((s, c) => s + c.k, 0) > page.videos

/** "Brands named in their videos": each counted brand's month set over the
 *  group's videos, you first, then most; names alone where brands are not
 *  counted yet (the brands table's rows, `brandTable`). PURE. */
export function groupBrandRows(input: {
  brands: VoicesBrands
  sets: readonly Pick<BrandMonthVideos, 'brandKey' | 'any'>[]
  videoIds: ReadonlySet<string>
  params: Pick<LevelParams, 'month'>
}): GroupBrandRows {
  const b = input.brands
  const href = (key: string) => voicesBrandHref(key, input.params)
  if (b.state === 'unread') return { state: 'unread', rows: [], line: b.empty }
  if (b.state === 'not_read') return { state: 'not_read', rows: [], line: b.empty }
  if (b.state === 'not_counted') {
    return { state: 'not_counted', rows: brandTable(b).rows.slice(0, GROUP_BRANDS_SHOWN).map((r) => ({ key: r.brandKey, label: r.label, you: r.you, k: null, href: href(r.brandKey) })), line: b.empty }
  }
  const setOf = new Map(input.sets.map((s) => [s.brandKey, s.any]))
  const rows = b.all
    .filter((r) => r.state === 'counted')
    .map((r) => ({ key: r.brandKey, label: r.label, you: r.you, k: (setOf.get(r.brandKey) ?? []).filter((v) => input.videoIds.has(v)).length, href: href(r.brandKey) }))
    .filter((r) => r.k > 0)
    .sort((x, y) => Number(y.you) - Number(x.you) || (y.k ?? 0) - (x.k ?? 0) || x.label.localeCompare(y.label))
    .slice(0, GROUP_BRANDS_SHOWN)
  return { state: 'ready', rows, line: rows.length === 0 ? 'No brand you track was named in their videos.' : null }
}

// =========================================================================================
// THE BRAND (a hub)
// =========================================================================================

export interface BrandMonthBar {
  month: string
  label: string
  /** Named without being asked: `k_organic` of `n_organic`, pooled. */
  k: number | null
  n: number | null
  filling: boolean
}

export interface BrandPage {
  kind: 'brand'
  month: LevelMonth
  brandKey: string
  label: string
  you: boolean
  /** A watched brand (no rival audience): no ninety-day section. */
  watched: boolean
  state: BrandRowState
  stateWords: string | null
  named: Level | null
  prevNamed: (Level & { month: string }) | null
  verdict: Verdict | null
  any: Level | null
  praised: Level | null
  complained: Level | null
  /** Pass C's weightiest finding for this rival, the header card's lead, and
   *  the update it was written at; null for you, a watched brand, or none. */
  lead: { title: string; body: string | null; kindWords: string } | null
  findingsDate: string | null
  /** The rest of its findings (the read card's right-hand column). */
  findings: { id: string; kindWords: string; title: string; body: string | null }[]
  /** The groups commenting on its videos this month: of its `any`. */
  groups: { key: string; name: string; oneLiner: string; k: number; href: string }[]
  /** The groups' state where none is listed (no profile, not read). */
  groupsLine: string | null
  /** Creators at the floor whose month videos name it. */
  creators: { key: string; account: string; platformLabel: string; initials: string; followers: number | null; followerWord: string; k: number; href: string }[]
  communitiesLeftOut: boolean
  /** Named without being asked, the month and the two before it. */
  months: BrandMonthBar[]
  kinds: { kind: string; label: string; k: number; n: number }[]
  subjects: { id: string; label: string; k: number; n: number; href: string }[]
  /** Every subject not ready, named; `failed` for one being re-described,
   *  whose reason the page says once (FAILED_EXPLAINED). */
  notMeasured: { id: string; label: string; failed?: boolean }[]
  /** Where it was named, of its `any`: in a comment dated this month, in the
   *  video's own words (caption, speech, on screen). */
  where: { comment: number; content: number; n: number } | null
  platforms: VoicesPlatform[]
  /** A rival's ninety days, under its own heading (D4); null for you and a
   *  watched brand. */
  window: { from: string; to: string; words: string } | null
  asked: { id: string; label: string; videos: number; href: string }[]
  /** What it says in its own videos (`video_claims` on its own posts in the
   *  window, the paraphrase, stored prose, never set as a quote). */
  claims: { id: string; claim: string }[]
  said: LevelQuote[]
  askHref: string
  crumbs: Crumb[]
}

export const BRAND_SAID_SHOWN = 3
export const BRAND_CLAIMS_SHOWN = 2
export const BRAND_MONTHS = 3
/** "this month" only while the month read is under way, else its name
 *  (decision 3, "Two clocks": a page reading September in October never
 *  says "this month" of it). */
export const brandGroupsNone = (m: Pick<LevelMonth, 'month' | 'soFar'>): string => `None of the groups comments on its videos ${inMonthWords(m)}.`
export const brandCreatorsNone = (m: Pick<LevelMonth, 'month' | 'soFar'>): string => `No creator with ${countWords(ACCOUNT_FLOOR)} or more videos ${inMonthWords(m)} made one that names it.`
/** A brand not counted (`not_yet`, `noise`) or that no video names (`none`)
 *  keeps every frame. Its header says why ONCE (the row's `stateWords`);
 *  each frame below says only what it holds, true of all three states (a
 *  brand no video names IS counted, and a noisy name is never counted, so
 *  "not counted yet" is wrong of both). */
export const brandFrameNone = (what: 'group' | 'creator' | 'figure', label: string, m: Pick<LevelMonth, 'month' | 'soFar'>): string =>
  what === 'figure' ? `No figure prints for ${label} ${inMonthWords(m)}.` : `No ${what} is listed for ${label} ${inMonthWords(m)}.`
export const brandCreatorsSub = (m: Pick<LevelMonth, 'month' | 'soFar'>): string => `Accounts with ${fmtInt(ACCOUNT_FLOOR)} or more of your market’s videos ${inMonthWords(m)} whose videos name it`
export const BRAND_FINDINGS_NOTE = 'Findings are the latest update’s, so they carry no month of their own.'
export const BRAND_YOU_NO_FINDING = 'Findings compare a rival’s talk with the rest of the market, so your own brand has none.'
export const BRAND_NO_FINDING = 'The latest update wrote no finding about this brand.'

/** The brands switcher (G3-Voices-Brand-Switcher): "Brands you track", you
 *  first, then by how often each was named without being asked, then those
 *  not named or not counted below a hairline, in words and no figure. */
export function brandMenu(brands: VoicesBrands, currentKey: string, p: Pick<LevelParams, 'month'>, when = 'this month'): CrumbMenu | null {
  const item = (r: VoicesBrandRow, note: string | null): CrumbItem => ({ key: r.brandKey, label: r.label, href: voicesBrandHref(r.brandKey, p), current: r.brandKey === currentKey, note })
  const named = (r: VoicesBrandRow) => r.state === 'counted' && (r.named?.k ?? 0) > 0
  const you = brands.all.find((r) => r.you) ?? null
  const top = [
    ...(you ? [item(you, 'You')] : []),
    ...brands.all.filter((r) => !r.you && named(r)).sort((a, b) => (b.named?.k ?? 0) - (a.named?.k ?? 0) || a.label.localeCompare(b.label)).map((r) => item(r, null)),
  ]
  const below = brands.all
    .filter((r) => !r.you && !named(r))
    .map((r) => item(r, r.state === 'counted' || r.state === 'none' ? `Not named ${when}` : r.state === 'noise' ? 'Not counted' : sentence(NOT_COUNTED_YET)))
  const menu: CrumbMenu = { label: 'Brands you track', switchLabel: 'Switch to another brand', items: top, below }
  return top.length + below.length > 1 ? menu : null
}

const sentence = (s: string): string => `${s.charAt(0).toUpperCase()}${s.slice(1)}`

/** What a brand's page reads, handed to its builder. */
export interface BrandInput {
  month: LevelMonth
  row: VoicesBrandRow
  brands: VoicesBrands
  /** Its month sets (`any`), where read. */
  set: Pick<BrandMonthVideos, 'any'> | null
  /** The stored month rows of this brand, three months, every audience. */
  rows: readonly (StoredBrandMonthRow & { k_content?: number | null; k_comment?: number | null })[]
  audiences: readonly string[]
  kinds: BrandCrossRow | null
  subjects: BrandCrossRow | null
  pending: readonly { id: string; label: string; failed?: boolean }[]
  noun: string | null
  personas: readonly VoicesPersona[]
  groupSets: ReadonlyMap<string, readonly string[]> | null
  creators: CreatorThemes | null
  creatorVideoIds: ReadonlyMap<string, readonly string[]>
  platformOf: ReadonlyMap<string, string>
  findings: readonly FindingRow[]
  findingsDate: string | null
  window: { from: string; to: string } | null
  asked: readonly { registryId: string; label: string; videos: number }[]
  claims: readonly { id: string; claim: string }[]
  said: LevelQuote[]
  nowMonth: string
  params: LevelParams
}

/** The month bars: named without being asked, pooled over the market's
 *  audiences, the month and the two before it. PURE. */
export function brandMonthBars(rows: BrandInput['rows'], brandKey: string, month: string, audiences: readonly string[], nowMonth: string, count = BRAND_MONTHS): BrandMonthBar[] {
  const keep = new Set(audiences)
  const months: string[] = []
  let m = monthStartOf(month)
  for (let i = 0; i < count; i++) { months.unshift(m); m = prevMonth(m) }
  return months.map((mm) => {
    const mine = rows.filter((r) => monthStartOf(String(r.month)) === mm && r.brand_key === brandKey && keep.has(r.audience))
    const has = mine.length > 0
    return {
      month: mm,
      label: longMonth(mm),
      k: has ? mine.reduce((s, r) => s + (Number(r.k_organic) || 0), 0) : null,
      n: has ? mine.reduce((s, r) => s + (Number(r.n_organic) || 0), 0) : null,
      filling: mm >= monthStartOf(nowMonth),
    }
  })
}

/** Where it was named this month, pooled: in a comment, in the video's own
 *  words, of its `k_any`. Null where the month holds no row. PURE. */
export function brandWhere(rows: BrandInput['rows'], brandKey: string, month: string, audiences: readonly string[]): BrandPage['where'] {
  const keep = new Set(audiences)
  const mine = rows.filter((r) => monthStartOf(String(r.month)) === monthStartOf(month) && r.brand_key === brandKey && keep.has(r.audience))
  if (mine.length === 0 || mine.some((r) => r.k_content == null || r.k_comment == null)) return null
  const n = mine.reduce((s, r) => s + (Number(r.k_any) || 0), 0)
  return n > 0 ? { comment: mine.reduce((s, r) => s + (Number(r.k_comment) || 0), 0), content: mine.reduce((s, r) => s + (Number(r.k_content) || 0), 0), n } : null
}

/**
 * A BRAND'S PAGE, from what it read. The header's figures are the root's row
 * (named without being asked with its `Verdict`, named at all, praised and
 * complained, `buildBrands`); its parts are Voices' levels (D3: the groups
 * commenting on its videos and the creators it comes up with, each over its
 * month set `any`); a rival's ninety days carry their own window (D4). A brand
 * not counted keeps every frame and says why once. PURE.
 */
export function buildBrandPage(input: BrandInput): BrandPage {
  const { row: r, month, params } = input
  const counted = r.state === 'counted'
  const any = new Set(counted ? input.set?.any ?? [] : [])
  const rival = !r.you && !r.watched
  const mine = rival ? input.findings.filter((f) => (f.competitor_name ?? '').trim().toLowerCase() === r.label.trim().toLowerCase() && !FINDING_KINDS_HELD.has(f.category) && f.title?.trim()) : []
  const [first, ...rest] = mine
  const groups = input.groupSets && counted
    ? input.personas
      .map((p) => ({ key: p.key, name: p.name, oneLiner: p.oneLiner, k: (input.groupSets!.get(p.key) ?? []).filter((v) => any.has(v)).length, href: voicesGroupHref(p.key, params) }))
      .filter((g) => g.k > 0)
      .sort((a, b) => b.k - a.k || a.name.localeCompare(b.name))
    : []
  const people = input.creators ? creatorsOf(input.creators).filter((c) => c.videos >= ACCOUNT_FLOOR) : []
  const creators = counted
    ? people
      .map((c) => ({
        key: c.key, account: c.account, platformLabel: platformLabel(c.platform), initials: initialsOf(c.account), followers: c.followers, followerWord: followerWord(c.platform),
        k: (input.creatorVideoIds.get(c.key) ?? []).filter((v) => any.has(v)).length, videos: c.videos, href: voicesCreatorHref(c.platform, c.account, params),
      }))
      .filter((c) => c.k > 0)
      // Most of its videos first; a tie, the creator with more of the market's.
      .sort((a, b) => b.k - a.k || b.videos - a.videos || a.account.localeCompare(b.account))
      .map(({ videos: _v, ...c }) => c)
    : []
  const kinds = counted && input.kinds && input.kinds.n > 0
    ? input.kinds.cells
      .filter((c) => c.id !== FLAGGED_KIND && c.k > 0)
      .map((c) => ({ kind: c.id, label: talkKindLabel(c.id, input.noun), k: c.k, n: c.n }))
      .sort((a, b) => b.k - a.k || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    : []
  const subjects = counted && input.subjects ? input.subjects.cells.map((c) => ({ id: c.id, label: c.label, k: c.k, n: c.n, href: marketSubjHref(c.id, month.month) })) : []
  const window = rival && input.window ? { ...input.window, words: windowWords(input.window) } : null
  // Praised and complained over every video naming it: the root's row where
  // its crosses were read, else this page's own kinds cross (the same lens).
  const kindCell = (id: string): Level | null => (input.kinds && input.kinds.n > 0 ? { k: input.kinds.cells.find((c) => c.id === id)?.k ?? 0, n: input.kinds.n } : null)
  return {
    kind: 'brand',
    month,
    brandKey: r.brandKey,
    label: r.label,
    you: r.you,
    watched: r.watched,
    state: r.state,
    stateWords: r.stateWords,
    named: r.named,
    prevNamed: r.prevNamed,
    verdict: r.verdict,
    any: r.any,
    praised: counted ? r.praised ?? kindCell('praise') : null,
    complained: counted ? r.complained ?? kindCell('pain_point') : null,
    lead: first ? { title: first.title.trim(), body: first.finding?.trim() || null, kindWords: findingKindWords(first.category) } : null,
    findingsDate: first ? input.findingsDate : null,
    findings: rest.slice(0, 2).map((f) => ({ id: f.id, kindWords: findingKindWords(f.category), title: f.title.trim(), body: f.finding?.trim() || null })),
    groups,
    groupsLine: counted && !input.groupSets ? 'Who comments on its videos could not be read just now.' : null,
    creators,
    communitiesLeftOut: input.creators ? input.creators.creators.some((c) => COMMUNITY_PLATFORMS.has(c.platform)) : false,
    months: brandMonthBars(input.rows, r.brandKey, month.month, input.audiences, input.nowMonth),
    kinds,
    subjects,
    notMeasured: counted ? input.pending.map((s) => ({ id: s.id, label: s.label, ...(s.failed ? { failed: true } : {}) })) : [],
    where: counted ? brandWhere(input.rows, r.brandKey, month.month, input.audiences) : null,
    platforms: counted ? platformsOfSet(any, input.platformOf) : [],
    window,
    asked: window ? input.asked.slice(0, ASKED_SHOWN).map((t) => ({ id: t.registryId, label: t.label, videos: t.videos, href: marketConvHref(t.registryId, month.month) })) : [],
    claims: window ? input.claims.slice(0, BRAND_CLAIMS_SHOWN).map((c) => ({ id: c.id, claim: c.claim })) : [],
    said: window ? input.said.slice(0, BRAND_SAID_SHOWN) : [],
    askHref: askHref(r.you ? 'What does my market say about us?' : `What does my market say about ${r.label}?`),
    crumbs: [voicesCrumb(params), { label: r.label, href: null, menu: brandMenu(input.brands, r.brandKey, params, inMonthWords(month)) }],
  }
}

/** A rival's claims on its own posts, each said once (folded words), the one
 *  carried by the most posts first, then the earliest posted. PURE. */
export function topClaims(rows: readonly { id: string; source_video_id: string; claim: string; posted?: string | null }[], count = BRAND_CLAIMS_SHOWN): { id: string; claim: string }[] {
  const key = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const by = new Map<string, { id: string; claim: string; posts: Set<string>; first: string }>()
  for (const r of rows) {
    const k = key(r.claim ?? '')
    if (!k) continue
    const held = by.get(k) ?? { id: r.id, claim: r.claim.trim(), posts: new Set<string>(), first: r.posted ?? '9999' }
    held.posts.add(r.source_video_id)
    if ((r.posted ?? '9999') < held.first) held.first = r.posted ?? '9999'
    by.set(k, held)
  }
  return [...by.values()]
    .sort((a, b) => b.posts.size - a.posts.size || a.first.localeCompare(b.first) || a.id.localeCompare(b.id))
    .slice(0, count)
    .map((c) => ({ id: c.id, claim: c.claim }))
}

// =========================================================================================
// THE CREATOR (the evidence)
// =========================================================================================

export interface CreatorComment {
  text: string
  lang: string | null
  english: string | null
  date: string
  /** The conversation it is counted in (the board: every comment names one). */
  conv: { id: string; label: string; href: string } | null
}

export interface CreatorVideoCard {
  id: string
  caption: string | null
  posted: string | null
  /** The conversation the video is in (the creator's biggest that holds it). */
  conv: { id: string; label: string; href: string } | null
  /** The brand named in it, where brands are counted. */
  brand: { label: string; you: boolean } | null
  /** Its comments counted this month, in any conversation. */
  counted: number
  total: number | null
  url: string | null
  quotes: CreatorComment[]
  /** Every counted comment that may print (uncapped). */
  quotable: number
  open: boolean
  href: string
}

export interface CreatorPage {
  kind: 'creator'
  month: LevelMonth
  key: string
  account: string
  platform: string
  platformLabel: string
  followers: number | null
  followerWord: string
  videos: number
  /** "Their biggest conversation is X: 6 of their 14 videos, of the 24 in it
   *  this month." Built by code from figures; null with no conversation. */
  lead: { id: string; label: string; k: number; ofTheme: number; href: string } | null
  brands: { label: string; k: number; you: boolean; href: string }[]
  evidence: {
    state: 'ready' | 'unread'
    total: number
    cards: CreatorVideoCard[]
    all: boolean
    more: { href: string; desktop: number; phone: number } | null
    capped: number | null
  }
  conversations: { id: string; label: string; k: number; ofTheme: number; href: string }[]
  groups: { key: string; name: string; k: number; href: string }[]
  groupsLine: string | null
  kinds: { kind: string; label: string; k: number; n: number }[] | null
  siblings: { key: string; account: string; platformLabel: string; initials: string; videos: number; href: string }[]
  /** Every creator at the floor this month (the root's "All N"), and the
   *  root's full list of them, the month kept. */
  atFloor: number
  allHref: string
  askHref: string
  crumbs: Crumb[]
}

export const CREATOR_SIBLINGS = 8
export const CREATOR_CONVERSATIONS = 6

/** The creator switcher: creators with three or more market videos, most
 *  videos first, never Reddit (the root's floor). */
export function creatorMenu(people: readonly CreatorRow[], currentKey: string, p: Pick<LevelParams, 'month'>): CrumbMenu | null {
  const items: CrumbItem[] = people.map((c) => ({ key: c.key, label: c.account, href: voicesCreatorHref(c.platform, c.account, p), current: c.key === currentKey, note: platformLabel(c.platform) }))
  return items.length > 1 || (items.length === 1 && !items[0].current)
    ? { label: 'Creators in your market', switchLabel: 'Switch to another creator', items }
    : null
}

/** A creator's page address with `?video=` / `?videos=all`, the month kept. */
export function creatorPageHref(c: Pick<CreatorRow, 'platform' | 'account'>, p: LevelParams, open: { video?: string | null; videos?: boolean } = {}): string {
  const q = new URLSearchParams()
  if (p.month) q.set('month', p.month)
  if (open.video) q.set('video', open.video)
  if (open.videos) q.set('videos', 'all')
  const qs = q.toString()
  const base = voicesCreatorHref(c.platform, c.account)
  const hash = open.video ? `#video-${open.video}` : open.videos ? '#their-videos' : ''
  return `${base}${qs ? `?${qs}` : ''}${hash}`
}

/** The video a comment sits under, as the quote gate reads it. */
const gateVideoOf = (v: ConvVideoRow): QuoteVideo => ({
  platform: v.platform, videoId: v.video_id, caption: v.caption, hashtags: v.hashtags, topics: v.topics,
  accountName: v.account_name, isClient: v.is_client, isCompetitor: v.is_competitor, competitorName: v.competitor_name,
  source: v.source, segment: null,
})

/**
 * A VIDEO'S COUNTED COMMENTS THAT MAY PRINT, best first, each naming the
 * conversation it is counted in: the citations of its comments counted this
 * month (any conversation's refs), one a comment (its best-ranked excerpt),
 * never a demographic one; through Market's rules for a video's comments
 * (`videoQuotes`, lib/pages/v2/market.ts: not the video's own account, readable
 * as a voice, no sale offer, then the quote gate), every passing one kept,
 * uncapped. The comment's conversation is the first of the creator's
 * conversations (biggest first) whose refs hold it. PURE.
 */
export function creatorVideoQuotes(a: {
  video: ConvVideoRow
  evidence: readonly ConvEvidenceRow[]
  counted: ReadonlySet<string>
  convOf: ReadonlyMap<string, { id: string; label: string; href: string }>
  translations: Map<string, { lang: string; english: string | null }>
  gate: GateOptions
}): CreatorComment[] {
  const best = new Map<string, ConvEvidenceRow>()
  for (const e of a.evidence) {
    if (e.redacted || !e.quote?.trim() || !a.counted.has(e.commentId)) continue
    if (e.comment.platform !== a.video.platform || e.comment.videoId !== a.video.video_id) continue
    const held = best.get(e.commentId)
    if (!held || e.rank < held.rank || (e.rank === held.rank && e.evidenceId < held.evidenceId)) best.set(e.commentId, e)
  }
  const own = accountKey(a.video.account_name)
  const candidates = [...best.values()]
    .sort((x, y) => x.rank - y.rank || x.evidenceId.localeCompare(y.evidenceId))
    .map((e) => ({ e, text: cleanQuote(e.quote ?? ''), reading: readingOf(a.translations, e.quote) }))
    .filter((c) => {
      const author = accountKey(c.e.comment.author)
      if (author && author === own) return false
      if (readsAsOffer(c.text) || readsAsOffer(c.reading.english)) return false
      return readsAsHeroQuote(c.text, { lang: c.reading.lang ?? null, english: c.reading.english ?? null })
    })
  const video = gateVideoOf(a.video)
  const every = candidates.length
  const picked = pickEligible(candidates, (c) => ({ text: c.text, lang: c.reading.lang ?? null, english: c.reading.english ?? null, video }), every, { ...a.gate, perThread: every })
  return picked.map((c) => ({
    text: c.text, lang: c.reading.lang ?? null, english: c.reading.english ?? null,
    date: c.e.comment.date ? shortDate(c.e.comment.date) : '',
    conv: a.convOf.get(c.e.commentId) ?? null,
  }))
}

/** What a creator's page reads, handed to its builder. */
export interface CreatorInput {
  month: LevelMonth
  creator: CreatorRow
  /** The month's creators at the floor (never Reddit), most videos first. */
  people: readonly CreatorRow[]
  labels: ReadonlyMap<string, string>
  /** Each conversation's month refs (videos and counted comments), the
   *  creator's conversations alone, over the market's audiences. */
  refs: readonly { themeId: string; videoIds: readonly string[]; commentIds: readonly string[] }[]
  /** The creator's month videos (their rows), or null where not read. */
  videos: readonly ConvVideoRow[] | null
  evidence: readonly ConvEvidenceRow[]
  translations: Map<string, { lang: string; english: string | null }>
  gate: GateOptions
  /** The counted brands' month sets (the root's chips), where counted. */
  brandSets: readonly { brandKey: string; label: string; you: boolean; any: ReadonlySet<string> }[]
  personas: readonly VoicesPersona[]
  groupSets: ReadonlyMap<string, readonly string[]> | null
  kinds: BrandCrossRow | null
  noun: string | null
  params: LevelParams
}

/**
 * A CREATOR'S PAGE, from what it read: the one line code builds (their biggest
 * conversation, their videos in it of theirs, of all its videos), the brands
 * in their videos, their videos (the most comments counted first; the first
 * five, every one with `?videos=all` up to sixty, the one `?video=` opens
 * wherever it falls, honoured only for their own), the facts and the other
 * creators. PURE.
 */
export function buildCreatorPage(input: CreatorInput): CreatorPage {
  const { creator: c, month, params } = input
  const m = month.month
  const mineIds = new Set((input.videos ?? []).map((v) => v.id))
  // Every labelled conversation of theirs names a comment or a video; the
  // facts list the biggest `CREATOR_CONVERSATIONS`.
  const labelled = c.themes
    .filter((t) => input.labels.has(t.themeId))
    .map((t) => ({ id: t.themeId, label: input.labels.get(t.themeId) as string, k: t.k, ofTheme: t.ofTheme, href: marketConvHref(t.themeId, m) }))
  const conversations = labelled.slice(0, CREATOR_CONVERSATIONS)
  const convById = new Map(labelled.map((x) => [x.id, { id: x.id, label: x.label, href: x.href }]))
  // Each counted comment's conversation, and each video's: the first of the
  // creator's conversations (biggest first) whose refs hold it.
  const order = c.themes.map((t) => t.themeId).filter((id) => convById.has(id))
  const refsOf = new Map(input.refs.map((r) => [r.themeId, r]))
  const convOfComment = new Map<string, { id: string; label: string; href: string }>()
  const convOfVideo = new Map<string, { id: string; label: string; href: string }>()
  const counted = new Set<string>()
  for (const id of order) {
    const ref = refsOf.get(id)
    if (!ref) continue
    for (const cm of ref.commentIds) { counted.add(cm); if (!convOfComment.has(cm)) convOfComment.set(cm, convById.get(id)!) }
    for (const v of ref.videoIds) if (mineIds.has(v) && !convOfVideo.has(v)) convOfVideo.set(v, convById.get(id)!)
  }
  for (const r of input.refs) for (const cm of r.commentIds) counted.add(cm)
  const brandOf = (id: string) => {
    const hit = input.brandSets.filter((b) => b.any.has(id)).sort((a, b) => Number(b.you) - Number(a.you) || a.label.localeCompare(b.label))[0]
    return hit ? { label: hit.label, you: hit.you } : null
  }
  let evidence: CreatorPage['evidence']
  if (!input.videos) evidence = { state: 'unread', total: 0, cards: [], all: false, more: null, capped: null }
  else {
    const ordered = convVideoOrder({ videoIds: [...mineIds], commentIds: counted, videos: input.videos, evidence: input.evidence })
    const { ids, open } = shownConvVideos(ordered, { video: params.video, videos: params.videos })
    const all = Boolean(params.videos)
    const shown = ordered.filter((o) => ids.includes(o.video.id))
    const cards: CreatorVideoCard[] = shown.map(({ video, comments }) => {
      const quotes = creatorVideoQuotes({ video, evidence: input.evidence, counted, convOf: convOfComment, translations: input.translations, gate: input.gate })
      const isOpen = video.id === open
      return {
        id: video.id,
        caption: video.caption?.replace(/\s+/g, ' ').trim() || null,
        posted: video.upload_date ? shortDate(`${video.upload_date.slice(0, 10)}T12:00:00.000Z`) : null,
        conv: convOfVideo.get(video.id) ?? null,
        brand: brandOf(video.id),
        counted: comments.size,
        total: video.comments_count ?? null,
        url: video.video_url?.trim() || null,
        quotes: quotes.slice(0, isOpen ? MARKET_VIDEO_COMMENTS_MAX : MARKET_VIDEO_QUOTES),
        quotable: quotes.length,
        open: isOpen,
        href: creatorPageHref(c, params, isOpen ? { videos: all } : { video: video.id, videos: all }),
      }
    })
    const total = ordered.length
    const desktop = total - shown.length
    const phoneShown = all ? shown.length : shown.filter((o, i) => i < MARKET_CONV_VIDEOS_PHONE || o.video.id === open).length
    const phone = total - phoneShown
    evidence = {
      state: 'ready', total, cards, all,
      more: !all && (desktop > 0 || phone > 0) ? { href: creatorPageHref(c, params, { videos: true }), desktop, phone } : null,
      capped: all && total > MARKET_CONV_VIDEOS_MAX ? MARKET_CONV_VIDEOS_MAX : null,
    }
  }
  const mine = [...mineIds]
  const lead = conversations[0] ?? null
  const groups = input.groupSets
    ? input.personas
      .map((p) => ({ key: p.key, name: p.name, k: (input.groupSets!.get(p.key) ?? []).filter((v) => mineIds.has(v)).length, href: voicesGroupHref(p.key, params) }))
      .filter((g) => g.k > 0)
      .sort((a, b) => b.k - a.k || a.name.localeCompare(b.name))
    : []
  return {
    kind: 'creator',
    month,
    key: c.key,
    account: c.account,
    platform: c.platform,
    platformLabel: platformLabel(c.platform),
    followers: c.followers,
    followerWord: followerWord(c.platform),
    videos: c.videos,
    lead,
    brands: input.brandSets
      .map((b) => ({ label: b.label, you: b.you, k: mine.filter((id) => b.any.has(id)).length, href: voicesBrandHref(b.brandKey, params) }))
      .filter((b) => b.k > 0)
      .sort((a, b) => Number(b.you) - Number(a.you) || b.k - a.k || a.label.localeCompare(b.label)),
    evidence,
    conversations,
    groups,
    groupsLine: input.groupSets ? null : 'Who comments on their videos could not be read just now.',
    kinds: input.kinds && input.kinds.n > 0
      ? input.kinds.cells
        .filter((x) => x.id !== FLAGGED_KIND && x.k > 0)
        .map((x) => ({ kind: x.id, label: talkKindLabel(x.id, input.noun), k: x.k, n: x.n }))
        .sort((a, b) => b.k - a.k || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
      : null,
    siblings: input.people
      .filter((x) => x.key !== c.key)
      .slice(0, CREATOR_SIBLINGS)
      .map((x) => ({ key: x.key, account: x.account, platformLabel: platformLabel(x.platform), initials: initialsOf(x.account), videos: x.videos, href: voicesCreatorHref(x.platform, x.account, params) })),
    atFloor: input.people.length,
    allHref: `${voicesHref({ ...(params.month ? { month: params.month } : {}), creators: 'all' })}#creators`,
    askHref: askHref(`What do people say under ${c.account}'s videos?`),
    crumbs: [voicesCrumb(params), { label: c.account, href: null, menu: creatorMenu(input.people, c.key, params) }],
  }
}

/** Which creator a creator page's address names, of the month's at the
 *  floor: two segments name one exactly; one segment names the account (the
 *  first by videos where two platforms share it), as the old `?creator=`.
 *  Reddit is never one (its account is a community). PURE. */
export function resolveCreatorPath(people: readonly CreatorRow[], segments: readonly string[]): CreatorRow | null {
  if (segments.length === 2) return resolveCreator(people, `${segments[0]}|${segments[1]}`)
  if (segments.length === 1) return people.find((r) => r.account.toLowerCase() === segments[0].toLowerCase()) ?? null
  return null
}

// =========================================================================================
// THE READS
// =========================================================================================

export interface LevelLoadInput {
  /** The session's client (runs, schedule, rivals). */
  supabase: SupabaseClient
  clientId: string
  reading: ReadingHandle
  params: LevelParams
  now?: string
}

const say = (what: string, error: unknown): void => {
  console.error(`[pages] voices.${what}: ${(error as { message?: string } | null)?.message ?? String(error)}`)
}

async function soft<T>(label: string, p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p
  } catch (e) {
    say(label, e)
    return fallback
  }
}

/** The month a level page reads, the market's audiences and its videos. */
async function loadLevelMonth(input: LevelLoadInput, opts: { profile: boolean }): Promise<{
  month: LevelMonth
  reading: ReadingMonth | null
  audiences: string[]
  market: MarketVideo[] | null
  profile: GroupProfileRow | null | undefined
  now: string
}> {
  const { supabase, reading: handle, params } = input
  const now = input.now ?? new Date().toISOString()
  const [rm, audiences, profile] = await Promise.all([
    loadReadingMonth(supabase, handle, now, { explicit: params.month ?? null }).catch((e: unknown) => { say('month', e); return null }),
    loadMarketRivalAudiences(supabase, handle.clientId).then((r) => (r ? marketAudiences(r) : loadMarketAudiences(handle))).catch((e: unknown) => { say('audiences', e); return null }),
    opts.profile ? loadLatestProfile(handle).catch((e: unknown) => { say('profile', e); return undefined }) : Promise.resolve(undefined),
  ])
  const month = monthStartOf(rm?.month ?? now)
  const soFar = rm ? rm.state === 'so_far' : true
  const market = audiences ? await loadMarketVideos(handle, month, audiences).catch((e: unknown) => { say('market', e); return null }) : null
  return {
    month: { month, soFar, monthWords: monthWordsOf(month, soFar), monthLabel: readingMonthLabel(month, now), n: market ? new Set(market.map((v) => v.id)).size : null },
    reading: rm,
    audiences: audiences ?? [],
    market,
    profile,
    now,
  }
}

/** The month's theme refs with their counted comments, over the market's
 *  audiences, for the conversations named (one read a 250). */
async function readThemeRefs(handle: ReadingHandle, month: string, audiences: readonly string[], ids: readonly string[] | null): Promise<{ themeId: string; audience: string; videoIds: string[]; commentIds: string[] }[]> {
  if (audiences.length === 0 || (ids && ids.length === 0)) return []
  type Row = { audience: string; object_id: string; video_ids: string[] | null; comment_ids?: string[] | null }
  const m = monthStartOf(month)
  // Named conversations: their counted comments too (a creator's page). Every
  // conversation of the month: its videos alone (the creators' cross).
  const rows = ids
    ? (await mapWithLimit(chunk([...new Set(ids)], UUID_IN_CHUNK), READ_CONCURRENCY, (part) => selectAll<Row>(() =>
      handle.client.from('month_evidence_refs').select('audience, object_id, video_ids, comment_ids')
        .eq('client_id', handle.clientId).eq('month', m).eq('object_kind', 'theme').in('audience', [...audiences]).in('object_id', part)
        .order('audience').order('object_id')))).flat()
    : await selectAll<Row>(() =>
      handle.client.from('month_evidence_refs').select('audience, object_id, video_ids')
        .eq('client_id', handle.clientId).eq('month', m).eq('object_kind', 'theme').in('audience', [...audiences])
        .order('audience').order('object_id'))
  return rows.map((r) => ({ themeId: String(r.object_id), audience: String(r.audience), videoIds: (r.video_ids ?? []).map(String), commentIds: (r.comment_ids ?? []).map(String) }))
}

/** These conversations on the themed run: labels, kinds and members (one read
 *  a 250, the session's client's alone). */
async function readRunThemes(handle: ReadingHandle, runId: string | null, ids: readonly string[] | null): Promise<Map<string, RunTheme>> {
  const out = new Map<string, RunTheme>()
  if (!runId || (ids && ids.length === 0)) return out
  type Row = { theme_id: string; label: string | null; category: string | null; member_insight_ids: string[] | null }
  const read = (part: string[] | null) => selectAll<Row>(() => {
    let q = handle.client.from('theme_observations').select('theme_id, label, category, member_insight_ids').eq('client_id', handle.clientId).eq('run_id', runId)
    if (part) q = q.in('theme_id', part)
    return q.order('theme_id', { ascending: true })
  })
  const rows = ids ? (await mapWithLimit(chunk([...new Set(ids)], UUID_IN_CHUNK), READ_CONCURRENCY, read)).flat() : await read(null)
  for (const r of rows) out.set(String(r.theme_id), { label: (r.label ?? '').trim(), kind: r.category ?? null, memberIds: (r.member_insight_ids ?? []).map(String) })
  return out
}

/** These conversations' descriptions on the themed run (Pass B). */
async function readDescriptions(handle: ReadingHandle, runId: string | null, ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!runId || ids.length === 0) return out
  const parts = await mapWithLimit(chunk([...new Set(ids)], UUID_IN_CHUNK), READ_CONCURRENCY, async (part) => {
    const res = await handle.client.from('themes').select('registry_id, description').eq('client_id', handle.clientId).eq('run_id', runId).in('registry_id', part)
    if (res.error) throw new Error(`themes descriptions: ${res.error.message}`)
    return (res.data ?? []) as { registry_id: string | null; description: string | null }[]
  })
  for (const r of parts.flat()) {
    const d = (r.description ?? '').trim()
    if (r.registry_id && d && !out.has(String(r.registry_id))) out.set(String(r.registry_id), d)
  }
  return out
}

/** The runs still running (one read a load, shared by every reader that
 *  must not read one), and the themed run (the run Market reads its
 *  conversations under), never one still running. */
const runningOf = (input: LevelLoadInput): Promise<string[]> => fetchRunningRunIds(input.supabase, input.clientId, 'voices').catch(() => [] as string[])
async function themedRun(input: LevelLoadInput, running: Promise<string[]>): Promise<string | null> {
  return fetchThemedRunId(input.supabase, input.clientId, await running, 'voices')
}

/** The brands' month rows (the pairs), the counted brands' sets and the
 *  root's own brand rows (`buildBrands`), without a judge read where no verdict
 *  prints. */
async function loadBrandsFor(handle: ReadingHandle, clientId: string, a: { month: string; now: string; audiences: string[]; market: MarketVideo[] | null; pair: PairOn; months?: number }): Promise<{
  brands: VoicesBrands
  pairs: BrandPair[] | null
  sets: BrandMonthVideos[] | null
  rows: (StoredBrandMonthRow & { k_content?: number | null; k_comment?: number | null })[]
}> {
  const refs = await loadBrandRefs(handle).catch((e: unknown) => { say('brandRefs', e); return undefined })
  const empty = { pairs: null, sets: null, rows: [] }
  if (refs === undefined) return { brands: buildBrands({ clientId, month: a.month, pairs: [], crosses: null, note: null, params: {}, failed: true }), ...empty }
  if (refs === null) return { brands: buildBrands({ clientId, month: a.month, pairs: null, crosses: null, note: null, params: {} }), ...empty }
  const months: string[] = []
  let m = monthStartOf(a.month)
  for (let i = 0; i < (a.months ?? 2); i++) { months.unshift(m); m = prevMonth(m) }
  let rows: (StoredBrandMonthRow & { k_content?: number | null; k_comment?: number | null })[]
  try {
    rows = await selectAll<StoredBrandMonthRow & { k_content: number | null; k_comment: number | null }>(() =>
      handle.client.from('month_brand_readings').select('month, audience, brand_key, k_any, k_content, k_comment, k_organic, n, n_organic')
        .eq('client_id', clientId).in('month', months).order('month').order('audience').order('brand_key'))
  } catch (e) {
    say('brandReadings', e)
    return { brands: buildBrands({ clientId, month: a.month, pairs: [], crosses: null, note: null, params: {}, failed: true }), ...empty }
  }
  const pairs = brandMonthPair({ month: monthStartOf(a.month), brands: refs.brands, rows, audiences: a.audiences, pair: a.pair })
  const keys = crossKeys(pairs)
  const sets = a.market && keys.length > 0
    ? await loadBrandMonthVideos(handle, { month: a.month, audiences: a.audiences, market: a.market }).catch((e: unknown) => { say('brandSets', e); return null })
    : null
  const crosses = sets ? { videos: sets.filter((s) => keys.includes(s.brandKey)), kinds: [], subjects: [] } : null
  const brands = buildBrands({ clientId, month: a.month, pairs, crosses, note: null, params: {}, clientCounts: clientCountsOf(clientId, a.month, pairs, crosses) })
  return { brands, pairs, sets: crosses?.videos ?? null, rows }
}

/** One set of videos through `lens_readings` (the month rule for kinds and
 *  subjects), the brand cross's own call; never an empty set (an empty set
 *  reads the whole market). */
async function readLens(handle: ReadingHandle, month: string, ids: readonly string[]): Promise<LensRowIn[]> {
  if (ids.length === 0) return []
  return selectAll<LensRowIn>(() =>
    // `lens_readings` (MF2), as lib/reading/cross.ts calls it.
    handle.client.rpc('lens_readings', {
      p_client: handle.clientId, p_month: monthStartOf(month), p_run: null, p_video_ids: [...ids], p_min_dated_comments: 1, p_captured_before: null,
    }).order('audience').order('object_kind').order('object_id'),
  )
}

/** The cite a quote prints: "Instagram · 4 Oct". */
const citeOf = (platform: string | null, date: string | null): string => [platform ? platformLabel(platform) : null, date ? shortDate(date) : null].filter(Boolean).join(' · ')

// ---- the group's reads ------------------------------------------------------------------

/** The group's three comments, each from its conversation where three exist:
 *  the group's quotes through the gate the root's panel used
 *  (`loadVoicesMany`, the month's, market first), then their evidence rows'
 *  insights (one bounded read of at most six ids), each labelled with one of
 *  the group's own conversations that holds the insight. */
async function loadGroupQuotes(handle: ReadingHandle, clientId: string, a: { persona: VoicesPersona; month: string; themes: ReadonlyMap<string, RunTheme>; listed: ReadonlySet<string> }): Promise<LevelQuote[]> {
  const voices = await loadVoicesMany(handle.client, clientId, [{ key: a.persona.key, insightIds: a.persona.insightIds }], {
    month: a.month.slice(0, 7), marketFirst: true, gate: gateFor(clientId, {}),
  })
  const picked = voices.get(a.persona.key)?.voices ?? []
  if (picked.length === 0) return []
  const evidenceIds = picked.map((v) => v.quote.ref).filter((r) => r.startsWith('e:')).map((r) => r.slice(2))
  const insightOf = new Map<string, string>()
  if (evidenceIds.length > 0) {
    const res = await handle.client.from('insight_evidence').select('id, audience_insight_id, comments!inner(client_id)').in('id', evidenceIds).eq('comments.client_id', clientId)
    if (res.error) throw new Error(`insight_evidence quotes: ${res.error.message}`)
    for (const r of (res.data ?? []) as { id: string; audience_insight_id: string }[]) insightOf.set(`e:${r.id}`, String(r.audience_insight_id))
  }
  // Only a conversation the page lists names a comment (Market's rule).
  const listed = new Map([...a.themes].filter(([id]) => a.listed.has(id)))
  const themeOf = insightThemes(listed)
  const withInsight = picked.map((v) => ({ v, insightId: insightOf.get(v.quote.ref) ?? '' }))
  return quotesAcrossConversations(withInsight, themeOf, 3).map(({ v, insightId }) => {
    const conv = themeOf.get(insightId)
    const date = v.cite.split(' · ')[0] ?? ''
    return {
      ref: v.quote.ref,
      text: v.quote.text,
      lang: (v.quote as { lang?: string | null }).lang ?? null,
      english: (v.quote as { english?: string | null }).english ?? null,
      cite: [v.platform ? platformLabel(v.platform) : null, /\d/.test(date) ? date : null].filter(Boolean).join(' · '),
      from: conv ? { id: conv.id, label: conv.label, href: marketConvHref(conv.id, a.month) } : null,
    }
  })
}

/** A group's page: its month, its people and their reads. Null before the
 *  first update; `missing` for a key today's profile does not hold. */
export async function loadVoicesGroup(input: LevelLoadInput & { key: string }): Promise<GroupPage | LevelMissing> {
  const { clientId, reading: handle, params } = input
  const base = await loadLevelMonth(input, { profile: true })
  const { month, audiences, market, profile, now } = base
  const persona = personasOf(profile ?? null).find((p) => p.key === input.key)
  if (!profile || !persona) return { kind: 'missing', level: 'group', line: GROUP_MISSING }
  const m = month.month

  const runAhead = soft('themedRun', themedRun(input, runningOf(input)), null)
  const [groupRead, placement, refs, labels, runId] = await Promise.all([
    market ? soft('groups', loadGroupSubjects(handle, { month: m, audiences, market, profile }), null) : Promise.resolve(null),
    soft('placement', loadSubjectPlacement(handle.client, clientId), { all: [], placed: null }),
    soft('refs', readThemeRefs(handle, m, audiences, persona.registryIds), []),
    soft('labels', readLabels(handle, persona.registryIds), new Map<string, string>()),
    runAhead,
  ])
  const ids = persona.registryIds
  const themeSets = themeVideoSets(refs.map((r) => ({ themeId: r.themeId, audience: r.audience, videoIds: r.videoIds })))
  const mine = new Set(groupRead?.videos.find((g) => g.key === persona.key)?.videoIds ?? [])
  const listed = new Set(ids.filter((id) => [...(themeSets.get(id) ?? [])].some((v) => mine.has(v))))
  const ready: MarketObjectRef[] = placement.all.filter((s) => s.calibration === 'ready').map((s) => ({ kind: 'subject' as const, id: s.subject.id, label: s.subject.name, calibration: s.calibration }))
  const phrases = phrasesOf(persona.howTheyTalk).map((p) => p.text)
  const brandsAhead = loadBrandsFor(handle, clientId, { month: m, now, audiences, market, pair: refuseEveryPair })
  const [themes, descriptions, readings, translations, products, brandRead] = await Promise.all([
    soft('runThemes', readRunThemes(handle, runId, ids), new Map<string, RunTheme>()),
    soft('descriptions', readDescriptions(handle, runId, [...listed]), new Map<string, string>()),
    ready.length > 0
      ? soft('levels', loadObjectReadings(handle.client, { clientId, objects: ready, month: m, months: 1, pair: refuseEveryPair, asOf: now, rivalAudiences: audiences.filter((x) => x.startsWith('competitor:')) }), [])
      : Promise.resolve([]),
    phrases.length > 0 ? soft('phrases', readTranslations(handle.client, phrases), new Map<string, { lang: string; english: string | null }>()) : Promise.resolve(new Map<string, { lang: string; english: string | null }>()),
    readGroupProducts(handle, clientId, m, month.monthWords, [...mine], { month: params.month }),
    brandsAhead,
  ])
  const quotes = await soft<LevelQuote[] | null>('quotes', loadGroupQuotes(handle, clientId, { persona, month: m, themes, listed }), null)
  const levels = new Map<string, Level>()
  for (const r of readings) if (r.curr && r.curr.k != null && r.curr.n != null) levels.set(r.object.id, { k: r.curr.k, n: r.curr.n })
  const groups = buildGroups({ profile, read: groupRead, platformOf: new Map(), params: {} })
  return buildGroupPage({
    month,
    persona,
    profileDate: profile.run_date,
    groups,
    read: groupRead,
    platformOf: new Map((market ?? []).map((v) => [v.id, v.platform])),
    subjects: placement.all,
    placed: placement.placed,
    themes,
    labels,
    descriptions,
    themeSets,
    levels,
    brands: groupBrandRows({ brands: brandRead.brands, sets: brandRead.sets ?? [], videoIds: mine, params }),
    products,
    quotes,
    englishOf: (text) => readingOf(translations, text).english ?? null,
    params,
  })
}

// ---- the brand's reads ------------------------------------------------------------------

/**
 * What is said about a rival over the ninety days, each comment labelled with
 * its conversation (board: "3 comments, each from its conversation"): the
 * reads and the gate of the Competitive page's `readSaidAbout`
 * (lib/pages/brands-load.ts), keeping each citation's insight, so a pick maps
 * to a conversation on the themed run (`insightThemes`), and three across
 * conversations where three exist.
 */
async function readSaidAboutLabelled(db: SupabaseClient, clientId: string, a: { name: string; window: { from: string; to: string }; themes: ReadonlyMap<string, RunTheme>; month: string }): Promise<LevelQuote[]> {
  const videos = await selectAll<{ id: string }>(() =>
    db.from('videos').select('id').eq('client_id', clientId).eq('is_competitor', true).eq('competitor_name', a.name)
      .not('analyzed_run_id', 'is', null).order('id'))
  if (videos.length === 0) return []
  const insightPages = await mapWithLimit(chunk(videos.map((v) => String(v.id)), UUID_IN_CHUNK), READ_CONCURRENCY, (part) =>
    selectAll<{ id: string }>(() => db.from('audience_insights_current').select('id').eq('client_id', clientId).in('source_video_id', part).order('id')))
  const insightIds = insightPages.flat().map((r) => String(r.id))
  if (insightIds.length === 0) return []
  const byInsight = await fetchQuoteCitationsByAudience(db, insightIds)
  const citations = [...byInsight.entries()].flatMap(([insightId, cs]) => cs.filter((c) => c.commentId).map((c) => ({ ...c, insightId })))
  const commentIds = [...new Set(citations.map((c) => String(c.commentId)))]
  const metaPages = await mapWithLimit(chunk(commentIds, UUID_IN_CHUNK), READ_CONCURRENCY, async (part) => {
    const r = await db.from('comments').select('id, platform, comment_date').eq('client_id', clientId).in('id', part)
    if (r.error) throw new Error(`comments: ${r.error.message}`)
    return (r.data ?? []) as { id: string; platform: string | null; comment_date: string | null }[]
  })
  const meta = new Map(metaPages.flat().map((c) => [String(c.id), c]))
  const dayOf = (id: string | null): string => (id ? meta.get(id)?.comment_date ?? '' : '').slice(0, 10)
  const inWindow = citations
    .filter((c) => { const d = dayOf(c.commentId); return d !== '' && d >= a.window.from && d < a.window.to })
    .sort((x, y) => x.rank - y.rank || dayOf(y.commentId).localeCompare(dayOf(x.commentId)) || x.evidenceId.localeCompare(y.evidenceId))
  if (inWindow.length === 0) return []
  const ctx = await readQuoteContext(db, clientId, { commentIds: inWindow.map((c) => c.commentId) }, db)
  const picked = pickEligible(inWindow, (c) => ({ text: c.quote, lang: c.lang ?? null, english: c.english ?? null, video: ctx.forComment(c.commentId) }), BRAND_SAID_SHOWN * 3, gateFor(clientId, { brand: a.name }))
  const themeOf = insightThemes(a.themes)
  return quotesAcrossConversations(picked, themeOf, BRAND_SAID_SHOWN).map((c) => {
    const m = c.commentId ? meta.get(String(c.commentId)) : undefined
    const conv = themeOf.get(c.insightId)
    return {
      ref: quoteRef.comment(String(c.commentId)), text: c.quote, lang: c.lang ?? null, english: c.english ?? null,
      cite: citeOf(m?.platform ?? null, m?.comment_date ?? null),
      from: conv ? { id: conv.id, label: conv.label, href: marketConvHref(conv.id, a.month) } : null,
    }
  })
}

/** A rival's claims on its own posts over the window (`video_claims`,
 *  `entity = 'competitor'`, on its `competitor_owned` posts uploaded in the
 *  window), read on the reading client as the Competitive page read them. */
async function readOwnClaims(db: SupabaseClient, clientId: string, a: { name: string; window: { from: string; to: string } }): Promise<{ id: string; claim: string }[]> {
  const fold = (s: string) => s.toLowerCase().trim()
  const posts = (await selectAll<{ id: string; competitor_name: string | null; upload_date: string | null }>(() =>
    db.from('videos').select('id, competitor_name, upload_date').eq('client_id', clientId).eq('source', 'competitor_owned')
      .gte('upload_date', a.window.from).lt('upload_date', a.window.to).order('id')))
    .filter((p) => fold(p.competitor_name ?? '') === fold(a.name))
  if (posts.length === 0) return []
  const postedOf = new Map(posts.map((p) => [String(p.id), p.upload_date]))
  const rows = (await mapWithLimit(chunk([...postedOf.keys()], UUID_IN_CHUNK), READ_CONCURRENCY, (part) =>
    selectAll<{ id: string; source_video_id: string; claim: string }>(() =>
      db.from('video_claims').select('id, source_video_id, claim').eq('client_id', clientId).eq('entity', 'competitor').in('source_video_id', part).order('id')))).flat()
  return topClaims(rows.map((r) => ({ id: String(r.id), source_video_id: String(r.source_video_id), claim: r.claim, posted: postedOf.get(String(r.source_video_id)) ?? null })))
}

/** A brand's page: any tracked brand, by its key, its name, its audience key
 *  or 'you'. `missing` for one the workspace does not track. */
export async function loadVoicesBrand(input: LevelLoadInput & { key: string }): Promise<BrandPage | LevelMissing> {
  const { clientId, reading: handle, params } = input
  const base = await loadLevelMonth(input, { profile: true })
  const { month, audiences, market, profile, now, reading } = base
  const m = month.month
  const pairAhead = loadPairOn(handle, now)
  const running = runningOf(input)
  const findingsAhead = soft('findings', readLatestFindings(handle, running), [] as FindingRow[])
  const brandRead = await loadBrandsFor(handle, clientId, { month: m, now, audiences, market, pair: await pairAhead, months: BRAND_MONTHS })
  const row = brandRead.brands.all.find((r) => matchesBrand(r, input.key))
  if (!row) return { kind: 'missing', level: 'brand', line: BRAND_MISSING }
  const counted = row.state === 'counted'
  const set = brandRead.sets?.find((s) => s.brandKey === row.brandKey) ?? null
  const rival = !row.you && !row.watched
  const window = rival && reading ? ninetyDays(windowEnd(reading)) : null
  const personas = personasOf(profile ?? null)
  const anyIds = counted ? set?.any ?? [] : []
  const runAhead = rival ? soft('themedRun', themedRun(input, running), null) : Promise.resolve(null)
  const [groupRead, lens, subjectsAll, findings, runId] = await Promise.all([
    counted && market && profile ? soft('groups', loadGroupSubjects(handle, { month: m, audiences, market, profile, videosOnly: true }), null) : Promise.resolve(null),
    counted ? soft('lens', readLens(handle, m, anyIds), null) : Promise.resolve(null),
    counted ? soft('subjects', loadSubjectPlacement(handle.client, clientId).then((x) => x.all), [] as PlacedSubjectRow[]) : Promise.resolve([] as PlacedSubjectRow[]),
    findingsAhead,
    runAhead,
  ])
  const live = rival ? await running : []
  const [asked, claims, themes] = await Promise.all([
    rival && window ? soft('asked', readQuestions(handle.client, clientId, m, window, [{ name: row.label, audience: rivalKey(row.label) }], live), null) : Promise.resolve(null),
    rival && window ? soft('claims', readOwnClaims(handle.client, clientId, { name: row.label, window }), []) : Promise.resolve([]),
    rival && window ? soft('runThemes', readRunThemes(handle, runId, null), new Map<string, RunTheme>()) : Promise.resolve(new Map<string, RunTheme>()),
  ])
  const said = rival && window ? await soft('said', readSaidAboutLabelled(handle.client, clientId, { name: row.label, window, themes, month: m }), []) : []
  const readyNames = new Map(subjectsAll.filter((s) => s.calibration === 'ready').map((s) => [s.subject.id, s.subject.name]))
  const pending = subjectsAll.filter((s) => s.calibration !== 'ready').map((s) => ({ id: s.subject.id, label: s.subject.name, ...(s.calibration === 'failed' ? { failed: true } : {}) }))
  const lensRows: BrandLens[] = lens ? [{ brandKey: row.brandKey, label: row.label, base: 'any', rows: lens }] : []
  const creators = market ? creatorThemes({ month: m, videos: market, refs: [], audiences }) : null
  const creatorIds = new Map<string, string[]>()
  for (const v of market ?? []) if (v.account) creatorIds.set(`${v.platform}|${v.account}`, [...(creatorIds.get(`${v.platform}|${v.account}`) ?? []), v.id])
  const themesQ = asked?.themes.get(rivalKey(row.label)) ?? []
  return buildBrandPage({
    month,
    row,
    brands: brandRead.brands,
    set,
    rows: brandRead.rows,
    audiences,
    kinds: lens ? brandKinds(m, lensRows)[0] ?? null : null,
    subjects: lens ? brandSubjects(m, lensRows, readyNames)[0] ?? null : null,
    pending,
    noun: WHAT_THEY_SELL[clientId] ?? null,
    personas,
    groupSets: groupRead ? new Map(groupRead.videos.map((g) => [g.key, g.videoIds])) : null,
    creators,
    creatorVideoIds: creatorIds,
    platformOf: new Map((market ?? []).map((v) => [v.id, v.platform])),
    findings,
    findingsDate: findings[0]?.created_at ?? null,
    window,
    asked: [...themesQ].sort((a, b) => b.videos - a.videos || a.label.localeCompare(b.label)),
    claims,
    said,
    nowMonth: monthStartOf(now),
    params,
  })
}

// ---- the creator's reads ------------------------------------------------------------------

/** A creator's month videos, by their row ids, the session's client's alone
 *  (one read a 250). */
async function readCreatorVideos(handle: ReadingHandle, ids: readonly string[]): Promise<ConvVideoRow[]> {
  if (ids.length === 0) return []
  const parts = await mapWithLimit(chunk([...new Set(ids)], UUID_IN_CHUNK), READ_CONCURRENCY, (part) =>
    selectAll<ConvVideoRow>(() =>
      handle.client.from('videos')
        .select('id, platform, video_id, video_url, account_name, caption, comments_count, upload_date, is_client, is_competitor, competitor_name, hashtags, topics, source')
        .eq('client_id', handle.clientId).in('id', part).order('id')))
  return parts.flat()
}

/**
 * The citations of a creator's counted comments (the refs' `comment_ids` of
 * their conversations), each with the comment it is on, kept only where that
 * comment is under one of the creator's own videos: one read a 250 comments,
 * the comment embedded (`comments!inner`, the session's client's alone, the
 * creator's platform and video ids), paged past the 1,000-row cap.
 */
async function readCreatorEvidence(handle: ReadingHandle, a: { commentIds: readonly string[]; platform: string; platformVideoIds: readonly string[] }): Promise<ConvEvidenceRow[]> {
  const ids = [...new Set(a.commentIds)]
  if (ids.length === 0 || a.platformVideoIds.length === 0) return []
  type Comment = { comment_date: string | null; platform: string; video_id: string; author: string | null }
  type Row = { id: string; audience_insight_id: string; comment_id: string | null; quote: string | null; relevance_rank: number | null; redacted: boolean | null; comments: Comment | Comment[] | null }
  const pages = await mapWithLimit(chunk(ids, UUID_IN_CHUNK), READ_CONCURRENCY, (part) =>
    selectAll<Row>(() =>
      handle.client.from('insight_evidence')
        .select('id, audience_insight_id, comment_id, quote, relevance_rank, redacted, comments!inner(client_id, comment_date, platform, video_id, author)')
        .in('comment_id', part).eq('source', 'comment').eq('comments.client_id', handle.clientId)
        .eq('comments.platform', a.platform).in('comments.video_id', [...a.platformVideoIds])
        .order('id')))
  const keep = new Set(a.platformVideoIds)
  return pages.flat().flatMap((r) => {
    const c = Array.isArray(r.comments) ? r.comments[0] : r.comments
    if (!c || !r.comment_id || c.platform !== a.platform || !keep.has(String(c.video_id))) return []
    return [{
      evidenceId: String(r.id), insightId: String(r.audience_insight_id), commentId: String(r.comment_id), quote: r.quote ?? null,
      rank: r.relevance_rank ?? 99, redacted: r.redacted === true,
      comment: { date: c.comment_date, platform: c.platform, videoId: String(c.video_id), author: c.author ?? null },
    }]
  })
}

/** A creator's page: two segments (`<platform>/<account>`), or an old link's
 *  account alone. `missing` for an address that names no creator at the
 *  floor this month, and for Reddit, whose account is a community. */
export async function loadVoicesCreator(input: LevelLoadInput & { segments: readonly string[] }): Promise<CreatorPage | LevelMissing> {
  const { clientId, reading: handle, params } = input
  if (input.segments.length === 2 && COMMUNITY_PLATFORMS.has(input.segments[0].toLowerCase())) return { kind: 'missing', level: 'creator', line: CREATOR_REDDIT }
  const base = await loadLevelMonth(input, { profile: true })
  const { month, audiences, market, profile, now } = base
  if (!market) return { kind: 'missing', level: 'creator', line: CREATOR_MISSING }
  const m = month.month
  const allRefs = await soft('refs', readThemeRefs(handle, m, audiences, null), [])
  const read = creatorThemes({ month: m, videos: market, refs: allRefs.map((r) => ({ themeId: r.themeId, audience: r.audience, videoIds: r.videoIds })), audiences })
  const people = creatorsOf(read).filter((c) => c.videos >= ACCOUNT_FLOOR)
  const creator = resolveCreatorPath(people, input.segments)
  if (!creator) {
    const anywhere = resolveCreatorPath(read.creators, input.segments)
    if (anywhere && COMMUNITY_PLATFORMS.has(anywhere.platform)) return { kind: 'missing', level: 'creator', line: CREATOR_REDDIT }
    return { kind: 'missing', level: 'creator', line: anywhere ? creatorBelowFloor(month.monthWords) : CREATOR_MISSING }
  }
  const mineIds = market.filter((v) => v.platform === creator.platform && v.account === creator.account).map((v) => v.id)
  const platformVideoIds = market.filter((v) => mineIds.includes(v.id)).map((v) => v.platformVideoId)
  // EVERY conversation of theirs is labelled, not the facts' first few: each
  // video and each counted comment names the conversation it is in (the
  // board), and a comment counted only in a smaller one would print with no
  // name. One read a 250 ids, so the count of statements is the same.
  const themeIds = creator.themes.map((t) => t.themeId)
  const [labels, refs, videos, groupRead, lens, brandRead] = await Promise.all([
    soft('labels', readLabels(handle, themeIds), new Map<string, string>()),
    soft('creatorRefs', readThemeRefs(handle, m, audiences, themeIds), []),
    soft<ConvVideoRow[] | null>('videos', readCreatorVideos(handle, mineIds), null),
    profile ? soft('groups', loadGroupSubjects(handle, { month: m, audiences, market, profile, videosOnly: true }), null) : Promise.resolve(null),
    soft('lens', readLens(handle, m, mineIds), null),
    loadBrandsFor(handle, clientId, { month: m, now, audiences, market, pair: refuseEveryPair }),
  ])
  const byTheme = new Map<string, { themeId: string; videoIds: string[]; commentIds: string[] }>()
  for (const r of refs) {
    const held = byTheme.get(r.themeId) ?? { themeId: r.themeId, videoIds: [], commentIds: [] }
    held.videoIds.push(...r.videoIds)
    held.commentIds.push(...r.commentIds)
    byTheme.set(r.themeId, held)
  }
  const commentIds = [...byTheme.values()].flatMap((r) => r.commentIds)
  const evidence = await soft('evidence', readCreatorEvidence(handle, { commentIds, platform: creator.platform, platformVideoIds }), [])
  const translations = await soft('translations', readTranslations(handle.client, evidence.map((e) => e.quote ?? '').filter(Boolean)), new Map<string, { lang: string; english: string | null }>())
  const counted = new Set(brandRead.brands.rows.map((r) => r.brandKey))
  const brandSets = brandRead.brands.state === 'ready'
    ? (brandRead.sets ?? []).filter((s) => counted.has(s.brandKey)).map((s) => ({ brandKey: s.brandKey, label: s.label, you: s.brandKey === 'client', any: new Set(s.any) }))
    : []
  return buildCreatorPage({
    month,
    creator,
    people,
    labels,
    refs: [...byTheme.values()],
    videos,
    evidence,
    translations,
    gate: gateFor(clientId, {}),
    brandSets,
    personas: personasOf(profile ?? null),
    groupSets: groupRead ? new Map(groupRead.videos.map((g) => [g.key, g.videoIds])) : null,
    kinds: lens ? brandKinds(m, [{ brandKey: creator.key, label: creator.account, base: 'any', rows: lens }])[0] ?? null : null,
    noun: WHAT_THEY_SELL[clientId] ?? null,
    params,
  })
}

// Re-exported for the page's components and the fixtures.
export { FAILED_EXPLAINED, SUBJECT_NOT_MEASURED, GROUP_NO_WHO, GROUP_NOT_DESCRIBED, groupProducts, isRegistryId, MARKET_CONV_VIDEOS, nextMonth }
