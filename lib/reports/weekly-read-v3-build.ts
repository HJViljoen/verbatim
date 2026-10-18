import { fmtInt } from '../format'
import { MARKET_LONG_RUN_ANCHOR, marketMonthHref, marketSubjectHref, surface } from '../nav'
import { CONTENT_PATH, daysLabel, REPLIES_ANCHOR, type TopAsked, type TopContent } from '../pages/v2/content'
import { marketLongRunOf, subjectOwnRead } from '../pages/v2/market'
import { compareMonths, RECORD_HREF, type TopMoves } from '../pages/v2/moves'
import type { TopProducts } from '../pages/v2/products'
import type { TopVoices } from '../pages/v2/voices'
import { streakLabel, UNTITLED_ADVICE, type AdviceHistory } from '../pages/v2/advice-words'
import { scrubProse } from '../prose/scrub'
import { monthStartOf } from '../reading/month-key'
import { closesMonth, endedMonthOf } from '../written/longrun'
import { coveredDays } from '../written/month'
import type { StoredLongRun } from '../written/store'
import type { WeekReadData } from '../written/types'
import {
  MOVES_LISTED, PRODUCTS_NAMED,
  type WeeklyContentPart, type WeeklyMonthClose, type WeeklyMovesPart, type WeeklyPages,
  type WeeklyProductsPart, type WeeklySubjectRead, type WeeklyVoicesPart,
} from './weekly-read-v3'

// What a version-3 snapshot freezes, from each page's own reader (the
// Dashboard tile's `top<Page>()`, as level 1's lines did; lib/reports/weekly-
// read-lines-load.ts reads them) and from the stored read. PURE: no I/O, no
// clock. Each part is the tile's data said for the email and the full read,
// never re-ranked or re-counted: the group in the most videos and the brands
// named most are `topVoices`'; the products, their first-time mark and the
// categories are the page's own shelf (`topProducts`, `cameUpOf`); the ideas
// are Content's set in rank order and the stand-in question the tile's
// (`topAsked`); the advice is `waitingAdvice`'s list and its count, and the
// move the tile's (`movedMove`). A page with nothing gives no part.

/** "1 update, first raised 12 Oct": the updates that raised a piece of
 *  advice, as the tile and Your moves print them. */
export function streakFigure(h: AdviceHistory): string | null {
  const streak = h.streak > 0 ? h.streak : h.dates.length
  return streak > 0 ? `${fmtInt(streak)} ${streakLabel(h)}` : null
}

/** Voices: the group in the most videos, the other groups by name, and the
 *  two brands named most unprompted only where the brands are counted. None
 *  where no group was read. */
export function voicesPart(top: TopVoices | null | undefined): WeeklyVoicesPart | null {
  const g = top?.group
  if (!top || !g || top.groupsState === 'unread' || !g.name.trim() || g.videos <= 0) return null
  return {
    month: top.month,
    monthWords: top.monthWords,
    monthLabel: top.monthLabel ?? null,
    videos: top.videos,
    group: { name: g.name.trim(), oneLiner: g.oneLiner?.trim() || null, videos: g.videos, href: g.href },
    others: top.groups.filter((x) => x.key !== g.key && x.name.trim()).map((x) => x.name.trim()),
    named: top.brandsState === 'ready' ? top.named.filter((b) => b.label.trim() && b.k > 0).map((b) => ({ ...b, label: b.label.trim() })) : [],
    href: top.href,
  }
}

/** Your products: only a `ready` tile (switched on, the month read, a
 *  catalogue, something came up). Off for a tenant (Sealand), nothing at all:
 *  no part, no placeholder. */
export function productsPart(top: TopProducts | null | undefined): WeeklyProductsPart | null {
  if (!top || top.state !== 'ready' || top.note === 'failed') return null
  const cameUp = top.cameUpProducts ?? []
  if (cameUp.length === 0 && (top.categories ?? []).length === 0) return null
  return {
    month: top.month ?? null,
    monthWords: top.monthWords,
    monthLabel: top.monthLabel ?? null,
    cameUp: top.cameUp ?? cameUp.length,
    products: top.products ?? 0,
    videos: top.videos ?? null,
    top: cameUp.slice(0, PRODUCTS_NAMED),
    categories: top.categories ?? [],
    href: top.href,
  }
}

/** "12 to 18 Oct": the days the week's reply list reads (Content's week). */
export function replyDays(read: Pick<WeekReadData, 'window'>): string | null {
  const c = coveredDays(read.window)
  return c ? daysLabel(c.first, c.last) : null
}

/** Content: this week's ideas (each title through the written read's scrub,
 *  a title it empties dropped), else the question asked most that your posts
 *  have not touched; Worth a reply always, as a link. An idea from an older
 *  week is not this week's: no idea prints then, and the question does. */
export function contentPart(top: TopContent | null | undefined, asked: TopAsked | null | undefined, read: Pick<WeekReadData, 'window'>): WeeklyContentPart {
  const idea = top?.state === 'ready' && top.idea && top.idea.ideasWeek.current ? top.idea : null
  const listed = idea ? (top!.ideas && top!.ideas.length > 0 ? top!.ideas : [{ id: idea.id, rank: idea.rank, title: idea.title, href: top!.href }]) : []
  const ideas = listed
    .map((x) => ({ id: x.id, title: scrubProse('week_read', x.title).text.trim(), href: x.href }))
    .filter((x) => x.title)
  const question = ideas.length === 0 && asked && asked.label.trim()
    ? {
        label: asked.label.trim(),
        week: asked.week?.k ?? null,
        month: asked.month?.k ?? null,
        weekWords: asked.weekWords,
        monthWords: asked.monthWords,
        href: asked.href,
      }
    : null
  return {
    ideas,
    read: ideas.length > 0 && idea ? idea.ideasWeek.read.label : null,
    medical: ideas.length > 0 && Boolean(idea?.medical),
    asked: question,
    replies: { href: `${CONTENT_PATH}#${REPLIES_ANCHOR}`, days: replyDays(read) },
    href: CONTENT_PATH,
  }
}

/** Your moves: the advice waiting (its count and the first few, each with the
 *  updates that raised it) and the move whose comparison may print. None
 *  where neither exists. */
export function movesPart(top: TopMoves | null | undefined): WeeklyMovesPart | null {
  if (!top) return null
  const listed = top.list && top.list.length > 0
    ? top.list
    : top.advice ? [{ lineageId: top.advice.lineageId, title: top.advice.title, href: top.advice.href, history: top.advice.history }] : []
  const advice = listed
    .filter((a) => a.title.trim())
    .slice(0, MOVES_LISTED)
    .map((a) => ({ title: a.title.trim(), untitled: a.title === UNTITLED_ADVICE, href: a.href, figure: streakFigure(a.history), since: a.history.since }))
  const m = top.move
  const move = m
    ? {
        title: m.title.trim(),
        day: m.day,
        label: m.label,
        kind: m.kind,
        href: m.href,
        before: { k: m.compare.before.k, n: m.compare.before.n },
        after: { k: m.compare.after.k, n: m.compare.after.n },
        months: compareMonths(m.compare, monthStartOf(m.day), top.reading),
        verdict: m.compare.verdict,
      }
    : null
  if (advice.length === 0 && !move) return null
  return { waiting: top.waiting, advice, move, href: surface('moves').href, recordHref: RECORD_HREF }
}

/**
 * The ready subjects' own reads, in Market's order (`order`, the ready
 * subjects as the top page ranks them), by `subjectOwnRead`'s rule over the
 * STORED read (the one that carries `subjectReads`), for the read's own
 * month. Only a ready subject is handed in, so no unready subject's words are
 * ever frozen (ruling U6); a ready subject with no read of its own for the
 * month is left out (no empty row). Each opens its page on Market for that
 * month. Pure.
 */
export function subjectsPart(a: {
  order: readonly { id: string; name: string }[]
  read: WeekReadData
  readsOn: boolean
}): WeeklySubjectRead[] {
  const month = a.read.month
  const out: WeeklySubjectRead[] = []
  for (const s of a.order) {
    const r = subjectOwnRead({ id: s.id, state: 'ready', read: a.read, month, readsOn: a.readsOn })
    if (!r) continue
    const firstSaid = r.saying.find((p) => p.trim())?.trim() ?? null
    const href = marketSubjectHref(s.id, { period: 'month', month })
    if (r.status === 'thin') {
      if (firstSaid) out.push({ id: s.id, name: s.name, status: 'thin', headline: null, means: null, line: firstSaid, href })
      continue
    }
    const means = r.means.trim() || firstSaid
    const headline = r.status === 'ready' && r.headline?.trim() ? r.headline.trim() : null
    if (!headline && !means) continue
    out.push({ id: s.id, name: s.name, status: 'ready', headline, means, line: null, href })
  }
  return out
}

/** The month-closing line: only on the run whose window holds the first day
 *  of the month it ends in (`closesMonth`), and only where the closed month's
 *  long-run read is published and prints (`marketLongRunOf`, Market › This
 *  month's own rule). Pure. */
export function monthClosePart(window: { from: string; to: string }, longRun: StoredLongRun | null | undefined): WeeklyMonthClose | null {
  if (!closesMonth(window)) return null
  const month = endedMonthOf(window)
  const printed = marketLongRunOf(longRun ?? null, month)
  if (!printed) return null
  return { month, title: printed.across, href: marketMonthHref(month, MARKET_LONG_RUN_ANCHOR) }
}

/** Every page's part, from the tops. */
export function pagesPart(tops: { voices?: TopVoices | null; products?: TopProducts | null; content?: TopContent | null; asked?: TopAsked | null; moves?: TopMoves | null }, read: Pick<WeekReadData, 'window'>): WeeklyPages {
  return {
    voices: voicesPart(tops.voices),
    products: productsPart(tops.products),
    content: contentPart(tops.content, tops.asked, read),
    moves: movesPart(tops.moves),
  }
}
