import { longMonth } from '@/lib/format'
import { sortParts, type MarketLabels } from '@/lib/brands/labels'
import type { About, StatementReading } from '@/lib/statements/types'

// Your moves (pages build, package MOVES): the page's words and the pure
// helpers its blocks print through, in one place so the tests can hold them.
// Every string here is the artboard's (Page-Your-moves.dc.html).

/** Palette A, set locally: the app's tokens are still the old brand's (the
 *  muted grey is #6B7075 there, the hairline cooler). The app-wide colour swap
 *  is a later task; these are the artboard's values. */
export const PALETTE = {
  ink: '#26292C',
  muted: '#5F656B',
  hair: '#E4E2DC',
  ground: '#F7F6F2',
  yellow: '#FFD43B',
  track: '#ECEAE4',
  gold: '#9A6B00',
} as const

export const PAGE_TITLE = 'Your moves'
export const CHECK_A_PLAN = 'Check a plan'
/** Where a plan is checked: the Agent's upload. */
export const CHECK_A_PLAN_HREF = '/dashboard/agent'

export const STATEMENTS_TITLE = 'Your statements'
export const STATEMENT_PLACEHOLDER = 'Add a statement, e.g. Made from 100% recycled nylon'
export const STATEMENT_LABEL = 'Add a statement'
export const STATEMENT_MENU_LABEL = 'Edit or remove this statement'
export const COLUMN_HEADS = ['You say', 'Talked about in', 'How people treat it'] as const
export const OF_MARKET_VIDEOS = 'of your market’s videos'
export const NOBODY_ANYWHERE = 'Nobody repeats it, in your market or under your own posts.'
export const STANCE_LABELS = { backs: 'Back it up', doubts: 'Doubt it', asks: 'Ask about it' } as const

export const CONSIDERING_TITLE = 'Moves worth considering'
export const CONSIDERING_SUB = 'Accept one to date it as a move'
/** The most pieces of advice the block draws. */
export const CONSIDERING_MAX = 5

/** "in September", or "in October so far" while the month is under way (U1:
 *  "so far" is a calendar fact). */
export function inMonthPhrase(month: string, complete: boolean): string {
  return `in ${longMonth(month)}${complete ? '' : ' so far'}`
}

/** The block's base, stated once: "Share of the 852 videos in your market in
 *  September". */
export function statementsBase(base: number, month: string, complete: boolean): string {
  return `Share of the ${fmt(base)} videos in your market ${inMonthPhrase(month, complete)}`
}

export function statementsLead(brand: string): string {
  return `What you say about ${brand}. For each statement, how much your market talks about the idea, and whether people back it up, doubt it or ask about it.`
}

export function nobodyInMarket(month: string, complete: boolean): string {
  return `Nobody in your market raised it ${inMonthPhrase(month, complete)}.`
}

/** A share drawn against 100%, rounded half up as the artboard rounds it. */
export function pct(k: number, n: number): number {
  return n > 0 ? Math.floor((100 * k) / n + 0.5) : 0
}

/** A bar's width, against 100% of its base, never against the top row. */
export function barWidth(k: number, n: number): number {
  return n > 0 ? Math.max(0, Math.min(100, (100 * k) / n)) : 0
}

export const fmt = (n: number): string => n.toLocaleString('en-US')

/** One part of a brand line: who the talk is about, as it prints. */
export interface WhoPart {
  key: string
  name: string
  tone: 'client' | 'rival' | 'market'
  videos: number
}

/** The brand line's parts, in the one order every page uses (the client,
 *  the rivals by videos, the market last: `sortParts`), whatever order a
 *  stored reading kept. One part prints its name alone; several print short
 *  names with their counts. The market's words are the tenant's
 *  (`marketLabels`), never a hard-coded noun. */
export function whoParts(who: StatementReading['who'], brand: string, market: MarketLabels): WhoPart[] {
  const sorted = sortParts(who, { client: brand })
  const several = sorted.length > 1
  return sorted.map((w) => ({
    key: w.about,
    name: aboutName(w.about, brand, market, several),
    tone: w.about === 'client' ? 'client' : w.about === 'market' ? 'market' : 'rival',
    videos: w.videos,
  }))
}

export function aboutName(about: About, brand: string, market: MarketLabels, short = false): string {
  if (about === 'client') return brand
  if (about === 'market') return short ? market.short : market.long
  return about.slice('rival:'.length)
}

const PRIORITY: Record<string, string> = { high: 'High priority', medium: 'Medium priority', low: 'Low priority' }

/** "High priority", or null for a row with no ranking (no chip). */
export function priorityLabel(priority: string | null | undefined): string | null {
  return PRIORITY[(priority ?? '').toLowerCase()] ?? null
}

/** The stored type slug as it prints: the artboard's labels for the named
 *  types, and a custom slug in words ("partnerships" → "Partnerships"). */
const TYPE_LABEL: Record<string, string> = {
  product: 'Product',
  positioning_messaging: 'Positioning',
  customer_experience: 'Customer experience',
  competitive_response: 'Competitive response',
  audience_targeting: 'Audience targeting',
  content_communication: 'Content',
}

export function typeLabel(kind: string | null | undefined): string | null {
  const k = (kind ?? '').trim()
  if (!k || k === 'other') return null
  if (TYPE_LABEL[k]) return TYPE_LABEL[k]
  const words = k.replace(/[_-]+/g, ' ').trim()
  return words ? words[0].toUpperCase() + words.slice(1) : null
}

/** The argument as the artboard prints it: its first sentence, and the second
 *  as well where the two together stay short. */
export const WHY_MAX = 240

export function whyLead(why: string | null | undefined): string | null {
  const text = (why ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return null
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z“"‘'])/)
  const first = sentences[0]
  const two = sentences.length > 1 ? `${first} ${sentences[1]}` : first
  return two.length <= WHY_MAX ? two : first
}
