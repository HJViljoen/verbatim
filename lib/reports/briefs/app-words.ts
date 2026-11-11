import { fmtInt, longMonth, platformLabel, shortDate } from '../../format'
import { MARKET_LONG_RUN_ANCHOR, marketMonthHref, surface } from '../../nav'
import { monthStartOf } from '../../reading/month-key'
import { coveredDays } from '../../written/month'
import type { BriefAdvice, BriefGroup, BriefIdea, BriefIdeas, BriefMove, BriefMoves, BriefNamed, BriefProducts, BriefSection, SectionKey } from './types'

// The October canvas's words, light (pure; the deck imports it, so it reads
// no page module): the titles, the lines code writes from the parts' counts,
// each page's own page in the app, and every word a page prints for In
// short's check. lib/reports/briefs/app.ts builds the parts and sections.

const NUMBER = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
/** "Five", or the digits past ten. */
export const numberWord = (n: number): string => NUMBER[n] ?? fmtInt(n)
/** "A", "A and B", "A, B and C". */
export const andList = (xs: readonly string[]): string => (xs.length <= 1 ? xs[0] ?? '' : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
/** A response multiple as Content prints it ("1.3×": `fmtMultiple`, pinned
 *  equal in app.test.ts). */
export const multipleText = (m: number): string => `${(Math.round(m * 10) / 10).toFixed(1)}×`
/** `YYYY-MM`. */
export const yyyymm = (month: string): string => monthStartOf(month).slice(0, 7)

/** The October canvas's pages' titles. */
export const APP_TITLES: Readonly<Partial<Record<SectionKey, string>>> = {
  'leadership.subjects': 'Where the market stands',
  'leadership.groups': 'Who is in your market',
  'leadership.moves': 'Your moves',
  // Not "Who is buying" (the blind-report check, 9 Nov): a group's count is
  // every video its people commented on, curious as well as buying.
  'sales.groups': 'Who is in your market',
  'marketing.products': 'Your products in the conversation',
  // "Without being asked" said what it means (the fresh check, 11 Nov): in
  // videos none of our brand searches found.
  'marketing.named': 'Who gets named outside our searches',
  'content.ideas': 'What to post next',
  'content.hooks': 'Hooks and formats that work',
}

/** "13 June": a day with its month in full. Pure. */
export function dayLong(day: string): string {
  const d = new Date(`${day.slice(0, 10)}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? day : `${d.getUTCDate()} ${longMonth(`${day.slice(0, 7)}-01`)}`
}

/** "4 to 31 October", "28 September to 25 October": the days a half-open
 *  window holds, in full, by the rule the Content page counts them
 *  (`coveredDays`: its "4 to 31 Oct"). Pure. */
export function daysLong(from: string, to: string): string {
  const c = coveredDays({ from, to })
  if (!c) return ''
  const name = (d: string) => longMonth(`${d.slice(0, 7)}-01`)
  const day = (d: string) => Number(d.slice(8, 10))
  if (c.first === c.last) return `${day(c.last)} ${name(c.last)}`
  return c.first.slice(0, 7) === c.last.slice(0, 7) ? `${day(c.first)} to ${day(c.last)} ${name(c.last)}` : `${day(c.first)} ${name(c.first)} to ${day(c.last)} ${name(c.last)}`
}

/** "In their videos": the subject a group talks about most and the company's
 *  products named in its videos, code's words. Null with neither. Pure. */
export function inTheirVideos(g: Pick<BriefGroup, 'top' | 'products' | 'videos'>): string | null {
  const parts: string[] = []
  if (g.top) parts.push(`Talks most about ${g.top.label}, ${fmtInt(g.top.k)} of their ${fmtInt(g.videos)} videos.`)
  if (g.products) {
    parts.push(g.products.length === 0 ? 'None of your products came up in them.' : `Your products in them: ${andList(g.products.slice(0, 3).map((x) => x.name))}.`)
  }
  return parts.length ? parts.join(' ') : null
}

/** The sub of Who is buying's first sheet: every group the month holds, and
 *  how many print. Pure. */
/** What a group's count is, said wherever the groups print (the blind-report
 *  check, 9 Nov: "First-time buyer: 121 of 766 videos" read as 121 videos of
 *  buyers, where most of them were people asking how a device works). */
export const GROUPS_ARE_NOT_BUYERS = 'each counted by the videos it commented on, not by purchases'

/** One of a brand's accounts we follow, with its posts in the month. */
export interface AccountPosts { platform: string; account: string; posts: number }

/** The accounts a brand's posts came from, each with its posts, the most
 *  first. Pure. */
export function accountsOf(vs: readonly { platform: string | null; account_name: string | null }[]): AccountPosts[] {
  const by = new Map<string, AccountPosts>()
  for (const v of vs) {
    if (!v.platform || !v.account_name?.trim()) continue
    const key = `${v.platform}::${v.account_name.trim()}`
    const at = by.get(key) ?? { platform: v.platform, account: v.account_name.trim(), posts: 0 }
    at.posts += 1
    by.set(key, at)
  }
  return [...by.values()].sort((a, b) => b.posts - a.posts || a.platform.localeCompare(b.platform) || a.account.localeCompare(b.account))
}

/** "Instagram @acme", "YouTube ACME": an account as it is named on its
 *  platform. Pure. */
export const accountName = (a: Pick<AccountPosts, 'platform' | 'account'>): string =>
  `${platformLabel(a.platform)} ${/^(?:instagram|tiktok)$/i.test(a.platform) && !a.account.startsWith('@') ? '@' : ''}${a.account}`

/** "Instagram @acme 24, TikTok @acme_co 11 and YouTube ACME 5". Pure. */
export const accountsLine = (xs: readonly AccountPosts[], counts = true): string =>
  andList(xs.map((a) => `${accountName(a)}${counts ? ` ${fmtInt(a.posts)}` : ''}`))

/** "the three Össur accounts we follow": what a brand's own posts are (the
 *  fresh check, 11 Nov: "40 posts Össur published" read as all of Össur's
 *  posts, where its regional accounts and other networks are not followed).
 *  Pure. */
export const followedAccounts = (company: string, n: number): string =>
  `the ${numberWord(n).toLowerCase()} ${company} ${n === 1 ? 'account' : 'accounts'} we follow`

/** A group Voices names for buying ("First-time buyer"), said for what it
 *  counts (the fresh check, 11 Nov: its people are mostly asking about or
 *  considering a purchase; the re-check, 11 Nov: 1 November's First-time
 *  buyer rests on 289 questions to 167 comments weighing a purchase, so the
 *  questions are said first). Null where no group's name says so. Pure. */
export function buyerNamesNote(groups: readonly Pick<BriefGroup, 'name'>[]): string | null {
  const named = groups.map((g) => g.name).filter((n) => /\bbuy(?:er|ers|ing)?\b|\bcustomers?\b|\bshoppers?\b|\bpurchas/i.test(n))
  if (named.length === 0) return null
  return `${andList(named.map((n) => `“${n}”`))} ${named.length === 1 ? 'is Voices’ name for a group' : 'are Voices’ names for groups'} of people asking questions about a purchase, some of them considering one; ${named.length === 1 ? 'its count is' : 'their counts are'} of videos, not purchases.`
}

/** Your products' foot: what its counts stand on, the base its line under
 *  the title names (the re-check, 11 Nov: "every video in your market" under
 *  a base of the videos read, your own posts in it). Pure. */
export function productsFoot(p: Pick<BriefProducts, 'month' | 'market'>): string {
  const on = p.market ? `the ${fmtInt(p.market)} videos we read in ${longMonth(p.month)}` : `the videos we read in ${longMonth(p.month)}`
  return `Counted on ${on}, your own posts included: on what their comments say, never on what your own posts say.`
}

export function buyersSub(month: string, groups: number, shown: number): string {
  const all = `${numberWord(groups)} ${groups === 1 ? 'group comments' : 'groups comment'} in your market in ${longMonth(month)}, as Voices describes them, ${GROUPS_ARE_NOT_BUYERS}.`
  return shown >= groups ? all : `${all} The ${numberWord(shown).toLowerCase()} in the most videos are here.`
}

/** The foot of Who is buying's last sheet: the groups no sheet holds, named,
 *  with their videos. Null where every group prints. Pure. */
export function alsoInMarket(month: string, rest: readonly Pick<BriefGroup, 'name' | 'videos'>[]): string | null {
  if (rest.length === 0) return null
  const m = `${longMonth(month)}’s`
  return rest.length === 1
    ? `Also in your market: ${rest[0].name}, in ${fmtInt(rest[0].videos)} of ${m} videos.`
    : `Also in your market: ${andList(rest.map((g) => `${g.name} (${fmtInt(g.videos)} videos)`))}.`
}

/** The record's line: "65 pieces of advice since 13 June: 1 decided, 4
 *  waiting." Pure. */
export function recordLine(m: Pick<BriefMoves, 'record' | 'waitingCount'>): string {
  const r = m.record
  const since = r.since ? ` since ${dayLong(r.since)}` : ''
  return `${fmtInt(r.total)} ${r.total === 1 ? 'piece' : 'pieces'} of advice${since}: ${fmtInt(r.decided)} decided, ${fmtInt(m.waitingCount)} waiting.`
}

/** What a piece of advice would move, counted: null where the month holds
 *  no reading of its conversation. A month's reading row is never written at
 *  zero, so a 0 is Your moves' "read in another month, not in this one"
 *  (`readMoveLevels`), which a brief never prints as a count (the re-check,
 *  11 Nov: "0 of 744" for a conversation the month's clustering did not
 *  read). Pure. */
export function aimLevel(aim: { k: number | null; n: number | null } | null | undefined): { k: number; n: number } | null {
  if (!aim || aim.k == null || aim.n == null || aim.k <= 0 || aim.n <= 0) return null
  return { k: aim.k, n: aim.n }
}

/** What an advice level counts (the re-check, 11 Nov: "744 category videos
 *  in October" are the category's videos whose comments were read that
 *  month, "the videos we read" as the brief says it elsewhere; Content's
 *  "2,090 category videos posted in October" are its uploads). One word
 *  more, not three: the line stays one line under Your moves' four pieces. */
export const AIM_BASE = 'category videos read'

/** A piece of advice's line under its title: "Raised 12 Oct · would move
 *  Where can I get one, 41 of 902 category videos read in October" (not
 *  "First raised": the line says what its count is of in the room the word
 *  took, one line under Your moves' four pieces, 11 Nov). Pure. */
export function adviceDetail(a: Pick<BriefAdvice, 'firstMade' | 'aim'>, month: string): string {
  const raised = `Raised ${shortDate(`${a.firstMade.slice(0, 10)}T00:00:00.000Z`)}`
  if (!a.aim) return raised
  const at = aimLevel(a.aim)
  const level = at ? `, ${fmtInt(at.k)} of ${fmtInt(at.n)} ${AIM_BASE} in ${longMonth(month)}` : ''
  return `${raised} · would move ${a.aim.label}${level}`
}

/** A dated move's line under its title: "Dated 5 Oct · Done · read on Cost
 *  and affordability frustration". Pure. */
export const moveLine = (m: Pick<BriefMove, 'day' | 'status' | 'label'>): string =>
  `Dated ${shortDate(`${m.day.slice(0, 10)}T00:00:00.000Z`)} · ${m.status}${m.label ? ` · read on ${m.label}` : ''}`

/** A move's month on its card: its videos of the market's where read, else
 *  why not (Your moves' slot reasons, in a word or two). Pure. */
export function slotWords(slot: { k: number | null; n: number | null; why: string | null; soFar?: boolean }): string {
  if (slot.k != null && slot.n != null) return `${fmtInt(slot.k)} of ${fmtInt(slot.n)}`
  switch (slot.why) {
    case 'pending': return 'Reads once ended'
    case 'unread': return 'No reading'
    case 'move': return 'No line'
    default: return 'Left off the line'
  }
}

/** A category's products as its row prints them ("Pro-Flex Terra 3 ·
 *  Pro-Flex XC 2"), or "None by name". Pure. */
export const categoryProducts = (c: BriefProducts['categories'][number]): string =>
  c.products.length ? c.products.map((p) => `${p.name} ${p.videos}${p.first ? ' First time' : ''}`).join(' · ') : 'None by name'

/** An idea's figure line: its videos over the days the ideas read beside
 *  its month, or the month's alone (decision 1: the four weeks never print
 *  without their month). Null with no month. Pure. */
export function ideaReadLine(x: Pick<BriefIdea, 'read' | 'month'>, i: Pick<BriefIdeas, 'read' | 'month'>): string | null {
  if (!x.month) return null
  const month = `${fmtInt(x.month.k)} of ${fmtInt(x.month.n)} in ${longMonth(i.month)}`
  return x.read ? `${fmtInt(x.read.k)} of ${fmtInt(x.read.n)} videos in your market, ${i.read.label} · ${month}` : month
}

/** Whether the company's posts touched on an idea's question, in Content's
 *  words (`OwnTouchLine`). Pure. */
export function ownTouchWords(own: BriefIdea['own']): string {
  const when = `since ${longMonth(own.since)}`
  if (own.state === 'unread') return 'Your posts could not be read just now'
  if (own.state === 'no_posts') return `You published nothing of your own ${when}`
  if (own.state === 'none') return `None of your ${fmtInt(own.posts)} posts ${when} touched on it`
  return `${fmtInt(own.touched)} of your ${fmtInt(own.posts)} posts ${when} touched on it`
}

/** Who asks, by group name (decision 5), in Content's words. Pure. */
export const whoAsks = (groups: readonly string[]): string => (groups.length ? groups.join(', ') : 'No group cites it')

/** The label over an idea's chips, as Content's card words it. Null with
 *  neither. Pure. */
export const recipeLabel = (x: Pick<BriefIdea, 'format' | 'opening'>): string | null =>
  x.format && x.opening ? 'Suggested format and opening' : x.format ? 'Suggested format' : x.opening ? 'Suggested opening' : null

/** The board's line where code chose neither. */
export const NO_RECIPE = 'No format stands out on this question yet'

/** Below this many videos named without being asked, a brand's count is few
 *  voices, and the notes say so. */
export const FEW_NAMED = 10

/** The notes under the brands table (code's), over the rows the table
 *  prints: the company's count beside its rivals' on the one base (never "named
 *  most" over a table without the company: the blind-report check, 9 Nov),
 *  few voices where every count is, and what the praise and complaints count.
 *  Pure. */
export function namedNotes(n: BriefNamed, company: string): string[] {
  const rivals = [...n.rows].filter((r) => !r.you).sort((x, y) => y.named.k - x.named.k || x.label.localeCompare(y.label))
  const out: string[] = []
  const you = n.rows.find((r) => r.you)
  const count = (k: number) => (k === 0 ? 'none' : fmtInt(k))
  const theirs = andList(rivals.slice(0, 2).map((r) => `${r.label} in ${count(r.named.k)}`))
  if (you) out.push(`Of the ${fmtInt(n.base)} videos none of our brand searches found, ${company} was named in ${count(you.named.k)}${theirs ? `, ${theirs}` : ''}.`)
  else if (rivals.length) out.push(`Of the ${fmtInt(n.base)} videos none of our brand searches found, ${theirs}.`)
  if (n.rows.length && n.rows.every((r) => r.named.k < FEW_NAMED)) out.push(`Few voices: no brand was named in ${numberWord(FEW_NAMED).toLowerCase()} or more of them.`)
  const widest = [...rivals].filter((r) => r.praised && r.complained && r.praised.n > 0).sort((x, y) => (y.praised?.n ?? 0) - (x.praised?.n ?? 0) || x.label.localeCompare(y.label))[0]
  if (widest?.praised && widest.complained) out.push(`Of the ${fmtInt(widest.praised.n)} videos in your market naming ${widest.label} in any way, ${fmtInt(widest.praised.k)} held praise in their comments and ${fmtInt(widest.complained.k)} a complaint, about anything in the video.`)
  return out
}

/** The line the Leadership groups' foot adds where the Sales brief prints its
 *  groups (compose.ts `pointToSalesGroups`). */
export const SALES_GROUPS_LINE = 'What each wants, and what stops them, is in the Sales brief.'

const VOICES = '/dashboard/voices'
const PRODUCTS = '/dashboard/products'
const CONTENT = '/dashboard/content'
const MOVES = '/dashboard/moves'

/** The month's Voices page (`voicesMonthQuery`'s form). */
export const voicesMonthHref = (month: string): string => `${VOICES}?month=${encodeURIComponent(yyyymm(month))}`

/** A page that reads `?month=` (Your moves' and its advice, move and record
 *  pages: `readCore`), at the brief's month, any query and anchor kept. So a
 *  brief opened later lands on the month its figures are, not today's
 *  reading month. Pure. */
export function withMonth(href: string, month: string): string {
  const at = href.indexOf('#')
  const path = at < 0 ? href : href.slice(0, at)
  const hash = at < 0 ? '' : href.slice(at)
  return `${path}${path.includes('?') ? '&' : '?'}month=${encodeURIComponent(yyyymm(month))}${hash}`
}

/** The page of the app an October page's header links to (every page links
 *  to its app page, the boards' rule): the closest page, with the month. The
 *  paths are the surfaces' (lib/nav.ts `SURFACES`, pinned in app.test.ts).
 *  Pure. */
export function pageHref(key: SectionKey | 'in_short' | 'finding', month: string): string {
  switch (key) {
    case 'in_short': return surface('home').href
    case 'sales.groups': case 'sales.rivals': case 'marketing.rivals': case 'marketing.named': case 'leadership.groups': case 'leadership.shares':
      return voicesMonthHref(month)
    case 'marketing.products': return `${PRODUCTS}?month=${encodeURIComponent(yyyymm(month))}`
    case 'content.ideas': case 'content.watch': case 'content.more': case 'content.confusion': return CONTENT
    case 'content.hooks': return `${CONTENT}#what-works`
    case 'leadership.moves': return withMonth(MOVES, month)
    case 'leadership.holds': return marketMonthHref(month, MARKET_LONG_RUN_ANCHOR)
    default: return marketMonthHref(month)
  }
}

/** Everything an October page says in words, its items' and its code's
 *  lines: what In short may sum up (compose.ts `printedTexts`) and what its
 *  check reads (inshort.ts `sectionLines`). No voice's words. Pure. */
export function appLines(s: BriefSection): string[] {
  const out: (string | null | undefined)[] = []
  if (s.people) {
    for (const g of s.people.groups) {
      out.push(`${g.name}: ${fmtInt(g.videos)} of ${fmtInt(s.people.market)} videos. ${g.oneLiner}`)
      if (s.key === 'sales.groups') out.push(`What they want: ${g.wants}`, `What stops them: ${g.stops}`, `What tips them: ${g.tips}`)
      // Who is in your market's card says the subject alone (no products);
      // Who is buying's "In their videos" says both.
      out.push(inTheirVideos(s.key === 'sales.groups' ? g : { ...g, products: null }))
    }
  }
  if (s.moves) {
    for (const a of s.moves.waiting) out.push(`${a.title}${a.aim ? ` (would move ${a.aim.label})` : ''}`)
    // The page draws the first move's card; the rest are a count.
    for (const m of s.moves.moves.slice(0, 1)) out.push(`${m.title}: ${m.sentence}`)
    out.push(recordLine(s.moves))
  }
  if (s.products) {
    for (const c of s.products.categories) out.push(`${c.name}: ${fmtInt(c.videos)} videos, ${fmtInt(c.named)} naming yours${c.products.length ? `: ${c.products.map((p) => `${p.name} ${p.videos}${p.first ? ' (first time)' : ''}`).join(', ')}` : ''}`)
    for (const x of s.products.standouts) out.push(`${x.label}: ${x.name}. ${x.text}`)
  }
  if (s.named) {
    for (const r of s.named.rows) out.push(`${r.you ? `${r.label} (you)` : r.label}: named outside our searches in ${fmtInt(r.named.k)} of ${fmtInt(r.named.n)}${r.praised && r.complained ? `; praised ${fmtInt(r.praised.k)}, complained ${fmtInt(r.complained.k)} of ${fmtInt(r.praised.n)}` : ''}${r.top ? `; talked about for ${r.top.label}` : ''}`)
  }
  if (s.ideas) {
    for (const i of s.ideas.ideas) {
      out.push(i.title, ...i.asks.map((a) => a.label), i.format ? `Format: ${i.format.label}` : null, i.opening ? `Opening: ${i.opening.label}` : null, i.groups.length ? `Who's asking: ${i.groups.join(', ')}` : null)
    }
    if (s.ideas.asked.length) out.push(`Also asked: ${s.ideas.asked.map((a) => a.label).join(', ')}`)
  }
  if (s.hooks) {
    for (const [t, label] of [[s.hooks.formats, 'Format'], [s.hooks.openings, 'Opening']] as const) {
      for (const r of t?.rows ?? []) out.push(`${label} ${r.label}: ${r.share}% of the category${r.multiple != null ? `, response ${multipleText(r.multiple)}` : ''}`)
    }
    const p = s.hooks.posts
    if (p) out.push(`Your posts in ${longMonth(s.hooks.month)}: ${fmtInt(p.total)}${p.response ? `, response ${multipleText(p.response.multiple)}` : ''}`, p.sentence, p.best ? `Best this month: ${p.best.format ?? 'a post'} on ${platformLabel(p.best.platform)}, ${multipleText(p.best.multiple)}` : null)
  }
  out.push(s.also, ...(s.lines ?? []), s.foot)
  return out.map((x) => (x ?? '').trim()).filter(Boolean)
}
