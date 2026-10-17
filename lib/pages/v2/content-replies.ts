import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk, UUID_IN_CHUNK } from '../../chunk'
import type { EngageUnder } from '../../engage'
import { longMonth, platformLabel, shortDate } from '../../format'
import { nextMonth } from '../../reading/month-key'
import { ownedPosts } from '../../reading/owned'
import type { Scope } from '../../renderables/types'
import { weekReadDates } from '../../reports/weekly-read'
import type { Crumb } from '../crumbs'
import { buildReplies, type ReplyRow } from '../week'
import {
  agentHref, parseContentParams, readBrand, repliesView, repliesWindowOf, REPLIES_NO_WEEK, soft,
  type ContentPeriod, type ContentWeek, type DaysWindow, type RepliesView,
} from './content'
import { contentRepliesHref, REPLY_SECTIONS, type ReplySection } from './content-address'
import {
  contentCrumb, elsewhereIdeas, elsewhereIdeasLine, POSTS_PAGE, postsLine, readAnchor, readElsewhereFigures, type Elsewhere,
} from './content-levels'

// THE COMMENTS WORTH A REPLY, THE EVIDENCE (depth as pages, 17 Oct; boards
// G5-Content-Replies and -Replies-Phone). Its own address,
// `/dashboard/content/replies`, which keeps the root's `?period=month`; the
// root card's "Open the replies" lands here, and an old `?replies=1` or
// `?reply=<intent>` redirects here (lib/nav.ts `contentRedirect`), the intent
// its section's anchor. `#worth-a-reply` stays on the root's card.
//
// TODAY'S LIST, NOT A LONGER ONE (the board report's decision 3): the digest
// the root card counts (`buildReplies`: the quote gate, three of a kind,
// twelve in all, two from one video), so the card and the page count one
// list. A CAP, never a level: no "of N" and no month beside it (decision 6).
// Nothing here can see whether you replied, so a comment stays on the list.
//
// Top to bottom: the flat header (a reply arrow on the neutral, "Comments",
// "Worth a reply", the days and the counts in mono, the period switch), the
// one-line read and the chips by kind; then the comments grouped by kind,
// each under the video it was written on, with the reply link (none on wrong
// information), beside the facts and how the list is picked; elsewhere on
// Content; the Agent.

/** The four kinds, in the page's order: the intent each lists, its title and
 *  what it holds. */
export const REPLY_KINDS: readonly { key: ReplySection; intent: string; title: string; sub: string; chip: string }[] = [
  { key: 'buy', intent: 'buying', title: 'Ready to buy', chip: 'Ready to buy', sub: 'They say they want one, ask where to try it, or ask what it would cost them.' },
  { key: 'questions', intent: 'question', title: 'Questions', chip: 'Questions', sub: 'Something asked that you can answer.' },
  { key: 'objections', intent: 'objection', title: 'Objections', chip: 'Objections', sub: 'A reason given for not buying, or a complaint about wear or cost.' },
  { key: 'wrong', intent: 'misinformation', title: 'Wrong information, for awareness', chip: 'Wrong information', sub: 'Read as getting something about your market wrong. They carry no reply link: an answer under someone else’s post starts an argument.' },
]

/** A kind's video cards on a phone before "Show all … in {kind}". */
export const REPLY_VIDEOS_PHONE = 2

export interface ReplyCommentView {
  ref: string
  /** The commenter's words, resolved at render (the queue's own quote). */
  text: string
  lang: string | null
  english: string | null
  /** "9 Oct". */
  date: string | null
  likes: number | null
  /** Why it surfaced: the insight's theme, humanised (the queue's `reason`). */
  reason: string
}

/** A video in a kind, with the comments in that kind written under it. */
export interface ReplyVideoView {
  key: string
  /** `videos.id`, where its row was read. */
  id: string | null
  /** The poster (`account_name`). */
  account: string | null
  /** "Instagram". */
  platform: string
  /** "posted 7 Oct" (`upload_date`). */
  posted: string | null
  caption: string | null
  under: EngageUnder | null
  /** Where a reply lands (the first comment's; none on wrong information). */
  href: string | null
  hrefLabel: string | null
  comments: ReplyCommentView[]
}

export interface ReplyKindView {
  key: ReplySection
  title: string
  sub: string
  chip: string
  comments: number
  videos: ReplyVideoView[]
  /** Listed in full on a phone (`?kind=`). */
  full: boolean
  /** "Show all {n} in {kind}" on a phone, where more than two videos. */
  moreHref: string | null
}

export interface RepliesPageData {
  brand: string
  period: ContentPeriod
  view: RepliesView
  /** "5 to 11 October", "October so far"; null where no update has covered
   *  a week. */
  dates: string | null
  /** A seven-day week. */
  isWeek: boolean
  kinds: ReplyKindView[]
  /** The comments by platform, the most first. */
  platforms: { platform: string; comments: number }[]
  /** The one-line read under the title block. */
  lead: string
  crumbs: Crumb[]
  elsewhere: Elsewhere
  askHref: string
}

/** The video a reply sits under, as read. */
export interface ReplyVideoRow {
  id: string
  platform: string
  video_url: string | null
  account_name: string | null
  caption: string | null
  upload_date: string | null
}

/** `?kind=`: a kind the page lists, or null. Pure. */
export function kindParam(raw: string | string[] | undefined): ReplySection | null {
  const v = (Array.isArray(raw) ? raw[0] : raw)?.trim()
  return (REPLY_SECTIONS as readonly string[]).includes(v ?? '') ? (v as ReplySection) : null
}

/** "Reply on YouTube" where a reply lands on the comment itself, else "Open
 *  the post on {Platform}". */
export const replyLinkLabel = (platform: string): string => (platform === 'youtube' ? 'Reply on YouTube' : `Open the post on ${platformLabel(platform)}`)

/**
 * THE LIST GROUPED AS THE PAGE DRAWS IT: each kind's comments in the queue's
 * own order, gathered under the video each was written on (in the order a
 * video first appears), the video's row where it was read. A comment whose
 * video was not read stands under a card of its own, named by its platform.
 * Pure.
 */
export function replyKinds(view: Pick<RepliesView, 'rows' | 'flagged'>, videos: ReadonlyMap<string, ReplyVideoRow>, opts: { period: ContentPeriod; kind: ReplySection | null }): ReplyKindView[] {
  return REPLY_KINDS.map((k) => {
    const rows = k.intent === 'misinformation' ? view.flagged : view.rows.filter((r) => r.intent === k.intent)
    const groups = new Map<string, ReplyVideoView>()
    for (const r of rows) {
      const key = r.videoRowId ?? `row:${r.id}`
      const v = r.videoRowId ? videos.get(r.videoRowId) ?? null : null
      const held = groups.get(key) ?? {
        key,
        id: v?.id ?? null,
        account: v?.account_name?.trim() || null,
        platform: platformLabel(v?.platform ?? r.platform),
        posted: v?.upload_date ? shortDate(`${v.upload_date.slice(0, 10)}T12:00:00.000Z`) : null,
        caption: v?.caption?.replace(/\s+/g, ' ').trim() || null,
        under: r.under ?? null,
        href: k.intent === 'misinformation' ? null : r.href,
        hrefLabel: k.intent === 'misinformation' || !r.href ? null : replyLinkLabel(v?.platform ?? r.platform),
        comments: [],
      }
      held.comments.push(commentOf(r))
      groups.set(key, held)
    }
    const list = [...groups.values()]
    const full = opts.kind === k.key
    return {
      key: k.key,
      title: k.title,
      sub: k.sub,
      chip: k.chip,
      comments: rows.length,
      videos: list,
      full,
      moreHref: !full && list.length > REPLY_VIDEOS_PHONE ? contentRepliesHref({ period: opts.period, kind: k.key }) : null,
    }
  })
}

function commentOf(r: ReplyRow): ReplyCommentView {
  return {
    ref: r.quote.ref,
    text: r.quote.text,
    lang: r.quote.lang ?? null,
    english: r.quote.english ?? null,
    date: r.date ? shortDate(r.date) : null,
    likes: r.likes ?? null,
    reason: r.reason,
  }
}

/** The comments by platform, the most first. Pure. */
export function replyPlatforms(view: Pick<RepliesView, 'rows' | 'flagged'>): { platform: string; comments: number }[] {
  const n = new Map<string, number>()
  for (const r of [...view.rows, ...view.flagged]) n.set(r.platform, (n.get(r.platform) ?? 0) + 1)
  return [...n.entries()].map(([platform, comments]) => ({ platform, comments })).sort((a, b) => b.comments - a.comments || a.platform.localeCompare(b.platform))
}

/** "5 to 11 October" for the week, "October so far" (or "September") for the
 *  month; null with no week. Pure. */
export function repliesDates(period: ContentPeriod, week: ContentWeek | null, month: { month: string; complete: boolean }): string | null {
  if (period === 'month') return month.complete ? longMonth(month.month) : `${longMonth(month.month)} so far`
  return week ? weekReadDates({ from: week.from, to: week.to }) || null : null
}

/** The one-line read under the title block, in code's words. Pure. */
export function repliesLead(period: ContentPeriod, window: DaysWindow | null, isWeek: boolean): string {
  const from = period === 'month' && window ? `Comments from ${window.phrase.replace(/^in /, '')}` : isWeek ? 'Comments from these seven days' : 'Comments from these days'
  return `${from} that ask you something, push back, or say they want to buy, each under the video it was written on.`
}

/** The videos the list's comments sit under, the tenant's own, one read. */
async function readReplyVideos(db: SupabaseClient, clientId: string, ids: readonly string[]): Promise<ReplyVideoRow[]> {
  if (ids.length === 0) return []
  const parts = await Promise.all(chunk([...ids], UUID_IN_CHUNK).map(async (part) => {
    const res = await db.from('videos').select('id, platform, video_url, account_name, caption, upload_date').eq('client_id', clientId).in('id', part)
    if (res.error) throw new Error(`content.replyVideos: ${res.error.message}`)
    return (res.data ?? []) as ReplyVideoRow[]
  }))
  return parts.flat()
}

/**
 * The reply list's page. `scope.params` carries `?period=` and `?kind=`.
 * Reads the root's anchor (its week and month, and the ideas the foot names),
 * the brand, the queue (`buildReplies`, the root card's own), the videos its
 * comments sit under, your posts this month (the foot's count) and the ideas'
 * figures (the foot's).
 */
export async function loadContentReplies(scope: Scope, opts: { now?: Date } = {}): Promise<RepliesPageData> {
  const db = scope.supabase as SupabaseClient
  const { clientId } = scope
  const now = opts.now ?? new Date()
  const { period } = parseContentParams(scope.params)
  const kind = kindParam(scope.params.kind)
  const anchor = await readAnchor(db, scope.reading.client, clientId, now)
  const { week, month } = anchor
  const window = repliesWindowOf(period, week, month)

  const [brand, replies, owned, figures] = await Promise.all([
    soft('replies.brand', readBrand(db, clientId)),
    window
      ? soft('replies.list', buildReplies({ supabase: db, clientId, runId: week?.runId ?? '', window: { from: window.from, to: window.to, basis: 'content' }, videos: Promise.resolve([]), gate: true }))
      : Promise.resolve(null),
    soft('replies.owned', ownedPosts({ supabase: db, clientId }, { from: month.month, to: nextMonth(month.month) })),
    soft('replies.elsewhere', readElsewhereFigures(scope, anchor)),
  ])
  const view = window ? repliesView(replies, window) : { ...repliesView(null, null), unread: REPLIES_NO_WEEK }
  const videoIds = [...new Set([...view.rows, ...view.flagged].map((r) => r.videoRowId).filter((x): x is string => Boolean(x)))]
  const videos = await soft('replies.videos', readReplyVideos(db, clientId, videoIds))

  return {
    brand: brand ?? 'You',
    period,
    view,
    dates: repliesDates(period, week, month),
    isWeek: week?.isWeek ?? false,
    kinds: replyKinds(view, new Map((videos ?? []).map((v) => [v.id, v])), { period, kind }),
    platforms: replyPlatforms(view),
    lead: repliesLead(period, window, week?.isWeek ?? false),
    crumbs: [contentCrumb(), { label: 'Worth a reply', href: null }],
    elsewhere: {
      ideas: elsewhereIdeas(anchor, figures ?? null),
      ideasLine: elsewhereIdeasLine(anchor.ideasState),
      page: { ...POSTS_PAGE, line: postsLine(owned ? owned.total : null, month) },
    },
    askHref: agentHref(`What do people want from us in the comments worth a reply ${window?.phrase ?? 'this week'}, and how should we answer them?`),
  }
}

