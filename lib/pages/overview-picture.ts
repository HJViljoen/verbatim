import type { SupabaseClient } from '@supabase/supabase-js'

import { fmtInt, longMonth } from '../format'
import { fetchQuoteResolutionsByRefs } from '../quotes'
import { LEVEL_FLOOR_N } from '../reading/level'
import { marketAudiences, pooledDenominators } from '../reading/market'
import { monthStartOf, prevMonth } from '../reading/month-key'
import { loadMonthSeries, type ReadingHandle } from '../reading/read'
import { loadDeliveredRuns, loadReadingSchedule, marketRivalAudiences, readingViewFrom } from '../reading/reading-view'
import { MONTH_PARAM } from '../reading/reading-month'
import { INDUSTRY_AUDIENCE, loadCompetitors, loadTrackedRivals } from '../rivals'
import { loadStanding } from '../written/standing'
import { loadPublishedLongRun, loadPublishedWeekRead } from '../written/published'
import type { LongRunReadData, StandingFact, WhoPart } from '../written/types'
import { loadCommentNamings, trackedBrands, whoSplit, type WhoVideo } from '../brands/attribution'
import { fetchRunningRunIds } from './latest-video-run'
import { WHAT_THEY_SELL } from './market-frame'
import { loadBoardObservations, loadBoardThemes, loadThemeSegmentRows, makerRuleEnabled, themeSegmentsOf } from './overview'
import { buildThemeBoard, byBoardOrder, segmentOf, type MarketTheme, type ThemeBoard } from './overview-market/board'
import { talkKindLabel } from './overview-market/kinds'
import { fetchThemedRunId } from './themed-run'

// Your market as "the bigger picture" (pages build, 1 Oct; the design
// `Page-Your-market.dc.html`). Four blocks, in order:
//  (a) "What holds across {months}": the PUBLISHED long-run read
//      (`week_reads` kind 'month', lib/written/longrun.ts, through
//      `loadPublishedLongRun`: the newest ready one, as soon as the run that
//      closed the month writes it), as stored. None: the block is omitted;
//  (b) "Where your market stands": EVERY tracked subject in one list
//      (`loadStanding`, the written read's own standing facts: its levels are
//      the Subjects page's). A ready subject prints its share, the latest
//      week read's sentence on it where that read is of this month, the
//      conversations inside it and its gated quote; any other subject its
//      name alone, with no figure and no note;
//  (c) "The biggest conversations": the theme board's top five (the
//      category's, makers' themes set apart in one line), each with who the
//      talk is about;
//  (d) "What people do in the comments": the six kinds, levels only, on the
//      market's base, each with who the videos are about.
// Nothing compares two months, and nothing says how any of it was read.
//
// ONE MONTH, THE READING MONTH (decision A, `readingViewFrom`), or the month
// `?month=` names (the monthly email's link lands here). Every block that
// states a base states it once, in its subtitle.
//
// THE READS. One wave for who and when (the runs, the rivals, the schedule,
// the stored denominators, the long-run read, the latest week read), then one
// for the month (the standing facts; the board's rows, observations and
// segment shares; the kinds), then the board's top five's brand mentions and
// the subjects' quotes. Every read is the service role's (`reading.client`),
// scoped to the session's client: `week_reads` has no tenant policy.

/** The kinds the block prints, as the design lists them. */
export const PICTURE_KINDS = ['praise', 'purchase_intent', 'question', 'pain_point', 'feature_request', 'objection'] as const
/** The conversations it prints. */
export const PICTURE_CONVERSATIONS = 5
/** At most this many conversations named under each subject. */
export const PICTURE_CONTENTS = 3
/** Makers' themes named on the makers line, at most. */
export const PICTURE_MAKERS_NAMED = 3

/** The noun the copy uses for what the client sells ("bags"), or null. */
export function soldNoun(clientId: string): string | null {
  return WHAT_THEY_SELL[clientId] ?? null
}

/** A kind's label, as the design words it ("Praised a bag"). */
export function pictureKindLabel(kind: string, noun: string | null): string {
  return talkKindLabel(kind, noun)
}

/** "September so far" while the month is under way, else "September". */
export function monthLabel(month: string, soFar: boolean): string {
  return soFar ? `${longMonth(month)} so far` : longMonth(month)
}

/** A level as a row prints it: a bare share at a base of a hundred videos,
 *  else the count (the subtitle carries the base). The bar is drawn against
 *  100% either way. Pure. */
export function rowLevel(k: number, n: number): { text: string; kind: 'share' | 'count'; pct: number } {
  const pct = n > 0 ? Math.max(0, Math.min(100, (k / n) * 100)) : 0
  return n >= LEVEL_FLOOR_N ? { text: `${Math.round(pct)}%`, kind: 'share', pct } : { text: fmtInt(k), kind: 'count', pct }
}

// ---- The shapes -------------------------------------------------------------------

export interface PictureQuote {
  text: string
  lang: string | null
  english: string | null
  platform: string | null
  date: string | null
}

export interface StandsRow {
  subjectId: string
  name: string
  /** Null where the subject prints its name alone. */
  level: { k: number; n: number; text: string; kind: 'share' | 'count'; pct: number } | null
  sentence: string | null
  contents: string[]
  quote: PictureQuote | null
}

export interface StandsBlock {
  /** The market's videos in the month: the base every level is of. */
  n: number | null
  rows: StandsRow[]
}

export interface ConversationRow {
  registryId: string
  label: string
  k: number
  text: string
  kind: 'share' | 'count'
  pct: number
  who: WhoPart[]
}

export interface ConversationsBlock {
  /** The category's videos in the month. */
  n: number
  rows: ConversationRow[]
  /** Makers' themes, set apart: the biggest by name, and how many of the
   *  month's five largest threads they are. Null where none is set apart. */
  makers: { labels: string[]; inTopFive: number } | null
}

export interface KindRow {
  kind: string
  label: string
  k: number
  text: string
  kindOfLevel: 'share' | 'count'
  pct: number
  /** The category first, then the rivals by videos (the design's line). */
  who: WhoPart[]
}

export interface KindsBlock {
  n: number
  rows: KindRow[]
}

export interface MarketPictureData {
  brand: string
  noun: string | null
  month: string
  soFar: boolean
  /** "September so far", or "September" once it has ended. */
  monthText: string
  longRun: LongRunReadData | null
  stands: StandsBlock | null
  conversations: ConversationsBlock | null
  kinds: KindsBlock | null
}

// ---- The builders (pure) -------------------------------------------------------------------

/**
 * "Where your market stands": every tracked subject, the ready ones first and
 * largest first (the standing facts' own order), then the rest by name with
 * no figure. Sentences only from a week read of this month. Pure.
 */
export function buildStands(
  facts: readonly StandingFact[],
  opts: { sentences?: ReadonlyMap<string, string>; quotes?: ReadonlyMap<string, PictureQuote> } = {},
): StandsBlock | null {
  if (facts.length === 0) return null
  const rows = facts.map((f): StandsRow => {
    const ready = f.calibration === 'ready' && f.level != null && f.level.n > 0
    if (!ready || !f.level) return { subjectId: f.subjectId, name: f.name, level: null, sentence: null, contents: [], quote: null }
    const level = rowLevel(f.level.k, f.level.n)
    return {
      subjectId: f.subjectId,
      name: f.name,
      level: { k: f.level.k, n: f.level.n, ...level },
      sentence: opts.sentences?.get(f.subjectId)?.trim() || null,
      contents: f.contents.slice(0, PICTURE_CONTENTS),
      quote: f.quoteRef ? opts.quotes?.get(f.quoteRef.ref) ?? null : null,
    }
  })
  const ready = rows.filter((r) => r.level)
  const rest = rows.filter((r) => !r.level).sort((a, b) => a.name.localeCompare(b.name))
  return { n: ready[0]?.level?.n ?? null, rows: [...ready, ...rest] }
}

/** A theme label inside a running line: its first letter lower case, unless
 *  it opens with a brand's name or an acronym ("Admiration for handmade bag
 *  design" reads "admiration for…"; "Cotopaxi praised…" and "UK airlines…"
 *  stay). Pure. */
export function inLine(label: string, names: readonly string[] = []): string {
  const first = label.split(/\s+/)[0] ?? ''
  if (!/^[A-Z][a-z]/.test(first) || names.some((n) => n.trim().split(/\s+/)[0]?.toLowerCase() === first.toLowerCase())) return label
  return label[0].toLowerCase() + label.slice(1)
}

/**
 * "The biggest conversations": the board's top five (makers' and noise-led
 * themes set apart, as the board sets them), each with who its videos are
 * about, and the makers line. Null where the board has no row. Pure.
 */
export function buildConversations(board: ThemeBoard, all: readonly MarketTheme[], who: ReadonlyMap<string, WhoPart[]>, names: readonly string[] = []): ConversationsBlock | null {
  if (board.rows.length === 0 || board.n <= 0) return null
  const rows = board.rows.slice(0, PICTURE_CONVERSATIONS).map((t): ConversationRow => {
    const level = rowLevel(t.k, board.n)
    return { registryId: t.registryId, label: t.label, k: t.k, text: level.text, kind: level.kind, pct: level.pct, who: who.get(t.registryId) ?? [{ about: 'market', videos: t.k }] }
  })
  let makers: ConversationsBlock['makers'] = null
  if (board.segments === 'measured' && board.makers && board.makers.count > 0) {
    const atFloor = all.filter((t) => t.k >= 10 && t.label.trim()).sort(byBoardOrder)
    const makerThemes = atFloor.filter((t) => segmentOf(t) === 'makers')
    makers = {
      labels: makerThemes.slice(0, PICTURE_MAKERS_NAMED).map((t) => inLine(t.label, names)),
      inTopFive: atFloor.slice(0, 5).filter((t) => segmentOf(t) === 'makers').length,
    }
  }
  return { n: board.n, rows, makers }
}

/**
 * "What people do in the comments": the six kinds on the market's base (the
 * category and the tracked rivals, never the client's own posts), largest
 * first, each split by who the videos are filed under. Null where the month
 * has no market base or no kind row. Pure.
 */
export function buildKinds(input: {
  rows: readonly { audience: string; kind: string; videos: number }[]
  n: number | null
  rivalAudiences: readonly string[]
  noun: string | null
}): KindsBlock | null {
  const n = input.n
  if (n == null || n <= 0) return null
  const market = new Set(marketAudiences(input.rivalAudiences))
  const rows = PICTURE_KINDS.flatMap((kind): KindRow[] => {
    const mine = input.rows.filter((r) => r.kind === kind && market.has(r.audience) && r.videos > 0)
    const k = mine.reduce((s, r) => s + r.videos, 0)
    if (k <= 0) return []
    const category = mine.filter((r) => r.audience === INDUSTRY_AUDIENCE).reduce((s, r) => s + r.videos, 0)
    const rivals = new Map<string, number>()
    for (const r of mine) {
      if (r.audience === INDUSTRY_AUDIENCE) continue
      const name = r.audience.replace(/^competitor:/, '')
      rivals.set(name, (rivals.get(name) ?? 0) + r.videos)
    }
    const who: WhoPart[] = [
      ...(category > 0 ? [{ about: 'market' as const, videos: category }] : []),
      ...[...rivals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, videos]) => ({ about: `rival:${name}` as const, videos })),
    ]
    const level = rowLevel(k, n)
    return [{ kind, label: pictureKindLabel(kind, input.noun), k, text: level.text, kindOfLevel: level.kind, pct: level.pct, who }]
  }).sort((a, b) => b.k - a.k)
  return rows.length > 0 ? { n, rows } : null
}

/** Who each theme's month is about, from its stored evidence ids (one row per
 *  theme and audience) and the brands their comments name: a video is about
 *  the brand a comment cited on it names, else its audience; one brand per
 *  video. Pure. */
export function themeWho(
  refs: readonly { object_id: string; audience: string; video_ids: string[]; comment_ids: string[] }[],
  mentions: readonly { comment_id: string; video_id: string; name: string }[],
  company: string,
): Map<string, WhoPart[]> {
  const videosOf = new Map<string, WhoVideo[]>()
  for (const r of refs) {
    const comments = new Set(r.comment_ids)
    const videos: WhoVideo[] = r.video_ids.map((id) => ({
      id,
      audience: r.audience,
      named: mentions.filter((m) => m.video_id === id && comments.has(m.comment_id)).map((m) => m.name),
    }))
    videosOf.set(r.object_id, [...(videosOf.get(r.object_id) ?? []), ...videos])
  }
  return new Map([...videosOf.entries()].map(([id, videos]) => [id, whoSplit(videos, company)]))
}

// ---- The reads ----------------------------------------------------------------------------

/** The PUBLISHED week read's stored sentences on each subject (lib/written/
 *  published.ts: the newest ready read), where that read is of `month`.
 *  Empty where there is none. */
async function loadWeekSentences(admin: SupabaseClient, clientId: string, month: string): Promise<Map<string, string>> {
  const data = (await loadPublishedWeekRead(admin, clientId, { month }))?.data
  return new Map((data?.standing ?? []).filter((s) => s.sentence?.trim()).map((s) => [s.subjectId, s.sentence.trim()]))
}

/** The month's stored kind rows, every audience. */
async function loadKindRows(admin: SupabaseClient, clientId: string, month: string): Promise<{ audience: string; kind: string; videos: number }[]> {
  const res = await admin.from('month_kind_readings').select('audience, kind, videos').eq('client_id', clientId).eq('month', month)
  if (res.error) {
    console.error(`[pages] overview-picture.kinds: ${res.error.message}`)
    return []
  }
  return ((res.data ?? []) as { audience: string; kind: string; videos: number }[]).map((r) => ({ audience: String(r.audience), kind: String(r.kind), videos: Number(r.videos) }))
}

/** The board's themes this month (the theme board's own reads). */
async function loadBoard(admin: SupabaseClient, clientId: string, month: string, n: number | null): Promise<{ board: ThemeBoard; all: MarketTheme[] } | null> {
  if (n == null || n <= 0) return null
  const themedRunId = await fetchRunningRunIds(admin, clientId, 'overview-picture').then((ids) => fetchThemedRunId(admin, clientId, ids, 'overview-picture'))
  const [boardRows, segmentRows] = await Promise.all([
    loadBoardThemes(admin, clientId, month, prevMonth(month)),
    loadThemeSegmentRows(admin, clientId, month, themedRunId),
  ])
  const obs = await loadBoardObservations(admin, clientId, themedRunId, boardRows.map((r) => r.id))
  const segments: ThemeBoard['segments'] = !makerRuleEnabled(clientId) ? 'no_rule' : segmentRows ? 'measured' : 'unknown'
  const shares = segmentRows ? themeSegmentsOf(segmentRows) : null
  const all: MarketTheme[] = boardRows.flatMap((r) => {
    const o = obs.get(r.id)
    if (!o?.label) return []
    return [{
      registryId: r.id, label: o.label, labelStripped: false, kind: o.kind, k: r.k, n, prev: null,
      makerShare: shares?.maker.get(r.id) ?? null, noiseShare: shares?.noise.get(r.id) ?? null,
      identityNewThisRun: false, flags: [], provenance: null,
    }]
  })
  return { board: buildThemeBoard(all, n, month, segments, null), all }
}

/** Who the top conversations' videos are about: the month's stored evidence
 *  ids for those themes (the category's), and the brands their comments
 *  name. A read that fails leaves the audience's answer. */
async function loadConversationWho(admin: SupabaseClient, clientId: string, month: string, themeIds: readonly string[], company: string): Promise<Map<string, WhoPart[]>> {
  if (themeIds.length === 0) return new Map()
  try {
    const refs = await admin.from('month_evidence_refs')
      .select('object_id, audience, video_ids, comment_ids')
      .eq('client_id', clientId).eq('month', month).eq('object_kind', 'theme').eq('audience', INDUSTRY_AUDIENCE)
      .in('object_id', [...themeIds])
    if (refs.error) throw new Error(refs.error.message)
    const rows = ((refs.data ?? []) as { object_id: string; audience: string; video_ids: string[] | null; comment_ids: string[] | null }[])
      .map((r) => ({ object_id: String(r.object_id), audience: String(r.audience), video_ids: (r.video_ids ?? []).map(String), comment_ids: (r.comment_ids ?? []).map(String) }))
    // The one rule and its gates (lib/brands/attribution.ts): the rules'
    // version, never a hit a confirm rejected, the hand check.
    const tracked = trackedBrands(clientId, company, await loadCompetitors(admin, clientId))
    const namings = await loadCommentNamings(admin, { clientId, commentIds: rows.flatMap((r) => r.comment_ids), brands: tracked })
    const mentions = namings.map((n) => ({ comment_id: n.commentId, video_id: n.videoId, name: n.name }))
    return themeWho(rows, mentions, company)
  } catch (error) {
    console.error(`[pages] overview-picture.who: ${(error as { message?: string })?.message ?? String(error)}`)
    return new Map()
  }
}

/** The subjects' quotes, resolved to words (never stored). A read that fails
 *  prints no quote. */
async function loadStandQuotes(admin: SupabaseClient, facts: readonly StandingFact[]): Promise<Map<string, PictureQuote>> {
  const refs = facts.flatMap((f) => (f.calibration === 'ready' && f.quoteRef ? [f.quoteRef] : []))
  if (refs.length === 0) return new Map()
  try {
    const words = await fetchQuoteResolutionsByRefs(admin, refs.map((r) => r.ref))
    const out = new Map<string, PictureQuote>()
    for (const r of refs) {
      const w = words.get(r.ref)
      if (w?.text?.trim()) out.set(r.ref, { text: w.text.trim(), lang: w.lang ?? null, english: w.english ?? null, platform: r.platform, date: r.date })
    }
    return out
  } catch (error) {
    console.error(`[pages] overview-picture.quotes: ${(error as { message?: string })?.message ?? String(error)}`)
    return new Map()
  }
}

/** A read beside the page that must not take it down: logged, and its block
 *  omitted. */
async function soft<T>(label: string, p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p
  } catch (error) {
    console.error(`[pages] overview-picture.${label}: ${(error as { message?: string })?.message ?? String(error)}`)
    return fallback
  }
}

/**
 * Your market, for the session's client. Null is the first-run state: no
 * delivered update yet, so nothing has been read.
 */
export async function loadMarketPicture(input: {
  supabase: SupabaseClient
  clientId: string
  reading: ReadingHandle
  params?: Record<string, string | undefined>
  now?: Date
}): Promise<MarketPictureData | null> {
  const { supabase, clientId } = input
  const admin = input.reading.client
  const now = input.now ?? new Date()
  const nowIso = now.toISOString()

  const [clientRes, runs, rivals, schedule, history, longRun] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    loadDeliveredRuns(supabase, clientId),
    loadTrackedRivals(supabase, clientId),
    loadReadingSchedule(admin, clientId),
    loadMonthSeries(admin, clientId, { from: '2019-01-01', to: nowIso, updatesByMonth: {}, firstRunMonth: null }),
    soft('longRun', loadPublishedLongRun(admin, clientId), null),
  ])
  if (runs.length === 0) return null
  const brand = ((clientRes.data as { company_name: string | null } | null)?.company_name ?? '').trim() || 'Your brand'
  const rivalAudiences = marketRivalAudiences(rivals)
  const view = readingViewFrom({
    now: nowIso,
    runs,
    denominators: history.denominators,
    rivalAudiences,
    schedule,
    explicit: input.params?.[MONTH_PARAM] ?? null,
  })
  const month = monthStartOf(view.reading.month)
  const soFar = view.reading.leadsWithCurrent
  const pooled = pooledDenominators(
    history.denominators.map((d) => ({ month: d.month, audience: d.audience, videos: d.videos, comments: d.comments ?? 0 })),
    rivalAudiences,
  ).get(month)
  const categoryN = history.denominators.find((d) => monthStartOf(d.month) === month && d.audience === INDUSTRY_AUDIENCE)?.videos ?? null
  const noun = soldNoun(clientId)

  const week = { from: new Date(now.getTime() - 7 * 86_400_000).toISOString(), to: nowIso }
  const [facts, sentences, board, kindRows] = await Promise.all([
    soft('standing', loadStanding(admin, { clientId, month, window: week, asOf: now }), [] as StandingFact[]),
    soft('sentences', loadWeekSentences(admin, clientId, month), new Map<string, string>()),
    soft('board', loadBoard(admin, clientId, month, categoryN), null),
    loadKindRows(admin, clientId, month),
  ])
  const top = board ? board.board.rows.slice(0, PICTURE_CONVERSATIONS).map((t) => t.registryId) : []
  const [who, quotes] = await Promise.all([
    loadConversationWho(admin, clientId, month, top, brand),
    loadStandQuotes(admin, facts),
  ])
  return {
    brand,
    noun,
    month,
    soFar,
    monthText: monthLabel(month, soFar),
    longRun: longRun?.data ?? null,
    stands: buildStands(facts, { sentences, quotes }),
    conversations: board ? buildConversations(board.board, board.all, who, [brand, ...rivals.map((r) => r.name)]) : null,
    kinds: buildKinds({ rows: kindRows, n: pooled?.videos ?? null, rivalAudiences, noun }),
  }
}
