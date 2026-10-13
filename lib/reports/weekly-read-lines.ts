import { fmtInt } from '../format'
import { surface, type NavKey } from '../nav'
import type { TopContent } from '../pages/v2/content'
import type { TopMoves } from '../pages/v2/moves'
import type { TopProducts } from '../pages/v2/products'
import type { TopVoices } from '../pages/v2/voices'
import { streakLabel, UNTITLED_ADVICE } from '../pages/v2/advice-words'
import { scrubProse, type ProseSlot } from '../prose/scrub'

// "Across your pages": the level-1 weekly email's one line per page (depth
// v2, T11b; board E7). PURE and small on purpose: each page's line is that
// page's Dashboard tile, said in a line. The build (lib/reports/weekly-read-
// lines-load.ts) calls the same `top<Page>()` reader the Dashboard calls
// (`topVoices`, `topProducts`, `topContent`, `topMoves`; Phase 4 fix round),
// and each function here turns one tile's data into its line: the same item,
// the same panel, the same figures and the same month words. So the email can
// never name a group, a product, an idea or a piece of advice the page does
// not lead with, or count it on another base (the review found both: products
// ranked without the client's audience, advice unfolded by its vectors).
//
// THE LINES ARE FROZEN INTO THE SNAPSHOT, NOT THE WEEK'S READ: post ideas are
// written after the read (`write-post-ideas` follows `write-week-read`), and
// the snapshot is built after the run, when every page's top exists.
//
// A LINE WHOSE PAGE HAS NOTHING IS DROPPED, never printed empty (§0a.2): a
// tile in an empty, failed or switched-off state gives no line (Your products
// not switched on, `PRODUCT_READINGS_ENABLED`; post ideas not switched on,
// `POST_IDEAS_ENABLED`). Decision 1 holds: a week's figure is printed beside
// its month, or not at all.
//
// TWO PLACES THE LINE IS STRICTER THAN THE TILE, and only ever by leaving
// itself out: a post idea's title goes through the written read's scrub (no
// digit the model typed, no direction word, no talk about the method), so a
// title the scrub empties drops the line; and an idea from an older week
// (the tile prints it under a line saying so) gives no line, because the
// email is about this week.

/** The pages a line can be about, in the board's order. */
export const LINE_PAGES = ['voices', 'products', 'content', 'moves'] as const satisfies readonly NavKey[]
export type LinePage = (typeof LINE_PAGES)[number]

/** How a line's name is marked for the copy contract: a model's words stored
 *  elsewhere name their slot; a post idea's title, scrubbed at build, is
 *  `prose`; a product's name is the client's own, and an untitled advice's
 *  words are the page's, and both are plain. */
export type LineNameCopy =
  | { kind: 'stored' | 'subject'; slot: ProseSlot }
  | { kind: 'prose' }
  | { kind: 'plain' }

export interface WeeklyReadLine {
  page: LinePage
  /** The page's name, as the sidebar prints it ("Your products"). */
  label: string
  /** Where the line opens: an app path, the tile's own link (the page's
   *  open panel). */
  href: string
  /** Code's words before the name ("Post next:"). */
  lead: string
  /** What the line is about: a group, a product, an idea, a piece of advice. */
  name: string
  copy: LineNameCopy
  /** Code's figure under it, or null. */
  figure: string | null
}

/** Each page's tile data, as the Dashboard reads it. */
export interface LineTops {
  voices?: TopVoices | null
  products?: TopProducts | null
  content?: TopContent | null
  moves?: TopMoves | null
}

const plural = (n: number, one: string, many: string) => `${fmtInt(n)} ${n === 1 ? one : many}`

/** "in October so far", whichever way a tile's month words arrive (the
 *  products tile's own rule). */
const inWords = (m: string): string => (/^in\s/i.test(m.trim()) ? m.trim() : `in ${m.trim()}`)

/** Voices: the group in the most videos this month, as the Voices tile leads
 *  ("In the most videos in October so far", 86 of 318 videos). */
export function voicesLine(top: TopVoices | null | undefined): WeeklyReadLine | null {
  const g = top?.group
  if (!top || !g || top.groupsState === 'unread' || !g.name.trim() || g.videos <= 0) return null
  return {
    page: 'voices', label: surface('voices').label, href: g.href,
    lead: `In the most videos in ${top.monthWords}:`, name: g.name.trim(), copy: { kind: 'subject', slot: 'pass_e_persona' },
    figure: top.videos ? `${fmtInt(g.videos)} of ${plural(top.videos, 'video', 'videos')}` : plural(g.videos, 'video', 'videos'),
  }
}

/** Your products: the tile's standout (a product's first month with videos,
 *  else the product, else the category, named in the most videos, on the
 *  page's own basis, `marketProductMonth`), under the tile's own label. None
 *  where the tile has no standout: no catalogue, not switched on, not read,
 *  failed or quiet. */
export function productsLine(top: TopProducts | null | undefined): WeeklyReadLine | null {
  const s = top?.state === 'ready' ? top.standout : null
  if (!top || !s || top.note === 'failed' || !s.name.trim() || s.k <= 0) return null
  const month = top.monthWords ? ` ${inWords(top.monthWords)}` : ''
  return {
    page: 'products', label: surface('products').label, href: s.href,
    lead: `${s.label}:`, name: s.name.trim(), copy: { kind: 'plain' },
    figure: s.n != null && s.n > 0 ? `${fmtInt(s.k)} of ${plural(s.n, 'video', 'videos')}${month}` : `${plural(s.k, 'video', 'videos')}${month}`,
  }
}

/** Content: this week's first post idea, its week beside its month as the
 *  tile counts them. */
export function contentLine(top: TopContent | null | undefined): WeeklyReadLine | null {
  const idea = top?.state === 'ready' ? top.idea : null
  if (!top || !idea || !idea.ideasWeek.current) return null
  const title = scrubProse('week_read', idea.title).text.trim()
  if (!title) return null
  const month = idea.month ? `${fmtInt(idea.month.k)} of ${fmtInt(idea.month.n)} ${idea.monthWords}` : null
  // The week only beside its month (decision 1); the month alone where the
  // week was not read, as the tile prints it.
  const figure = idea.week && month
    ? `${fmtInt(idea.week.k)} of ${plural(idea.week.n, 'video', 'videos')} this week · ${month}`
    : idea.month ? `${fmtInt(idea.month.k)} of ${plural(idea.month.n, 'video', 'videos')} ${idea.monthWords}` : null
  return {
    page: 'content', label: surface('content').label, href: top.href,
    lead: 'Post next:', name: title, copy: { kind: 'prose' }, figure,
  }
}

/** Your moves: the first piece of advice waiting for a decision, and the
 *  updates that raised it, as the tile prints them. */
export function movesLine(top: TopMoves | null | undefined): WeeklyReadLine | null {
  const a = top?.advice
  if (!a || !a.title.trim()) return null
  const h = a.history
  const streak = h.streak > 0 ? h.streak : h.dates.length
  return {
    page: 'moves', label: surface('moves').label, href: a.href,
    lead: 'Advice waiting:', name: a.title.trim(),
    copy: a.title === UNTITLED_ADVICE ? { kind: 'plain' } : { kind: 'stored', slot: 'pass_d_b_recommendation' },
    figure: streak > 0 ? `${fmtInt(streak)} ${streakLabel(h)}` : null,
  }
}

/** The level-1 email's lines, one per page that has something, in the
 *  board's order. Pure. */
export function weeklyReadLines(tops: LineTops): WeeklyReadLine[] {
  return [voicesLine(tops.voices), productsLine(tops.products), contentLine(tops.content), movesLine(tops.moves)]
    .filter((l): l is WeeklyReadLine => l != null)
}
