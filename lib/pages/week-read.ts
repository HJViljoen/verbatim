import type { SupabaseClient } from '@supabase/supabase-js'

import {
  aboutName,
  aboutVideo,
  attributeVideos,
  loadAttribution,
  marketLabels,
  trackedBrands,
  windowMonths,
  type AboutPart,
  type AttributionInputs,
} from '../brands/attribution'
import { clientBrandName } from '../brands/precision'
import { chunk, UUID_IN_CHUNK } from '../chunk'
import { longMonth } from '../format'
import { TABLE_EVIDENCE_REFS } from '../reading/evidence-refs'
import { parseRef } from '../renderables/quotes-freeze'
import type { Scope } from '../renderables/types'
import { resolvedQuote, type ResolvedQuote } from '../reports/weekly-read'
import type { FigureTable } from '../reports/types'
import { INDUSTRY_AUDIENCE, isMissingCompetitors, loadCompetitors } from '../rivals'
import { hydrateData } from '../snapshots'
import { stripUnevidencedBrand } from './overview-market/board'
import { loadPublishedWeekRead } from '../written/published'
import type { QuoteRef, WeekReadData } from '../written/types'

// This week: the latest weekly read, in full (the pages build, 1 Oct; the
// approved artboard Page-This-week.dc.html).
//
// THE PAGE IS THE STORED READ. Nothing here is measured again: the lead line,
// each finding (what was seen, what it means, its quote, its evidence and
// context lines) and what else was heard are the run's `week_reads` row as
// the pipeline's `write-week-read` step stored it, its quotes' words resolved
// at render like every stored artefact's. The one thing added is WHO each item
// is about (lib/brands/attribution.ts): a finding's month videos, a quote's
// own video and comment, an also-heard conversation's week videos.
//
// THE NEWEST READY READ. A thin or failed run stores a row with no finding to
// print; the page shows the newest read that has one. `week_reads` is read
// with the service role (the table has no tenant read, review L2), scoped to
// the session's client id, which the route takes from the session and never
// from the URL.
//
// FOUR LIGHT WAVES: the row, the client and its rivals; the quotes' words,
// the talk's comments (month_evidence_refs) and the quotes' comments; the
// attribution read; nothing after.

export interface WeekReadQuote extends ResolvedQuote {
  /** Who the quote's words are about: its own video, overridden by a brand
   *  its comment names. Null where its video is unknown. */
  who: AboutPart[] | null
}

export interface WeekReadPageFinding {
  /** 1-based, the anchor `#finding-{n}` the weekly email links to. */
  n: number
  headline: string
  /** What was seen, a paragraph each. */
  saw: string[]
  means: string
  quote: WeekReadQuote | null
  /** Code's lines with `[[keys]]` into `figures`. */
  evidence: string
  context: string
  /** Who the finding's month videos are about ("In September: …"); null on
   *  a read stored before the videos were. */
  who: AboutPart[] | null
}

export interface WeekReadAlsoHeardRow {
  label: string
  videos: number
  who: AboutPart[] | null
}

export interface WeekReadPageData {
  brand: string
  month: string
  /** "In short": the week in one line (v3), or an older read's In short. */
  lead: string | null
  findings: WeekReadPageFinding[]
  alsoHeard: WeekReadAlsoHeardRow[]
  figures: FigureTable
  /** The names a brand line prints. */
  names: { client: string; market: { long: string; short: string } }
}

// ---- the pure half -------------------------------------------------------------

/** What was seen, a paragraph each (a stored `saw` keeps its blank lines). */
export function paragraphs(text: string | null | undefined): string[] {
  return (text ?? '').split(/\n\s*\n|\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

/** The read's lead: v3's week in one line, else an older read's In short. */
export function readLead(read: WeekReadData): string | null {
  const s = (read.version === 2 ? read.headline : read.inShort) ?? ''
  const t = s.replace(/\s+/g, ' ').trim()
  return t || null
}

/** Where a stored quote came from: its evidence row's comment and video. */
export interface QuoteOrigin {
  commentId: string | null
  videoId: string | null
}

/**
 * The page from a hydrated read (quotes' words in), with the attribution
 * read and the talk each item rests on. Pure.
 *
 *  · a finding's brand line splits its stored month videos, the talk being
 *    the comments its themes rest on in the month (`themeComments`); where
 *    those were not read, any comment of the read's months on those videos;
 *  · a quote is about its own video, or a brand its own comment names;
 *  · an also-heard row splits its week videos over the theme's talk.
 * With no attribution read, no item carries a brand line (never a guess).
 */
export function weekReadPage(a: {
  read: WeekReadData
  brand: string
  names: WeekReadPageData['names']
  attribution: AttributionInputs | null
  themeComments: ReadonlyMap<string, ReadonlySet<string>> | null
  origins: ReadonlyMap<string, QuoteOrigin>
  /** The client's and every rival's name, for the label check. */
  trackedNames?: readonly string[]
}): WeekReadPageData {
  const { read, attribution } = a
  // A finding's videos are the read's month's; an also-heard row's, the week's.
  const monthOnly = new Set([read.month])
  const weekMonths = read.window ? windowMonths(read.window) : monthOnly
  const talkOf = (themeIds: readonly string[]): ReadonlySet<string> | null => {
    if (!a.themeComments) return null
    const out = new Set<string>()
    for (const id of themeIds) for (const c of a.themeComments.get(id) ?? []) out.add(c)
    return out
  }
  const split = (videoIds: readonly string[] | undefined, themeIds: readonly string[], months: ReadonlySet<string>): AboutPart[] | null => {
    if (!attribution || !videoIds || videoIds.length === 0) return null
    const parts = attributeVideos(videoIds, attribution, { comments: talkOf(themeIds), months })
    return parts.length > 0 ? parts : null
  }
  const quoteOf = (q: QuoteRef | null | undefined): WeekReadQuote | null => {
    const r = resolvedQuote(q)
    if (!r) return null
    const origin = a.origins.get(r.ref)
    const who = attribution && origin?.videoId
      ? [{ about: aboutVideo(origin.videoId, attribution, { comments: new Set(origin.commentId ? [origin.commentId] : []) }), videos: 1 }]
      : null
    return { ...r, who }
  }

  const findings: WeekReadPageFinding[] = (read.findings ?? [])
    .filter((f) => (f.headline ?? '').trim())
    .map((f, i) => ({
      n: i + 1,
      headline: f.headline.trim(),
      saw: paragraphs(f.saw),
      means: (f.means ?? '').trim(),
      quote: quoteOf(f.quote),
      evidence: (f.evidence ?? '').trim(),
      context: contextWords(f.context),
      who: split(f.monthVideoIds, f.basedOn ?? [], monthOnly),
    }))

  // A label naming a tracked brand its own talk does not bear out says "a
  // brand" instead (the board's rule, `stripUnevidencedBrand`): the evidence
  // is the split itself, so with no split read every such name goes.
  const alsoHeard: WeekReadAlsoHeardRow[] = findings.length === 0 ? [] : (read.alsoHeard ?? [])
    .filter((x) => x.label?.trim() && x.videos > 0)
    .map((x) => {
      const who = split(x.videoIds, [x.themeId], weekMonths)
      const borne = (who ?? []).map((p) => aboutName(p.about, a.names) ?? '').filter(Boolean)
      return { label: stripUnevidencedBrand(x.label.trim(), a.trackedNames ?? [], borne).label, videos: x.videos, who }
    })

  return {
    brand: a.brand,
    month: read.month,
    lead: findings.length > 0 ? readLead(read) : null,
    findings,
    alsoHeard,
    figures: read.figures ?? {},
    names: a.names,
  }
}

/**
 * A finding's context line in the DESIGN's words (Heinrich, 1 Oct): "Part of
 * Comfort, the third biggest subject in your market this month." Read off the
 * stored line, which code wrote ("Part of Comfort: [[…]] of [[…]] videos in
 * your market in September, the third biggest subject.", `contextLine`): the
 * subject's name and its rank words are kept, the figures and anything after
 * the rank are not (no figure in this line). "First heard in {Month}." stays
 * where the read said it. A line in any other form prints as stored. The
 * weekly email prints the stored line; this is the page's. Pure.
 */
export function contextWords(stored: string | null | undefined): string {
  const line = (stored ?? '').trim()
  const parts: string[] = []
  const part = /^Part of (.+?): /.exec(line)
  if (part) {
    const rank = /, (the (?:[a-z]+ )?biggest) subject\b/.exec(line)?.[1]
    parts.push(rank ? `Part of ${part[1]}, ${rank} subject in your market this month.` : `Part of ${part[1]}.`)
  }
  const heard = /First heard in [A-Z][a-z]+\./.exec(line)?.[0]
  if (heard) parts.push(heard)
  return parts.length > 0 ? parts.join(' ') : line
}

/** "In September: " — the brand line's prefix under a finding. */
export const monthPrefix = (month: string): string => `In ${longMonth(month)}: `

// ---- the reads -----------------------------------------------------------------

/** The PUBLISHED week read of this client (`loadPublishedWeekRead`: under a
 *  review schedule, the newest one that was sent), or null (none, one with no
 *  findings, or the table is not in this database). */
export async function loadLatestWeekRead(admin: SupabaseClient, clientId: string): Promise<{ runId: string; data: WeekReadData } | null> {
  const row = await loadPublishedWeekRead(admin, clientId)
  if (!row || !Array.isArray(row.data.findings) || row.data.findings.length === 0) return null
  return { runId: row.runId, data: row.data }
}

/** The comments each theme's month rests on (the category's theme rows). */
async function loadThemeComments(db: SupabaseClient, clientId: string, month: string, themeIds: readonly string[]): Promise<Map<string, Set<string>> | null> {
  if (themeIds.length === 0) return new Map()
  try {
    const out = new Map<string, Set<string>>()
    for (const part of chunk([...new Set(themeIds)], UUID_IN_CHUNK)) {
      const res = await db.from(TABLE_EVIDENCE_REFS).select('object_id, comment_ids')
        .eq('client_id', clientId).eq('month', month).eq('audience', INDUSTRY_AUDIENCE).eq('object_kind', 'theme').in('object_id', part)
      if (res.error) throw new Error(res.error.message)
      for (const r of (res.data ?? []) as { object_id: string; comment_ids: string[] | null }[]) {
        out.set(String(r.object_id), new Set((r.comment_ids ?? []).map(String)))
      }
    }
    return out
  } catch (error) {
    console.error(`[pages] week.themeComments: ${(error as Error)?.message ?? String(error)}; not read`)
    return null
  }
}

/** Where each stored evidence quote came from (`e:` refs only). */
async function loadQuoteOrigins(db: SupabaseClient, refs: readonly string[]): Promise<Map<string, QuoteOrigin>> {
  const byId = new Map<string, string>()
  for (const ref of refs) {
    const p = parseRef(ref)
    if (p && p.kind === 'e') byId.set(p.id, ref)
  }
  const out = new Map<string, QuoteOrigin>()
  if (byId.size === 0) return out
  try {
    for (const part of chunk([...byId.keys()], UUID_IN_CHUNK)) {
      const res = await db.from('insight_evidence').select('id, comment_id, source_video_id').in('id', part)
      if (res.error) throw new Error(res.error.message)
      for (const r of (res.data ?? []) as { id: string; comment_id: string | null; source_video_id: string | null }[]) {
        const ref = byId.get(String(r.id))
        if (ref) out.set(ref, { commentId: r.comment_id ? String(r.comment_id) : null, videoId: r.source_video_id ? String(r.source_video_id) : null })
      }
    }
  } catch (error) {
    console.error(`[pages] week.quoteOrigins: ${(error as Error)?.message ?? String(error)}; not read`)
  }
  return out
}

/**
 * This week, for one tenant. Null where no ready read exists yet (the route
 * prints one neutral line, ruling U2).
 */
export async function loadWeekReadPage(scope: Scope): Promise<WeekReadPageData | null> {
  const supabase = scope.supabase as SupabaseClient
  const { clientId } = scope
  const db = scope.reading.client

  const [clientRes, latest, rivals] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    loadLatestWeekRead(db, clientId),
    loadCompetitors(supabase, clientId).catch((error: unknown) => {
      if (!isMissingCompetitors(error)) console.error(`[pages] week.rivals: ${(error as Error)?.message ?? String(error)}`)
      return []
    }),
  ])
  if (!latest) return null
  const company = ((clientRes.data as { company_name: string | null } | null)?.company_name ?? '').trim()
  const brand = clientBrandName(clientId) ?? (company || 'Your brand')
  const raw = latest.data

  const themeIds = [...new Set([...(raw.findings ?? []).flatMap((f) => f.basedOn ?? []), ...(raw.alsoHeard ?? []).map((x) => x.themeId)])]
  const quoteRefs = (raw.findings ?? []).map((f) => f.quote?.ref).filter((r): r is string => Boolean(r))
  const [read, themeComments, origins] = await Promise.all([
    hydrateData(db, raw),
    loadThemeComments(db, clientId, raw.month, themeIds),
    loadQuoteOrigins(db, quoteRefs),
  ])

  const videoIds = [
    ...(raw.findings ?? []).flatMap((f) => f.monthVideoIds ?? []),
    ...(raw.alsoHeard ?? []).flatMap((x) => x.videoIds ?? []),
    ...[...origins.values()].map((o) => o.videoId).filter((v): v is string => Boolean(v)),
  ]
  const attribution = await loadAttribution(db, {
    clientId,
    videoIds,
    brands: trackedBrands(clientId, brand, rivals.map((r) => ({ id: r.id, name: r.name }))),
  })

  return weekReadPage({
    read,
    brand,
    names: { client: brand, market: marketLabels(clientId) },
    attribution,
    themeComments,
    origins,
    trackedNames: [brand, ...rivals.map((r) => r.name)],
  })
}
