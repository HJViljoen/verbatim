import type { SupabaseClient } from '@supabase/supabase-js'

import { CONFIG_CHANGES_TABLE, isMissingConfigLog, type ConfigChange } from '../config-log'
import { COMPETITIVE_MIN_VIDEOS } from '../config'
import { fmtInt, monthName, platformLabel } from '../format'
import { fetchQuoteCitationsByAudience } from '../quotes'
import { attentionTotals, type AttentionRow } from '../reading/attention'
import { horizonWindow, parseHorizon, sinceStart, type Horizon, type HorizonWindow } from '../reading/horizon'
import { freezeStateFor, isMissingMonthlyReading, monthStartOf } from '../reading/monthly'
import { loadMonthSeries, type ReadingHandle } from '../reading/read'
import { countRefused, howSoundLine, loadRecordInputs, recordLines, refusals } from '../reading/record'
import { buildStandings, NOT_OBSERVED, type StandingRow } from '../reading/standings'
import type { MonthStatus, PlatformMix } from '../reading/types'
import type { Verdict } from '../reading/verdicts'
import { CLIENT_AUDIENCE, isMissingCompetitors, loadCompetitors, rivalKey } from '../rivals'
import type { Quote, Scope } from '../renderables/types'
import { quoteRef } from '../renderables/quotes-freeze'
import { selectAll } from '../supabase-admin'
import { isMissingSubjects, TABLE_SUBJECTS } from '../subjects/types'
import { recordWindow } from './overview'
import { row } from './read'

// Competitive — the rivals surface (Phase 1 WP14, design §3 CO1–CO7, item 42's
// second half).
//
// A SECOND MODULE BESIDE `lib/pages/competitive.ts`, for the reason
// market-surface.ts gives about Market: that file is Competitive Intelligence,
// parked at /dashboard/competitive-intel, and it reads the run-indexed
// `period_share_of_voice` layer in five places. This one reads NONE of them.
//
// WHY RETIRING period_* IS A CO1 CHANGE AND NOT ONLY A CO2 ONE. The parked
// loader picks a LAYER before it picks a rival (lib/pages/competitive.ts:
// 235-241) and then takes the selectable rivals from that layer's keys. On
// Sealand today that silently drops Rareform, which is configured, has fifteen
// videos and appears in no period row — a tracked rival the selector cannot
// offer. Here the rivals come from `competitors` (or, until M1 lands, from the
// tracked list), and whether a rival was OBSERVED is a separate, printed fact.
//
// THE WORD IS "RIVAL". The page is called Competitive and the noun in every
// sentence on it is rival, because that is the word the rest of the product
// uses and a page title is not a vocabulary change (design §3 CO).

export type CompetitiveSurfaceParams = { vs?: string; horizon?: string; item?: string }

/** Question rows drawn in full before the rest are counted. */
export const QUESTIONS_SHOWN = 12

/** Quotes under one question. Two is the design's "counts and quotes" without
 *  turning a block into a transcript. */
export const QUOTES_PER_QUESTION = 2

// ---- the shapes ---------------------------------------------------------------

/** What is known about a tracked rival before any reading of it. */
export type RivalState =
  /** Read this window: the standings and the questions have something to say. */
  | 'observed'
  /** Tracked, and nothing of theirs was read in this window. */
  | 'quiet'
  /** Tracked, and nothing of theirs has ever been analysed. */
  | 'configured'
  /** Tracked once, not any more. Its frozen months keep its name. */
  | 'retired'

export interface RivalOption {
  audience: string
  name: string
  state: RivalState
  /** Analysed videos of theirs in the whole corpus. Null where `videos` could
   *  not be read. */
  analysed: number | null
  retiredAt: string | null
  href: string
  selected: boolean
}

export interface RivalsBlock {
  options: RivalOption[]
  selected: RivalOption | null
  /** False when `competitors` (M1) is not applied here — a rival the tenant has
   *  STOPPED tracking then cannot be listed at all, and the block says so
   *  instead of implying there were never any. */
  identityRecorded: boolean
  empty: string | null
}

export interface StandingsMonthRow {
  month: string
  label: string
  status: MonthStatus
  videos: number
  comments: number
  platformMix: PlatformMix
  /** The update that seeded or wrote this month. Two months are like-for-like
   *  only where this is equal (AGENTS.md). */
  runId: string | null
}

export interface StandingsSeriesPoint {
  month: string
  content: number | null
  attention: number | null
}

export interface StandingsSeries {
  audience: string
  label: string
  role: StandingRow['role']
  points: StandingsSeriesPoint[]
}

/** Where the two shares were read from. The design's CO2 asks for the frozen
 *  attention panel; until M5 is applied there is none, and the corpus reading
 *  is a real, frozen, comment-dated answer to a NARROWER question. The block
 *  prints which one it is looking at. */
export type StandingsSource = 'panel' | 'corpus'

export interface StandingsBlock {
  source: StandingsSource
  months: string[]
  /** The month this table IS — the newest month on the axis that has stored
   *  rows, which is not always the month in hand. `month_denominators` is
   *  written by `freeze-months`, so every calendar month has a gap between
   *  midnight on the 1st and that month's first delivered update (up to a week
   *  on both tenants) in which the newest row is last month's. */
  month: string
  monthLabel: string
  /** Said when the month in hand has not been read and this table is an
   *  earlier one; null when they are the same month. */
  behind: string | null
  /** The newest read month's table. */
  rows: StandingRow[]
  series: StandingsSeries[]
  /** The two denominators, per month, with their platform mix. */
  denominators: StandingsMonthRow[]
  /** A rule at every month a tracking change landed in. */
  rules: { month: string; label: string; text: string }[]
  /** Videos of the client's own that also named a tracked rival, this month. */
  dualMention: number | null
  precedence: string
  /** What these shares are shares OF, in the reader's words. */
  denominatorLine: string
  /** The attention index this block does not have yet. */
  unlock: string
  /** Months whose comparison was refused because the updates behind them
   *  differ — collapsed into ONE sentence, never one per bar. */
  caveat: string | null
  empty: string | null
}

export interface QuestionRow {
  id: string
  /** The question, as the analysis wrote it. */
  text: string
  platform: string | null
  /** The rival video it was asked under. */
  videoHref: string | null
  quotes: Quote[]
}

export interface QuestionsBlock {
  rival: string | null
  /** Distinct rival videos in the window carrying a question. */
  videos: number
  /** Question-kind insights in the window. */
  insights: number
  quotes: number
  platformMix: PlatformMix
  rows: QuestionRow[]
  /** The floor, and whether it was cleared. */
  floor: number
  cleared: boolean
  /** The communities watched for this tenant — the design's platform note. */
  subreddits: string[]
  /** Said instead of the rows when the floor is not cleared, or when there is
   *  nothing at all. */
  empty: string | null
  /** Why the questions are listed as asked rather than grouped. */
  groupingNote: string
  /** Whether subjects exist to match the questions to. */
  subjectsNote: string | null
}

export interface CompetitiveUnlockRow {
  section: string
  title: string
  line: string
  owner: string
}

export interface CompetitiveSurfaceData {
  brand: string
  month: string
  monthStatus: MonthStatus
  readingAt: string
  horizon: Horizon
  window: HorizonWindow
  rivals: RivalsBlock
  standings: StandingsBlock
  questions: QuestionsBlock
  unlocks: { rows: CompetitiveUnlockRow[] }
  record: { line: string; lines: string[]; href: string }
}

// ---- the pure half ------------------------------------------------------------

/** The precedence caveat CO2 carries, printed once under the table (§7). */
export const PRECEDENCE_RULE =
  'A video that names both you and a rival counts in your audience only; the count of those is beside this table.'

/** What the corpus shares are shares of. The design's own label, said in full
 *  rather than abbreviated to a percent sign. */
export const CORPUS_DENOMINATOR_LINE =
  'Both shares are of what our search plan found and we read this month — the videos on the left, the comments we kept on the right.'

export const PANEL_DENOMINATOR_LINE =
  'Both shares are of a frozen panel of accounts — the videos they posted on the left, the comments those posts drew on the right.'

/** The attention index item 11 describes and this block does not have: the
 *  platform's own comment counts on a frozen panel of accounts. Named, and
 *  without a date, because nothing in the product holds one. */
export const ATTENTION_UNLOCK =
  'The attention index — what the platforms themselves report on a frozen panel of accounts — is not recorded for this workspace yet, so the right-hand share is of the comments we kept.'

export const STANDINGS_UNREAD =
  'No month has been read for this workspace yet, so there are no standings to draw.'

/** The month in hand has no stored row yet. NOT the same fact as "nothing was
 *  observed": the reading has not been written, and a table that answered with
 *  last month's numbers under this month's name is the defect this replaces. */
export const standingsUnreadMonth = (month: string): string =>
  `${monthName(month)} has not been read yet. A month’s row is written by the first update that lands in it, and none has landed in this one.`

/** Said above a table that is an earlier month than the one in hand. */
export const standingsBehindLine = (month: string, table: string): string =>
  `${monthName(month)} has not been read yet, so this table is ${monthName(table)}.`

/**
 * A rival's state, from what has actually been read.
 *
 * FOUR STATES AND NOT TWO. "Tracked" and "not tracked" is the vocabulary the
 * parked page has, and it cannot say the two things a client most needs to
 * hear: that a rival they configured has never produced a video we analysed
 * (Rareform: 15 videos, 1 analysed, 0 in any month), and that a rival they
 * stopped tracking still owns the months it was read in.
 */
export function rivalState(input: {
  retiredAt: string | null
  analysed: number | null
  observedThisWindow: boolean
}): RivalState {
  if (input.retiredAt) return 'retired'
  if (input.observedThisWindow) return 'observed'
  if (input.analysed != null && input.analysed > 0) return 'quiet'
  return 'configured'
}

/** What each state says on the selector, in the reader's words. */
export const RIVAL_STATE_LINE: Record<RivalState, string> = {
  observed: 'read this window',
  quiet: 'tracked · nothing of theirs was read this window',
  configured: 'tracked · nothing of theirs has been read yet',
  retired: 'was tracked · its months keep its name',
}

/**
 * A rule at every month a tracking change landed in.
 *
 * ONE PER MONTH, NEVER ONE PER CHANGE. Össur logged ten tracking changes in
 * September; ten rules on one bar is a chart nobody can read, and the fact a
 * reader needs is "something changed in this month", which is true once.
 */
export function trackingRules(
  changes: readonly Pick<ConfigChange, 'changed_at' | 'surface'>[],
  months: readonly string[],
): { month: string; label: string; text: string }[] {
  const inMonth = new Map<string, number>()
  for (const c of changes) {
    const m = monthStartOf(c.changed_at.slice(0, 10))
    if (!months.includes(m)) continue
    inMonth.set(m, (inMonth.get(m) ?? 0) + 1)
  }
  return [...inMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, n]) => ({
      month,
      label: monthName(month),
      text: n === 1
        ? `One change to what we track landed in ${monthName(month)}.`
        : `${fmtInt(n)} changes to what we track landed in ${monthName(month)}.`,
    }))
}

/**
 * The months whose comparison was refused, as ONE sentence.
 *
 * Block A's convention, and the reason for it: a run of months read under
 * different updates is one fact about the series, and printing it per bar turns
 * a caveat into wallpaper.
 */
export function comparabilityCaveat(rows: readonly StandingsMonthRow[]): string | null {
  const keys = new Set(rows.map((r) => r.runId ?? 'unknown'))
  if (keys.size <= 1) return null
  const labels = rows.map((r) => r.label)
  return `These months were not all read by the same update, so a month-on-month comparison across ${labels[0]} to ${labels[labels.length - 1]} is not like for like.`
}

/** The platform mix, in the reader's words, largest first. */
export function mixLine(mix: PlatformMix): string {
  const parts = Object.entries(mix)
    .filter(([, n]) => typeof n === 'number' && n > 0)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .map(([p, n]) => `${platformLabel(p)} ${fmtInt(n as number)}`)
  return parts.join(' · ')
}

/** What CO5 says when the floor is not cleared, or when there is nothing.
 *
 *  THE DESIGN WRITES NO SENTENCE FOR THIS. It writes CO3's "— not tracked" and
 *  CO4's "their accounts are not configured — {role} · by {date}", and ST1's
 *  fallback is for a section whose INPUTS are not configured. CO5's inputs are
 *  configured; there are simply not enough questions, which is a different fact
 *  and gets its own words. */
export function questionsEmpty(input: {
  rival: string | null
  videos: number
  floor: number
}): string | null {
  if (!input.rival) return 'No rival is tracked for this workspace yet.'
  if (input.videos === 0) {
    return `Nothing was asked under ${input.rival}’s content in this window. Widen the horizon and this block reads further back.`
  }
  if (input.videos < input.floor) {
    return `${fmtInt(input.videos)} of ${input.rival}’s videos carried a question in this window, under the floor of ${fmtInt(input.floor)}. They are shown, and no share is drawn from them.`
  }
  return null
}

/** Why the questions are listed one by one rather than grouped into themes.
 *
 *  `audience_insights.theme` is a RAW PER-INSIGHT SLUG, not a clustered theme:
 *  `bag_features`, `bag_features_and_design`, `product_features` and
 *  `product_details` are four slugs for one question. Grouped on it, Ottobock's
 *  six-month top question theme is `location_inquiry` at n = 3 — a list of ones
 *  wearing the clothes of a ranking. */
export const QUESTIONS_GROUPING_NOTE =
  'Questions are listed as they were asked. Grouping them needs the clustering that names your subjects, which is not switched on for this workspace yet.'

export const QUESTIONS_SUBJECTS_NOTE =
  'Matching these against your own subjects arrives once subjects are named and confirmed for this workspace.'

/** CO3, CO4, CO6 and CO7: what each waits for and who owns it. */
export function competitiveUnlockRows(): CompetitiveUnlockRow[] {
  return [
    {
      section: 'CO3',
      title: 'Head to head, then and now',
      line: 'You against the selected rival, one row per measure — videos about, comments per video, engagement per video, positive share, own posts published — now, last month and the change, with an n on every row.',
      owner: 'Verbatim engineering',
    },
    {
      section: 'CO4',
      title: 'What they say about themselves',
      line: 'The rival’s own-post claims, verbatim, beside what their audience says on the same subject. Their accounts are not configured, and a rival’s claims may only be read from videos they posted themselves.',
      owner: 'Your digital director',
    },
    {
      section: 'CO6',
      title: 'Findings, with recurrence',
      line: 'Cross-brand findings with “seen in 4 of the last 6 months”, which needs a finding identity that survives an update.',
      owner: 'Verbatim engineering',
    },
    {
      section: 'CO7',
      title: 'How the category makes content',
      line: 'Formats and hooks side by side for the category, for you and for each rival, with “read from n of m videos” on every row and Reddit named as absent from all of them.',
      owner: 'Verbatim engineering',
    },
  ]
}

// ---- the loader ---------------------------------------------------------------

interface StoredDenominatorRow {
  month: string
  audience: string
  videos: number
  comments: number
  platform_mix: PlatformMix | null
  dual_mention: number | null
  status: MonthStatus
  run_id: string | null
}

interface RivalVideo {
  id: string
  platform: string | null
  video_url: string | null
  competitor_name: string | null
}

interface QuestionInsight {
  id: string
  theme: string
  description: string
  platform: string | null
  source_video_id: string | null
}

export async function loadCompetitiveSurface(scope: Scope): Promise<CompetitiveSurfaceData | null> {
  const supabase = scope.supabase as SupabaseClient
  const { clientId } = scope
  const params = scope.params as CompetitiveSurfaceParams
  const reading: ReadingHandle = scope.reading
  const readingAt = new Date().toISOString()
  const horizon = parseHorizon(params.horizon)

  const [clientRes, rivals, subreddits] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    loadRivals(supabase, clientId),
    loadSubreddits(supabase, clientId),
  ])
  const brand = row<{ company_name: string | null }>(clientRes, 'competitive-surface.client')?.company_name ?? 'Your brand'

  // ── the axis ───────────────────────────────────────────────────────────
  // The whole denominator history, cheap and indexed, decides what "since we
  // started" means (decision M) and therefore what every horizon's window is.
  const history = await loadMonthSeries(reading.client, clientId, { from: '2019-01-01', to: readingAt, updatesByMonth: {} })
  const started = sinceStart(history.denominators.map((d) => ({ month: d.month, videos: d.videos })))
  const window = horizonWindow(horizon, readingAt, started.from)
  const axis = window.months
  const month = axis[axis.length - 1]
  const monthStatus = freezeStateFor(month, readingAt)
  // THE COMPARISON IS THE CALENDAR'S, NOT THE HORIZON'S — the Overview's own
  // correction: taking the previous month off the axis left the default reading
  // with no month-on-month comparison at all.
  const prevMonth = previousMonthOf(month)
  const readAxis = axis[0] <= prevMonth ? axis : [prevMonth, ...axis]

  const [denominators, changes] = await Promise.all([
    readDenominators(reading.client, clientId, readAxis),
    loadConfigChanges(reading.client, clientId),
  ])

  const standings = buildStandingsBlock({
    brand,
    rivals: rivals.rivals,
    denominators,
    axis,
    readAxis,
    month,
    changes,
  })

  // ── CO1 · the rival selection ──────────────────────────────────────────
  const analysedByRival = await countAnalysedByRival(supabase, clientId)
  const observed = new Set(
    (denominators ?? [])
      .filter((d) => axis.includes(monthStartOf(d.month)) && d.videos > 0)
      .map((d) => d.audience),
  )
  const options: RivalOption[] = rivals.rivals.map((r) => {
    const audience = rivalKey(r.name)
    const analysed = analysedByRival ? analysedByRival.get(r.name) ?? 0 : null
    return {
      audience,
      name: r.name,
      state: rivalState({ retiredAt: r.retiredAt, analysed, observedThisWindow: observed.has(audience) }),
      analysed,
      retiredAt: r.retiredAt,
      href: competitiveSurfaceHref(r.name, scope.params),
      selected: false,
    }
  })
  const wanted = (params.vs ?? '').trim().toLowerCase()
  const selectedIndex = wanted
    ? options.findIndex((o) => o.name.toLowerCase() === wanted || o.audience.toLowerCase() === wanted)
    : -1
  // The first OBSERVED rival by default, and the first tracked one when none
  // has been read: a selector that opens on a rival with nothing behind it is
  // a page that looks broken to a client whose other rival is fine.
  const fallback = options.findIndex((o) => o.state === 'observed')
  const index = selectedIndex >= 0 ? selectedIndex : fallback >= 0 ? fallback : options.length > 0 ? 0 : -1
  if (index >= 0) options[index] = { ...options[index], selected: true }
  const selected = index >= 0 ? options[index] : null

  // ── CO5 · what the category asks under their content ───────────────────
  const questions = await buildQuestions({
    supabase,
    reading,
    clientId,
    rival: selected?.name ?? null,
    window,
    subreddits,
    subjectsNamed: await subjectsExist(supabase, clientId),
  })

  // ── the record ─────────────────────────────────────────────────────────
  const verdicts = standingsVerdicts({ standings })
  const recordInputs = await loadRecordInputs(
    reading.client,
    clientId,
    recordWindow(month, readingAt),
    { comparisonsRefused: countRefused(verdicts), refusals: refusals(verdicts), now: readingAt },
  )

  return {
    brand,
    month,
    monthStatus,
    readingAt,
    horizon,
    window,
    rivals: {
      options,
      selected,
      identityRecorded: rivals.recorded,
      empty: options.length === 0 ? 'No rival is tracked for this workspace yet — name one in Settings and this page starts reading them.' : null,
    },
    standings,
    questions,
    unlocks: { rows: competitiveUnlockRows() },
    record: { line: howSoundLine(recordInputs), lines: recordLines(recordInputs), href: '/dashboard/settings' },
  }
}

/** The page's own address, keeping the reader's horizon. */
export function competitiveSurfaceHref(rival: string | null, params: Record<string, string | undefined> = {}): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (typeof v === 'string' && v !== '' && k !== 'vs') q.set(k, v)
  if (rival) q.set('vs', rival)
  const s = q.toString()
  return s ? `/dashboard/competitive?${s}` : '/dashboard/competitive'
}

function previousMonthOf(month: string): string {
  const d = new Date(`${monthStartOf(month)}T00:00:00.000Z`)
  return monthStartOf(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString())
}

/**
 * The tenant's rivals, and whether their IDENTITY is recorded.
 *
 * `competitors` (M1) is the register; until it is applied the only list is
 * `tracking_configs.competitor_names`, which holds today's names and no
 * retirement at all — so a rival the tenant stopped tracking is invisible, and
 * the block has to say that rather than imply there were never any. (Sealand
 * had Patagonia and Topo Designs until 2026-09-09; both were removed with no
 * record anywhere, and 84 of their registry themes are still in the database.)
 */
async function loadRivals(
  supabase: SupabaseClient,
  clientId: string,
): Promise<{ rivals: { name: string; retiredAt: string | null }[]; recorded: boolean }> {
  try {
    const stored = await loadCompetitors(supabase, clientId)
    if (stored.length > 0) return { rivals: stored.map((r) => ({ name: r.name, retiredAt: r.retired_at })), recorded: true }
  } catch (error) {
    if (!isMissingCompetitors(error)) throw error
  }
  const res = await supabase.from('tracking_configs').select('competitor_names').eq('client_id', clientId).maybeSingle()
  const tc = row<{ competitor_names: string[] | null }>(res, 'competitive-surface.rivals')
  return { rivals: (tc?.competitor_names ?? []).map((name) => ({ name, retiredAt: null })), recorded: false }
}

async function loadSubreddits(supabase: SupabaseClient, clientId: string): Promise<string[]> {
  const res = await supabase.from('tracking_configs').select('subreddits').eq('client_id', clientId).maybeSingle()
  const tc = row<{ subreddits: { name?: string; status?: string }[] | null }>(res, 'competitive-surface.subreddits')
  return (tc?.subreddits ?? [])
    .filter((s) => s && s.status === 'active' && typeof s.name === 'string')
    .map((s) => s.name as string)
}

/** The stored months, read straight. Null — never [] — when the month tables
 *  are not applied here. */
async function readDenominators(
  client: SupabaseClient,
  clientId: string,
  months: readonly string[],
): Promise<StoredDenominatorRow[] | null> {
  if (months.length === 0) return []
  try {
    return await selectAll<StoredDenominatorRow>(() =>
      client.from('month_denominators')
        .select('month, audience, videos, comments, platform_mix, dual_mention, status, run_id')
        .eq('client_id', clientId)
        .gte('month', months[0])
        .lte('month', months[months.length - 1])
        .order('month', { ascending: true })
        .order('audience', { ascending: true }),
    )
  } catch (error) {
    if (isMissingMonthlyReading(error)) return null
    throw error
  }
}

/** The three columns a rule needs, and no more: `config_changes.before` and
 *  `.after` carry whatever a write site put there and none of it is drawn. */
type ChangeMark = Pick<ConfigChange, 'changed_at' | 'surface' | 'source'>

async function loadConfigChanges(client: SupabaseClient, clientId: string): Promise<ChangeMark[]> {
  try {
    return await selectAll<ChangeMark>(() =>
      client.from(CONFIG_CHANGES_TABLE).select('changed_at, surface, source')
        .eq('client_id', clientId).order('changed_at', { ascending: true }),
    )
  } catch (error) {
    if (isMissingConfigLog(error)) return []
    throw error
  }
}

/** Analysed videos per rival, over the whole corpus — the fact that tells
 *  "configured and never read" apart from "read, and quiet this window". */
async function countAnalysedByRival(supabase: SupabaseClient, clientId: string): Promise<Map<string, number> | null> {
  try {
    const rows = await selectAll<{ competitor_name: string | null }>(() =>
      supabase.from('videos').select('competitor_name')
        .eq('client_id', clientId).eq('is_competitor', true).not('analyzed_run_id', 'is', null)
        .order('id', { ascending: true }),
    )
    const out = new Map<string, number>()
    for (const r of rows) {
      if (!r.competitor_name) continue
      out.set(r.competitor_name, (out.get(r.competitor_name) ?? 0) + 1)
    }
    return out
  } catch (error) {
    console.error(`[pages] competitive-surface.analysed: ${(error as { message?: string })?.message ?? String(error)}`)
    return null
  }
}

/** Does this tenant have subjects at all? M4 unapplied and "none named" are
 *  different facts and CO5 says the right one. */
async function subjectsExist(supabase: SupabaseClient, clientId: string): Promise<boolean> {
  try {
    const { data } = await supabase.from(TABLE_SUBJECTS).select('id').eq('client_id', clientId).eq('status', 'active').limit(1)
    return (data ?? []).length > 0
  } catch (error) {
    if (isMissingSubjects(error)) return false
    throw error
  }
}

interface StandingsInputs {
  brand: string
  rivals: readonly { name: string; retiredAt: string | null }[]
  denominators: StoredDenominatorRow[] | null
  axis: string[]
  readAxis: string[]
  /** The calendar month in hand. The table's own month is derived from what has
   *  rows, and the month before it likewise — neither is a caller's to choose. */
  month: string
  changes: readonly ChangeMark[]
}

export function buildStandingsBlock(input: StandingsInputs): StandingsBlock {
  const base = {
    source: 'corpus' as StandingsSource,
    months: input.axis,
    precedence: PRECEDENCE_RULE,
    denominatorLine: CORPUS_DENOMINATOR_LINE,
    unlock: ATTENTION_UNLOCK,
  }
  const nothing = (month: string, empty: string): StandingsBlock => ({
    ...base,
    month,
    monthLabel: monthName(month),
    behind: null,
    rows: [],
    series: [],
    denominators: [],
    rules: [],
    dualMention: null,
    caveat: null,
    empty,
  })
  if (input.denominators == null || input.denominators.length === 0) {
    return nothing(input.month, STANDINGS_UNREAD)
  }

  const byMonth = new Map<string, StoredDenominatorRow[]>()
  for (const d of input.denominators) {
    const m = monthStartOf(d.month)
    byMonth.set(m, [...(byMonth.get(m) ?? []), d])
  }

  // THE TABLE IS A MONTH THAT HAS ROWS, AND IT IS LABELLED WITH THAT MONTH.
  // `input.month` is the calendar month in hand; `freeze-months` writes a
  // month's `month_denominators` rows when an update lands in it, so from
  // midnight on the 1st until that month's first delivered run — up to a week
  // on both tenants — the month in hand holds nothing. The block used to take
  // the newest STORED denominator and print it under the month in hand's name:
  // September's 449 videos and 11,330 comments under "October 2026", beside a
  // table whose every row read "not observed". Three answers, one month, all
  // disagreeing.
  const stored = input.axis.filter((m) => byMonth.has(m))
  const month = stored[stored.length - 1] ?? null
  if (month == null) return nothing(input.month, standingsUnreadMonth(input.month))
  const prevMonth = previousMonthOf(month)
  const behind = month === monthStartOf(input.month) ? null : standingsBehindLine(input.month, month)

  // THE CORPUS ROWS WEAR THE PANEL'S SHAPE, and the label says which they are.
  // `buildStandings` divides an audience's videos by the month's videos and its
  // comments by the month's comments; feeding it the comment-dated month
  // denominators makes both shares readings of what our search plan found —
  // which is the design's own label for CO2's denominators. The frozen panel of
  // accounts (item 11's attention index) is a different measurement and lands
  // with `month_audience_stats`.
  const rowsOf = (m: string): AttentionRow[] =>
    (byMonth.get(m) ?? []).map((d) => ({
      audience: d.audience,
      panel_videos: d.videos,
      attention_comments: d.comments,
      panel_platform_mix: d.platform_mix ?? {},
    }))
  const runIdOf = (m: string): string | null => (byMonth.get(m) ?? [])[0]?.run_id ?? null

  const rows = buildStandings({
    month,
    rows: rowsOf(month),
    prevRows: byMonth.has(prevMonth) ? rowsOf(prevMonth) : undefined,
    prevMonth,
    rivals: input.rivals.map((r) => ({ name: r.name })),
    clientLabel: input.brand,
    categoryLabel: 'The rest of the category',
    dualMention: (byMonth.get(month) ?? []).find((d) => d.audience === CLIENT_AUDIENCE)?.dual_mention ?? null,
    panelId: runIdOf(month),
    prevPanelId: byMonth.has(prevMonth) ? runIdOf(prevMonth) : null,
  })

  const series: StandingsSeries[] = rows.map((r) => ({
    audience: r.audience,
    label: r.label,
    role: r.role,
    points: input.axis.map((m) => {
      const monthRows = rowsOf(m)
      const totals = attentionTotals(monthRows)
      const mine = monthRows.find((x) => x.audience === r.audience)
      return {
        month: m,
        content: mine && totals.videos > 0 ? round1((mine.panel_videos / totals.videos) * 100) : null,
        attention: mine && totals.comments > 0 ? round1((mine.attention_comments / totals.comments) * 100) : null,
      }
    }),
  }))

  const denominators: StandingsMonthRow[] = input.axis
    .filter((m) => byMonth.has(m))
    .map((m) => {
      const monthRows = byMonth.get(m) ?? []
      const totals = attentionTotals(rowsOf(m))
      const mix: PlatformMix = {}
      for (const d of monthRows) {
        for (const [p, n] of Object.entries(d.platform_mix ?? {})) {
          if (typeof n === 'number') mix[p] = (mix[p] ?? 0) + n
        }
      }
      return {
        month: m,
        label: monthName(m),
        status: monthRows[0]?.status ?? 'filling',
        videos: totals.videos,
        comments: totals.comments,
        platformMix: mix,
        runId: monthRows[0]?.run_id ?? null,
      }
    })

  return {
    ...base,
    month,
    monthLabel: monthName(month),
    behind,
    rows,
    series,
    denominators,
    rules: trackingRules(input.changes, input.axis),
    dualMention: (byMonth.get(month) ?? []).find((d) => d.audience === CLIENT_AUDIENCE)?.dual_mention ?? null,
    caveat: comparabilityCaveat(denominators),
    empty: rows.every((r) => !r.observed) ? `Nothing was ${NOT_OBSERVED} in ${monthName(month)}.` : null,
  }
}

const round1 = (n: number): number => Math.round(n * 10) / 10

interface QuestionInputs {
  supabase: SupabaseClient
  reading: ReadingHandle
  clientId: string
  rival: string | null
  window: HorizonWindow
  subreddits: string[]
  subjectsNamed: boolean
}

/**
 * CO5 — the questions asked under one rival's content, in the horizon's window.
 *
 * DATED BY THE COMMENT, through the evidence. A question insight has no date of
 * its own — `audience_insights.created_at` is when the model wrote it, which is
 * a run's clock — so the window is applied to the COMMENTS behind it
 * (`insight_evidence.comment_id` → `comments.comment_date`). Measured
 * read-only against production, every question insight under a rival's content
 * on both tenants resolves at least one comment date, so nothing is dropped for
 * want of a date: Ottobock 57 of 57, Cotopaxi 29 of 29, Freitag 4 of 4.
 *
 * The alternative — "the video had a comment in this month", the idiom
 * `monthly_denominators` uses — needs a join over ~100k comment rows per page
 * load and answers a slightly different question ("was this video being talked
 * about"), where CO5 asks "was this question asked".
 */
async function buildQuestions(input: QuestionInputs): Promise<QuestionsBlock> {
  const empty = (videos: number): QuestionsBlock => ({
    rival: input.rival,
    videos,
    insights: 0,
    quotes: 0,
    platformMix: {},
    rows: [],
    floor: COMPETITIVE_MIN_VIDEOS,
    cleared: false,
    subreddits: input.subreddits,
    empty: questionsEmpty({ rival: input.rival, videos, floor: COMPETITIVE_MIN_VIDEOS }),
    groupingNote: QUESTIONS_GROUPING_NOTE,
    subjectsNote: input.subjectsNamed ? null : QUESTIONS_SUBJECTS_NOTE,
  })
  if (!input.rival) return empty(0)

  const videos = await selectAll<RivalVideo>(() =>
    input.supabase.from('videos').select('id, platform, video_url, competitor_name')
      .eq('client_id', input.clientId).eq('is_competitor', true).eq('competitor_name', input.rival)
      .not('analyzed_run_id', 'is', null)
      .order('id', { ascending: true }),
  ).catch((error: unknown) => {
    console.error(`[pages] competitive-surface.rivalVideos: ${(error as { message?: string })?.message ?? String(error)}`)
    return [] as RivalVideo[]
  })
  if (videos.length === 0) return empty(0)
  const videoById = new Map(videos.map((v) => [v.id, v]))

  // THROUGH `audience_insights_current`, never `audience_insights … eq(run_id)`
  // — this is a population read ("all current question insights"), which is
  // exactly what the view is for (AGENTS.md). 696 rows on Össur, 567 on
  // Sealand, so one read answers for every rival and the filter is in memory.
  const insights = await selectAll<QuestionInsight>(() =>
    input.supabase.from('audience_insights_current')
      .select('id, theme, description, platform, source_video_id')
      .eq('client_id', input.clientId).eq('category', 'question')
      .order('id', { ascending: true }),
  ).catch((error: unknown) => {
    console.error(`[pages] competitive-surface.questions: ${(error as { message?: string })?.message ?? String(error)}`)
    return [] as QuestionInsight[]
  })
  const mine = insights.filter((i) => i.source_video_id != null && videoById.has(i.source_video_id))
  if (mine.length === 0) return empty(0)

  const citations = await fetchQuoteCitationsByAudience(input.supabase, mine.map((i) => i.id))
  const commentIds = [...new Set([...citations.values()].flat().map((c) => c.commentId).filter((id): id is string => !!id))]
  const dates = await commentDates(input.reading.client, input.clientId, commentIds)

  const from = input.window.from
  const to = input.window.to
  const inWindow = (id: string): boolean => {
    const cited = citations.get(id) ?? []
    return cited.some((c) => {
      const d = c.commentId ? dates.get(c.commentId) : undefined
      return d != null && d >= from && d < to
    })
  }

  const kept = mine.filter((i) => inWindow(i.id))
  const keptVideos = new Set(kept.map((i) => i.source_video_id as string))
  const mix: PlatformMix = {}
  for (const id of keptVideos) {
    const p = videoById.get(id)?.platform ?? 'other'
    mix[p] = (mix[p] ?? 0) + 1
  }
  let quotes = 0
  const rows: QuestionRow[] = kept.slice(0, QUESTIONS_SHOWN).map((i) => {
    const cited = (citations.get(i.id) ?? []).slice().sort((a, b) => a.rank - b.rank).slice(0, QUOTES_PER_QUESTION)
    quotes += (citations.get(i.id) ?? []).length
    const video = i.source_video_id ? videoById.get(i.source_video_id) ?? null : null
    return {
      id: i.id,
      text: i.description,
      platform: i.platform ?? video?.platform ?? null,
      videoHref: video?.video_url ?? null,
      quotes: cited.map((c) => ({ ref: quoteRef.evidence(c.evidenceId), text: c.quote, lang: c.lang ?? null, english: c.english ?? null })),
    }
  })
  for (const i of kept.slice(QUESTIONS_SHOWN)) quotes += (citations.get(i.id) ?? []).length

  return {
    rival: input.rival,
    videos: keptVideos.size,
    insights: kept.length,
    quotes,
    platformMix: mix,
    rows,
    floor: COMPETITIVE_MIN_VIDEOS,
    cleared: keptVideos.size >= COMPETITIVE_MIN_VIDEOS,
    subreddits: input.subreddits,
    empty: questionsEmpty({ rival: input.rival, videos: keptVideos.size, floor: COMPETITIVE_MIN_VIDEOS }),
    groupingNote: QUESTIONS_GROUPING_NOTE,
    subjectsNote: input.subjectsNamed ? null : QUESTIONS_SUBJECTS_NOTE,
  }
}

/** Comment dates by id, chunked to stay under the PostgREST URL cap. Read on
 *  the reading client with the tenant re-asserted: a date is not a reading and
 *  needs no policy of its own, but a read that could cross a tenant is a read
 *  that names its tenant. */
async function commentDates(client: SupabaseClient, clientId: string, ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const unique = [...new Set(ids)]
  for (let i = 0; i < unique.length; i += 120) {
    const chunk = unique.slice(i, i + 120)
    const { data, error } = await client
      .from('comments').select('id, comment_date').eq('client_id', clientId).in('id', chunk)
    if (error) {
      console.error(`[pages] competitive-surface.commentDates: ${error.message}`)
      continue
    }
    for (const r of (data ?? []) as { id: string; comment_date: string | null }[]) {
      if (r.comment_date) out.set(r.id, r.comment_date)
    }
  }
  return out
}

/** Every comparison this surface may speak from — what a prompt may read a
 *  direction word off, and what the record counts as refused. */
export function standingsVerdicts(data: Pick<CompetitiveSurfaceData, 'standings'>): Verdict[] {
  return data.standings.rows.flatMap((r) => [r.contentVerdict, r.attentionVerdict].filter((v): v is Verdict => v != null))
}
