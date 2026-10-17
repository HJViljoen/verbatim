import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk } from '../../chunk'
import { fmtInt, longMonth, platformLabel, shortDate } from '../../format'
import { pickEligible, type GateOptions, type QuoteVideo } from '../../quote-gate'
import { gateFor } from '../../quote-context'
import { readTranslations } from '../../quotes'
import { nextMonth } from '../../reading/month-key'
import { ownedPosts, type OwnedPost, type OwnedPosts } from '../../reading/owned'
import { quoteRef } from '../../renderables/quotes-freeze'
import { printsMedicalLine } from '../../post-ideas/medical'
import type { Scope } from '../../renderables/types'
import { selectAll } from '../../supabase-admin'
import type { Crumb } from '../crumbs'
import { accountKey } from '../overview-market/voices'
import { buildPlaybook, loadPlaybookVideos } from '../playbook'
import {
  agentHref, formatLabel, mixSentence, monthWords, openingLabel, postRow, postsBlock, soft, typicalRate, worksRows,
  type ContentMonth, type PostsBlock, type SentencePart,
} from './content'
import { contentPostsHref, postAnchor } from './content-address'
import {
  contentCrumb, elsewhereIdeas, elsewhereIdeasLine, readAnchor, readElsewhereFigures, REPLIES_PAGE, repliesLine, type Elsewhere,
} from './content-levels'

// YOUR POSTS, THE EVIDENCE (depth as pages, 17 Oct; boards G5-Content-Posts
// and -Posts-Phone; the board report's own addition, approved): the root
// card's "All your posts" opened in place, and nothing may open in place. Its
// own address, `/dashboard/content/posts`, with no period switch: it reads the
// month the root's card reads (`contentMonth` over the root's anchor). An old
// `?posts=1` redirects here (lib/nav.ts `contentRedirect`).
//
// Top to bottom: the flat header (a person on the neutral, "Your own
// accounts", "Your posts", the month and the counts in mono); code's sentence
// about your mix as the lead (`mixSentence`, its formats half); your posts
// newest first, each with its format, opening, response and what was said
// under it, five (three on a phone) then "Show {n} more posts"; beside them
// the facts (how they were made, how they open, where, response); elsewhere on
// Content; the Agent.
//
// THE COMMENTS ARE THOSE UNDER EACH POST (`comments` on its platform and its
// own id), the post's own account's replies left out, through the quote gate
// with comments under your own posts allowed (your posts' comments are the
// basis here, as on Your products), their words resolved at render, never
// stored. One chunked read for the posts shown.

/** Posts listed before "Show more" (from 640, and on a phone). */
export const POSTS_SHOWN = 5
export const POSTS_SHOWN_PHONE = 3
/** At most this many with `?all=1`. */
export const POSTS_MAX = 60
/** A post's comments on its card, and opened (`?post=`). */
export const POST_QUOTES = 2
export const POST_COMMENTS_MAX = 50

export interface PostComment {
  ref: string
  text: string
  lang: string | null
  english: string | null
  /** "10 Oct". */
  date: string | null
}

export interface PostCard {
  /** `videos.id`: its card's anchor and its `?post=`. */
  id: string
  account: string | null
  /** "Instagram". */
  platform: string
  /** "10 Oct". */
  posted: string
  caption: string | null
  format: string | null
  opening: string | null
  multiple: number | null
  url: string | null
  /** The month's best response (the root card's "Best this month"). */
  best: boolean
  /** The comments under it the page holds (its own account's replies left
   *  out), and the platform's own count where it is more. Null where the
   *  comments could not be read. */
  held: number | null
  onPlatform: number | null
  /** Whether the post's own account replied under it: those replies are
   *  left out by rule, so the card names them beside the platform's count
   *  (they are part of the gap, never a comment we failed to gather). */
  ownLeftOut: boolean
  /** Two of them, or, opened, every one that may print (at most
   *  `POST_COMMENTS_MAX`). */
  quotes: PostComment[]
  /** How many of them may print, uncapped. */
  quotable: number
  open: boolean
  href: string
}

/** A count by a kind of post: its label and posts, the most first. */
export interface KindCount {
  key: string
  label: string
  posts: number
}

export interface PostsPageData {
  month: Pick<ContentMonth, 'month' | 'complete'>
  /** The root card's block: totals, platforms, the typical response, the
   *  best post, or why it could not be read. */
  block: PostsBlock
  /** Code's sentence about your mix (its formats half), every number a
   *  figure; null where it could not be written. */
  lead: SentencePart[] | null
  cards: PostCard[]
  /** Posts the page does not list yet, from 640 and on a phone. */
  more: { href: string; desktop: number; phone: number } | null
  all: boolean
  /** With `?all=1`, how many it lists where that is fewer than all. */
  capped: number | null
  formats: KindCount[]
  openings: KindCount[]
  /** Posts with no format, or no opening, read yet. */
  unread: { format: number; opening: number }
  commentsUnread: boolean
  crumbs: Crumb[]
  elsewhere: Elsewhere
  askHref: string
}

/** A comment under one of your posts, as read. */
export interface PostCommentRow {
  id: string
  text: string | null
  platform: string
  comment_date: string | null
  video_id: string
  author: string | null
}

/** `?post=`: one of the month's own posts by its row id, or null (a foreign,
 *  a non-member or a malformed id names nothing). Pure. */
export function postParam(raw: string | string[] | undefined, posts: readonly { id: string }[]): string | null {
  const v = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase() ?? ''
  return v && posts.some((p) => p.id === v) ? v : null
}

/** Which posts the page lists: the first `POSTS_SHOWN`, every one with
 *  `all` (at most `POSTS_MAX`), and the one `?post=` opens wherever it falls.
 *  Pure. */
export function shownPosts(posts: readonly OwnedPost[], opts: { all: boolean; open: string | null }): OwnedPost[] {
  const base = posts.slice(0, opts.all ? POSTS_MAX : POSTS_SHOWN)
  return opts.open && !base.some((p) => p.id === opts.open) ? posts.filter((p) => base.includes(p) || p.id === opts.open) : base
}

/** Your posts by a classifier's value, the most first; the posts it has not
 *  read are counted apart. Pure. */
export function kindCounts(posts: readonly OwnedPost[], key: 'classified_type' | 'hook_style', label: (k: string) => string): { rows: KindCount[]; unread: number } {
  const n = new Map<string, number>()
  let unread = 0
  for (const p of posts) {
    const k = p[key]
    if (!k) { unread += 1; continue }
    n.set(k, (n.get(k) ?? 0) + 1)
  }
  return {
    rows: [...n.entries()].map(([k, posts]) => ({ key: k, label: label(k), posts })).sort((a, b) => b.posts - a.posts || a.label.localeCompare(b.label)),
    unread,
  }
}

/** The video a comment sits under, as the quote gate reads it: the post's own
 *  row (`segment` null, as Market's conversation page builds it). */
const gateVideoOf = (p: OwnedPost): QuoteVideo => ({
  platform: p.platform, videoId: p.video_id, caption: p.caption, hashtags: null, topics: p.topics,
  accountName: p.account_name, isClient: p.is_client, isCompetitor: p.is_competitor, competitorName: p.competitor_name,
  source: p.source, segment: null,
})

/**
 * The posts as the page draws them, newest first: each its format, opening
 * and response (`postRow`, the root's), the month's best marked, its comments
 * (those under it on its platform, its own account's replies left out) and
 * the ones that may print through the gate: two, or opened every one. Pure.
 */
export function postCards(a: {
  posts: readonly OwnedPost[]
  typical: number | null
  best: string | null
  comments: readonly PostCommentRow[] | null
  translations: Map<string, { lang: string; english: string | null }>
  gate: GateOptions
  open: string | null
  all: boolean
}): PostCard[] {
  const reading = (t: string) => a.translations.get(t) ?? null
  return a.posts.map((p) => {
    const row = postRow(p, a.typical)
    const own = accountKey(p.account_name)
    const onPost = (a.comments ?? [])
      .filter((c) => c.platform === p.platform && c.video_id === p.video_id && (c.text ?? '').trim())
    const under = onPost
      .filter((c) => !own || accountKey(c.author) !== own)
      .sort((x, y) => (y.comment_date ?? '').localeCompare(x.comment_date ?? '') || x.id.localeCompare(y.id))
    const video = gateVideoOf(p)
    const view = (c: PostCommentRow) => {
      const tr = reading(c.text ?? '')
      return { text: c.text ?? '', lang: tr?.lang ?? null, english: tr?.english ?? null, video }
    }
    // A post is one thread: every comment under it may print.
    const every = pickEligible(under, view, under.length, { ...a.gate, perThread: Math.max(1, under.length) })
    const open = a.open === p.id
    const shown = open ? every.slice(0, POST_COMMENTS_MAX) : every.slice(0, POST_QUOTES)
    const held = a.comments ? under.length : null
    const platformCount = Number.isFinite(p.comments_count) ? p.comments_count : null
    return {
      id: p.id,
      account: p.account_name?.trim() || null,
      platform: platformLabel(p.platform),
      posted: shortDate(`${p.upload_date}T12:00:00.000Z`),
      caption: p.caption?.replace(/\s+/g, ' ').trim() || null,
      format: row.format,
      opening: row.opening,
      multiple: row.multiple,
      url: row.url,
      best: a.best === p.id,
      held,
      onPlatform: held != null && platformCount != null && platformCount > held ? platformCount : null,
      ownLeftOut: held != null && under.length < onPost.length,
      quotes: shown.map((c) => {
        const tr = reading(c.text ?? '')
        return { ref: quoteRef.message(c.id), text: (c.text ?? '').trim(), lang: tr?.lang ?? null, english: tr?.english ?? null, date: c.comment_date ? shortDate(c.comment_date) : null }
      }),
      quotable: every.length,
      open,
      href: open ? contentPostsHref({ all: a.all }).replace(/#.*$/, '') + `#${postAnchor(p.id)}` : contentPostsHref({ all: a.all, post: p.id }),
    }
  })
}

/** The comments under the posts shown, the tenant's own, by the posts'
 *  platform ids, one read a chunk (each post's held to its platform in
 *  `postCards`). */
async function readPostComments(db: SupabaseClient, clientId: string, posts: readonly OwnedPost[]): Promise<PostCommentRow[]> {
  const ids = [...new Set(posts.map((p) => p.video_id).filter(Boolean))]
  if (ids.length === 0) return []
  const parts = await Promise.all(chunk(ids, 100).map((part) =>
    selectAll<PostCommentRow>(() => db.from('comments').select('id, text, platform, comment_date, video_id, author').eq('client_id', clientId).in('video_id', part).order('id'))))
  return parts.flat()
}

/** "October so far", "September". */
export const monthText = (m: Pick<ContentMonth, 'month' | 'complete'>): string => (m.complete ? longMonth(m.month) : `${longMonth(m.month)} so far`)

/**
 * Your posts' page. `scope.params` carries `?all=1` and `?post=`. Reads the
 * root's anchor (its month, and the ideas the foot names), your posts this
 * month, the month's playbook (the typical video, and the formats' response
 * for the lead), the comments under the posts shown and their English, and
 * the ideas' figures (the foot's).
 */
export async function loadContentPosts(scope: Scope, opts: { now?: Date } = {}): Promise<PostsPageData> {
  const db = scope.supabase as SupabaseClient
  const { clientId } = scope
  const now = opts.now ?? new Date()
  const anchor = await readAnchor(db, scope.reading.client, clientId, now)
  const { month } = anchor
  const all = scope.params.all === '1'

  const [owned, playbook, figures] = await Promise.all([
    soft('posts.owned', ownedPosts({ supabase: db, clientId }, { from: month.month, to: nextMonth(month.month) })),
    soft('posts.playbook', async () => buildPlaybook({ month: month.month, brand: 'You', rival: null, videos: await loadPlaybookVideos(db, clientId, month.month), clientSide: 'owned' })),
    soft('posts.elsewhere', readElsewhereFigures(scope, anchor)),
  ])
  const posts = owned?.posts ?? []
  const open = postParam(scope.params.post, posts)
  const shown = shownPosts(posts, { all, open })
  const comments = shown.length > 0 ? await soft('posts.comments', readPostComments(db, clientId, shown)) : []
  const printable = (comments ?? []).filter((c) => (c.text ?? '').trim())
  const translations = printable.length > 0 ? await soft('posts.translations', readTranslations(db, printable.map((c) => c.text ?? ''))) : null

  const typical = typicalRate(playbook)
  const block = postsBlock({ owned, typical, month })
  const formats = kindCounts(posts, 'classified_type', formatLabel)
  const openings = kindCounts(posts, 'hook_style', openingLabel)
  const desktop = all ? 0 : Math.max(0, posts.length - shown.length)
  const phoneShown = all ? shown.length : shown.filter((p, i) => i < POSTS_SHOWN_PHONE || p.id === open).length
  const phone = Math.max(0, posts.length - phoneShown)
  return {
    month,
    block,
    lead: owned && playbook ? leadOf(playbook, owned, month) : null,
    cards: postCards({ posts: shown, typical, best: block.best?.id ?? null, comments, translations: translations ?? new Map(), gate: gateFor(clientId, { allowOwn: true }), open, all }),
    more: !all && (desktop > 0 || phone > 0) ? { href: contentPostsHref({ all: true }), desktop, phone } : null,
    all,
    capped: all && posts.length > POSTS_MAX ? POSTS_MAX : null,
    formats: formats.rows,
    openings: openings.rows,
    unread: { format: formats.unread, opening: openings.unread },
    commentsUnread: shown.length > 0 && comments === null,
    crumbs: [contentCrumb(), { label: 'Your posts', href: null }],
    elsewhere: {
      ideas: elsewhereIdeas(anchor, figures ?? null),
      medical: printsMedicalLine(clientId),
      ideasLine: elsewhereIdeasLine(anchor.ideasState),
      page: { ...REPLIES_PAGE, line: repliesLine(anchor.week, month) },
    },
    askHref: agentHref(`How did my own posts do ${monthWords(month)}, and what did people say under them?`),
  }
}

/** The lead: code's sentence about your mix, its formats half (what you made
 *  most and how it draws, the kind that draws best), as the root's What
 *  works writes it. Pure. */
export function leadOf(playbook: Parameters<typeof worksRows>[0], owned: OwnedPosts, month: Pick<ContentMonth, 'month' | 'complete'>): SentencePart[] | null {
  const formats = worksRows(playbook, 'formats', formatLabel)
  if (formats.length === 0) return owned.total === 0 ? [`You published nothing of your own ${monthWords(month)}.`] : null
  return mixSentence({ formats, openings: [], posts: owned.total, unclassified: 0, month: month.month, complete: month.complete })
}

/** "9 posts". */
export const postsCount = (n: number): string => `${fmtInt(n)} ${n === 1 ? 'post' : 'posts'}`
