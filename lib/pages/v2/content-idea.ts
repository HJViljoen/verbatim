import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk, UUID_IN_CHUNK } from '../../chunk'
import { postIdeasEnabled } from '../../config'
import { shortDate } from '../../format'
import { printsMedicalLine } from '../../post-ideas/medical'
import {
  isMissingPostIdeas, loadPostIdeas, parsePostIdeaRow, POST_IDEA_COLUMNS, subquestionCounts, TABLE_POST_IDEAS,
  type PostIdeaCover, type PostIdeaLength, type PostIdeaRank, type PostIdeaRow,
} from '../../post-ideas/types'
import { pickEligible, type GateOptions } from '../../quote-gate'
import { gateFor, readQuoteContext } from '../../quote-context'
import { readTranslations } from '../../quotes'
import { marketAudiences } from '../../reading/market'
import { ownedPosts } from '../../reading/owned'
import { marketRivalAudiences } from '../../reading/reading-view'
import type { Counted, Verdict } from '../../reading/verdicts'
import { quoteRef } from '../../renderables/quotes-freeze'
import type { Scope } from '../../renderables/types'
import { loadTrackedRivals } from '../../rivals'
import { loadPublishedWeekRead, type PublishedWeekRead } from '../../written/published'
import type { Crumb, CrumbItem } from '../crumbs'
import { buildPlaybook, loadPlaybookVideos } from '../playbook'
import { flagWordOf, FLAG_WORDS } from '../../../components/v2/flag-chip'
import {
  agentHref, anchorOf, contentMonth, conversationHref, flagVerdict, groupsByConversation, ideaOwnedFrom, ideasWeekOf, ideaWeeks, marketVideoCards,
  monthWords, newVerdict, olderIdeasLine, ownedTo, ownTouch, platformsOf, readFlags, readLabels, readPanelVideos, readPersonas, readWindows, readWords,
  recipe, soft, touchPosts, typicalRate, wordsToBorrow,
  type ContentMonth, type FlagRowIn, type GroupName, type IdeasWeek, type MarketVideoCard, type OwnTouch, type Recipe,
} from './content'
import { contentIdeaHref, contentIdeaPath, subAnchor } from './content-address'
import { contentCrumb } from './content-levels'

// A POST IDEA'S PAGE, THE HUB (depth as pages, 17 Oct; boards
// G5-Content-Idea, -Idea-Switcher, -Idea-Thin and -Idea-Phone). Addressed by
// its row (`/dashboard/content/ideas/<post_ideas.id>`), never its rank: rank 1
// is a new idea every week and a link in an email has to keep resolving.
//
// Top to bottom: the path ("Content / {idea}", its switcher the set's other
// ideas in rank order, a flag as its state word, no figure; none with one
// idea); the title block (a lightbulb on the yellow, "Post idea 1, from {its
// conversation}", the idea's title, the days it read beside its month); the
// header card (what the post should cover, the medical line in a medical
// market, then four figures: where it came up, make it as, open with, length);
// what they want to know, a card a sub-question with the comments asking it;
// the numbers (its four weeks, who's asking, where it came up, your posts,
// words to borrow); market videos where it came up; the conversation in
// Market; the Agent. No period switch: an idea's four weeks are fixed.
//
// THE ROOT'S RULES, READ THE SAME WAY. The page's week is the root's anchor
// (`anchorOf` over this idea's set and the published read), so a current
// idea's figures are its card's on the root: its videos over the days its set
// read, of the market's then, beside ITS month (`ideasWeekOf`: the page's for
// a current set, the read window's own for an older one), each week a bare
// count, all under the anchor run's clustering. An older idea still resolves
// (an emailed link) and says which week it was written for.
//
// WHAT IT READS, AND ONLY FOR WHAT IT PRINTS: the row, by id, for the session's
// tenant alone (a foreign or malformed id reads nothing more), its set, the
// published read; then the conversation's label, the flags (the switcher's
// words and the idea's own chip), the groups, the rivals (the market's
// audiences), the window readings, your posts (the touch test), the
// sub-questions' comments (one read a 250, their English, the gate's
// context), the words to borrow, the market videos and the month's playbook
// (the typical video their response is read against).

export const IDEA_MISSING = 'Content has no post idea at this address.'

/** An idea from an earlier set than the newest (an emailed link, a week or
 *  more on): the week it was written for. Never the root's "No new ideas
 *  this week", which is untrue where a newer set exists; "before the ideas
 *  Content shows now" only where the newest set was read. Pure. */
export const earlierIdeaLine = (week: Pick<IdeasWeek, 'phrase'>, newestKnown: boolean): string =>
  `This idea was written for ${week.phrase}${newestKnown ? ', before the ideas Content shows now' : ''}.`
export const IDEA_NOT_ON = 'Post ideas are not switched on for this workspace.'
export const IDEA_UNREAD = 'This post idea could not be read just now.'

/** A sub-question's comments on its card, and opened (`?sub=`). */
export const SUB_QUOTES = 2
export const SUB_COMMENTS_MAX = 50

/** A comment as a sub-question's card prints it: the commenter's words
 *  (resolved at render through the quote gate, never stored), its English,
 *  where and when. */
export interface SubComment {
  ref: string
  text: string
  lang: string | null
  english: string | null
  platform: string | null
  /** "5 Oct". */
  date: string | null
}

export interface SubquestionCard {
  /** Its place on the page, from 1: its `?sub=` and its card's anchor. */
  n: number
  /** The model's label (`stored`, slot `post_idea`). */
  label: string
  /** Its distinct videos and comments, off its ids (`subquestionCounts`). */
  videos: number
  comments: number
  /** The videos the comments were grouped from (`cover.asked.videos`): its
   *  figure prints "of" them, and nothing else. Null on a row without. */
  of: number | null
  /** Two of its comments, or, opened, every one that may print (at most
   *  `SUB_COMMENTS_MAX`). */
  quotes: SubComment[]
  /** How many of its comments may print, uncapped. Null where its comments
   *  could not be read. */
  quotable: number | null
  open: boolean
  /** Opens its comments (or, open, closes them). */
  href: string
}

export interface IdeaPage {
  id: string
  rank: PostIdeaRank
  registryId: string
  /** The model's title (`stored`, slot `post_idea`). */
  title: string
  /** The conversation's own label this run (Pass B's), where the run named it. */
  label: string | null
  /** What the post should cover (`stored`, slot `post_idea`). */
  cover: string
  medical: boolean
  week: IdeasWeek
  /** Over the days the set read, of the market's then, and its month beside
   *  it: the four weeks never print without their month (decision 1). */
  read: Counted | null
  month: Counted | null
  weeks: { label: string; count: number }[] | null
  /** Where it came up over those days, the most first (each video on its own
   *  platform, so they add up to `read.k`). Null where not read. */
  platforms: { platform: string; videos: number }[] | null
  /** The anomaly check's flag, or the week read's "new"; null for neither. */
  flag: Verdict | null
  format: Recipe | null
  opening: Recipe | null
  length: PostIdeaLength | null
  asked: NonNullable<PostIdeaCover['asked']> | null
  subquestions: SubquestionCard[]
  groups: GroupName[]
  own: OwnTouch
  words: { ref: string; text: string }[]
  videos: MarketVideoCard[]
  /** The month the videos' typical response is read over, in words
   *  ("in October so far"); its videos' multiples need it. */
  typicalWords: string
  askHref: string
  conversationHref: string
  /** Where the idea is not the root's week's: the root's own line ("No new
   *  ideas this week. These are from the week of 28 Sep.") where its set is
   *  the newest; else which week it was written for (`earlierIdeaLine`). */
  older: string | null
}

export type IdeaPageState = 'ready' | 'missing' | 'not_on' | 'unread'

export interface ContentIdeaData {
  state: IdeaPageState
  page: IdeaPage | null
  /** "Content / {idea}" with its switcher; just "Content" where the page
   *  names no idea. */
  crumbs: Crumb[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `?sub=<n>`: a sub-question by its place on the page, from 1, only where
 *  the idea has one there. Pure. */
export function subParam(raw: string | string[] | undefined, count: number): number | null {
  const v = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? ''
  if (!/^\d{1,2}$/.test(v)) return null
  const n = Number(v)
  return n >= 1 && n <= count ? n : null
}

/** The flag's word as a switcher prints it ("Unusual this week", "New"), or
 *  null: a state word, never a figure. */
export const flagNote = (v: Verdict | null | undefined): string | null => {
  const w = flagWordOf(v)
  return w ? FLAG_WORDS[w] : null
}

/** The path and its switcher: the set's ideas in rank order, the page ticked,
 *  each with its flag's word; no menu with one idea. Pure. */
export function ideaCrumbs(page: { id: string; title: string }, set: readonly { id: string; title: string; rank: number; flag: Verdict | null }[], week: Pick<IdeasWeek, 'label'>): Crumb[] {
  const items: CrumbItem[] = [...set].sort((a, b) => a.rank - b.rank).map((i) => ({
    key: i.id, label: i.title, href: contentIdeaPath(i.id), current: i.id === page.id, note: flagNote(i.flag), slot: 'post_idea',
  }))
  return [
    contentCrumb(),
    {
      label: page.title,
      href: null,
      slot: 'post_idea',
      menu: items.length > 1 ? { label: `Post ideas for ${week.label}`, switchLabel: 'Switch to another post idea', items, wide: true } : null,
    },
  ]
}

/** A sub-question's comments as read, with the video each sits under. */
export interface SubCommentRow {
  id: string
  text: string | null
  platform: string | null
  comment_date: string | null
  video_id: string | null
}

/**
 * The sub-questions as the page draws them, the most videos first: each its
 * counts off its ids, and its comments through the quote gate the root's
 * panel ran (`gateFor` with the idea's title as the claim, comments under
 * your own posts allowed): two, one a video, or opened every one that may
 * print. Where the comments could not be read, no comment and no count of
 * them. Pure.
 */
export function subquestionCards(a: {
  idea: Pick<PostIdeaRow, 'id' | 'subquestions' | 'cover'>
  rows: readonly SubCommentRow[] | null
  translations: Map<string, { lang: string; english: string | null }>
  video: (commentId: string) => ReturnType<Awaited<ReturnType<typeof readQuoteContext>>['forComment']>
  gate: GateOptions
  open: number | null
}): SubquestionCard[] {
  const byId = new Map((a.rows ?? []).filter((r) => (r.text ?? '').trim()).map((r) => [r.id, r]))
  const reading = (t: string) => a.translations.get(t) ?? null
  const view = (r: SubCommentRow) => {
    const tr = reading(r.text ?? '')
    return { text: r.text ?? '', lang: tr?.lang ?? null, english: tr?.english ?? null, video: a.video(r.id) }
  }
  const asComment = (r: SubCommentRow): SubComment => {
    const tr = reading(r.text ?? '')
    return { ref: quoteRef.message(r.id), text: (r.text ?? '').trim(), lang: tr?.lang ?? null, english: tr?.english ?? null, platform: r.platform, date: r.comment_date ? shortDate(r.comment_date) : null }
  }
  return a.idea.subquestions
    .map((s) => ({ s, ...subquestionCounts(s) }))
    .filter((x) => x.s.label.trim() && (x.videos > 0 || x.comments > 0))
    .sort((x, y) => y.videos - x.videos || y.comments - x.comments || x.s.label.localeCompare(y.s.label))
    .map((x, i) => {
      const n = i + 1
      const open = a.open === n
      const rows = [...new Set(x.s.commentIds)].map((id) => byId.get(id)).filter((r): r is SubCommentRow => r != null)
      // Every one that may print, uncapped (the card's "Show all" counts
      // them; the opened list draws the first `SUB_COMMENTS_MAX`).
      const every = a.rows ? pickEligible(rows, view, rows.length, { ...a.gate, perThread: Math.max(1, rows.length) }) : []
      const shown = open ? every.slice(0, SUB_COMMENTS_MAX) : a.rows ? pickEligible(rows, view, SUB_QUOTES, a.gate) : []
      return {
        n,
        label: x.s.label,
        videos: x.videos,
        comments: x.comments,
        of: a.idea.cover.asked?.videos ?? null,
        quotes: shown.map(asComment),
        quotable: a.rows ? every.length : null,
        open,
        href: open ? contentIdeaPath(a.idea.id) + `#${subAnchor(n)}` : contentIdeaHref(a.idea.id, { sub: n }),
      }
    })
}

/** "Show all 14 comments" where every one asking it may print, else "Show 9
 *  of 14", at most the opened list's cap; null where no more than the card
 *  shows may print. Pure. */
export function showSubComments(card: Pick<SubquestionCard, 'quotable' | 'comments' | 'quotes' | 'open'>): { shown: number; of: number | null } | null {
  if (card.open || card.quotable == null || card.quotable <= card.quotes.length) return null
  const shown = Math.min(card.quotable, SUB_COMMENTS_MAX)
  return { shown, of: shown < card.comments ? card.comments : null }
}

/** Under an opened list, once: where the cap cut it, how many may print; else
 *  the comments counted and not printed, and why; null where every one
 *  printed. Pure. */
export function openedSubNote(card: Pick<SubquestionCard, 'quotable' | 'comments' | 'open'>): string | null {
  if (!card.open || card.quotable == null) return null
  const unquoted = Math.max(0, card.comments - card.quotable)
  if (card.quotable > SUB_COMMENTS_MAX) {
    return `The first ${SUB_COMMENTS_MAX} of the ${card.quotable} that can be quoted are shown${unquoted > 0 ? `; ${unquoted} more ${unquoted === 1 ? 'is' : 'are'} counted, not quoted` : ''}.`
  }
  return unquoted > 0 ? `The other ${unquoted === 1 ? 'one is' : `${unquoted} are`} counted, not quoted: ${QUOTE_RULE}.` : null
}

/** Why a counted comment may not print: the gate's two tests, in words. */
export const QUOTE_RULE = 'a comment prints only where it reads clearly and speaks to this'
/** A sub-question none of whose comments may print. */
export const SUB_NONE_QUOTABLE = `None of these comments can be quoted: ${QUOTE_RULE}.`
/** A sub-question whose comments could not be read. */
export const SUB_UNREAD = 'Its comments could not be read just now.'

// ---- the reads ---------------------------------------------------------------------

/** The row by its id, for this tenant alone; null for none (a foreign, a
 *  retired or a malformed id reads nothing). `'not_on'` where the table is
 *  not there: the root reads that as "not switched on" (`readIdeas`), never
 *  as a read that failed (AGENTS.md, Content). */
export async function readIdeaRow(db: SupabaseClient, clientId: string, id: string): Promise<PostIdeaRow | null | 'not_on'> {
  if (!UUID_RE.test(id)) return null
  const res = await db.from(TABLE_POST_IDEAS).select(POST_IDEA_COLUMNS).eq('client_id', clientId).eq('id', id.toLowerCase()).maybeSingle()
  if (res.error) {
    if (isMissingPostIdeas(res.error)) return 'not_on'
    throw new Error(`content.idea: ${res.error.message}`)
  }
  return res.data ? parsePostIdeaRow(res.data) : null
}

/** The newest set's run and window (the root's first read, `loadPostIdeas`):
 *  the root anchors on it, so an older idea's page knows it is older. */
export async function readNewestIdeaRun(db: SupabaseClient, clientId: string): Promise<Pick<PostIdeaRow, 'run_id' | 'window_start' | 'window_end'> | null> {
  const res = await db.from(TABLE_POST_IDEAS).select('run_id, window_start, window_end')
    .eq('client_id', clientId).order('window_end', { ascending: false }).order('created_at', { ascending: false }).limit(1)
  if (res.error) throw new Error(`content.ideaNewest: ${res.error.message}`)
  const r = (res.data?.[0] ?? null) as Pick<PostIdeaRow, 'run_id' | 'window_start' | 'window_end'> | null
  return r?.run_id && r.window_start && r.window_end ? r : null
}

/** The sub-questions' comments, by id, the tenant's own, one read a 250. */
async function readSubComments(db: SupabaseClient, clientId: string, ids: readonly string[]): Promise<SubCommentRow[]> {
  if (ids.length === 0) return []
  const parts = await Promise.all(chunk([...ids], UUID_IN_CHUNK).map(async (part) => {
    const res = await db.from('comments').select('id, text, platform, comment_date, video_id').eq('client_id', clientId).in('id', part)
    if (res.error) throw new Error(`content.ideaComments: ${res.error.message}`)
    return (res.data ?? []) as SubCommentRow[]
  }))
  return parts.flat()
}

/** A flag's verdict for a conversation, the root card's rule: the anomaly
 *  check's on the anchor run, else the week read's "new" over the PAGE's month
 *  (the root's `month`, never an older set's own: "new" is the page's week's
 *  flag, AGENTS.md's Content bullet). */
function flagFor(registryId: string, label: string, flags: ReadonlyMap<string, FlagRowIn>, newIds: ReadonlySet<string>, week: { from: string; to: string } | null, pageMonthLevel: Counted | null, pageMonth: ContentMonth): Verdict | null {
  const f = flags.get(registryId)
  if (f && week) return flagVerdict(f, week)
  return newIds.has(registryId) && pageMonthLevel ? newVerdict(registryId, label, pageMonth, pageMonthLevel) : null
}

const missing = (state: IdeaPageState): ContentIdeaData => ({ state, page: null, crumbs: [contentCrumb()] })

/**
 * A post idea's page. `scope.supabase` reads the tenant's rows (the session
 * client on the app path); `scope.reading` the window readings and the
 * published read. `scope.params` carries `?sub=`.
 */
export async function loadContentIdea(scope: Scope, id: string, opts: { now?: Date } = {}): Promise<ContentIdeaData> {
  const db = scope.supabase as SupabaseClient
  const { clientId } = scope
  const admin = scope.reading.client
  const now = opts.now ?? new Date()
  // Switched off for this workspace: nothing is read and no stored idea prints.
  if (!postIdeasEnabled(clientId)) return missing('not_on')

  // ---- wave 1: the row (for this tenant alone), the newest set's run, the
  // published read. A malformed id reads nothing at all.
  if (!UUID_RE.test(id)) return missing('missing')
  let row: PostIdeaRow | null | 'not_on'
  let published: PublishedWeekRead | null
  let newest: Pick<PostIdeaRow, 'run_id' | 'window_start' | 'window_end'> | null
  try {
    ;[row, newest, published] = await Promise.all([
      readIdeaRow(db, clientId, id),
      soft('idea.newest', readNewestIdeaRun(db, clientId)),
      soft('idea.published', loadPublishedWeekRead(admin, clientId)),
    ])
  } catch (e) {
    console.error(`[pages] content.idea: ${(e as { message?: string })?.message ?? String(e)}`)
    return missing('unread')
  }
  if (row === 'not_on') return missing('not_on')
  if (!row) return missing('missing')
  const idea = row

  // The root's anchor (`anchorOf` over the newest set and the published
  // read): a current idea's week is its card's; an older one is beside its
  // own read window's month and says which week it was written for.
  const week = anchorOf([{ ...idea, ...(newest ?? {}) }], published)
  const ideasWeek = ideasWeekOf([idea], week)
  if (!ideasWeek) return missing('unread')
  const month = contentMonth(week, now)
  const since = ideaOwnedFrom(month.month)
  const commentIds = [...new Set(idea.subquestions.flatMap((s) => s.commentIds))]
  const videoIds = [...new Set(idea.subquestions.flatMap((s) => s.videoIds))]
  const runId = week?.runId ?? idea.run_id

  // ---- wave 2
  const [set, labels, flags, personas, rivals, ownedRead, comments, words, videos, playbook] = await Promise.all([
    soft('idea.set', loadPostIdeas(db, clientId, idea.run_id)),
    soft('idea.label', readLabels(db, clientId, runId, [...new Set([idea.registry_id])])),
    soft('idea.flags', readFlags(db, clientId, runId)),
    soft('idea.personas', readPersonas(db, clientId)),
    soft('idea.rivals', loadTrackedRivals(db, clientId)),
    soft('idea.owned', ownedPosts({ supabase: db, clientId }, { from: since, to: ownedTo(month, week) })),
    soft('idea.comments', readSubComments(db, clientId, commentIds)),
    soft('idea.words', readWords(db, clientId, commentIds)),
    soft('idea.videos', readPanelVideos(db, clientId, videoIds)),
    // The typical video the market videos' response is read against: the
    // ideas' month's, as the card's month.
    soft('idea.playbook', async () => buildPlaybook({ month: ideasWeek.month.month, brand: 'You', rival: null, videos: await loadPlaybookVideos(db, clientId, ideasWeek.month.month), clientSide: 'owned' })),
  ])
  const audiences = marketAudiences(marketRivalAudiences(rivals ?? []))
  const printable = (comments ?? []).filter((c) => (c.text ?? '').trim())

  // ---- wave 3: the window readings, the comments' English and the gate's context
  const [windows, translations, ctx] = await Promise.all([
    soft('idea.windows', readWindows(scope, week, month, audiences, { week: false, ideas: ideasWeek })),
    comments ? soft('idea.translations', readTranslations(db, printable.map((c) => c.text ?? ''))) : Promise.resolve(null),
    comments ? soft('idea.context', readQuoteContext(db, clientId, { commentVideos: printable.map((c) => ({ commentId: c.id, platform: c.platform, videoId: c.video_id })), commentIds: printable.map((c) => c.id) }, admin)) : Promise.resolve(null),
  ])

  const label = labels?.get(idea.registry_id) ?? null
  const flagOf = new Map((flags ?? []).map((f) => [String(f.object_id), f]))
  const newIds = published && week && published.runId === week.runId && 'newThisWeek' in published.data
    ? new Set((published.data.newThisWeek ?? []).map((n) => n.themeId))
    : new Set<string>()
  const ideaMonth = (registryId: string): Counted | null => {
    const n = windows?.ideas?.month.market ?? null
    return windows?.ideas?.month.themes && n != null && n > 0 ? { k: windows.ideas.month.themes.get(registryId) ?? 0, n } : null
  }
  // The page's own month (the root's), which "new" is judged over.
  const pageMonth = (registryId: string): Counted | null => {
    const n = windows?.market.month ?? null
    return windows?.themes.month && n != null && n > 0 ? { k: windows.themes.month.get(registryId) ?? 0, n } : null
  }
  const id0 = idea.registry_id
  const readN = windows?.ideas?.market ?? null
  const flag = flagFor(id0, label ?? idea.title, flagOf, newIds, week, pageMonth(id0), month)
  const sub = subParam(scope.params.sub, idea.subquestions.length)

  const siblings = (set && set.length > 0 ? set : [idea]).map((r) => ({
    id: r.id, title: r.title, rank: r.rank,
    flag: r.id === idea.id ? flag : flagFor(r.registry_id, r.title, flagOf, newIds, week, pageMonth(r.registry_id), month),
  }))

  const page: IdeaPage = {
    id: idea.id,
    rank: idea.rank,
    registryId: id0,
    title: idea.title,
    label,
    cover: idea.cover.text,
    medical: printsMedicalLine(clientId),
    week: ideasWeek,
    read: windows?.ideas?.themes && readN != null && readN > 0 ? { k: windows.ideas.themes.get(id0) ?? 0, n: readN } : null,
    month: ideaMonth(id0),
    weeks: ideaWeeks(ideasWeek.read, windows?.ideas?.weeks, id0),
    platforms: platformsOf(windows?.ideas?.mix, id0),
    flag,
    format: recipe(idea.format, idea.format_multiple, 'format'),
    opening: recipe(idea.opening, idea.opening_multiple, 'opening'),
    length: idea.cover.length ?? null,
    asked: idea.cover.asked ?? null,
    subquestions: subquestionCards({
      idea,
      rows: comments,
      translations: translations ?? new Map(),
      video: (cid) => ctx?.forComment(cid) ?? null,
      gate: gateFor(clientId, { allowOwn: true, claim: idea.title }),
      open: sub,
    }),
    groups: groupsByConversation(personas ?? []).get(id0) ?? [],
    own: ownTouch([label ?? idea.title], touchPosts(ownedRead, month.month, week?.to ?? now.toISOString()), since),
    words: wordsToBorrow(words ?? []),
    videos: marketVideoCards(videos ?? [], typicalRate(playbook)),
    typicalWords: monthWords(ideasWeek.month),
    askHref: agentHref(`Draft an outline for a post that answers this question from my market: ${idea.title}`),
    conversationHref: conversationHref(id0),
    older: ideasWeek.current ? null : newest?.run_id === idea.run_id ? olderIdeasLine(ideasWeek) : earlierIdeaLine(ideasWeek, newest != null),
  }
  return { state: 'ready', page, crumbs: ideaCrumbs(page, siblings, ideasWeek) }
}
