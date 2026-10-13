import { fmtInt, longMonth } from '../format'
import { surface, type NavKey } from '../nav'
import type { ProseSlot } from '../prose/scrub'
import { inMonth } from '../written/month'
import type { WeekReadData } from '../written/types'

// "Across your pages": the level-1 weekly email's one line per page (depth
// v2, T11b; board E7). PURE and small on purpose: each page's line is built
// from that page's "top" (the one thing its first screen leads with), handed
// in by the build (lib/reports/weekly-read-build.ts), which reads what exists
// when the snapshot is made. Wave 2b's `top<Page>()` readers replace those
// reads one for one, and this file does not change.
//
// THE LINES ARE FROZEN INTO THE SNAPSHOT, NOT THE WEEK'S READ: post ideas are
// written after the read (`write-post-ideas` follows `write-week-read`), and
// the snapshot is built after the run, when every page's top exists.
//
// A LINE WHOSE PAGE HAS NOTHING IS DROPPED, never printed empty (§0a.2). And
// decision 1 holds: a week's figure is printed beside its month, or not at all.

/** The pages a line can be about, in the board's order. */
export const LINE_PAGES = ['voices', 'products', 'content', 'moves'] as const satisfies readonly NavKey[]
export type LinePage = (typeof LINE_PAGES)[number]

/** How a line's name is marked for the copy contract: a model's words stored
 *  elsewhere name their slot; a post idea's title, scrubbed at build, is
 *  `prose`; a product's name is the client's own and is plain. */
export type LineNameCopy =
  | { kind: 'stored' | 'subject'; slot: ProseSlot }
  | { kind: 'prose' }
  | { kind: 'plain' }

export interface WeeklyReadLine {
  page: LinePage
  /** The page's name, as the sidebar prints it ("Your products"). */
  label: string
  /** Where the line opens: an app path, the page's open panel. */
  href: string
  /** Code's words before the name ("Post next:"). */
  lead: string
  /** What the line is about: a group, a product, an idea, a piece of advice. */
  name: string
  copy: LineNameCopy
  /** Code's figure under it, or null. */
  figure: string | null
}

// ---- Each page's top, as the build hands it in --------------------------------

/** Voices: the group in the most videos this month (decision 2: a count,
 *  never a share or its change). Not read by the build yet: wave 2b's
 *  `topVoices()` fills it. */
export interface VoicesTop { key: string; name: string; videos: number }

/** Your products: the product named in the most of the market's videos this
 *  month (`month_product_readings`, product rows, every market audience). */
export interface ProductsTop { productId: string; name: string; videos: number }

/** Content: the run's first post idea (`post_ideas`, rank 1). `title` is the
 *  model's, already scrubbed by the build; `registryId` its conversation. */
export interface ContentTop { rank: number; title: string; registryId: string }

/** Your moves: the first undecided piece of advice on the short list. */
export interface MovesTop { lineageId: string; title: string; timesMade: number }

export interface LineInputs {
  /** The reading month, `YYYY-MM-01`. */
  month: string
  /** The week's stored read, for a conversation's week-and-month figure. */
  read: WeekReadData | null
  voices?: VoicesTop | null
  products?: ProductsTop | null
  content?: ContentTop | null
  moves?: MovesTop | null
}

const plural = (n: number, one: string, many: string) => `${fmtInt(n)} ${n === 1 ? one : many}`

const withParam = (page: NavKey, key: string, value: string | number) =>
  `${surface(page).href}?${key}=${encodeURIComponent(String(value))}`

/**
 * A conversation's week beside its month, off the week's own read: "12 videos
 * this week · 31 in October so far". The same measure the read prints its
 * findings in (lenient-gated videos), so the two halves are one count read
 * twice. Null where the read does not hold the conversation.
 */
export function conversationFigure(read: WeekReadData | null, registryId: string): string | null {
  if (!read || !registryId) return null
  const where = inMonth(read.month, read.version === 2 ? read.monthComplete : false)
  const pair = (week: number, month: number) => `${plural(week, 'video', 'videos')} this week · ${fmtInt(month)} ${where}`
  const heard = (read.alsoHeard ?? []).find((h) => h.themeId === registryId)
  if (heard && typeof heard.monthVideos === 'number') return pair(heard.videos, heard.monthVideos)
  if (read.version === 2) {
    const fresh = (read.newThisWeek ?? []).find((x) => x.themeId === registryId)
    if (fresh) return pair(fresh.videos.week, fresh.videos.month)
  }
  const finding = (read.findings ?? []).find((f) => f.basedOn.length === 1 && f.basedOn[0] === registryId)
  return finding ? pair(finding.videos.week, finding.videos.month) : null
}

/** The level-1 email's lines, one per page that has something, in the
 *  board's order. Pure. */
export function weeklyReadLines(input: LineInputs): WeeklyReadLine[] {
  const month = longMonth(input.month)
  const out: WeeklyReadLine[] = []
  const v = input.voices
  if (v && v.name.trim() && v.videos > 0) {
    out.push({
      page: 'voices', label: surface('voices').label, href: withParam('voices', 'group', v.key),
      lead: `In the most videos in ${month}:`, name: v.name.trim(), copy: { kind: 'subject', slot: 'pass_e_persona' },
      figure: plural(v.videos, 'video', 'videos'),
    })
  }
  const p = input.products
  if (p && p.name.trim() && p.videos > 0) {
    out.push({
      page: 'products', label: surface('products').label, href: withParam('products', 'product', p.productId),
      lead: `Named most in ${month}:`, name: p.name.trim(), copy: { kind: 'plain' },
      figure: plural(p.videos, 'video', 'videos'),
    })
  }
  const c = input.content
  if (c && c.title.trim()) {
    out.push({
      page: 'content', label: surface('content').label, href: withParam('content', 'idea', c.rank),
      lead: 'Post next:', name: c.title.trim(), copy: { kind: 'prose' },
      figure: conversationFigure(input.read, c.registryId),
    })
  }
  const m = input.moves
  if (m && m.title.trim()) {
    out.push({
      page: 'moves', label: surface('moves').label, href: withParam('moves', 'advice', m.lineageId),
      lead: 'Advice waiting:', name: m.title.trim(), copy: { kind: 'stored', slot: 'pass_d_b_recommendation' },
      figure: m.timesMade > 1 ? `raised in ${plural(m.timesMade, 'update', 'updates')}` : null,
    })
  }
  return out
}

// ---- The tops, picked from what the build read ----------------------------------

/** The product named in the most videos this month, across the market's
 *  audiences (every audience but the client's own posts: one audience per
 *  video, so a month's audiences add up). Ties by name. Null where none was
 *  named. Pure. */
export function productsTop(input: {
  month: string
  rows: readonly { month: string; audience: string; object_kind: string; product_id: string | null; k_named: number }[]
  names: ReadonlyMap<string, string>
  clientAudience: string
}): ProductsTop | null {
  const month = input.month.slice(0, 7)
  const videos = new Map<string, number>()
  for (const r of input.rows) {
    if (r.object_kind !== 'product' || !r.product_id || r.month.slice(0, 7) !== month || r.audience === input.clientAudience) continue
    videos.set(r.product_id, (videos.get(r.product_id) ?? 0) + Math.max(0, Number(r.k_named) || 0))
  }
  const ranked = [...videos]
    .filter(([id, k]) => k > 0 && (input.names.get(id) ?? '').trim())
    .sort((a, b) => b[1] - a[1] || (input.names.get(a[0]) ?? '').localeCompare(input.names.get(b[0]) ?? ''))
  const top = ranked[0]
  return top ? { productId: top[0], name: input.names.get(top[0])!.trim(), videos: top[1] } : null
}

/** The first undecided piece of advice, in the short list's order. Pure. */
export function movesTop(rows: readonly { lineageId: string; title: string; status: string; timesMade: number }[], order: readonly string[]): MovesTop | null {
  const byId = new Map(rows.map((r) => [r.lineageId, r]))
  for (const id of order) {
    const r = byId.get(id)
    if (r && r.status === 'new' && r.title.trim()) return { lineageId: r.lineageId, title: r.title.trim(), timesMade: r.timesMade }
  }
  return null
}
