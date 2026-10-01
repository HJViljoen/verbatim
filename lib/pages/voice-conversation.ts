import type { SupabaseClient } from '@supabase/supabase-js'

import { attributeAudiences, attributeVideos, sortParts, type About, type AboutPart, type AttributionInputs } from '../brands/attribution'
import { chunk, UUID_IN_CHUNK } from '../chunk'
import { kindLabel } from '../reading/kinds'
import { monthStartOf } from '../reading/month-key'
import { TABLE_THEME_READINGS } from '../reading/types'
import { CLIENT_AUDIENCE, rivalNameOf } from '../rivals'
import { selectAll } from '../supabase-admin'
import { loadActiveSubjects } from '../subjects/membership'
import { subjectCalibration } from '../subjects/calibration-state'
import { isMissingSubjects } from '../subjects/types'
import type { Quote } from '../renderables/types'
import { WHAT_THEY_SELL } from './market-frame'
import { makerFraction, segmentOf } from './overview-market'
import { loadMemberInsightIdsBySubject } from './subjects'

// Conversation, as the approved artboard draws it (the pages build, 1 Oct;
// Page-Conversation.dc.html). What the page adds to the loader's board, pane,
// cast and accounts: who each item of talk is about (lib/brands/attribution.ts),
// the subject a conversation is part of, the makers' share in words, and THE
// MARKET'S WORDS AS AN ANALYSIS BY KIND (Heinrich: no quote walls): for each of
// six kinds, its videos in the market and who they are about, the category's
// conversations of that kind it was said most in, the conversations on videos
// about the client and its rivals, and at most one quote.
//
// PURE HALF FIRST, THEN THE READS.

/** The six kinds the analysis draws, in the artboard's pairs. */
export const CONV_KIND_ROWS = [['praise', 'purchase_intent'], ['question', 'pain_point'], ['feature_request', 'objection']] as const
export const CONV_KINDS: readonly string[] = CONV_KIND_ROWS.flat()
/** Every kind a pane may count. */
const ALL_KINDS = [...CONV_KIND_ROWS.flat(), 'buying_trigger', 'switching_signal', 'demographic_signal']

/** A category conversation is listed under its kind at this many videos. */
export const KIND_ITEM_FLOOR = 4
/** The rows a kind lists, and the most it lists when the fifth is tied. */
export const KIND_ITEMS = 5
export const KIND_ITEMS_MAX = 8
/** A conversation on videos about the client or a rival is listed at this. */
export const BRAND_ITEM_FLOOR = 2
export const BRAND_ITEMS_MAX = 6
/** Accounts the card lists before "All N accounts". */
export const WHERE_SHOWN = 5
/** A maker-led conversation's share is printed in the makers' line at this. */
export const MAKER_LINE_SHARE_FLOOR = 3

/** The kinds in the artboard's words. Praise names what the tenant sells
 *  ("Praised a bag"); a tenant with no noun reads "Praised it". */
export function convKindLabel(kind: string, clientId: string): string {
  switch (kind) {
    case 'praise': {
      const noun = WHAT_THEY_SELL[clientId]
      return noun ? `Praised a ${singular(noun)}` : 'Praised it'
    }
    case 'purchase_intent': return 'Said they want to buy'
    case 'question': return 'Asked a question'
    case 'pain_point': return 'Complained about something'
    case 'feature_request': return 'Wished for something'
    case 'objection': return 'Pushed back'
    case 'buying_trigger': return 'Said what made them look'
    case 'switching_signal': return 'Said they’re switching'
    case 'demographic_signal': return 'Said who they are'
    default: return kindLabel(kind)
  }
}

/** "bags" → "bag". */
function singular(noun: string): string {
  return noun.endsWith('ies') ? `${noun.slice(0, -3)}y` : noun.endsWith('s') ? noun.slice(0, -1) : noun
}

/** A share as the page prints it: whole percent, half up. */
export const shareOf = (k: number, n: number): number => (n > 0 ? Math.floor((100 * k) / n + 0.5) : 0)

/** The fraction the artboard says ("a third"), from the board's own ladder
 *  without its "about"; null under a fifth, unmeasured, or half or more
 *  (such a conversation is set apart in the makers' line). */
function makerWordsOf(share: number | null | undefined): string | null {
  const f = makerFraction(share)
  if (!f || f === 'mostly') return null
  return f.replace(/^about /, '')
}

/** "a third on makers’ posts", or null. */
export function makerPostsPhrase(share: number | null | undefined): string | null {
  const f = makerWordsOf(share)
  return f ? `${f} on makers’ posts` : null
}

/** "A third of its videos are makers’ own posts.", or null. */
export function makerPostsSentence(share: number | null | undefined): string | null {
  const f = makerWordsOf(share)
  return f ? `${f.charAt(0).toUpperCase()}${f.slice(1)} of its videos are makers’ own posts.` : null
}

/**
 * The subject a conversation is part of: the one holding the most of its
 * member insights, at least 3 of them and at least 15% (the written read's
 * rule, lib/written/pool.ts `subjectForTheme`, restated here so the page does
 * not import the pipeline's pool; the test pins the two together). A tie goes
 * to the subject earlier in `order`, then by id.
 */
export function subjectOfTheme(
  memberIds: readonly string[],
  subjectsOf: ReadonlyMap<string, readonly string[]>,
  order: readonly string[] = [],
): string | null {
  const members = [...new Set(memberIds)]
  if (members.length === 0) return null
  const counts = new Map<string, number>()
  for (const id of members) for (const s of new Set(subjectsOf.get(id) ?? [])) counts.set(s, (counts.get(s) ?? 0) + 1)
  const at = (s: string) => {
    const i = order.indexOf(s)
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  let best: string | null = null
  let bestN = 0
  for (const [s, n] of counts) {
    if (n > bestN || (n === bestN && best != null && (at(s) - at(best) || s.localeCompare(best)) < 0)) {
      best = s
      bestN = n
    }
  }
  return best != null && bestN >= 3 && bestN / members.length >= 0.15 ? best : null
}

/** A category conversation as the kind analysis weighs it. */
export interface KindTheme {
  id: string
  label: string
  kind: string | null
  k: number
  makerShare: number | null
  noiseShare: number | null
}

/**
 * The category conversations a kind lists: of that kind, at the floor, not
 * led by makers or off-topic videos, by videos (then id); the top five, and
 * every one tied with the fifth, at most eight. Pure.
 */
export function kindItems(themes: readonly KindTheme[], kind: string): KindTheme[] {
  const ranked = themes
    .filter((t) => t.kind === kind && t.k >= KIND_ITEM_FLOOR && t.label.trim() && segmentOf(t) == null)
    .sort((a, b) => b.k - a.k || a.id.localeCompare(b.id))
  if (ranked.length <= KIND_ITEMS) return ranked
  const fifth = ranked[KIND_ITEMS - 1].k
  return ranked.filter((t, i) => i < KIND_ITEMS || t.k === fifth).slice(0, KIND_ITEMS_MAX)
}

/** One month reading of a conversation under the client's or a rival's videos. */
export interface BrandThemeRow {
  themeId: string
  audience: string
  videos: number
  label: string | null
  kind: string | null
}

export interface ConvBrandItem {
  about: About
  themeId: string
  label: string
  videos: number
}

/** "On videos about {client} and its rivals": the kind's conversations under
 *  the client's own posts first, then under each rival's, by videos. Pure. */
export function brandItems(rows: readonly BrandThemeRow[], kind: string): ConvBrandItem[] {
  const aboutOf = (audience: string): About | null =>
    audience === CLIENT_AUDIENCE ? 'client' : rivalNameOf(audience) ? (`rival:${rivalNameOf(audience)}` as About) : null
  return rows
    .filter((r) => r.kind === kind && r.videos >= BRAND_ITEM_FLOOR && (r.label ?? '').trim() && aboutOf(r.audience))
    .map((r) => ({ about: aboutOf(r.audience) as About, themeId: r.themeId, label: (r.label as string).trim(), videos: r.videos }))
    .sort((a, b) => Number(b.about === 'client') - Number(a.about === 'client') || b.videos - a.videos || a.themeId.localeCompare(b.themeId))
    .slice(0, BRAND_ITEMS_MAX)
}

/** The first sentence of a persona's line, trimmed (the artboard's cut). */
export function firstSentence(s: string | null | undefined): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  const m = /^[\s\S]*?[.!?](?=\s|$)/.exec(t)
  return (m ? m[0] : t).trim()
}

/** Emoji out, spaces closed (the artboard prints none). */
export function stripEmoji(s: string): string {
  return s.replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}]/gu, ' ').replace(/\s+/g, ' ').trim()
}

// ---- the shapes the page prints ---------------------------------------------------

/** A quote with its source line and who the words are about. */
export interface ConvQuote {
  quote: Quote
  /** "TikTok · 6 Sep". */
  source: string
  who: AboutPart[]
}

export interface ConvBoardRow {
  who: AboutPart[]
  subject: string | null
  makers: string | null
}

export interface ConvKindItem {
  themeId: string
  label: string
  videos: number
  who: AboutPart[]
}

export interface ConvKind {
  kind: string
  label: string
  /** The kind's videos in the market this month. */
  videos: number
  /** Those videos by who they are about (the audiences' own answer). */
  split: AboutPart[]
  items: ConvKindItem[]
  brandItems: ConvBrandItem[]
  quote: ConvQuote | null
}

/** What the artboard adds to the loader's data. Optional on the data, so a
 *  stored copy taken before it still renders. */
export interface ConversationExtras {
  names: { client: string; market: { long: string; short: string } }
  /** "in September so far" while the month is under way, else "in September". */
  monthWords: string
  /** By registry id: the board's rows and the open conversation. */
  rows: Record<string, ConvBoardRow>
  /** The open conversation's voices with who each is about. */
  voices: ConvQuote[]
  kinds: ConvKind[]
  /** Every kind in the artboard's words ("Praised a bag"), for the pane. */
  kindLabels?: Record<string, string>
}

/** A video set and the comments its talk rests on, for one item. */
export interface TalkRef {
  videoIds: readonly string[]
  comments: ReadonlySet<string> | null
}

/** Who an item of talk is about, or [] where its videos were not read. */
export function whoOf(ref: TalkRef | undefined, inputs: AttributionInputs | null): AboutPart[] {
  if (!ref || !inputs || ref.videoIds.length === 0) return []
  return attributeVideos(ref.videoIds, inputs, { comments: ref.comments })
}

/** A kind's split by audience, most first (the artboard prints the market
 *  first here, where it is the biggest part). */
export function kindSplit(rows: readonly { audience: string; kind: string; videos: number | null }[], kind: string, client: string): AboutPart[] {
  const parts = attributeAudiences(rows.filter((r) => r.kind === kind).map((r) => ({ audience: r.audience, videos: Number(r.videos ?? 0) })), { client })
  return sortParts(parts, { client }).sort((a, b) => b.videos - a.videos)
}

// ---- the reads --------------------------------------------------------------------

/** The month's conversations under the client's own posts and the rivals'
 *  videos, at the floor. [] where the table is not there. */
export async function loadBrandThemeRows(db: SupabaseClient, clientId: string, month: string, rivalAudiences: readonly string[]): Promise<{ themeId: string; audience: string; videos: number }[]> {
  try {
    const rowsIn = await selectAll<{ theme_id: string; audience: string; videos: number }>(() => db
      .from(TABLE_THEME_READINGS)
      .select('theme_id, audience, videos')
      .eq('client_id', clientId)
      .eq('month', monthStartOf(month))
      .in('audience', [CLIENT_AUDIENCE, ...rivalAudiences])
      .gte('videos', BRAND_ITEM_FLOOR)
      .order('theme_id'))
    return rowsIn.map((r) => ({ themeId: String(r.theme_id), audience: r.audience, videos: Number(r.videos) }))
  } catch (error) {
    console.error(`[pages] voice.brandThemes: ${(error as Error)?.message ?? String(error)}; not read`)
    return []
  }
}

/** Labels and kinds (and, where asked, member ids) of these conversations on
 *  the themed update. */
export async function loadThemeFacts(
  supabase: SupabaseClient,
  clientId: string,
  themedRunId: string | null,
  ids: readonly string[],
  members = false,
): Promise<Map<string, { label: string | null; kind: string | null; memberIds: string[] }>> {
  const out = new Map<string, { label: string | null; kind: string | null; memberIds: string[] }>()
  if (!themedRunId || ids.length === 0) return out
  const cols: string = members ? 'theme_id, label, category, member_insight_ids' : 'theme_id, label, category'
  try {
    const parts = await Promise.all(chunk([...new Set(ids)], UUID_IN_CHUNK).map((part) => selectAll<{ theme_id: string; label: string | null; category: string | null; member_insight_ids?: string[] | null }>(() => supabase
      .from('theme_observations')
      .select(cols)
      .eq('client_id', clientId)
      .eq('run_id', themedRunId)
      .in('theme_id', part)
      .order('theme_id') as never)))
    for (const r of parts.flat()) {
      out.set(String(r.theme_id), { label: r.label?.trim() || null, kind: r.category ?? null, memberIds: (r.member_insight_ids ?? []).map(String) })
    }
  } catch (error) {
    console.error(`[pages] voice.themeFacts: ${(error as Error)?.message ?? String(error)}; not read`)
  }
  return out
}

/** The ready subjects (a subject whose membership is not verified tags
 *  nothing) and which of them each insight is a member of. Null where the
 *  subjects are not recorded here. */
export async function loadReadySubjects(supabase: SupabaseClient, clientId: string): Promise<{ names: Map<string, string>; order: string[]; subjectsOf: Map<string, string[]> } | null> {
  try {
    const subjects = (await loadActiveSubjects(supabase as never, clientId)).filter((s) => subjectCalibration(s) === 'ready')
    if (subjects.length === 0) return null
    const bySubject = await loadMemberInsightIdsBySubject(supabase, clientId, subjects.map((s) => s.id))
    if (!bySubject) return null
    const subjectsOf = new Map<string, string[]>()
    for (const [subject, ids] of bySubject) for (const id of ids) subjectsOf.set(id, [...(subjectsOf.get(id) ?? []), subject])
    return { names: new Map(subjects.map((s) => [s.id, s.name])), order: subjects.map((s) => s.id), subjectsOf }
  } catch (error) {
    if (!isMissingSubjects(error)) console.error(`[pages] voice.subjects: ${(error as Error)?.message ?? String(error)}; not read`)
    return null
  }
}

// ---- the assembly (pure) ------------------------------------------------------------

/** A quote as the loader holds it before it is attributed. */
export interface QuoteSeed {
  quote: Quote
  platform: string | null
  /** The comment's date. */
  date: string | null
  commentId: string | null
  videoId: string | null
}

/** "TikTok · 6 Sep". */
export function quoteSource(platformLabel: (p: string) => string, shortDate: (iso: string) => string, q: Pick<QuoteSeed, 'platform' | 'date'>): string {
  return [q.platform ? platformLabel(q.platform) : null, q.date ? shortDate(q.date) : null].filter(Boolean).join(' · ')
}

export function buildConversation(input: {
  client: string
  market: { long: string; short: string }
  month: string
  monthName: string
  /** The month is still under way (the reading's own state). */
  soFar: boolean
  /** The board's rows and the open conversation, by registry id. */
  boardIds: readonly string[]
  /** Each conversation's videos in the month and the comments its talk rests on. */
  talk: ReadonlyMap<string, TalkRef>
  attribution: AttributionInputs | null
  /** Member insight ids by conversation (the board's). */
  members: ReadonlyMap<string, readonly string[]>
  subjects: { names: ReadonlyMap<string, string>; order: readonly string[]; subjectsOf: ReadonlyMap<string, readonly string[]> } | null
  /** Makers' share by conversation, where the segments were measured; null
   *  where they were not (nothing is said about makers then). */
  makerShares: ReadonlyMap<string, number | null> | null
  kindThemes: readonly KindTheme[]
  brandRows: readonly BrandThemeRow[]
  /** The month's kind readings on the market's audiences. */
  kindRows: readonly { audience: string; kind: string; videos: number | null }[] | null
  kindVideos: ReadonlyMap<string, number> | null
  kindLabel: (kind: string) => string
  voices: readonly QuoteSeed[]
  kindQuotes: ReadonlyMap<string, QuoteSeed>
  source: (q: QuoteSeed) => string
}): ConversationExtras {
  const quoteWho = (q: QuoteSeed): ConvQuote => ({
    quote: q.quote,
    source: input.source(q),
    who: q.videoId && input.attribution
      ? attributeVideos([q.videoId], input.attribution, { comments: q.commentId ? new Set([q.commentId]) : new Set<string>() })
      : [],
  })
  const rows: Record<string, ConvBoardRow> = {}
  for (const id of new Set(input.boardIds)) {
    const subjectId = input.subjects ? subjectOfTheme(input.members.get(id) ?? [], input.subjects.subjectsOf, input.subjects.order) : null
    rows[id] = {
      who: whoOf(input.talk.get(id), input.attribution),
      subject: subjectId ? input.subjects?.names.get(subjectId) ?? null : null,
      makers: input.makerShares ? makerPostsPhrase(input.makerShares.get(id)) : null,
    }
  }
  const kinds: ConvKind[] = []
  for (const kind of CONV_KINDS) {
    const items = kindItems(input.kindThemes, kind).map((t) => ({ themeId: t.id, label: t.label, videos: t.k, who: whoOf(input.talk.get(t.id), input.attribution) }))
    const brand = brandItems(input.brandRows, kind)
    if (items.length === 0 && brand.length === 0) continue
    const split = input.kindRows ? kindSplit(input.kindRows, kind, input.client) : []
    const videos = input.kindVideos?.get(kind) ?? split.reduce((n, p) => n + p.videos, 0)
    const q = input.kindQuotes.get(kind)
    kinds.push({ kind, label: input.kindLabel(kind), videos, split, items, brandItems: brand, quote: q ? quoteWho(q) : null })
  }
  return {
    names: { client: input.client, market: input.market },
    monthWords: input.soFar ? `in ${input.monthName} so far` : `in ${input.monthName}`,
    rows,
    voices: input.voices.map(quoteWho),
    kinds,
    kindLabels: Object.fromEntries(ALL_KINDS.map((k) => [k, input.kindLabel(k)])),
  }
}
