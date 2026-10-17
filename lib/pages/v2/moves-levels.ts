import { commentVideoKey, type GroupEvidence } from '../../reading/cross'
import { aboutNamed, type WhoVideo } from '../../brands/attribution'
import { fmtInt, longMonth, platformLabel, shortDate } from '../../format'
import type { GateOptions } from '../../quote-gate'
import { joinedRun } from '../../reading/pairs'
import { monthStartOf, nextMonth, prevMonth } from '../../reading/month-key'
import { inlineMonth } from '../../reading/month-label'
import { pairOnVerdict } from '../../reading/comparability'
import type { PairOn } from '../../reading/pairs'
import type { RefusedReason } from '../../reading/verdicts'
import { audienceOfVideo } from '../../written/evidence'
import type { WhoAbout, WhoPart } from '../../written/types'
import type { Crumb, CrumbItem, CrumbMenu } from '../crumbs'
import { marketConversationHref } from '../../nav'
import type { AdviceRow } from '../market-surface'
import {
  MARKET_CONV_VIDEOS, MARKET_CONV_VIDEOS_MAX, MARKET_CONV_VIDEOS_PHONE, MARKET_VIDEO_COMMENTS_MAX, MARKET_VIDEO_QUOTES,
  convVideoOrder, doingOf, groupCountsOf, platformRows, shownConvVideos, videoQuotes, whoOf,
  type BrandsState, type ConvEvidenceRow, type ConvVideo, type ConvVideoRow, type Doing, type GroupLink, type PersonaLink, type PlatformsBlock,
} from './market'
import { ADVICE_RECORD_PATH, MOVES_PATH, advicePath, moveEvidenceHref, movePath, RECORD_GONE_ANCHOR, ADVICE_RECORD_ALL_HREF } from './moves-address'
import { adviceTitle, axisLine, MOVE_STATUS_LABEL, sharePct, UNTITLED_ADVICE, type AdviceCard, type MoveCard, type MovePoint, type MoveSlot, type RecordRow } from './moves'

// YOUR MOVES' LEVELS, AS PAGES (17 Oct; the G6 boards, every recommendation in
// the board report approved). Today's in-place panels each became a page,
// and each level has its own job and its own look:
//
//   A PIECE OF ADVICE is the HUB (/dashboard/moves/advice/<lineage>): the
//   argument and its figures in a header card, what it rests on, the
//   conversations behind it (each opening on Market, its home), its numbers
//   over its videos ALL TIME (decision 5: only the would-move line is
//   monthly), three comments each from its conversation, its history and the
//   moves made on it. A signpost on yellow.
//   A DATED MOVE is the EVIDENCE (/dashboard/moves/<id>): its one comparison
//   beside its line, then what people said after it, from its day to the
//   latest update, dated by the comment (decision 6), the facts beside it,
//   your other moves. A flag on the neutral.
//   THE ADVICE RECORD is the INDEX (/dashboard/moves/advice): every piece,
//   grouped by what was decided. A check-list on the neutral.
//
// A conversation or a subject keeps its home in Market, so these pages link
// there instead of drawing a copy. No week chip anywhere (decision 7): this
// page prints no week figure (decision 1). Pure: the reads are
// ./moves-levels-load.ts.

// ---- the words ----------------------------------------------------------------------

export const ADVICE_LEVEL = 'Advice'
export const RECORD_TITLE = 'The advice record'
export const RECORD_LEVEL = 'Every piece of advice, and what you decided'
export const MOVES_CRUMB = 'Your moves'
/** An address naming nothing this tenant holds: one calm line and the way back. */
export const ADVICE_MISSING = 'Your moves holds no piece of advice at this address.'
export const MOVE_MISSING = 'Your moves holds no dated move at this address.'
export const BACK_TO_MOVES = 'Back to Your moves'
/** Where a whole section's read failed on this load. */
export const LEVEL_UNREAD = 'could not be read just now'

/** The advice switcher's label and its chevron's name. */
export const ADVICE_SWITCH = { label: 'Advice waiting for a decision', switchLabel: 'Switch to another piece of advice waiting' }
/** The move switcher's label and its chevron's name. */
export const MOVE_SWITCH = { label: 'Your moves', switchLabel: 'Switch to another of your moves' }
/** The switcher's way into the record, under a hairline. */
export const RECORD_ENTRY_NOTE = 'every piece, and what you decided'

/** "No longer raised" lists this many, then "Show the other N" (`?all=1`). */
export const RECORD_GONE_SHOWN = 6

/** The section heads. */
export const CONVERSATIONS_TITLE = 'The conversations behind it'
export const NUMBERS_TITLE = 'The numbers'
export const HISTORY_TITLE = 'Its history'
export const SAID_TITLE = 'What people said after it'
export const OTHER_MOVES_TITLE = 'Your other moves'
export const NO_CAUSE = 'We show what the conversation did after a move. We never claim the move caused it.'

/** The advice's conversations where its videos sit in none Market reads. */
export const NO_CONVERSATION = 'Its videos sit in no conversation Market reads month by month.'
/** The third card's place where its videos sit in two conversations. */
export const NO_THIRD_CONVERSATION = 'No third conversation holds its videos. The rest sit in no conversation Market reads month by month.'
/** "In their words" with fewer comments than conversations. */
export const NO_OTHER_COMMENT = 'No other comment behind this advice can be shown yet.'
export const NO_COMMENT = 'No comment behind this advice can be shown yet.'
/** "Moves made on it", none. */
export const NO_MOVE_ON_IT = 'None yet.'
/** The invitation after it, only where the reader may accept and date. */
export const noMoveOnItInvite = (label: string | null): string =>
  `Accept it and date the change you make, and the move gets its own page${label ? `, read month by month on ${label}` : ''}.`
/** The move page's "Your next move" card, only where the reader may date one. */
export const NEXT_MOVE_PAGE = { title: 'Your next move', line: 'Date a change when you make it, and its months are drawn on its own page.' }

/** What "What people said after it" says where it lists nothing. */
export const SAID_HELD = 'What people said after it prints once this subject’s check has passed.'
export const SAID_NOTHING = 'This move names nothing the market is read on month by month, so no video is read after it.'
export const SAID_UNREAD = 'Its videos could not be read just now.'
export const saidNone = (day: string): string => `No video with a comment about it since ${shortDate(day)} yet.`

// ---- the argument -------------------------------------------------------------------

/** The argument, a paragraph for every two sentences, as the boards set it. */
export function whyParagraphs(why: string | null): string[] {
  const text = (why ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return []
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z“"‘'])/)
  const out: string[] = []
  for (let i = 0; i < sentences.length; i += 2) out.push(sentences.slice(i, i + 2).join(' '))
  return out
}

/**
 * The hub's header leads with the argument's FIRST SENTENCE (32px, the
 * board's); "Why" holds the rest, two sentences a paragraph. An argument of
 * one sentence leads and leaves "Why" to say so; none leads with nothing.
 * Pure.
 */
export function argumentParts(why: string | null): { lead: string | null; rest: string[] } {
  const text = (why ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return { lead: null, rest: [] }
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z“"‘'])/)
  return { lead: sentences[0], rest: whyParagraphs(sentences.slice(1).join(' ')) }
}

// ---- the conversations behind a piece of advice ------------------------------------

export interface AdviceConversation {
  /** `theme_registry.id`. */
  id: string
  /** Stored, `pass_b_theme`. */
  label: string
  /** Pass B's one line, as Market lists it; null where none. */
  description: string | null
  /** Of the advice's videos (all time), how many sit in it. */
  videos: number
  /** Its videos out of the market's in the reading month; null where not read. */
  level: { k: number; n: number } | null
  /** The one a move dated on this advice is read on (`adviceTargets`). */
  target: boolean
  /** Its page on Market, on the reading month's view. */
  href: string
}

export interface AdviceConversations {
  /** Every conversation its videos sit in, most of its videos first. */
  rows: AdviceConversation[]
  /** The advice's videos: the base "of its N". */
  videos: number
}

/** The cards drawn before the list. */
export const ADVICE_CONV_CARDS = 3

/**
 * THE CONVERSATIONS BEHIND A PIECE OF ADVICE (board report, data 1): its
 * evidence insights grouped by the themed run's themes (the
 * `registryIdsByInsight` bridge, never a label), each conversation counted in
 * the advice's own videos (a video once however many of its insights sit
 * there), most first, the target first on a tie. A conversation Market does
 * not name (no label) is left out: Market could not open it. Pure.
 */
export function adviceConversationsOf(a: {
  evidence: readonly string[]
  registryByInsight: ReadonlyMap<string, readonly string[]>
  videoByInsight: ReadonlyMap<string, string | null>
  labels: ReadonlyMap<string, string>
  descriptions: ReadonlyMap<string, string>
  level: (themeId: string) => { k: number; n: number } | null
  target: string | null
  month: string
}): AdviceConversations {
  const videosOf = new Map<string, Set<string>>()
  const all = new Set<string>()
  for (const insight of new Set(a.evidence)) {
    const video = a.videoByInsight.get(insight)
    if (!video) continue
    all.add(video)
    for (const reg of a.registryByInsight.get(insight) ?? []) {
      const held = videosOf.get(reg) ?? new Set<string>()
      held.add(video)
      videosOf.set(reg, held)
    }
  }
  const month = monthStartOf(a.month)
  const rows = [...videosOf.entries()]
    .flatMap(([id, videos]): AdviceConversation[] => {
      const label = a.labels.get(id)?.trim()
      if (!label) return []
      return [{
        id, label, description: a.descriptions.get(id)?.trim() || null, videos: videos.size,
        level: a.level(id), target: id === a.target,
        href: marketConversationHref(id, { period: 'month', month }),
      }]
    })
    .sort((x, y) => y.videos - x.videos || Number(y.target) - Number(x.target) || x.label.localeCompare(y.label))
  return { rows, videos: all.size }
}

// ---- the would-move line -----------------------------------------------------------

export interface WouldMoveLine {
  themeId: string
  /** Stored, `pass_b_theme`. */
  label: string
  /** Market's conversation page, on the reading month. */
  href: string
  /** The reading month and the two before, each drawn or empty and why. */
  slots: MoveSlot[]
  /** Why the empty ones are empty (`axisLine`), then where a move on this
   *  advice is read, in one quiet note. */
  note: string
}

/** The line's months: the reading month and the two before it. */
export const LINE_MONTHS = 3

/**
 * THE LINE A MOVE ON THIS ADVICE IS READ ON (board report, data 4): the
 * conversation its evidence leads with, its share of the market's videos in
 * the reading month and the two before. Only months read the same way are
 * drawn beside each other (`joinedRun`, anchored at the newest month read,
 * the one condition); a month left off says why, as a move's line does. A
 * month with no reading is an empty slot, never 0. Pure.
 */
export function wouldMoveLineOf(a: {
  themeId: string
  label: string
  month: string
  monthLabel: string | null
  now: string
  level: (month: string) => number | null
  n: (month: string) => number | null
  joined?: (prevMonth: string, month: string) => boolean
  pair?: PairOn | null
}): WouldMoveLine {
  const reading = monthStartOf(a.month)
  const months: string[] = []
  let at = reading
  for (let i = 0; i < LINE_MONTHS; i++) {
    months.unshift(at)
    at = prevMonth(at)
  }
  const read: MovePoint[] = months.flatMap((m) => {
    const n = a.n(m)
    const k = a.level(m)
    return n != null && n > 0 && k != null ? [{ month: m, role: 'before' as const, k, n, soFar: Date.parse(`${nextMonth(m)}T00:00:00.000Z`) > Date.parse(a.now) }] : []
  })
  const anchor = read[read.length - 1]?.month ?? null
  const drawn = anchor ? joinedRun(read, anchor, a.joined ?? (() => true)) : []
  const byMonth = new Map(drawn.map((p) => [p.month, p]))
  const wasRead = new Set(read.map((p) => p.month))
  const first = drawn[0]?.month ?? null
  const stepReason = (prev: string, next: string): RefusedReason | null => (a.pair ? pairOnVerdict(a.pair(prev, next, 'market')).refused : null)
  const slots: MoveSlot[] = months.map((m) => {
    const point = byMonth.get(m) ?? null
    if (point) return { month: m, point, why: null }
    if (!wasRead.has(m)) return { month: m, point: null, why: 'unread' }
    const reason = first && m < first ? stepReason(prevMonth(first), first) : null
    return { month: m, point: null, why: 'cut', ...(reason ? { reason } : {}) }
  })
  const parts = [
    axisLine(slots),
    a.monthLabel ? `${longMonth(reading)} is ${a.monthLabel}.` : null,
    // "from two months before it" only where a month before the reading
    // month is drawn (G6-Moves-Advice-Thin leaves it out).
    `A move dated on this advice is read on this line${slots.slice(0, -1).some((s) => s.point) ? ', from two months before it' : ''}.`,
  ].filter(Boolean)
  return { themeId: a.themeId, label: a.label, href: marketConversationHref(a.themeId, { period: 'month', month: reading }), slots, note: parts.join(' ') }
}

// ---- the numbers, over the advice's videos all time ---------------------------------

export interface AdviceNumbers {
  /** The advice's videos (all time): every count below is "of" it. */
  n: number
  /** Each group's videos of them, where any group counts; null where no
   *  group holds insights to count (Pass E's names alone, `groupNames`). */
  groups: GroupLink[] | null
  /** Who they are about, where the tenant's brands are counted. */
  who: { parts: WhoPart[]; n: number } | null
  brands: BrandsState
  /** What people did in them: the kinds of their insights. */
  doing: Doing[]
  /** Where: each platform's videos. */
  where: PlatformsBlock | null
}

/** One cited comment as the advice's numbers and quotes read it: the
 *  citation and the comment's video by row id. */
export interface LevelCitation extends ConvEvidenceRow {
  /** `videos.id` of the comment's video, where read. */
  video: string | null
}

/**
 * THE ADVICE'S NUMBERS (board report, data 3, decision 5): over its videos
 * ALL TIME, the base its header prints ("63 videos it rests on"), each block
 * "of" it: who raises it (`groupCountsOf` over its insights' citations), who
 * it is about (the tracked brands its cited comments name, `whoOf`), what
 * people did (its insights' kinds, a video once a kind) and where (each
 * platform's videos). Pure.
 */
export function adviceNumbersOf(a: {
  lineageId: string
  title: string
  month: string
  now: string
  evidence: readonly string[]
  videoByInsight: ReadonlyMap<string, string | null>
  kindByInsight: ReadonlyMap<string, string | null>
  videos: ReadonlyMap<string, Pick<ConvVideoRow, 'id' | 'platform' | 'video_id' | 'is_client' | 'is_competitor' | 'competitor_name'>>
  citations: readonly LevelCitation[]
  personas: readonly Pick<PersonaLink, 'key' | 'name' | 'insightIds'>[]
  mentions: readonly { comment_id: string; video_id: string; name: string }[]
  brands: BrandsState
  brand: string
  noun: string | null
  audienceOf: (v: Pick<ConvVideoRow, 'is_client' | 'is_competitor' | 'competitor_name'>) => string
}): AdviceNumbers {
  const evidence = new Set(a.evidence)
  const ids = new Set<string>()
  for (const insight of evidence) {
    const v = a.videoByInsight.get(insight)
    if (v) ids.add(v)
  }
  const n = ids.size
  // What people did: a video once a kind.
  const byKind = new Map<string, Set<string>>()
  for (const insight of evidence) {
    const kind = a.kindByInsight.get(insight)
    const v = a.videoByInsight.get(insight)
    if (!kind || !v) continue
    byKind.set(kind, (byKind.get(kind) ?? new Set<string>()).add(v))
  }
  const kinds = [...byKind.entries()].map(([kind, set]) => ({ kind, videos: set.size })).sort((x, y) => y.videos - x.videos || x.kind.localeCompare(y.kind))
  // Where: a video once, by its platform.
  const mix: Record<string, number> = {}
  for (const id of ids) {
    const v = a.videos.get(id)
    if (v) mix[v.platform] = (mix[v.platform] ?? 0) + 1
  }
  // Who raises it: the group cross over its own citations, all time.
  const cites = a.citations.filter((c) => evidence.has(c.insightId))
  const market = new Map(cites.map((c) => [commentVideoKey(c.comment.platform, c.comment.videoId), commentVideoKey(c.comment.platform, c.comment.videoId)]))
  const counted = a.personas.some((p) => (p.insightIds ?? []).length > 0)
  const groups = counted
    ? groupCountsOf({
        id: a.lineageId, name: a.title, month: monthStartOf(a.month), window: { from: '2000-01-01T00:00:00.000Z', to: a.now },
        personas: a.personas, evidence: cites.map(groupEvidenceOfCitation), members: evidence, market,
      }).filter((g) => (g.videos ?? 0) <= n)
    : null
  // Who it is about: the tracked brands its cited comments name, each video once.
  const who = a.brands === 'counted' && n > 0
    ? whoOf([{ theme_id: a.lineageId, video_ids: [...ids], comment_ids: cites.map((c) => c.commentId) }], a.mentions, a.brand, (id) => {
        const v = a.videos.get(id)
        return v ? a.audienceOf(v) : 'industry-other'
      }).get(a.lineageId) ?? []
    : []
  return {
    n,
    groups,
    who: who.length > 0 ? { parts: who, n: who.reduce((s, p) => s + p.videos, 0) } : null,
    brands: a.brands,
    doing: doingOf(kinds, n, a.noun),
    where: platformRows(mix, 'month'),
  }
}

/** A citation as the group cross reads it. */
export const groupEvidenceOfCitation = (c: Pick<ConvEvidenceRow, 'insightId' | 'commentId' | 'comment'>): GroupEvidence => ({
  insightId: c.insightId, commentId: c.commentId, platform: c.comment.platform, platformVideoId: c.comment.videoId, commentDate: c.comment.date,
})

// ---- in their words: three comments, each from its conversation --------------------

export interface AdviceQuote {
  /** The conversation it is from, opening on Market; null where none. */
  conv: { id: string; label: string; href: string } | null
  text: string
  lang: string | null
  english: string | null
  /** "TikTok · 7 Oct". */
  cite: string
  /** Who the video is about, where counted. */
  about: WhoAbout | null
}

/** The comments the hub prints: one a conversation, three at most. */
export const ADVICE_QUOTES = 3

/**
 * THREE COMMENTS, EACH FROM ITS CONVERSATION (board report, data 2): for each
 * conversation behind the advice, biggest first, the best comment its own
 * evidence insights cite in it, through the rules Market's evidence passes
 * (`videoQuotes`: not the video's own account, readable as a voice, no sale
 * offer, then the quote gate with the conversation's claim and its
 * relevance required), a comment never printed twice; videos tried most
 * citations first. Words resolved at render, never stored. Pure.
 */
export function adviceQuotesOf(a: {
  conversations: readonly AdviceConversation[]
  /** Each conversation's member insights among the advice's evidence. */
  membersOf: ReadonlyMap<string, ReadonlySet<string>>
  citations: readonly LevelCitation[]
  videos: ReadonlyMap<string, ConvVideoRow>
  translations: Map<string, { lang: string; english: string | null }>
  gate: (claim: string) => GateOptions
  named: ReadonlyMap<string, readonly string[]>
  brand: string
  brands: BrandsState
  count?: number
}): AdviceQuote[] {
  const out: AdviceQuote[] = []
  const used = new Set<string>()
  for (const conv of a.conversations) {
    if (out.length >= (a.count ?? ADVICE_QUOTES)) break
    const members = a.membersOf.get(conv.id) ?? new Set<string>()
    const cites = a.citations.filter((c) => members.has(c.insightId) && c.video)
    if (cites.length === 0) continue
    const byVideo = new Map<string, number>()
    for (const c of cites) byVideo.set(c.video as string, (byVideo.get(c.video as string) ?? 0) + 1)
    const order = [...byVideo.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([id]) => id)
    const commentIds = new Set(cites.map((c) => c.commentId))
    for (const id of order) {
      const video = a.videos.get(id)
      if (!video) continue
      const quotes = videoQuotes({ video, evidence: cites, commentIds, members, translations: a.translations, gate: a.gate(conv.label), kind: null })
      const q = quotes.find((x) => !used.has(fold(x.text)))
      if (!q) continue
      used.add(fold(q.text))
      // "Who talk is about": a tracked brand its counted comments name, else
      // its audience (a rival's own post is the rival's), the rule the
      // numbers' "Who it's about" counts by.
      const about = a.brands === 'counted' ? aboutNamed({ audience: audienceOfVideo(video), named: [...(a.named.get(id) ?? [])] }, a.brand) : 'market'
      out.push({
        conv: { id: conv.id, label: conv.label, href: conv.href },
        text: q.text, lang: q.lang, english: q.english,
        cite: [platformLabel(video.platform), q.date].filter(Boolean).join(' · '),
        about: about === 'market' ? null : about as WhoAbout,
      })
      break
    }
  }
  return out
}

/** A comment's words, folded, so one voice is never printed twice. */
const fold = (text: string): string => text.replace(/\s+/g, ' ').trim().toLowerCase()

// ---- the moves made on a piece of advice --------------------------------------------

/** The moves dated on one piece of advice (`moves.lineage_id`, board report
 *  data 5), as the root draws them. Pure. */
export function movesOnAdvice(cards: readonly MoveCard[], dated: readonly { id: string; lineage_id: string | null; kind: string }[], lineageId: string): MoveCard[] {
  const on = new Set(dated.filter((m) => m.kind === 'advice' && m.lineage_id === lineageId).map((m) => m.id))
  return cards.filter((c) => on.has(c.id))
}

/** The decision figure's foot: "no move dated on it", "1 move dated on it". */
export const movesDatedLine = (n: number): string => (n === 0 ? 'no move dated on it' : `${fmtInt(n)} ${n === 1 ? 'move' : 'moves'} dated on it`)

// ---- the record ----------------------------------------------------------------------

export type RecordGroupKey = 'waiting' | 'decided' | 'gone'

export interface RecordGroup {
  key: RecordGroupKey
  title: string
  rows: (RecordRow & { note?: string | null })[]
  /** Rows past `RECORD_GONE_SHOWN` not drawn ("Show the other N"). */
  hidden: number
}

export const RECORD_GROUP_TITLE: Record<RecordGroupKey, string> = {
  waiting: 'Waiting for a decision',
  decided: 'Decided',
  gone: 'No longer raised',
}

/** A row folded into a piece waiting (the short list's "the same idea"). */
export const SAME_IDEA_NOTE = 'the same idea as one above'

/**
 * THE ADVICE RECORD, GROUPED BY WHAT WAS DECIDED (board report, decision 1):
 * every piece of advice once, in three groups. WAITING is the advice waiting
 * (`waitingAdvice`, the one count the root's bar and the Dashboard print),
 * strongest first, then any piece the latest update raised that the short
 * list folded into one of them, marked as the same idea; DECIDED is every
 * piece decided on, the newest decision first; NO LONGER RAISED is the rest,
 * in the ledger's order (newest raised first), `RECORD_GONE_SHOWN` of them
 * unless `all`. Pure.
 */
export function recordGroupsOf(rows: readonly RecordRow[], waiting: readonly string[], all = false): RecordGroup[] {
  const waitingSet = new Set(waiting)
  const byLineage = new Map(rows.map((r) => [r.lineageId, r]))
  const first = waiting.map((id) => byLineage.get(id)).filter((r): r is RecordRow => r != null)
  const folded = rows.filter((r) => r.status === 'new' && r.current && !waitingSet.has(r.lineageId)).map((r) => ({ ...r, note: SAME_IDEA_NOTE }))
  const decided = rows.filter((r) => r.status !== 'new')
    .sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? '') || a.lineageId.localeCompare(b.lineageId))
  const gone = rows.filter((r) => r.status === 'new' && !r.current && !waitingSet.has(r.lineageId))
  const shown = all ? gone : gone.slice(0, RECORD_GONE_SHOWN)
  return [
    { key: 'waiting', title: RECORD_GROUP_TITLE.waiting, rows: [...first, ...folded], hidden: 0 },
    { key: 'decided', title: RECORD_GROUP_TITLE.decided, rows: decided, hidden: 0 },
    { key: 'gone', title: RECORD_GROUP_TITLE.gone, rows: shown, hidden: gone.length - shown.length },
  ]
}

/**
 * WHAT WAS DECIDED, IN THE CONTROLS' OWN WORDS (G6-Moves-Record: "Accepted
 * since 28 Sep", "Not for us since 7 Sep"): Accept stores `acted_on` and Not
 * for us `dismissed` (lib/actions/accept-advice.ts, rec-status.ts), so the
 * record and the hub name a decision by the button that made it; a status set
 * elsewhere keeps the ladder's word (`REC_STATUS_LABEL`). Pure.
 */
export function decisionWord(r: Pick<RecordRow, 'status' | 'statusLabel'>): string {
  return r.status === 'acted_on' ? 'Accepted' : r.status === 'dismissed' ? 'Not for us' : r.statusLabel
}

/** A record row's state: "not decided", or "Accepted since 28 Sep". */
export function recordState(r: Pick<RecordRow, 'status' | 'statusLabel' | 'decidedAt'>): string {
  return r.status === 'new' ? 'not decided' : `${decisionWord(r)}${r.decidedAt ? ` since ${shortDate(r.decidedAt)}` : ''}`
}

/** The history's line: "First suggested 20 Jul. Nobody has decided on it
 *  yet.", or "… Accepted since 28 Sep." Pure. */
export function hubDecisionLine(card: Pick<AdviceCard, 'firstMade' | 'status' | 'statusLabel' | 'decidedAt'>): string {
  const first = card.firstMade ? `First suggested ${shortDate(card.firstMade)}.` : ''
  const decided = card.status === 'new' ? 'Nobody has decided on it yet.' : `${recordState(card)}.`
  return [first, decided].filter(Boolean).join(' ')
}

/** "Show the other 10" (or every one), the record's own address. */
export const recordAllHref = (): string => `${ADVICE_RECORD_ALL_HREF}#${RECORD_GONE_ANCHOR}`

export interface RecordPageData {
  /** Every piece of advice. */
  total: number
  /** The first day any was suggested, `YYYY-MM-DD`; null with none. */
  since: string | null
  decided: number
  waiting: number
  groups: RecordGroup[]
  all: boolean
  crumbs: Crumb[]
}

// ---- the crumbs and the switchers ---------------------------------------------------

const MOVES_ROOT: Crumb = { label: MOVES_CRUMB, href: MOVES_PATH }

/** "High priority" from a stored priority, in words; null where none. */
export function priorityWords(priority: string | null | undefined): string | null {
  const p = (priority ?? '').trim().toLowerCase()
  return p === 'high' ? 'High priority' : p === 'medium' ? 'Medium priority' : p === 'low' ? 'Low priority' : null
}

/**
 * THE ADVICE SWITCHER (board G6-Moves-Advice-Switcher, decision 2): the advice
 * waiting, strongest first, each with its priority in words; a piece opened
 * from the record shows ABOVE a hairline, ticked; then, under a hairline, the
 * advice record with how many it holds. Pure.
 */
export function adviceMenu(a: { waiting: readonly AdviceRow[]; current: { lineageId: string; title: string; untitled?: boolean } ; total: number }): CrumbMenu {
  const isWaiting = a.waiting.some((r) => r.lineageId === a.current.lineageId)
  const item = (r: Pick<AdviceRow, 'lineageId' | 'title' | 'why' | 'priority'>): CrumbItem => {
    const title = adviceTitle(r.title, r.why)
    return { key: r.lineageId, label: title, href: advicePath(r.lineageId), current: r.lineageId === a.current.lineageId, note: priorityWords(r.priority), slot: title === UNTITLED_ADVICE ? null : 'pass_d_b_recommendation' }
  }
  return {
    label: ADVICE_SWITCH.label,
    switchLabel: ADVICE_SWITCH.switchLabel,
    wide: true,
    above: isWaiting ? [] : [{ key: a.current.lineageId, label: a.current.title, href: advicePath(a.current.lineageId), current: true, slot: a.current.untitled ? null : 'pass_d_b_recommendation' }],
    items: a.waiting.map(item),
    below: [{ key: 'record', label: `The advice record, all ${fmtInt(a.total)}`, href: ADVICE_RECORD_PATH, current: false, note: RECORD_ENTRY_NOTE }],
  }
}

/** "Your moves / {advice title} ⌃⌄". */
export function adviceCrumbs(card: Pick<AdviceCard, 'title' | 'untitled'>, menu: CrumbMenu | null): Crumb[] {
  return [MOVES_ROOT, { label: card.title, href: null, slot: card.untitled ? null : 'pass_d_b_recommendation', menu }]
}

/** The move switcher: the dated moves, each with its status in words. Pure. */
export function moveMenu(cards: readonly Pick<MoveCard, 'id' | 'title' | 'status'>[], currentId: string): CrumbMenu | null {
  if (cards.length === 0) return null
  return {
    label: MOVE_SWITCH.label,
    switchLabel: MOVE_SWITCH.switchLabel,
    items: cards.map((c) => ({ key: c.id, label: c.title, href: movePath(c.id), current: c.id === currentId, note: MOVE_STATUS_LABEL[c.status], slot: 'quote' })),
  }
}

/** "Your moves / {move title} ⌃⌄". */
export function moveCrumbs(card: Pick<MoveCard, 'title'>, menu: CrumbMenu | null): Crumb[] {
  return [MOVES_ROOT, { label: card.title, href: null, slot: 'quote', menu }]
}

/** "Your moves / The advice record", no chevron: it has no siblings. */
export const recordCrumbs = (): Crumb[] => [MOVES_ROOT, { label: RECORD_TITLE, href: null }]

// ---- a move's evidence: what people said after it -----------------------------------

export interface MoveEvidence {
  /** `held`: a subject whose check has not passed (U6); `nothing`: the move
   *  names nothing read month by month; `unread`: a read failed. */
  state: 'ready' | 'unread' | 'held' | 'nothing'
  /** Its videos since the day (the market's, a comment about it on each). */
  total: number
  videos: ConvVideo[]
  all: boolean
  more: { href: string; desktop: number; phone: number } | null
  capped: number | null
}

export const MOVE_EVIDENCE_EMPTY = (state: MoveEvidence['state']): MoveEvidence => ({ state, total: 0, videos: [], all: false, more: null, capped: null })

/**
 * "WHAT PEOPLE SAID AFTER IT" (board report, data 6, decision 6): the videos
 * with a comment about what the move is on, dated from the move's day to the
 * latest update, most of those comments first (`convVideoOrder`), the shown
 * ones (`shownConvVideos`: five, every one with `?videos=all`, a video's
 * whole list with `?video=`, only the move's own), each with its comments
 * through Market's evidence rules (`videoQuotes`). Market's video cards over
 * a different window and set. Pure.
 */
export function moveEvidenceOf(a: {
  moveId: string
  claim: string
  videoIds: readonly string[]
  commentIds: ReadonlySet<string>
  members: ReadonlySet<string>
  videos: readonly ConvVideoRow[]
  evidence: readonly ConvEvidenceRow[]
  translations: Map<string, { lang: string; english: string | null }>
  named: ReadonlyMap<string, readonly string[]>
  brand: string
  brands: BrandsState
  gate: GateOptions
  p: { video?: string | null; videos?: boolean }
}): MoveEvidence {
  const order = convVideoOrder(a)
  const { ids, open } = shownConvVideos(order, { video: a.p.video ?? null, videos: Boolean(a.p.videos) })
  const all = Boolean(a.p.videos)
  const shown = order.filter((o) => ids.includes(o.video.id))
  const videos: ConvVideo[] = shown.map(({ video, comments }) => {
    const quotes = videoQuotes({ video, evidence: a.evidence, commentIds: a.commentIds, members: a.members, translations: a.translations, gate: a.gate, kind: null })
    const isOpen = video.id === open
    // A tracked brand its counted comments name, else its audience: these
    // are the market's videos, the tracked rivals' own posts among them, so
    // a rival's post is the rival's, as the facts' "Who it's about" counts it
    // (Market's conversation cards are the category's alone).
    const about = a.brands === 'counted' ? aboutNamed({ audience: audienceOfVideo(video), named: [...(a.named.get(video.id) ?? [])] } as Pick<WhoVideo, 'audience' | 'named'>, a.brand) : 'market'
    return {
      id: video.id,
      account: (video.account_name ?? '').trim(),
      platform: platformLabel(video.platform),
      posted: video.upload_date ? shortDate(`${video.upload_date.slice(0, 10)}T12:00:00.000Z`) : null,
      about: about === 'market' ? null : about as WhoAbout,
      caption: video.caption?.replace(/\s+/g, ' ').trim() || null,
      url: video.video_url?.trim() || null,
      aboutCount: comments.size,
      total: video.comments_count ?? null,
      quotes: quotes.slice(0, isOpen ? MARKET_VIDEO_COMMENTS_MAX : MARKET_VIDEO_QUOTES),
      quotable: quotes.length,
      open: isOpen,
      href: moveEvidenceHref(a.moveId, isOpen ? { videos: all } : { video: video.id, videos: all }),
    }
  })
  const total = order.length
  const desktop = total - shown.length
  const phoneShown = all ? shown.length : shown.filter((o, i) => i < MARKET_CONV_VIDEOS_PHONE || o.video.id === open).length
  const phone = total - phoneShown
  return {
    state: 'ready',
    total,
    videos,
    all,
    more: !all && (desktop > 0 || phone > 0) ? { href: moveEvidenceHref(a.moveId, { videos: true }), desktop, phone } : null,
    capped: all && total > MARKET_CONV_VIDEOS_MAX ? MARKET_CONV_VIDEOS_MAX : null,
  }
}

export { MARKET_CONV_VIDEOS }

// ---- a move's facts ------------------------------------------------------------------

export interface MoveFacts {
  /** Its videos since the day: every fact below is "of" it. */
  n: number
  who: { parts: WhoPart[]; n: number } | null
  brands: BrandsState
  doing: Doing[]
  /** Counted; null where no group holds insights (Pass E's names alone). */
  groups: GroupLink[] | null
  where: PlatformsBlock | null
}

/**
 * THE FACTS BESIDE IT (board G6-Moves-Move): over the same videos since the
 * move's day, who they are about, what people did (the kinds of the insights
 * that cite their comments), who's saying it (the group cross over those
 * citations, dated from the day) and where. Pure.
 */
export function moveFactsOf(a: {
  moveId: string
  title: string
  day: string
  now: string
  month: string
  videos: readonly ConvVideoRow[]
  citations: readonly ConvEvidenceRow[]
  kindByInsight: ReadonlyMap<string, string | null>
  members: ReadonlySet<string>
  personas: readonly Pick<PersonaLink, 'key' | 'name' | 'insightIds'>[]
  mentions: readonly { comment_id: string; video_id: string; name: string }[]
  brands: BrandsState
  brand: string
  noun: string | null
  audienceOf: (v: ConvVideoRow) => string
}): MoveFacts {
  const byKey = new Map(a.videos.map((v) => [commentVideoKey(v.platform, v.video_id), v]))
  const n = a.videos.length
  const byKind = new Map<string, Set<string>>()
  for (const c of a.citations) {
    const kind = a.kindByInsight.get(c.insightId)
    const v = byKey.get(commentVideoKey(c.comment.platform, c.comment.videoId))
    if (!kind || !v) continue
    byKind.set(kind, (byKind.get(kind) ?? new Set<string>()).add(v.id))
  }
  const kinds = [...byKind.entries()].map(([kind, set]) => ({ kind, videos: set.size })).sort((x, y) => y.videos - x.videos || x.kind.localeCompare(y.kind))
  const mix: Record<string, number> = {}
  for (const v of a.videos) mix[v.platform] = (mix[v.platform] ?? 0) + 1
  const market = new Map([...byKey.keys()].map((k) => [k, k]))
  const groups = a.personas.some((p) => (p.insightIds ?? []).length > 0)
    ? groupCountsOf({
        id: a.moveId, name: a.title, month: monthStartOf(a.month), window: { from: `${a.day}T00:00:00.000Z`, to: a.now },
        personas: a.personas, evidence: a.citations.map(groupEvidenceOfCitation), members: a.members, market,
      }).filter((g) => (g.videos ?? 0) <= n)
    : null
  const audience = new Map(a.videos.map((v) => [v.id, a.audienceOf(v)]))
  const who = a.brands === 'counted' && n > 0
    ? whoOf([{ theme_id: a.moveId, video_ids: a.videos.map((v) => v.id), comment_ids: a.citations.map((c) => c.commentId) }], a.mentions, a.brand, (id) => audience.get(id) ?? 'industry-other').get(a.moveId) ?? []
    : []
  return {
    n,
    who: who.length > 0 ? { parts: who, n: who.reduce((s, p) => s + p.videos, 0) } : null,
    brands: a.brands,
    doing: doingOf(kinds, n, a.noun),
    groups,
    where: platformRows(mix, 'month'),
  }
}

// ---- the move page --------------------------------------------------------------------

export interface MovePageData {
  brand: string
  /** What the tenant sells, for "the market"'s words. */
  noun: string | null
  month: string
  monthLabel: string | null
  readingAt: string
  canDecide: boolean
  card: MoveCard
  /** What it is on, and its level in the reading month; null where it names
   *  nothing Market reads. */
  on: { kind: 'subject' | 'theme'; label: string; href: string | null; level: { k: number; n: number } | null; ready: boolean } | null
  /** From the move's day to the latest update. */
  window: { from: string; to: string }
  evidence: MoveEvidence
  facts: MoveFacts | null
  /** The other dated moves, as their cards. */
  others: MoveCard[]
  /** "Your next move", where the reader may date one. */
  invite: boolean
  crumbs: Crumb[]
  askHref: string
}

/** "read July to September, the last full month": the months its line draws. */
export function moveReadWords(card: Pick<MoveCard, 'points'>, monthLabel: string | null, readingMonth: string): string | null {
  if (card.points.length === 0) return null
  const first = card.points[0].month
  const last = card.points[card.points.length - 1].month
  const lastName = inlineMonth(longMonth(last), monthStartOf(last) === monthStartOf(readingMonth) ? monthLabel : null)
  return first === last ? `read ${lastName}` : `read ${longMonth(first)} to ${lastName}`
}

/** The Agent, asked about what people said after a move. */
export const askAfterMoveHref = (label: string | null, day: string): string =>
  `/dashboard/agent?ask=${encodeURIComponent(`What did people say about ${label ?? 'this'} after ${shortDate(day)}?`.slice(0, 300))}`

/** The Agent, asked about the advice record. */
export const ASK_RECORD_HREF = `/dashboard/agent?ask=${encodeURIComponent('What have you advised over time, and what came of what we decided?')}`

/** A share, as the line prints it. */
export { sharePct }

// ---- the hub's words ----------------------------------------------------------------

/** One to twelve in words, as the boards write a count in a sentence; a
 *  figure past that. */
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
export const countWords = (n: number): string => (n >= 0 && n < WORDS.length ? WORDS[n] : fmtInt(n))
const cap = (s: string): string => `${s.charAt(0).toUpperCase()}${s.slice(1)}`

/**
 * The note under "What it rests on": "Two conclusions about your market and
 * one finding about a rival. The finding opens in Voices.", and, where a
 * conclusion resolves to no video (drawn from rival findings alone), why it
 * prints no count. Null with nothing to say. Pure.
 */
export function restsOnNote(rows: readonly { kind: 'market' | 'rival'; videos: number | null }[]): string | null {
  const market = rows.filter((r) => r.kind === 'market').length
  const rival = rows.filter((r) => r.kind === 'rival').length
  if (market + rival === 0) return null
  const parts = [
    market > 0 ? `${countWords(market)} ${market === 1 ? 'conclusion' : 'conclusions'} about your market` : null,
    rival > 0 ? `${countWords(rival)} ${rival === 1 ? 'finding' : 'findings'} about a rival` : null,
  ].filter(Boolean).join(' and ')
  const opens = rival > 0 ? ` The ${rival === 1 ? 'finding opens' : 'findings open'} in Voices.` : ''
  const uncounted = rows.some((r) => r.kind === 'market' && r.videos == null) ? ' A conclusion drawn from rival findings alone counts no videos.' : ''
  return `${cap(parts)}.${opens}${uncounted}`
}

/** The streak figure's words (G6-Moves-Advice): "updates in a row have raised
 *  it" and "since 20 Jul"; "update has raised it" and "first raised 12 Oct";
 *  and where the latest update did not raise it, how many did. Pure. */
export function streakWords(h: { streak: number; since: string | null; dates: readonly string[] }): { value: number; label: string; sub: string | null } {
  if (h.streak > 1 && h.since) return { value: h.streak, label: 'updates in a row have raised it', sub: `since ${shortDate(h.since)}` }
  if (h.streak === 1 && h.since) return { value: 1, label: 'update has raised it', sub: `first raised ${shortDate(h.since)}` }
  return { value: h.dates.length, label: h.dates.length === 1 ? 'update raised it' : 'updates raised it', sub: 'not raised by the latest update' }
}

/** The decision figure's title: "Not decided yet", or "Accepted". */
export const decisionWords = (card: Pick<AdviceCard, 'status' | 'statusLabel'>): string => (card.status === 'new' ? 'Not decided yet' : decisionWord(card))
