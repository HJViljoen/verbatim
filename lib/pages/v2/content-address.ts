import { CONTENT_POSTS_PATH, CONTENT_REPLIES_PATH, CONTENT_ROOT_PARAMS, contentRedirect, surface, withQuery, type SearchParams } from '../../nav'

// CONTENT'S ADDRESSES (depth as pages, 17 Oct; the G5 boards). Content is a
// root page and three kinds of page under it, each its own address, written
// once here (and the two `redirectFor` needs, in lib/nav.ts):
//
//   /dashboard/content                  the root (`?period=`, `?asked=all`)
//   /dashboard/content/ideas/<id>       a post idea, a HUB, by `post_ideas.id`
//                                       (`?sub=<n>`: that sub-question's
//                                       comments in full)
//   /dashboard/content/replies          the comments worth a reply, EVIDENCE
//                                       (`?period=month`; `?kind=<section>`
//                                       lists a section in full on a phone)
//   /dashboard/content/posts            your own posts this month, EVIDENCE
//                                       (`?all=1`: every post; `?post=<id>`:
//                                       one post's comments in full)
//
// An idea is addressed by its row id, never its rank: rank 1 is a new idea
// every week, and a link in an email has to keep resolving (the board
// report's decision 2). A client-safe module: plain strings, no reads.

/** The root. */
export const CONTENT_ROOT = surface('content').href

export { CONTENT_POSTS_PATH, CONTENT_REPLIES_PATH }

/** A post idea's page. */
export const contentIdeaPath = (id: string): string => `${CONTENT_ROOT}/ideas/${encodeURIComponent(id)}`

/** A post idea's page with one sub-question's comments open (`?sub=<n>`,
 *  its place on the page from 1), landing on its card. */
export function contentIdeaHref(id: string, opts: { sub?: number | null } = {}): string {
  const base = contentIdeaPath(id)
  return opts.sub != null ? `${base}?sub=${opts.sub}#${subAnchor(opts.sub)}` : base
}

/** A sub-question's card anchor on the idea's page. */
export const subAnchor = (n: number): string => `sub-${n}`

/** The reply list's sections, in the page's order: the anchor each one
 *  carries and an old tab's intent lands on (`REPLY_SECTION_ANCHORS`). */
export const REPLY_SECTIONS = ['buy', 'questions', 'objections', 'wrong'] as const
export type ReplySection = (typeof REPLY_SECTIONS)[number]

/** The reply list's page, the period kept where it is not the week; a
 *  section listed in full on a phone (`?kind=`), landing on it. */
export function contentRepliesHref(opts: { period?: 'week' | 'month'; kind?: ReplySection | null } = {}): string {
  const q = new URLSearchParams()
  if (opts.period === 'month') q.set('period', 'month')
  if (opts.kind) q.set('kind', opts.kind)
  const qs = q.toString()
  return `${CONTENT_REPLIES_PATH}${qs ? `?${qs}` : ''}${opts.kind ? `#${opts.kind}` : ''}`
}

/** Your posts' page: every post with `all`; one post's comments open with
 *  `post` (landing on its card). */
export function contentPostsHref(opts: { all?: boolean; post?: string | null } = {}): string {
  const q = new URLSearchParams()
  if (opts.all) q.set('all', '1')
  if (opts.post) q.set('post', opts.post)
  const qs = q.toString()
  return `${CONTENT_POSTS_PATH}${qs ? `?${qs}` : ''}${opts.post ? `#${postAnchor(opts.post)}` : opts.all ? '#posted' : ''}`
}

/** A post's card anchor on your posts' page. */
export const postAnchor = (id: string): string => `post-${id}`

/** "What works in your market's videos" on the root, where your posts' page
 *  sends a reader for the market's formats. */
export const WORKS_ANCHOR = 'what-works'

/** Whether a path is one of Content's pages, for the redirect table's "an
 *  address something serves". */
export function isContentPage(path: string): boolean {
  return path === CONTENT_ROOT || path === CONTENT_REPLIES_PATH || path === CONTENT_POSTS_PATH
    || /^\/dashboard\/content\/ideas\/[^/]+$/.test(path)
}

// ---- an old `?idea=<rank>` -------------------------------------------------------

/** The rank an old link names (`?idea=1` to `3`), or null. */
export function ideaRankParam(params: SearchParams): 1 | 2 | 3 | null {
  const raw = Array.isArray(params.idea) ? params.idea[0] : params.idea
  const n = raw?.trim()
  return n === '1' ? 1 : n === '2' ? 2 : n === '3' ? 3 : null
}

/** These params without the named keys, every other value kept as it came. */
function dropKeys(params: SearchParams, drop: readonly string[]): SearchParams {
  const out: SearchParams = {}
  for (const [k, v] of Object.entries(params)) if (!drop.includes(k)) out[k] = v
  return out
}

/**
 * WHERE AN OLD `?idea=<rank>` LANDS: that rank's idea in the set the root
 * shows now (the anchor set: the newest run's ideas, unless they are too old
 * to print), on its page, the root's own params dropped and any other kept;
 * where the set holds no idea at that rank (none written, switched off, too
 * old, or a set of fewer), the root itself, the rank dropped, or wherever the
 * rest of the link points (`contentRedirect`). Never a second hop. A rank is a
 * week's, so this landing changes from week to week: the page sends it with
 * Next's temporary redirect, as every redirect in this app is sent. Pure.
 */
export function ideaLanding(params: SearchParams, set: readonly { rank: number; id: string }[] | null): string {
  const rank = ideaRankParam(params)
  const idea = rank != null ? set?.find((i) => i.rank === rank) ?? null : null
  if (idea) return withQuery(contentIdeaPath(idea.id), dropKeys(params, [...CONTENT_ROOT_PARAMS, 'period']))
  const rest = dropKeys(params, ['idea'])
  return contentRedirect(rest) ?? withQuery(CONTENT_ROOT, rest)
}
