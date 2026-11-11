import { fmtInt, longMonth } from '../../format'
import { marketConversationHref, marketMonthHref, marketSubjectHref } from '../../nav'
import { currentAdvice } from '../../pages/advice-shortlist'
import { contentPostsHref, WORKS_ANCHOR } from '../../pages/v2/content-address'
import {
  CONTENT_PATH, formatLabel, GROUPS_SHOWN, openingLabel, repliesHref, worksRows,
  type ContentPageData, type PostsBlock, type SentencePart,
} from '../../pages/v2/content'
import {
  axisLine, compareMonths, comparePrintable, levelBase, MOVE_STATUS_LABEL, MOVE_UNREAD, moveAxis, monthLabelOn, waitingAdvice,
  type AdviceAim, type MoveCard, type ReadingLabel,
} from '../../pages/v2/moves'
import { adviceTitle } from '../../pages/v2/advice-words'
import { titleFromBody } from '../../prose/advice-title'
import { ADVICE_RECORD_ALL_HREF, MOVES_PATH } from '../../pages/v2/moves-address'
import { productsHref } from '../../pages/v2/products-address'
import type { ProductsData, ShelfCategoryView, Standout } from '../../pages/v2/products'
import { voicesGroupHref } from '../../pages/v2/voices-address'
import type { GroupProducts, VoicesBrands, VoicesGroups } from '../../pages/v2/voices'
import type { PlaybookBlock } from '../../pages/playbook'
import { BEST_MIN_VIEWS, type matchedPosts } from './benchmark'
import type { BriefNaming } from './naming'
import { subquestionCounts, type PostIdeaRow } from '../../post-ideas/types'
import type { Persona } from '../../profile-tiles'
import { inlineMonth } from '../../reading/month-label'
import { monthStartOf, prevMonth } from '../../reading/month-key'
import type { Verdict } from '../../reading/verdicts'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, isRivalAudience } from '../../rivals'
import { firstSentenceOf } from '../weekly-read-v3'
import { aimLevel, andList, APP_TITLES, buyerNamesNote, daysLong, GROUPS_ARE_NOT_BUYERS, namedNotes, numberWord, productsFoot, voicesMonthHref, withMonth, yyyymm } from './app-words'
import type { StandingFact } from '../../written/types'
import type {
  BriefAdvice, BriefGroup, BriefHookRow, BriefHooks, BriefHookTable, BriefIdea, BriefIdeas, BriefItem, BriefMove, BriefMoves, BriefNamed, BriefNamedRow,
  BriefPeople, BriefProducts, BriefQuote, BriefRole, BriefSection, BriefStandout, BriefVerdict, SectionKey,
} from './types'

export {
  adviceDetail, alsoInMarket, andList, APP_TITLES, appLines, buyersSub, GROUPS_ARE_NOT_BUYERS, categoryProducts, dayLong, daysLong, ideaReadLine, inTheirVideos, moveLine, multipleText, NO_RECIPE,
  namedNotes, numberWord, ownTouchWords, pageHref, recipeLabel, recordLine, SALES_GROUPS_LINE, slotWords, voicesMonthHref, whoAsks, withMonth,
} from './app-words'

// THE OCTOBER CANVAS'S PAGES READ FROM THE APP (the boards Heinrich approved
// on 18 Oct with the designer's recommendations; pure). Each page is the
// app's own page for the month, said on a sheet: Voices' groups and brands,
// Your products, Content's ideas and its measure, Your moves, and each
// subject's own read on Market. Code reads them (lib/reports/briefs/app-
// load.ts, in `plan-briefs`, no model call); this module turns what was read
// into the parts a step carries (`*Of`, from the pages' own data) and the
// parts into the brief's sections (`*Section`). NO WRITER PROMPT CHANGED AND
// NO MODEL CALL WAS ADDED for them: the sections they replace on the printed
// page (the writer's buyer types, The questions people ask, What buyers
// weigh) are still written and stored, and not drawn (canvas.ts).
//
// ONE SOURCE. Every count is the page's: a group's videos and the subject it
// talks about most are Voices' cards (`buildGroups`, ready subjects only:
// ruling U6), its products Voices' column (`readGroupProducts`, Your
// products' rule); a brand's row is Voices' brands table (`buildBrands`); a
// category and its products are Your products' shelf, a standout its strict
// pick (`pickStandouts`); an idea is Content's card (`loadContentPage`); a
// format's response is Content's (`worksRows`); the advice waiting is Your
// moves' list (`waitingAdvice`, folded by the compose step's own vectors: no
// call of its own) and a dated move its card (`moveAxis`, `axisLine`, the
// sentence `MoveSentence` writes). Every item links to its own page in the
// app, with the month.
//
// NO COMMENTER'S WORDS. A part carries counts, the stored words the app
// prints (a group's description, a subject's read, an advice title, a post
// idea and its sub-questions, a conversation's label) and paths. The company's
// own post captions are not carried either: "Best this month" names a post by
// its format, platform and day, and links to it (an export stores refs, never
// words: AGENTS.md).

// ---- What a step carries --------------------------------------------------------------

/** A subject's own read on Market for the month (the closing run's week row,
 *  `data.subjectReads`, as `subjectsPart` takes it): its headline and what it
 *  means in full, or a thin read's one line. */
export interface BriefSubjectRead {
  id: string
  status: 'ready' | 'thin'
  headline: string | null
  means: string | null
  line: string | null
}

/** One piece of the current advice, as `waitingAdvice` folds it. */
export interface BriefAdvicePoolRow {
  lineageId: string
  title: string
  why: string | null
  status: string
  inLatest: boolean
  firstMade: string
  /** What it would move, where read. */
  aim: BriefAdvice['aim']
  href: string
}

/** Your moves as read for the month, before the advice is folded. */
export interface BriefMovesIn {
  month: string
  /** The current advice, in the ledger's order (`currentAdvice`). */
  pool: BriefAdvicePoolRow[]
  moves: BriefMove[]
  record: BriefMoves['record']
}

/** Everything the October canvas reads from the app, for one month. Each part
 *  null where it was not read, the page is off, or there is nothing to say. */
export interface BriefAppInputs {
  /** `YYYY-MM-01`: the month every part was read for. */
  month: string
  subjectReads: BriefSubjectRead[] | null
  people: BriefPeople | null
  named: BriefNamed | null
  products: BriefProducts | null
  ideas: BriefIdeas | null
  hooks: BriefHooks | null
  moves: BriefMovesIn | null
}

// ---- Small words ------------------------------------------------------------------------

const pct = (k: number, n: number): string => (n > 0 ? `${Math.round((100 * k) / n)}%` : '0%')
const sentence = (parts: readonly SentencePart[] | null | undefined): string | null => {
  const s = (parts ?? []).map((p) => (typeof p === 'string' ? p : p.figure)).join('').trim()
  return s || null
}
/** A verdict as a page prints it; null for none, and for a refused one (a
 *  refused comparison prints nothing, T0a). Pure. */
export function briefVerdict(v: Verdict | null | undefined): BriefVerdict | null {
  if (!v || v.state === 'refused') return null
  return { state: v.state, change: v.changePts, band: v.bandPts }
}

/** What Content says about how a response is read (`worksBasis`' second
 *  sentence: lib/reports/briefs/app.test.ts pins it equal). The brief's own
 *  measure, platform by platform, says `MATCHED_BASIS` instead. */
export const RESPONSE_BASIS = 'Response is each kind’s median against the market’s median video; Reddit is left out of response.'
/** How the brief reads a response (benchmark.ts): each video against a
 *  typical one on its own platform. */
export const MATCHED_BASIS = `Response is each video against a typical category video on its own platform, published the same month, then the median; Reddit is left out. Best this month needs ${fmtInt(BEST_MIN_VIEWS)} views or more.`

/** Content's measure re-read platform by platform (benchmark.ts). */
export interface MatchedHooks {
  kinds: { formats: ReadonlyMap<string, { multiple: number; rated: number }>; hooks: ReadonlyMap<string, { multiple: number; rated: number }> }
  posts: ReturnType<typeof matchedPosts>
}

// ---- From the pages' data to the parts a step carries (pure) --------------------------

/**
 * Voices' groups for the month (`buildGroups` over the month's evidence), with
 * each persona's own words in full (the card keeps their first sentences) and
 * the products named in its videos. Null where the groups were not read, or no
 * group is in a market video this month. Pure.
 */
export function peopleOf(a: {
  month: string
  market: number | null
  groups: Pick<VoicesGroups, 'state' | 'cards'>
  personas: readonly Pick<Persona, 'key' | 'oneLiner' | 'wants' | 'blockers' | 'triggers'>[]
  products?: ReadonlyMap<string, GroupProducts> | null
}): BriefPeople | null {
  const month = monthStartOf(a.month)
  if (a.groups.state !== 'ready' || !a.market || a.market <= 0) return null
  const byKey = new Map(a.personas.map((p) => [p.key, p]))
  const groups: BriefGroup[] = a.groups.cards
    .filter((c) => c.videos > 0 && c.name.trim())
    .map((c) => {
      const p = byKey.get(c.key)
      const top = c.subjects.find((s) => s.k > 0) ?? null
      const gp = a.products?.get(c.key) ?? null
      return {
        key: c.key,
        name: c.name.trim(),
        oneLiner: (p?.oneLiner || c.oneLiner).trim(),
        wants: (p?.wants || c.wants).trim(),
        stops: (p?.blockers || c.stops).trim(),
        tips: (p?.triggers ?? '').trim(),
        videos: c.videos,
        top: top ? { id: top.id, label: top.label, k: top.k, href: marketSubjectHref(top.id, { period: 'month', month }) } : null,
        products: gp?.state === 'ready' ? gp.rows.map((r) => ({ name: r.name, k: r.k, href: r.href })) : null,
        href: voicesGroupHref(c.key, { month: yyyymm(month) }),
      }
    })
    .sort((x, y) => y.videos - x.videos || x.name.localeCompare(y.name))
  return groups.length > 0 ? { month, market: a.market, groups } : null
}

/**
 * Voices' brands table for the month, where the brands are counted (`ready`):
 * each brand named unprompted (`k_organic` of `n_organic`) with its verdict,
 * praised and complained over every video naming it, and the ready subject its
 * videos carry most. Null where the brands are not counted (Össur until its
 * back-read) or no counted brand was named. Pure.
 */
export function namedOf(b: Pick<VoicesBrands, 'state' | 'month' | 'rows' | 'notNamed'>): BriefNamed | null {
  if (b.state !== 'ready') return null
  const rows: BriefNamedRow[] = b.rows
    .filter((r) => r.state === 'counted' && r.named && r.named.n > 0)
    .map((r) => ({
      label: r.label,
      you: r.you,
      named: { k: r.named!.k, n: r.named!.n },
      verdict: briefVerdict(r.verdict),
      praised: r.praised ? { k: r.praised.k, n: r.praised.n } : null,
      complained: r.complained ? { k: r.complained.k, n: r.complained.n } : null,
      top: r.topSubject ? { label: r.topSubject.label, k: r.topSubject.k, n: r.topSubject.n } : null,
      href: r.href,
    }))
  if (rows.length === 0) return null
  return {
    month: monthStartOf(b.month),
    base: Math.max(...rows.map((r) => r.named.n)),
    rows,
    notNamed: b.notNamed.map((x) => x.label),
    href: voicesMonthHref(b.month),
  }
}

/** A standout's eyebrow, as the board words it (the praise place in the
 *  page's own words: praise in the comments may be about anything in the
 *  video, so it never says the product is praised). */
export const STANDOUT_LABEL: Readonly<Record<Standout['kind'], string>> = {
  first: 'Came up for the first time',
  general: 'Talked about, none of yours named',
  gap: 'Category, not you',
  praised: 'Praise in the comments',
  focus: 'Where it sits',
}

/** One standout in code's words, every figure the pick's own. Pure. */
export function standoutOf(s: Standout, month: string, company: string): BriefStandout {
  const m = longMonth(month)
  const videos = (k: number) => `${fmtInt(k)} ${k === 1 ? 'video' : 'videos'}`
  const word = s.name.toLowerCase()
  const base = { kind: s.kind, name: s.name, href: s.href }
  switch (s.kind) {
    case 'first': {
      const since = s.months.length > 1 ? `, its first since ${longMonth(s.months[0].month)}` : ''
      return { ...base, label: STANDOUT_LABEL.first, text: `Named in ${s.videos === 1 ? 'one video' : videos(s.videos)} in ${m}${since}.` }
    }
    case 'general':
      return {
        ...base,
        label: s.yours.k === 0 ? STANDOUT_LABEL.general : 'Category, not you',
        text: s.yours.k === 0
          ? `${videos(s.inGeneral.n)} about ${word} in ${m}. None named one of ${company}’s.`
          : `${fmtInt(s.inGeneral.k)} of the ${videos(s.inGeneral.n)} about ${word} in ${m} named none of ${company}’s products.`,
      }
    case 'gap': {
      const less = s.product.k * s.category.n < s.category.k * s.product.n
      return {
        ...base,
        label: less ? 'Category, not you' : 'You, more than the category',
        name: `${s.subject} on ${s.product.name}`,
        text: `${s.subject} is in ${fmtInt(s.category.k)} of the ${videos(s.category.n)} about ${s.where.toLowerCase()}, and in ${fmtInt(s.product.k)} of the ${fmtInt(s.product.n)} naming ${s.product.name}.`,
      }
    }
    case 'praised':
      return { ...base, label: STANDOUT_LABEL.praised, text: `${fmtInt(s.praised.k)} of the ${videos(s.praised.n)} about ${word} have praise in their comments.` }
    case 'focus':
      return { ...base, label: STANDOUT_LABEL.focus, name: `${s.name} in ${s.subject}`, text: `${fmtInt(s.level.k)} of the ${videos(s.level.n)} about ${word} are in ${s.subject}.` }
  }
}

/**
 * Your products for the month, where the page is ready (switched on, the
 * month read, a catalogue): each category with videos, the most first, its
 * videos naming one of the company's products (`k_named`, pooled over every
 * audience: `named`), its products that came up with the shelf's first-month
 * mark, and the page's strict standouts. Null in any other state (Sealand: no
 * catalogue; a tenant switched off). Pure.
 */
export function productsOf(d: Pick<ProductsData, 'state' | 'month' | 'header' | 'market' | 'shelf' | 'standouts'>, company: string, namedOfCategory: (id: string) => number | null): BriefProducts | null {
  if (d.state !== 'ready' || !d.header) return null
  const month = monthStartOf(d.month)
  const categories = d.shelf
    .filter((c): c is ShelfCategoryView & { videos: number } => (c.videos ?? 0) > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      videos: c.videos,
      named: namedOfCategory(c.id) ?? 0,
      products: c.products.filter((p) => (p.videos ?? 0) > 0)
        .map((p) => ({ name: p.name, videos: p.videos ?? 0, first: p.flag != null, href: p.href }))
        .sort((x, y) => y.videos - x.videos || x.name.localeCompare(y.name)),
      href: c.href,
    }))
    .sort((x, y) => y.videos - x.videos || x.name.localeCompare(y.name))
  if (categories.length === 0) return null
  return {
    month,
    cameUp: d.header.cameUp,
    products: d.header.products,
    videos: d.header.videos,
    market: d.market,
    categories,
    standouts: d.standouts.map((s) => standoutOf(s, month, company)),
    href: productsHref({ month: yyyymm(month) }),
  }
}

/**
 * Content's ideas for the month-closing run: its stored post ideas as their
 * cards read them (the four weeks they read, beside the month), each with its
 * sub-questions and their videos, "Also asked" over the month and Worth a
 * reply. Only a CURRENT set (the closing run's own ideas) of the brief's
 * month: an older set is another week's. Null otherwise. Pure.
 */
export function ideasOf(page: Pick<ContentPageData, 'ideas' | 'asked'>, rows: readonly PostIdeaRow[], a: { month: string; medical: boolean }): BriefIdeas | null {
  const b = page.ideas
  const week = b.week
  if (b.state !== 'ready' || !week || !week.current || b.cards.length === 0) return null
  if (monthStartOf(week.month.month) !== monthStartOf(a.month)) return null
  const byId = new Map(rows.map((r) => [r.id, r]))
  const ideas: BriefIdea[] = b.cards.map((c) => {
    const row = c.id ? byId.get(c.id) : undefined
    const asks = (row?.subquestions ?? [])
      .map((s) => ({ label: s.label.trim(), videos: subquestionCounts(s).videos }))
      .filter((s) => s.label && s.videos > 0)
      .sort((x, y) => y.videos - x.videos || x.label.localeCompare(y.label))
    return {
      id: c.id ?? '',
      rank: c.rank,
      title: c.title,
      read: c.read ? { k: c.read.k, n: c.read.n } : null,
      month: c.month ? { k: c.month.k, n: c.month.n } : null,
      groups: c.groups.slice(0, GROUPS_SHOWN).map((g) => g.name),
      own: { state: c.own.state, touched: c.own.touched, posts: c.own.posts, since: c.own.since },
      asks,
      asksOf: row?.cover.asked?.videos ?? null,
      // The suggestion, not its multiple: Content's idea multiples pool the
      // platforms, where the brief's measure is platform by platform (the
      // fresh check, 11 Nov), so the brief prints no figure for them.
      format: c.format ? { label: c.format.label, multiple: null } : null,
      opening: c.opening ? { label: c.opening.label, multiple: null } : null,
      href: c.id ? `${CONTENT_PATH}/ideas/${encodeURIComponent(c.id)}` : CONTENT_PATH,
    }
  }).filter((i) => i.id && i.title.trim())
  if (ideas.length === 0) return null
  const month = monthStartOf(week.month.month)
  return {
    month,
    read: { from: week.read.from, to: week.read.to, label: week.read.label },
    since: page.asked.since,
    medical: a.medical,
    ideas,
    // Also asked from the top of Content's list: where fewer than three ideas
    // print, the page sets its first questions in the cards the ideas leave
    // (`b.questions`, `askedWithLead`) and its table goes on after them; the
    // brief draws no question card, so they lead its line.
    asked: page.asked.unread ? [] : [...b.questions, ...page.asked.rows]
      .filter((r) => r.label.trim() && (r.month ?? 0) > 0)
      .slice(0, 3)
      .map((r) => ({ label: r.label.trim(), videos: r.month ?? 0, href: marketConversationHref(r.registryId, { period: 'month', month }) })),
    replies: repliesHref('month'),
    href: CONTENT_PATH,
  }
}

/** The rows a table prints: the formats (or openings) with a response
 *  figure, the category's most common first (Content's own set,
 *  `worksRows`), each with the company's posts and the rival's videos. */
function hookTable(playbook: PlaybookBlock, key: 'formats' | 'hooks', n: number, matched?: MatchedHooks['kinds'] | null): BriefHookTable | null {
  const matrix = playbook[key]
  const market = matrix.sides.find((s) => s.audience === INDUSTRY_AUDIENCE)
  if (!market || market.of === 0) return null
  const own = matrix.sides.find((s) => s.audience === CLIENT_AUDIENCE && !s.unread && s.of > 0) ?? null
  const rival = matrix.sides.find((s) => isRivalAudience(s.audience) && !s.unread && s.of > 0) ?? null
  const rows: BriefHookRow[] = worksRows(playbook, key, key === 'formats' ? formatLabel : openingLabel, n)
    .map((r) => ({
      label: r.label,
      share: r.share ?? 0,
      own: own ? own.byKey[r.key]?.value.k ?? 0 : null,
      rival: rival ? rival.byKey[r.key]?.value.k ?? 0 : null,
      // Platform by platform where the brief measured it so (benchmark.ts).
      multiple: matched ? matched[key].get(r.key)?.multiple ?? null : r.multiple,
    }))
    .sort((x, y) => y.share - x.share || x.label.localeCompare(y.label))
    .slice(0, n)
  return rows.length > 0 ? { of: market.of, ownOf: own?.of ?? null, rivalOf: rival?.of ?? null, rows } : null
}

/** Rows the formats and the openings tables print (the board's five and four). */
export const HOOK_FORMAT_ROWS = 5
export const HOOK_OPENING_ROWS = 4

/**
 * Content's measure for the month: the market's videos by format and by
 * opening with their response against a typical video (`worksRows`), the
 * company's own posts and the first rival's videos beside each, and "Your
 * posts in {month}" (`postsBlock`, `mixSentence`). Null where neither table
 * has a row. Pure.
 */
export function hooksOf(a: {
  month: string; rival: string | null; playbook: PlaybookBlock | null; posts: PostsBlock | null; sentence: readonly SentencePart[] | null; matched?: MatchedHooks | null
  /** The accounts we follow that posted, each with its posts. */
  accounts?: readonly { platform: string; account: string; posts: number }[] | null
}): BriefHooks | null {
  if (!a.playbook || a.playbook.unread) return null
  const m = a.matched ?? null
  const formats = hookTable(a.playbook, 'formats', HOOK_FORMAT_ROWS, m?.kinds)
  const openings = hookTable(a.playbook, 'hooks', HOOK_OPENING_ROWS, m?.kinds)
  if (!formats && !openings) return null
  const rivalSide = a.playbook.formats.sides.find((s) => isRivalAudience(s.audience) && !s.unread && s.of > 0) ?? null
  const p = a.posts && !a.posts.unread ? a.posts : null
  return {
    month: monthStartOf(a.month),
    rival: rivalSide ? rivalSide.label : null,
    formats,
    openings,
    posts: p ? {
      total: p.total,
      byPlatform: p.byPlatform,
      ...(a.accounts?.length ? { accounts: [...a.accounts] } : {}),
      response: m ? m.posts.response : p.response,
      ...(m ? { platforms: m.posts.platforms } : {}),
      sentence: sentence(a.sentence),
      best: m
        ? (m.posts.best
          ? {
            platform: m.posts.best.post.platform, date: m.posts.best.post.upload_date,
            format: m.posts.best.post.classified_type ? formatLabel(m.posts.best.post.classified_type) : null,
            multiple: m.posts.best.multiple, href: contentPostsHref({ post: m.posts.best.post.id }), views: Number(m.posts.best.post.views) || 0,
          }
          : null)
        : p.best && p.best.multiple != null
          ? { platform: p.best.platform, date: p.best.date, format: p.best.format, multiple: p.best.multiple, href: contentPostsHref({ post: p.best.id }) }
          : null,
      href: contentPostsHref({ all: true }),
    } : null,
    basis: m ? MATCHED_BASIS : RESPONSE_BASIS,
    href: `${CONTENT_PATH}#${WORKS_ANCHOR}`,
  }
}

/** A move's one sentence, as Your moves' `MoveSentence` writes it, in text.
 *  Pure. */
export function moveSentence(card: MoveCard, reading: ReadingLabel | null): string {
  const level = (p: { k: number; n: number }) => `${pct(p.k, p.n)} (${fmtInt(p.k)} of ${fmtInt(p.n)})`
  if (card.unread) return MOVE_UNREAD[card.unread]
  if (card.pending) {
    const last = card.points[card.points.length - 1]
    return last ? `Share of ${levelBase(card.kind)}: ${level(last)} in ${longMonth(last.month)}, before the move.` : ''
  }
  const c = card.compare
  if (comparePrintable(c)) {
    const m = compareMonths(c, monthStartOf(card.day), reading)
    return `Share of ${levelBase(card.kind)} went from ${level(c.before)} in ${m.before}, to ${level(c.after)} in ${m.after}.`
  }
  const latest = card.compare?.after ?? card.points[card.points.length - 1]
  if (!latest) return ''
  return `Share of ${levelBase(card.kind)}: ${level(latest)} in ${inlineMonth(`${longMonth(latest.month)}${latest.soFar ? ' so far' : ''}`, monthLabelOn(latest.month, reading))}.`
}

/** A dated move as the brief prints it: Your moves' card, said on paper. Pure. */
export function moveOf(card: MoveCard, reading: ReadingLabel): BriefMove {
  const axis = moveAxis(card, reading.month)
  return {
    id: card.id,
    title: card.title,
    kind: card.kind,
    status: MOVE_STATUS_LABEL[card.status],
    day: card.day,
    label: card.label,
    labelHref: card.onHref,
    slots: axis.map((s) => ({ month: s.month, k: s.point?.k ?? null, n: s.point?.n ?? null, soFar: s.point?.soFar ?? false, why: s.why })),
    sentence: moveSentence(card, reading),
    verdict: comparePrintable(card.compare) ? briefVerdict(card.compare.verdict) : null,
    axis: card.unread ? null : axisLine(axis),
    // Your moves' pages read `?month=`: the move's page at the brief's month.
    href: withMonth(card.href, reading.month),
  }
}

/**
 * Your moves for the month, before the fold: the current advice (each with
 * what it would move), the dated moves (the one whose comparison prints
 * first, then the newest), and the record. Pure.
 */
export function movesOf(a: {
  month: string
  rows: readonly { lineageId: string; title: string; why: string | null; status: string; inLatest?: boolean; firstMade: string; timesMade?: number }[]
  aims: ReadonlyMap<string, AdviceAim | null>
  cards: readonly MoveCard[]
  adviceHref: (lineageId: string) => string
  aimHref?: (aim: AdviceAim) => string | null
}): BriefMovesIn {
  const month = monthStartOf(a.month)
  // A piece with no title of its own is named by its body's first clause,
  // cut at about seventy characters (`adviceTitle`): an observation, cut off,
  // not advice to decide on (the re-check, 11 Nov: "People judge a device by
  // whether they can wear it through work…"). It stays on Your moves, and in
  // the record's count.
  const pool = currentAdvice(a.rows.filter((r) => hasOwnTitle(r.title, r.why)).map((r) => ({ ...r, inLatest: r.inLatest === true }))).map((r) => {
    const aim = a.aims.get(r.lineageId) ?? null
    const level = aim ? aimLevel(aim.level) : null
    return {
      lineageId: r.lineageId,
      // Named as Your moves names it everywhere: its stored title, else its
      // body's first clause (`adviceTitle`).
      title: adviceTitle(r.title, r.why),
      why: r.why,
      status: r.status,
      inLatest: r.inLatest,
      firstMade: r.firstMade,
      // No count where the month holds no reading of it (`aimLevel`).
      aim: aim ? { label: aim.label, k: level?.k ?? null, n: level?.n ?? null, href: a.aimHref?.(aim) ?? null } : null,
      // At the brief's month, as each figure beside it is (`?month=`).
      href: withMonth(a.adviceHref(r.lineageId), month),
    }
  })
  // A brief is about its month, named on every page ("in October"); it is
  // frozen, so a label relative to the day it was written ("the last full
  // month", `readingMonthLabel`) would go stale and say what no other page
  // of it says. A move's sentence names the month alone.
  const reading = { month, label: null }
  const moves = a.cards.map((c) => moveOf(c, reading))
    .sort((x, y) => Number(y.verdict != null) - Number(x.verdict != null) || y.day.localeCompare(x.day))
  const firsts = a.rows.map((r) => r.firstMade).filter(Boolean).sort()
  return {
    month,
    pool,
    moves,
    record: { total: a.rows.length, decided: a.rows.filter((r) => r.status !== 'new').length, since: firsts[0] ?? null, href: withMonth(ADVICE_RECORD_ALL_HREF, month) },
  }
}

/** Whether a piece of advice has a title of its own: stored, and not its
 *  body's first clause as the pipeline derives it (`titleFromBody`). Pure. */
export function hasOwnTitle(title: string | null | undefined, body: string | null | undefined): boolean {
  const t = (title ?? '').trim()
  return t !== '' && t !== titleFromBody(body)
}

// ---- From the parts to the brief's sections (pure) ------------------------------------

const appSection = (key: SectionKey, extra: Partial<BriefSection>): BriefSection => ({ key, title: APP_TITLES[key] ?? key, groups: [], ...extra })

/** "Who is in your market" (Leadership): every group, each with its count,
 *  its one line and the subject it talks about most. Pure. */
export function groupsSection(p: BriefPeople | null): BriefSection | null {
  if (!p || p.groups.length === 0) return null
  const n = p.groups.length
  return appSection('leadership.groups', {
    people: p,
    sub: `${numberWord(n)} ${n === 1 ? 'group comments' : 'groups comment'} in your market, as Voices describes them, ${GROUPS_ARE_NOT_BUYERS}. A video can hold more than one group, so the counts overlap.`,
    foot: [buyerNamesNote(p.groups), `Each update describes the groups afresh, so no count is set against ${longMonth(prevMonth(p.month))}.`].filter(Boolean).join(' '),
    link: { href: voicesMonthHref(p.month), text: 'Open the groups on Voices →' },
  })
}

/** "Who is buying" (Sales): the groups in the most videos, two a sheet, with
 *  what they want, what stops them and what tips them; the rest named. Pure. */
export function buyersSection(p: BriefPeople | null): BriefSection | null {
  if (!p || p.groups.length === 0) return null
  return appSection('sales.groups', { people: p, link: { href: voicesMonthHref(p.month), text: 'Open the groups on Voices →' } })
}

/** "Your moves" (Leadership): the advice waiting, folded as Your moves folds
 *  it (`waitingAdvice`, by `vectors`: none, and it is drawn unmerged, the
 *  page's own fallback), the dated moves, and the record. Null where there is
 *  no advice waiting and no move. Pure. */
export function movesSection(m: BriefMovesIn | null, vectors: ReadonlyMap<string, number[]> | null): BriefSection | null {
  if (!m) return null
  const waiting = waitingAdvice(m.pool, vectors).map((r): BriefAdvice => ({ lineageId: r.lineageId, title: r.title, firstMade: r.firstMade, aim: r.aim, href: r.href }))
  if (waiting.length === 0 && m.moves.length === 0) return null
  const page = withMonth(MOVES_PATH, m.month)
  const moves: BriefMoves = { month: m.month, waiting, waitingCount: waiting.length, moves: m.moves, record: m.record, href: page }
  return appSection('leadership.moves', {
    moves,
    sub: m.moves.length > 0 ? 'The advice waiting for a decision, and the moves you dated, each read against the month before it.' : 'The advice waiting for a decision, and what was decided before it.',
    foot: m.moves.length > 0 ? 'Each piece of advice is printed as Your moves stores it. A dated move is read on what it is about, month by month.' : 'Each piece of advice is printed as Your moves stores it.',
    link: { href: page, text: 'Open Your moves →' },
  })
}

/** "Your products in the conversation" (Marketing): Össur only, behind
 *  `PRODUCT_READINGS_ENABLED` (the part is read only where the page is
 *  ready). Pure. */
export function productsSection(p: BriefProducts | null): BriefSection | null {
  if (!p) return null
  const m = longMonth(p.month)
  const came = `${fmtInt(p.cameUp)} of your ${fmtInt(p.products)} products came up by name in ${m}`
  return appSection('marketing.products', {
    products: p,
    sub: p.videos != null && p.market
      ? `${came}, and ${fmtInt(p.videos)} of the ${fmtInt(p.market)} videos we read in ${m}, your own posts and posts about you included, were about them or their categories, a product named or not.`
      : `${came}.`,
    foot: productsFoot(p),
    link: { href: p.href, text: 'Open Your products →' },
  })
}

/** Voices' brands table re-counted by the brief's naming (naming.ts): every
 *  brand's naming on ONE base, the videos we read that none of our brand
 *  searches found (the company's own name searches out of it too), and the
 *  company's own row KEPT (the blind-report check, 9 Nov: Ottobock printed as
 *  "named most" because Össur's row was left out). Praised and complained,
 *  and what a brand is talked about for, are NOT carried: Voices counts them
 *  over each brand's own audience, so two brands' rows stood on unlike bases
 *  (the fresh check, 11 Nov). A brand Voices counts and nobody named, or
 *  whose name it finds nowhere, is still said ("not named"). A month-pair
 *  verdict was read on the old base and is not carried. Null without naming,
 *  or with fewer than two brands. Pure. */
export function namedByNaming(n: BriefNamed | null, naming: BriefNaming | null): BriefNamed | null {
  if (!naming || naming.rows.length < 2) return null
  const voices = new Map((n?.rows ?? []).map((r) => [r.you ? 'client' : r.label.trim().toLowerCase(), r]))
  const rows: BriefNamedRow[] = naming.rows.map((b) => ({
    label: b.label,
    you: b.you,
    named: { k: b.videos, n: naming.videos },
    verdict: null,
    praised: null,
    complained: null,
    top: null,
    href: voices.get(b.you ? 'client' : b.label.trim().toLowerCase())?.href ?? voicesMonthHref(naming.month),
  }))
  const named = new Set(rows.filter((r) => r.named.k > 0).map((r) => r.label.trim().toLowerCase()))
  const notNamed = [...new Set([...rows.filter((r) => r.named.k === 0).map((r) => r.label), ...(n?.notNamed ?? [])])]
    .filter((label) => !named.has(label.trim().toLowerCase()))
  return { month: naming.month, base: naming.videos, rows, notNamed, href: n?.href ?? voicesMonthHref(naming.month) }
}

/** "Who gets named without being asked" (Marketing): only where the brands
 *  are counted, on the brief's naming (`namedByNaming`): a set read with no
 *  naming (null) prints no page, and says why in what it held (compose.ts).
 *  Voices' table as it is only where no naming was asked for at all
 *  (undefined: a fixture's page). Pure. */
export function namedSection(n: BriefNamed | null, company: string, naming?: BriefNaming | null): BriefSection | null {
  const named = naming === undefined ? n : namedByNaming(n, naming)
  if (!named) return null
  const m = longMonth(named.month)
  const crosses = named.rows.some((r) => r.praised || r.top)
  return appSection('marketing.named', {
    named,
    sub: `Of the ${fmtInt(named.base)} videos we read in ${m} that none of our brand searches found, how many named each brand. Posts on the accounts we follow for each brand are left out.${crosses ? ' Then, over every video in your market naming it, what people did.' : ''}`,
    lines: namedNotes(named, company),
    ...(named.notNamed.length ? { also: `Not named outside our searches in ${m}: ${andList(named.notNamed)}.` } : {}),
    ...(crosses ? { foot: 'Praised and complained, and what each brand is talked about for, are counted over every video in your market naming it, and are about anything in the video.' } : {}),
    link: { href: named.href, text: 'Open the brands on Voices →' },
  })
}

/** "What to post next" (Content): the month-closing run's ideas. Pure. */
export function ideasSection(i: BriefIdeas | null): BriefSection | null {
  if (!i) return null
  const multiples = i.ideas.some((x) => x.format?.multiple != null || x.opening?.multiple != null)
  return appSection('content.ideas', {
    ideas: i,
    sub: `From questions people asked ${daysLong(i.read.from, i.read.to)} that none of your posts since ${longMonth(i.since)} had touched on, the most videos first.${multiples ? ' 1× is a typical market video on the question.' : ''}`,
    link: { href: i.replies, text: 'Worth a reply →' },
  })
}

/** "Hooks and formats that work" (Content), on Content's measure. Pure. */
export function hooksSection(h: BriefHooks | null): BriefSection | null {
  if (!h) return null
  return appSection('content.hooks', {
    hooks: h,
    sub: `Videos published in ${longMonth(h.month)}, by format and by how they open: 1× is a typical video in your market on the same platform.`,
    link: { href: h.href, text: 'What works →' },
  })
}

// ---- The subjects' reads (Leadership's Where the market stands) ----------------------

/** A subject's words on the page, from its own read: the headline and the
 *  first sentence of what it means; a thin read's line; else nothing (the
 *  writer's sentence stands in). Pure. */
export function subjectWords(r: BriefSubjectRead | null | undefined): { headline: string | null; meaning: string | null } | null {
  if (!r) return null
  if (r.status === 'thin') return r.line?.trim() ? { headline: null, meaning: r.line.trim() } : null
  const meaning = r.means?.trim() ? firstSentenceOf(r.means) : null
  const headline = r.headline?.trim() || null
  return headline || meaning ? { headline, meaning } : null
}

/** The Market sub of Where the market stands (v2). Pure. */
export const subjectsBase = (n: number, month: string): string => `Share of the ${fmtInt(n)} videos in your market in ${longMonth(month)} · each subject in Market’s own words`

/**
 * Where the market stands on the October canvas: each READY subject with a
 * level (ruling U6), in Market's order, said in its own read on Market (its
 * headline and the first sentence of what it means); where the month holds no
 * read of it, the writer's sentence (`sentenceOf`), else one of its voices
 * (`voiceOf`, asked only then: it spends the voice); a subject with none of
 * them is held with why. The kinds and the mood under them (`panel`). Pure.
 */
export function subjectsSection(a: {
  month: string
  subjects: readonly { id: string; fact: StandingFact }[]
  reads: readonly BriefSubjectRead[] | null
  sentenceOf: (id: string) => string
  voiceOf: (fact: StandingFact) => BriefQuote | null
  panel: Pick<BriefSection, 'kinds' | 'mood'>
}): { section: BriefSection | null; held: { what: string; reason: string }[] } {
  const held: { what: string; reason: string }[] = []
  const ready = a.subjects.filter(({ fact }) => fact.calibration === 'ready' && fact.level && fact.level.n > 0)
    .sort((x, y) => (x.fact.rank || 99) - (y.fact.rank || 99))
  if (ready.length === 0) return { section: null, held }
  const reads = new Map((a.reads ?? []).map((r) => [r.id, r]))
  const items: BriefItem[] = []
  for (const { id, fact } of ready) {
    const pct = Math.round((fact.level!.k / fact.level!.n) * 100)
    const href = marketSubjectHref(fact.subjectId, { period: 'month', month: a.month })
    const words = subjectWords(reads.get(fact.subjectId))
    if (words) {
      items.push({ title: fact.name, text: words.headline ?? words.meaning ?? '', ...(words.headline && words.meaning ? { detail: words.meaning } : {}), slot: 'week_read', measure: { pct }, href })
      continue
    }
    const sentence = a.sentenceOf(id)
    const voice = sentence ? null : a.voiceOf(fact)
    if (!sentence && !voice) { held.push({ what: `subject: ${fact.name}`, reason: 'nothing was said about it, and the month holds no read of it' }); continue }
    items.push({ title: fact.name, text: sentence, ...(voice ? { quote: voice } : {}), measure: { pct }, href })
  }
  if (items.length === 0) return { section: null, held }
  return {
    section: {
      key: 'leadership.subjects', title: APP_TITLES['leadership.subjects'] ?? 'Where the market stands', groups: [{ items }],
      base: subjectsBase(ready[0].fact.level!.n, a.month), ...a.panel,
      foot: 'What people said inside each subject is on its Market page.',
      link: { href: marketMonthHref(a.month), text: `Open ${longMonth(a.month)} on Market →` },
    },
    held,
  }
}

/** Each role's October pages read from the app, in the canvas's order:
 *  Leadership's subjects (built by the caller, which holds the writer's
 *  sentences), its groups and its moves (folded by `vectors`); Sales' groups;
 *  Marketing's products and named brands; Content's ideas and its measure.
 *  Pure. */
export function appSectionsFor(role: BriefRole, a: { company: string; app: BriefAppInputs | null; subjects: BriefSection | null; vectors: ReadonlyMap<string, number[]> | null; naming?: BriefNaming | null }): BriefSection[] {
  const app = a.app
  const out: Record<BriefRole, (BriefSection | null)[]> = {
    leadership: [a.subjects, groupsSection(app?.people ?? null), movesSection(app?.moves ?? null, a.vectors)],
    sales: [buyersSection(app?.people ?? null)],
    marketing: [productsSection(app?.products ?? null), namedSection(app?.named ?? null, a.company, a.naming)],
    content: [ideasSection(app?.ideas ?? null), hooksSection(app?.hooks ?? null)],
  }
  return out[role].filter((x): x is BriefSection => x != null)
}
