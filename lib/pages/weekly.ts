import type { SupabaseClient } from '@supabase/supabase-js'
import type { Scope } from '../renderables/types'
import type { Quote } from '../renderables/types'
import type { MonthStatus } from '../reading/types'
import { selectAll } from '../supabase-admin'
import { rows } from './read'
import { isMissingMonthlyReading, readDenominators } from '../reading/monthly'
import type { ReadingHandle } from '../reading/read'
import { cleanQuote, fetchQuoteCitationsByAudience, fetchQuoteResolutionsByRefs, readsAsHeroQuote, type QuoteCitation } from '../quotes'
import { quoteRef } from '../renderables/quotes-freeze'
import { citationLink } from '../evidence-cite'
import { shortDate } from '../format'
import { monthStartOf, prevMonth } from '../reading/month-key'
import { BASELINE_MONTHS, baselineStateOf, thinUpdate, type ThinUpdateVerdict } from '../reading/anomaly'
import { loadOverview, audienceInSentence, daysInto, isMissingAnomalyFlags, type Mover, type OverviewData, type SubjectsBlock } from './overview'
import { loadContent, isContentEmpty, type ContentInboxRow } from './content'
import {
  weekCheck,
  weekSentence,
  type Section1,
  type WeekCheckState,
  type WeekFlag,
} from '../reports/weekly'

/**
 * The weekly report's loader (Phase 1 WP17, design §3 Artefact WR).
 *
 * THE REPORT IS THE PAGES' OWN READING, NOT A SECOND ONE. Sections 2, 5 and 6
 * are Overview's and Content's loaders, unchanged: the artefact cannot say
 * something the page cannot, because it IS the page. What is weekly-only is
 * section 1's check, section 3's "what came in this update", and section 4's
 * sales quotes — and even those state every count as a contribution to the
 * month so far, never as a figure of their own.
 *
 * WHAT DEGRADES, AND HOW. M1–M7 are not applied in production. Every read that
 * needs one is guarded by name and answers in words — the `isMissing*`
 * precedent — so the artefact has the SAME SHAPE every week (the design's own
 * gate: "sections 4 and 5 print their empty states rather than being dropped").
 * A block that cannot say something says so; it never prints a zero for a
 * thing nobody counted.
 */

// ---- the shapes ---------------------------------------------------------------

/** Section 3 — what came in this update. Every count is this update's
 *  contribution to the month so far, and is labelled as one. */
export interface IncomingBlock {
  /** Videos this update gathered. */
  gathered: number
  /** Of those, the ones this update analysed. Null where nobody counted. */
  analysed: number | null
  platforms: { platform: string; videos: number }[]
  /** The month's videos so far, which the counts above are a contribution to. */
  monthVideos: number | null
  /** Themes this update heard for the first time. */
  newThemes: { label: string; videos: number }[]
  newThemesNote: string | null
  rivalPosts: RivalPost[]
  rivalPostsNote: string | null
}

export interface RivalPost {
  rival: string
  account: string
  platform: string
  views: number
  comments: number
  uploadDate: string | null
  href: string | null
}

/** Section 4 — for sales. The customers' words, grouped by rival where they
 *  named one. */
export interface SalesRow {
  /** The insight kind, as the pipeline wrote it. */
  kind: string
  /** The kind in the reader's words. */
  kindLabel: string
  /** What it was about, in plain words. */
  label: string
  /** The rival the video belonged to, where it belonged to one. */
  rival: string | null
  quote: Quote
  cite: string
  href: string | null
}

export interface ForSalesBlock {
  rows: SalesRow[]
  /** How many more of these the month holds, past what is printed. */
  more: number
  note: string | null
  briefHref: string
}

/** Section 5 — for content. */
export interface ForContentBlock {
  worthAReply: { ref: string; text: string; lang?: string | null; english?: string | null; context: string; intentLabel: string; href: string | null }[]
  worthAReplyNote: string | null
  rising: Mover[]
  risingNote: string | null
  format: { label: string; multiple: number; videos: number } | null
  weekHref: string
  briefHref: string
}

/** Section 6 — coverage, in one line. */
export interface CoverageBlock {
  line: string
  lines: string[]
  href: string
}

export interface WeeklyData {
  brand: string
  month: string
  monthStatus: MonthStatus
  /** The instant this reading was taken. Stored in the snapshot's `data`
   *  until M9 gives `report_snapshots` a column of its own (WP18). */
  readingAt: string
  runId: string | null
  /** The update's frozen window (`pipeline_runs.window_start/_end`). */
  window: { from: string; to: string } | null
  section1: Section1
  /** OV2's own block, rendered at report width. */
  subjects: SubjectsBlock
  /** Videos each subject gained since the last update, by subject id. Null
   *  where the window function (M4) cannot answer it. */
  contributions: Record<string, number> | null
  contributionsNote: string | null
  incoming: IncomingBlock
  sales: ForSalesBlock
  content: ForContentBlock
  coverage: CoverageBlock
}

// ---- the pure half ------------------------------------------------------------

const KIND_LABEL: Record<string, string> = {
  objection: 'Objection',
  pain_point: 'Complaint',
  switching_signal: 'Switching signal',
  praise: 'Selling point',
}

/** The four kinds section 4 is about, in the order the design lists them. */
export const SALES_KINDS = ['objection', 'praise', 'switching_signal', 'pain_point'] as const

/** How many of the customers' own words section 4 prints. */
export const SALES_ROWS = 4

/** How many comments section 5 names as worth a reply (design: "top three"). */
export const WORTH_A_REPLY = 3

/** How many themes section 5's "rising now" names. */
export const RISING_NOW = 3

/**
 * A theme slug as a reader reads it — `fit_complaints` → `Fit complaints`.
 *
 * `audience_insights.theme` is a machine slug and has always been humanised at
 * the renderer. The weekly report puts it in a heading beside a customer's own
 * words, so it is humanised here, once, where a test can see it.
 */
export function humanTheme(slug: string): string {
  const words = slug.replace(/[_-]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Something customers raised'
}

/** The state the check is in, from what the record holds — and the reason each
 *  state is NOT the others. Pure, so every branch is exercised without a
 *  database. */
export function checkStateOf(input: {
  /** The `anomaly_checks` row for this update, or null where there is none. */
  outcome: string | null
  /** Whether M7 is applied here at all. */
  recorded: boolean
  /** Months of the trailing three that clear the floor. */
  monthsClearing: number
  /** The thin-update verdict computed over this update and the eight behind it. */
  suppression: ThinUpdateVerdict | null
}): WeekCheckState {
  // THE ORDER IS THE ARGUMENT, and it runs from what we did, to what we have,
  // to what was written down.
  //
  //   suppressed        we did not look, and here is why — the strongest claim,
  //                     and the one a reader is owed before any other.
  //   baseline_forming  there is nothing to look AGAINST. A fact about the
  //                     workspace's data, true whether or not M7 is applied, and
  //                     more use to a reader than "not recorded": it says when
  //                     the check starts working.
  //   not_recorded      the check itself has never run here.
  //
  // Putting `not_recorded` first read as a fault on a new workspace, where the
  // honest answer is "this takes three months and you have one".
  if (input.suppression?.suppressed) return 'suppressed'
  if (input.outcome === 'suppressed') return 'suppressed'
  if (input.monthsClearing < BASELINE_MONTHS) return 'baseline_forming'
  if (!input.recorded) return 'not_recorded'
  if (input.outcome === 'no_window') return 'no_window'
  if (input.outcome === 'missing_migration' || input.outcome == null) return 'not_recorded'
  return input.outcome === 'flagged' ? 'flagged' : 'nothing_unusual'
}

/** The headline the week's sentence is about: the month's largest banded
 *  change where there is one, and otherwise the largest subject the category
 *  carries — a level is still a reading, and a sentence that refused to name
 *  anything would print nothing every quiet month. */
export function headlineObject(data: OverviewData): {
  label: string
  objectId: string
  audience: string
  k: number
  n: number
  atLastMonth: { k: number; n: number } | null
} | null {
  const lead = data.sentence.lead
  if (lead) {
    const row = data.subjects.rows.find((r) => r.id === lead.objectId)
    return {
      label: lead.objectLabel,
      objectId: lead.objectId,
      audience: audienceInSentence(lead.audience),
      k: lead.value.k,
      n: lead.value.n,
      atLastMonth: row?.categoryAtLastMonth ? { k: row.categoryAtLastMonth.k, n: row.categoryAtLastMonth.n } : null,
    }
  }
  const best = [...data.subjects.rows]
    .filter((r) => r.category.k != null && r.category.n != null && r.category.n > 0)
    .sort((a, b) => (b.category.pct ?? 0) - (a.category.pct ?? 0))[0]
  if (best) {
    return {
      label: best.label,
      objectId: best.id,
      audience: 'the category’s videos',
      k: best.category.k ?? 0,
      n: best.category.n ?? 0,
      atLastMonth: best.categoryAtLastMonth ? { k: best.categoryAtLastMonth.k, n: best.categoryAtLastMonth.n } : null,
    }
  }
  const top = [...data.category.growing, ...data.category.fading].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0]
  if (top) {
    return { label: top.label, objectId: top.id, audience: 'the category’s videos', k: top.k, n: top.n, atLastMonth: null }
  }
  return null
}

// ---- the loader ---------------------------------------------------------------

interface RunRow {
  id: string
  started_at: string
  completed_at: string | null
  status: string | null
  videos_scraped: number | null
  window_start?: string | null
  window_end?: string | null
  stalled?: boolean | null
}

interface FlagRow {
  object_kind: string
  label: string
  denominator: string
  week_k: number
  week_n: number
  baseline_k: number
  baseline_n: number
  change_pts: number
  band_pts: number
  rank: number
  explanation: { sentences?: string[] } | null
  quote_refs: string[] | null
}

/** How many updates behind this one the thin gate measures against. */
export const THIN_TRAILING = 8

/**
 * The weekly report, for one tenant.
 *
 * Null is the first-update empty state: a tenant with nothing delivered has no
 * week to report and no month to state it against, and an artefact of six
 * refusals is not a report.
 */
export async function loadWeekly(scope: Scope): Promise<WeeklyData | null> {
  const supabase = scope.supabase as SupabaseClient
  const { clientId } = scope
  const readingAt = new Date().toISOString()

  const overview = await loadOverview(scope)
  if (!overview) return null

  const month = overview.month
  const [runsRaw, contentRaw] = await Promise.all([
    latestRuns(supabase, clientId),
    loadContent(scope).catch((e) => {
      console.error(`[pages] weekly.content: ${(e as { message?: string })?.message ?? String(e)}`)
      return { empty: true } as const
    }),
  ])
  const run = runsRaw[0] ?? null
  const window = run?.window_start && run?.window_end
    ? { from: run.window_start.slice(0, 10), to: run.window_end.slice(0, 10) }
    : null

  // ── section 1 ───────────────────────────────────────────────────────────
  const suppression = run
    ? thinUpdate(
        { analysedVideos: run.videos_scraped, stalled: run.stalled ?? null, status: run.status },
        runsRaw.slice(1, THIN_TRAILING + 1).map((r) => ({ analysedVideos: r.videos_scraped })),
      )
    : null
  const [check, clearing] = await Promise.all([
    run ? loadCheck(supabase, clientId, run.id) : Promise.resolve({ recorded: false, outcome: null, flags: [] as FlagRow[], flaggedCount: 0 }),
    baselineMonths(scope.reading, clientId, month, readingAt),
  ])
  // A baseline nobody could READ is not a baseline of zero months: the check
  // then stands on whatever the record said, and the record is allowed to say
  // it has never run.
  const monthsClearing = clearing ?? BASELINE_MONTHS
  const state = checkStateOf({ outcome: check.outcome, recorded: check.recorded, monthsClearing, suppression })
  const head = headlineObject(overview)
  const section1: Section1 = {
    month,
    daysIn: daysInto(month, readingAt),
    window,
    sentence: head
      ? weekSentence({ month, daysIn: daysInto(month, readingAt), ...head })
      : { body: overview.sentence.body, figures: overview.sentence.figures },
    check: weekCheck({
      state,
      flags: await toWeekFlags(supabase, check.flags),
      flaggedCount: check.flaggedCount,
      monthsClearing: clearing ?? 0,
      suppression,
    }),
  }

  // ── sections 3, 4 ───────────────────────────────────────────────────────
  const [incoming, sales] = await Promise.all([
    loadIncoming(supabase, clientId, run, overview),
    loadSales(supabase, clientId, month, overview),
  ])

  // ── section 5 ───────────────────────────────────────────────────────────
  const content = buildContent(contentRaw, overview)

  return {
    brand: overview.brand,
    month,
    monthStatus: overview.monthStatus,
    readingAt,
    runId: run?.id ?? null,
    window,
    section1,
    subjects: overview.subjects,
    // THE CONTRIBUTION PER SUBJECT NEEDS M4's WINDOW FUNCTION, which is not
    // applied. Saying "+0 videos since the last update" for every subject would
    // be a claim about the conversation; saying it is not recorded is a claim
    // about our own bookkeeping, and only the second one is true.
    contributions: null,
    contributionsNote: 'How much of each subject arrived since the last update is not recorded for this workspace yet.',
    incoming,
    sales,
    content,
    coverage: { line: overview.record.line, lines: overview.record.lines, href: '/dashboard/settings' },
  }
}

/** This tenant's delivered updates, newest first. */
async function latestRuns(supabase: SupabaseClient, clientId: string): Promise<RunRow[]> {
  // window_start / window_end / stalled arrive with 20260915090000 (applied).
  // A workspace whose database predates it degrades to "no window" rather than
  // failing the whole report, which is why the columns are read optimistically
  // and the read falls back.
  const full = await supabase
    .from('pipeline_runs')
    .select('id, started_at, completed_at, status, videos_scraped, window_start, window_end, stalled')
    .eq('client_id', clientId)
    .in('status', ['completed', 'partial'])
    .order('started_at', { ascending: false })
    .limit(THIN_TRAILING + 1)
  if (!full.error) return rows<RunRow>(full, 'weekly.runs')
  const bare = await supabase
    .from('pipeline_runs')
    .select('id, started_at, completed_at, status, videos_scraped')
    .eq('client_id', clientId)
    .in('status', ['completed', 'partial'])
    .order('started_at', { ascending: false })
    .limit(THIN_TRAILING + 1)
  return rows<RunRow>(bare, 'weekly.runs')
}

/** The check's own record for this update (WP8's two tables). */
async function loadCheck(
  supabase: SupabaseClient,
  clientId: string,
  runId: string,
): Promise<{ recorded: boolean; outcome: string | null; flags: FlagRow[]; flaggedCount: number }> {
  try {
    const checkRes = await supabase
      .from('anomaly_checks')
      .select('outcome, flagged_count')
      .eq('client_id', clientId)
      .eq('run_id', runId)
      .maybeSingle()
    if (checkRes.error) throw checkRes.error
    const row = checkRes.data as { outcome: string; flagged_count: number | null } | null
    if (!row) return { recorded: true, outcome: null, flags: [], flaggedCount: 0 }
    if (row.outcome !== 'flagged') return { recorded: true, outcome: row.outcome, flags: [], flaggedCount: 0 }
    const flags = await selectAll<FlagRow>(() =>
      supabase
        .from('anomaly_flags')
        .select('object_kind, label, denominator, week_k, week_n, baseline_k, baseline_n, change_pts, band_pts, rank, explanation, quote_refs')
        .eq('client_id', clientId)
        .eq('run_id', runId)
        .order('rank', { ascending: true }),
    )
    return { recorded: true, outcome: row.outcome, flags, flaggedCount: row.flagged_count ?? flags.length }
  } catch (error) {
    // M7 not applied is the expected state today and says nothing; anything
    // else is news and is said in the log (the lib/pages/read.ts rule).
    if (!isMissingAnomalyFlags(error) && !isMissingAnomalyChecks(error)) {
      console.error(`[pages] weekly.check: ${(error as { message?: string })?.message ?? String(error)}`)
    }
    return { recorded: false, outcome: null, flags: [], flaggedCount: 0 }
  }
}

/** Is `anomaly_checks` (M7) simply not applied here? */
export function isMissingAnomalyChecks(error: unknown): boolean {
  if (!error) return false
  const { code, message } = (typeof error === 'object' ? error : {}) as { code?: string; message?: string }
  const text = message ?? (error instanceof Error ? error.message : String(error))
  if (!text.includes('anomaly_checks')) return false
  if (code && ['PGRST202', 'PGRST205', '42883', '42P01'].includes(code)) return true
  return /in the schema cache/i.test(text) || /does not exist/i.test(text)
}

/** How many of a flag's quotes the artefact prints (design: "one paragraph of
 *  explanation with two quotes"). */
export const FLAG_QUOTES = 2

async function toWeekFlags(supabase: SupabaseClient, flags: FlagRow[]): Promise<WeekFlag[]> {
  const refs = [...new Set(flags.flatMap((f) => (f.quote_refs ?? []).filter((r): r is string => typeof r === 'string').slice(0, FLAG_QUOTES)))]
  const resolved = refs.length > 0 ? await fetchQuoteResolutionsByRefs(supabase, refs, { onReadError: 'degrade' }) : new Map()
  return flags.map((row) => ({
    objectKind: row.object_kind,
    label: row.label,
    denominator: row.denominator,
    weekK: row.week_k,
    weekN: row.week_n,
    baselineK: row.baseline_k,
    baselineN: row.baseline_n,
    changePts: Number(row.change_pts),
    bandPts: Number(row.band_pts),
    sentences: row.explanation?.sentences ?? [],
    quotes: (row.quote_refs ?? [])
      .filter((r): r is string => typeof r === 'string')
      .slice(0, FLAG_QUOTES)
      .flatMap((ref) => {
        const one = resolved.get(ref)
        // A ref that no longer resolves is DROPPED, not printed empty: the
        // comment has been erased, and the flag's arithmetic stands without it.
        return one ? [{ ref, text: one.text, lang: one.lang ?? null, english: one.english ?? null }] : []
      }),
    href: '/dashboard/week',
  }))
}

/**
 * How many of the trailing three complete months carry enough conversation to
 * be compared against.
 *
 * READ OFF `month_denominators`, THE SAME ROWS THE CHECK ITSELF DIVIDES BY —
 * through the reading layer's own function, pooled across audiences exactly as
 * `weekVsBaseline`'s pooled slice is. The first version of this read the page's
 * subject rows instead, and answered "0 of 3" on both tenants for the unrelated
 * reason that M4 is unapplied: a workspace with six seeded months was told its
 * baseline was empty.
 *
 * A READ THAT FAILS IS NOT A ZERO. Zero says "this workspace has no history",
 * which is a claim about the client; a failed read is a claim about us. The
 * caller gets null and the check stands on whatever the record said.
 */
async function baselineMonths(
  reading: ReadingHandle,
  clientId: string,
  month: string,
  readingAt: string,
): Promise<number | null> {
  const months = [prevMonth(month), prevMonth(prevMonth(month)), prevMonth(prevMonth(prevMonth(month)))].sort()
  try {
    const denominators = await readDenominators(reading.client, clientId, { from: months[0], to: monthStartOf(readingAt) })
    if (denominators.length === 0) return null
    const pooled = new Map<string, number>()
    for (const d of denominators) {
      if (!months.includes(d.month)) continue
      pooled.set(d.month, (pooled.get(d.month) ?? 0) + d.videos)
    }
    return baselineStateOf({
      name: 'every audience together',
      // `weekVideos` is what the check divides the WEEK by; this call only asks
      // how many MONTHS clear the floor, so it is stated as zero rather than
      // guessed at from a window nothing here has read.
      weekVideos: 0,
      months: [...pooled.entries()].map(([m, videos]) => ({ month: m, videos })),
    }).monthsClearing
  } catch (error) {
    if (!isMissingMonthlyReading(error)) {
      console.error(`[pages] weekly.baseline: ${(error as { message?: string })?.message ?? String(error)}`)
    }
    return null
  }
}

// ---- section 3 ----------------------------------------------------------------

interface VideoRow {
  platform: string | null
  account_name: string | null
  competitor_name: string | null
  is_competitor: boolean | null
  video_url: string | null
  views: number | null
  comments_count: number | null
  upload_date: string | null
  analyzed_run_id?: string | null
}

/** How many rival posts section 3 names. */
export const RIVAL_POSTS = 3

async function loadIncoming(
  supabase: SupabaseClient,
  clientId: string,
  run: RunRow | null,
  overview: OverviewData,
): Promise<IncomingBlock> {
  const empty: IncomingBlock = {
    gathered: 0,
    analysed: null,
    platforms: [],
    monthVideos: overview.bar.videos,
    newThemes: [],
    newThemesNote: 'No theme was heard for the first time in this update.',
    rivalPosts: [],
    rivalPostsNote: 'No tracked rival posted in this update’s window.',
  }
  if (!run) return { ...empty, newThemesNote: 'This workspace has no delivered update yet.', rivalPostsNote: null }

  const [videoRes, themeRows] = await Promise.all([
    selectAll<VideoRow>(() =>
      supabase
        .from('videos')
        .select('platform, account_name, competitor_name, is_competitor, video_url, views, comments_count, upload_date, analyzed_run_id')
        .eq('client_id', clientId)
        .eq('run_id', run.id),
    ).catch(() =>
      selectAll<VideoRow>(() =>
        supabase
          .from('videos')
          .select('platform, account_name, competitor_name, is_competitor, video_url, views, comments_count, upload_date')
          .eq('client_id', clientId)
          .eq('run_id', run.id),
      ),
    ),
    newThemesOf(supabase, clientId, run.id),
  ])

  const byPlatform = new Map<string, number>()
  let analysed = 0
  let analysedKnown = false
  for (const v of videoRes) {
    const p = v.platform ?? 'unknown'
    byPlatform.set(p, (byPlatform.get(p) ?? 0) + 1)
    if (v.analyzed_run_id !== undefined) {
      analysedKnown = true
      if (v.analyzed_run_id === run.id) analysed += 1
    }
  }
  const rivalPosts = videoRes
    .filter((v) => v.is_competitor && v.competitor_name)
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, RIVAL_POSTS)
    .map((v) => ({
      rival: v.competitor_name ?? '',
      account: v.account_name ?? '',
      platform: v.platform ?? '',
      views: v.views ?? 0,
      comments: v.comments_count ?? 0,
      uploadDate: v.upload_date,
      href: v.video_url,
    }))

  return {
    gathered: videoRes.length,
    analysed: analysedKnown ? analysed : null,
    platforms: [...byPlatform.entries()]
      .map(([platform, videos]) => ({ platform, videos }))
      .sort((a, b) => b.videos - a.videos),
    monthVideos: overview.bar.videos,
    newThemes: themeRows,
    newThemesNote: themeRows.length > 0 ? null : 'No theme was heard for the first time in this update.',
    rivalPosts,
    rivalPostsNote: rivalPosts.length > 0 ? null : 'No tracked rival posted in this update’s window.',
  }
}

/**
 * Themes this update heard for the first time.
 *
 * `theme_observations.match_kind = 'new'` is the MATCHER's own answer, recorded
 * per run beside the registry entry, and it is the only honest source: a theme
 * is new relative to the REGISTRY, not relative to a label nobody has seen
 * before, and labels churn ~88% run to run (AGENTS.md). `themes.match_kind`,
 * which the first version of this read, does not exist.
 *
 * The count beside it is `themes.supporting_video_ids` — the per-run membership
 * the reading layer counts in videos. `theme_observations.evidence_count` is
 * evidence ROWS, a different unit, and printing it as videos is exactly the
 * mismatch the thirteen words exist to stop.
 */
async function newThemesOf(supabase: SupabaseClient, clientId: string, runId: string): Promise<{ label: string; videos: number }[]> {
  const obsRes = await supabase
    .from('theme_observations')
    .select('theme_id, label')
    .eq('client_id', clientId)
    .eq('run_id', runId)
    .eq('match_kind', 'new')
    .limit(50)
  const observed = rows<{ theme_id: string; label: string }>(obsRes, 'weekly.newThemes')
  if (observed.length === 0) return []
  const videosRes = await supabase
    .from('themes')
    .select('registry_id, supporting_video_ids')
    .eq('client_id', clientId)
    .eq('run_id', runId)
    .in('registry_id', observed.map((o) => o.theme_id))
  const byRegistry = new Map<string, number>()
  for (const t of rows<{ registry_id: string | null; supporting_video_ids: string[] | null }>(videosRes, 'weekly.newThemeVideos')) {
    if (t.registry_id) byRegistry.set(t.registry_id, (t.supporting_video_ids ?? []).length)
  }
  return observed
    .map((o) => ({ label: o.label, videos: byRegistry.get(o.theme_id) ?? 0 }))
    // A theme whose membership this run did not retain cannot be stated in
    // videos, and "heard for the first time, in 0 videos" is not a sentence.
    .filter((t) => t.videos > 0)
    .sort((a, b) => b.videos - a.videos)
    .slice(0, 3)
}

// ---- section 4 ----------------------------------------------------------------

interface InsightRow {
  id: string
  category: string
  theme: string
  source_video_id: string | null
}

async function loadSales(
  supabase: SupabaseClient,
  clientId: string,
  month: string,
  overview: OverviewData,
): Promise<ForSalesBlock> {
  const briefHref = '/dashboard/reports'
  const empty: ForSalesBlock = {
    rows: [],
    more: 0,
    note: 'Nothing a customer said this month was an objection, a complaint, a switching signal or a selling point we could quote.',
    briefHref,
  }
  // The month's own videos, so a quote is dated by the COMMENT's month the way
  // every other figure on the artefact is — a run-indexed read here would put
  // September's words under August's heading the first time an update crossed a
  // boundary.
  const from = monthStartOf(month)
  const insightRes = await supabase
    .from('audience_insights_current')
    .select('id, category, theme, source_video_id')
    .eq('client_id', clientId)
    .in('category', [...SALES_KINDS])
    .gte('created_at', from)
    .order('strength_score', { ascending: false })
    .limit(120)
  const insights = rows<InsightRow>(insightRes, 'weekly.salesInsights')
  if (insights.length === 0) return empty

  const videoIds = [...new Set(insights.map((i) => i.source_video_id).filter((v): v is string => Boolean(v)))]
  const rivalByVideo = new Map<string, string>()
  if (videoIds.length > 0) {
    const vres = await supabase.from('videos').select('id, competitor_name, is_competitor').eq('client_id', clientId).in('id', videoIds)
    for (const v of rows<{ id: string; competitor_name: string | null; is_competitor: boolean | null }>(vres, 'weekly.salesVideos')) {
      if (v.is_competitor && v.competitor_name) rivalByVideo.set(v.id, v.competitor_name)
    }
  }

  const citations = await fetchQuoteCitationsByAudience(supabase, insights.map((i) => i.id))
  const commentIds: string[] = []
  const picked: { insight: InsightRow; citation: QuoteCitation }[] = []
  const seen = new Set<string>()
  const usedKinds = new Set<string>()
  // ONE PER KIND FIRST, then the rest. The design lists four kinds and a sales
  // reader who gets four objections and no selling point has been handed half
  // the brief.
  for (const pass of [0, 1]) {
    for (const insight of insights) {
      if (picked.length >= SALES_ROWS) break
      if (pass === 0 && usedKinds.has(insight.category)) continue
      for (const c of (citations.get(insight.id) ?? []).sort((a, b) => a.rank - b.rank)) {
        const text = cleanQuote(c.quote)
        const key = text.toLowerCase()
        if (!text || seen.has(key) || !readsAsHeroQuote(text, c)) continue
        seen.add(key)
        usedKinds.add(insight.category)
        picked.push({ insight, citation: { ...c, quote: text } })
        if (c.commentId) commentIds.push(c.commentId)
        break
      }
    }
  }
  if (picked.length === 0) return empty

  const meta = new Map<string, { platform: string | null; comment_date: string | null; video_id: string | null; comment_id: string | null }>()
  if (commentIds.length > 0) {
    const res = await supabase.from('comments').select('id, platform, comment_date, video_id, comment_id').eq('client_id', clientId).in('id', commentIds)
    for (const c of rows<{ id: string; platform: string | null; comment_date: string | null; video_id: string | null; comment_id: string | null }>(res, 'weekly.salesComments')) meta.set(c.id, c)
  }
  const nativeIds = [...new Set([...meta.values()].map((m) => m.video_id).filter((v): v is string => Boolean(v)))]
  const urlByKey = new Map<string, string>()
  if (nativeIds.length > 0) {
    const res = await supabase.from('videos').select('platform, video_id, video_url').eq('client_id', clientId).in('video_id', nativeIds)
    for (const v of rows<{ platform: string | null; video_id: string | null; video_url: string | null }>(res, 'weekly.salesVideoUrls')) {
      if (v.video_url && v.video_id) urlByKey.set(`${v.platform}::${v.video_id}`, v.video_url)
    }
  }

  const out: SalesRow[] = picked.map(({ insight, citation }) => {
    const m = citation.commentId ? meta.get(citation.commentId) : undefined
    const url = m?.platform && m.video_id ? urlByKey.get(`${m.platform}::${m.video_id}`) ?? null : null
    return {
      kind: insight.category,
      kindLabel: KIND_LABEL[insight.category] ?? humanTheme(insight.category),
      label: humanTheme(insight.theme),
      rival: insight.source_video_id ? rivalByVideo.get(insight.source_video_id) ?? null : null,
      quote: {
        ref: quoteRef.evidence(citation.evidenceId),
        text: citation.quote,
        ...(citation.lang != null ? { lang: citation.lang, english: citation.english ?? null } : {}),
      },
      cite: [m?.platform, m?.comment_date ? shortDate(m.comment_date) : null, 'under a video we read'].filter(Boolean).join(' · '),
      href: citationLink(m?.platform ?? null, url, m?.comment_id ?? null).href,
    }
  })
  return {
    rows: out,
    more: Math.max(0, insights.length - out.length),
    note: overview.subjects.state === 'not_recorded' ? 'Grouped by what customers raised; your subjects are not recorded for this workspace yet.' : null,
    briefHref,
  }
}

// ---- section 5 ----------------------------------------------------------------

const INTENT_LABEL: Record<string, string> = {
  buying: 'Buying signal',
  question: 'Question',
  objection: 'Objection',
  misinformation: 'Something wrong',
}

function buildContent(
  content: Awaited<ReturnType<typeof loadContent>> | { empty: true },
  overview: OverviewData,
): ForContentBlock {
  const weekHref = '/dashboard/week'
  const briefHref = '/dashboard/reports'
  const rising = overview.category.growing.slice(0, RISING_NOW)
  const risingNote = overview.category.moversNote ?? (rising.length > 0 ? null : 'No theme in the category cleared its band this month.')
  if (isContentEmpty(content as never)) {
    return {
      worthAReply: [],
      worthAReplyNote: 'Nothing is waiting for a reply from this update.',
      rising,
      risingNote,
      format: null,
      weekHref,
      briefHref,
    }
  }
  const c = content as Exclude<Awaited<ReturnType<typeof loadContent>>, { empty: true }>
  const top: ContentInboxRow[] = c.inbox.rows.slice(0, WORTH_A_REPLY)
  const format = c.works.formats[0] ?? c.works.hooks[0] ?? null
  return {
    worthAReply: top.map((r) => ({
      ref: r.ref,
      text: r.text,
      ...(r.lang != null ? { lang: r.lang, english: r.english ?? null } : {}),
      context: r.context,
      intentLabel: INTENT_LABEL[r.intent] ?? 'Worth a reply',
      href: r.href,
    })),
    // KEPT VERBATIM FROM THE INBOX (design §3 WR Gates): the empty state is the
    // inbox's own sentence, so the artefact keeps the same shape every week
    // rather than dropping the section.
    worthAReplyNote: top.length > 0 ? null : 'Nothing is waiting for a reply from this update.',
    rising,
    risingNote,
    format: format ? { label: format.k, multiple: format.multiple, videos: format.count } : null,
    weekHref,
    briefHref,
  }
}
