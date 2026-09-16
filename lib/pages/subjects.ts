import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk } from '../chunk'
import { fmtInt, monthName, shortDate } from '../format'
import { cleanQuote, fetchQuoteCitationsByAudience, readsAsHeroQuote, type QuoteCitation } from '../quotes'
import { citationLink } from '../evidence-cite'
import { quoteRef } from '../renderables/quotes-freeze'
import type { Quote, Scope } from '../renderables/types'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, loadTrackedRivals, rivalKey, type TrackedRival } from '../rivals'
import { audienceLabel } from '../readiness/types'
import { SHARE_BAND } from '../report-bands'
import { directionWord, monthChange, thinMonth, type Direction, type SeriesPoint } from '../reading/bands'
import { horizonWindow, HORIZON_LABEL, parseHorizon, sinceStart, type Horizon, type HorizonWindow } from '../reading/horizon'
import { kindShares, redditRead, type KindShare, type RedditRead } from '../reading/kinds'
import { isMissingKindMoodAttention } from '../reading/attention'
import { freezeBoundary, freezeStateFor, isMissingMonthTable } from '../reading/monthly'
import { monthStartOf } from '../reading/month-key'
import { loadMonthSeries, type ReadingHandle } from '../reading/read'
import { countRefused, howSoundLine, loadRecordInputs, monthRecordWindow, recordLines, refusals } from '../reading/record'
import { pointsByMonth, type MonthLabel, type MonthSeries, type Substrate } from '../reading/series'
import type { MonthStatus } from '../reading/types'
import type { FigureTable, Verdict } from '../reading/verdicts'
import {
  isMissingSubjects,
  subjectCalibration,
  TABLE_SUBJECTS,
  TABLE_SUBJECT_MEMBERSHIPS,
  TABLE_MOVES,
  type Move,
  type Subject,
  type SubjectCalibration,
} from '../subjects/types'
import { selectAll } from '../supabase-admin'
import { fetchRunningRunIds } from './latest-video-run'
import { fetchThemedRunId } from './themed-run'

// Subjects — "how are we seen on this subject?" (Phase 1 WP12, design §3
// SU1–SU3, the mock's Subjects.dc.html).
//
// THE PAGE IS ONE SUBJECT AT A TIME. SU1 is the rail: every subject the tenant
// named, where it came from, the day it was named, and the sentence that makes
// the whole model legible — renaming or adding one starts a NEW line and the
// old line is kept. SU2 is the selected subject in full: you, each rival and
// the category as monthly lines, the kinds of thing said in each audience, six
// voices, and the two things a reader can DO about it (Track this, Ask about
// this). SU3 is the gap: questions the category asks on this subject that your
// own posts have never answered.
//
// EVERYTHING COUNTED COMES OFF THE STORED MONTHS. `month_subject_readings`
// through `loadMonthSeries` (WP12 attached the table to it) — never a
// recomputation and never a run. M4 is authored and NOT applied, so on
// production today every one of those reads answers `numeratorSubstrate:
// 'missing'` and this page says what is not recorded yet, in words, rather
// than drawing an axis of hollow months for a table that does not exist.
//
// AND ONE THING IT WILL NOT PRINT. SU3's counts are taken from the CURRENT
// analysis — which videos carry a question insight on this subject — while
// every other number on the page is comment-dated. Those two are not two ends
// of one fraction, so SU3 prints counts and the population it counted in, and
// no share and no change badge. The design's example sentence is a share; the
// smallest correct alternative is the sentence without it (see UNANSWERED_BASIS).

/** How many subjects the rail shows before it scrolls. The set is 5-8 by
 *  design (SUBJECTS_MAX), so this is a guard against a tenant that grew past
 *  the editor rather than a page decision. */
export const RAIL_MAX = 12

/** Voices on the selected subject (the mock: "6 shown"). */
export const VOICES_SHOWN = 6

/** …and at most this many from any one audience, so the three sides are all
 *  heard. The design asks for "up to six quotes per audience" and the mock
 *  draws six in total, mixed — one under your post, one under a rival's, one
 *  under a category video. Six per audience is eighteen quotes on one page and
 *  the page is a reading, not an archive; a round-robin over the audiences
 *  keeps the mock's six AND the design's guarantee that no audience is
 *  silenced by another's volume. */
export const VOICES_PER_AUDIENCE = 3

/**
 * How much of a subject's evidence the six voices are drawn from.
 *
 * A COST DECISION, AND THEREFORE SAID OUT LOUD. Every citation on a member
 * insight is read to find six quotable ones, and one insight can carry a
 * hundred; a subject that is a third of Össur's corpus would mean thousands of
 * insights and tens of thousands of evidence rows for six quotes on one tile.
 * So the pool is capped — and where the cap bites, the block stops printing a
 * denominator it did not count ("6 of 41") and says it is a sample instead.
 * SU3's counts are NOT capped: a count printed as the whole must be the whole.
 */
export const VOICES_POOL_INSIGHTS = 400
export const VOICES_POOL_CITATIONS = 400

/** Rows SU3 lists. The mock draws three. */
export const UNANSWERED_SHOWN = 3

/** SU3's gate (design §3 SU3): fewer question videos than this on the subject
 *  and the block says so rather than ranking noise. */
export const UNANSWERED_GATE = 10

/** What SU3's counts are counted in, said once.
 *
 *  TWO STATEMENTS, NOT ONE. The counts cover the period the reader chose, and
 *  a video is placed in it by the day it was posted — which is not the date
 *  the rest of this page is read by (a month here is dated by the COMMENT).
 *  Saying only "not in a calendar month" left the first half unsaid, and a
 *  count whose period nobody states is a count a reader will assume is the
 *  one on the control. */
export const UNANSWERED_BASIS =
  'Counted in the videos we have read on this subject over the period shown, each placed by the day it was posted — not by the calendar month the rest of this page reads. So these are counts, not shares, and carry no change.'

/**
 * What SU3 says about the half of your posts it cannot read.
 *
 * A question is "answered" here when one of your own posts is ABOUT it —
 * `videos.topics`. The other half of the evidence is what those posts CLAIM
 * (`video_claims`), and no tenant may select that table until M8 (WP16): RLS
 * is on and there is not one policy, so a member's read comes back empty with
 * no error. An empty half that reads as "you never answered this" is the
 * failure this block exists to avoid, so the block says which half it read —
 * the OV4 precedent, where a side that cannot be read is named and not drawn
 * as a zero.
 */
export const UNANSWERED_CLAIMS_UNREADABLE =
  'We match these against what your posts are about. What your posts claim is not readable yet — Verbatim engineering.'

/** Reddit's own caveat wherever a question count leans on it (design §3 SU3). */
export const REDDIT_THREAD_CAP =
  'Reddit threads are the densest source of questions and are counted; we read up to 40 comments on each.'

/** SU1's sentence. The whole identity model in twelve words, printed where the
 *  editing happens rather than inside a help page nobody opens. */
export const SUPERSEDE_RULE = 'Renaming or adding a subject starts a new line. The old line is kept.'

// ---- the shapes ---------------------------------------------------------------

/** One side of the reading: you, one rival, or the category. */
export interface SubjectSide {
  /** The stored audience key. */
  audience: string
  /** The reader's words for it. */
  label: string
  kind: 'you' | 'rival' | 'category'
  /** The entity's colour token — never the rank's. */
  color: string
  /** This month's k and n, and the share. Null where nothing was read. */
  k: number | null
  n: number | null
  pct: number | null
  /** False where this side carries no share this month, for either reason. */
  observed: boolean
  /**
   * WHICH silence, in the page's own distinction (railNote's, one tile away).
   *
   * `not_tracked` is about the AUDIENCE: nothing was read for it at all, there
   * is no denominator, and "— not tracked" is true of it. `no_reading` is
   * about the SUBJECT: the audience was read — the denominator row proves it —
   * and this subject carried no row in it. `monthly_subject_readings` emits a
   * row only where videos > 0 (it is a group-by over matches), so a freshly
   * confirmed subject with no members in a month has no row at all, and
   * printing "— not tracked" for the client's OWN audience there is false.
   */
  silence: 'no_reading' | 'not_tracked' | null
  /** The banded month-on-month change, or null where none was drawn. */
  verdict: Verdict | null
  /** Three consecutive readings in one regime, or null. */
  direction: Direction | null
  /** The month before this one, as a level beside a level — never a change. */
  previous: { month: string; pct: number | null } | null
  /** The audience-wide kind mix this month (the mock's own denominator: every
   *  video in the audience, not the subject's). */
  kinds: KindShare[]
  reddit: RedditRead | null
}

export interface SubjectRail {
  id: string
  name: string
  description: string | null
  origin: Subject['origin']
  namedAt: string
  status: Subject['status']
  calibration: SubjectCalibration
  /** Your own side this month, as a level. Null while the subject is
   *  calibrating — a share nobody has measured the precision of is not shown
   *  to a client (design :891). */
  level: { k: number; n: number; pct: number | null } | null
  /** Why no share is shown, in the reader's words. */
  note: string | null
  selected: boolean
  href: string
}

export interface SubjectListBlock {
  rows: SubjectRail[]
  /** Subjects named but not confirmed — nothing counts them yet. */
  proposed: { id: string; name: string; because: string }[]
  rule: string
  /** Null where `subjects` is readable; a sentence where M4 is not applied. */
  notRecorded: string | null
  setLine: string
}

export interface SubjectVoice {
  quote: Quote
  cite: string
  href: string | null
  /** Which side of the conversation it came from, for the reader. */
  from: string
}

export interface UnansweredRow {
  id: string
  label: string
  /** Non-owned videos that asked it. */
  videos: number
  /** Of those, Reddit threads. */
  reddit: number
  /** True where one of your own posts touches it. */
  answered: boolean
  href: string | null
}

export interface UnansweredBlock {
  rows: UnansweredRow[]
  /** Distinct non-owned videos carrying a question on this subject — the gate's
   *  own number. */
  questionVideos: number
  /** Videos read for the category, as the population the counts sit in. */
  population: number | null
  /** Your own posts in the drawn window. */
  yourPosts: number
  lead: string | null
  basis: string
  /** What half of your posts this matched on, while the other half is
   *  unreadable. Null the day M8 lands and the claims can be read. */
  claims: string | null
  reddit: string | null
  refusal: string | null
}

export interface SubjectPane {
  id: string
  name: string
  description: string | null
  namedAt: string
  origin: Subject['origin']
  calibration: SubjectCalibration
  index: number
  of: number
  sides: SubjectSide[]
  /** The chart's lines, one per side, in axis order. */
  series: MonthSeries[]
  voices: SubjectVoice[]
  voicesFrom: number
  /** True where the pool the six were drawn from was capped — then the block
   *  says "a sample" instead of a denominator. */
  voicesSampled: boolean
  unanswered: UnansweredBlock
  /** The move already declared on this subject, where there is one. */
  move: { id: string; title: string; declaredAt: string; status: Move['status'] } | null
  /** The videos behind YOUR figure, as a link and a count. */
  behind: { videos: number; href: string } | null
  /** The sentence above the axis about which lines carry an n. */
  axisNote: string | null
  /** Said where the numerator table is not applied here. */
  notRecorded: string | null
}

export interface SubjectsRecordBlock {
  line: string
  lines: string[]
  href: string
  freezesOn: string
}

export interface SubjectsData {
  brand: string
  month: string
  monthStatus: MonthStatus
  readingAt: string
  horizon: Horizon
  window: HorizonWindow
  axis: string[]
  substrate: Substrate
  notes: MonthLabel[]
  list: SubjectListBlock
  selected: SubjectPane | null
  record: SubjectsRecordBlock
}

// ---- pure ---------------------------------------------------------------------

const pctOf = (k: number | null, n: number | null): number | null =>
  k == null || n == null || n <= 0 ? null : Math.round((k / n) * 1000) / 10

/** Where a subject came from, in the client's words. The same three sentences
 *  OV2's empty state uses, so the two surfaces cannot word one origin twice. */
export function originLine(origin: Subject['origin']): string {
  if (origin === 'own_claims') return 'you said this in your own posts'
  if (origin === 'category_theme') return 'the category raised it in the videos we read'
  return 'you named it'
}

/** The rail's own "N named" line, and what it says about the set. */
export function setLine(active: number, proposed: number): string {
  if (active === 0 && proposed === 0) return 'No subject named yet.'
  if (active === 0) return `${fmtInt(proposed)} proposed · none confirmed, so nothing is counted yet.`
  const tail = proposed > 0 ? ` · ${fmtInt(proposed)} waiting to be confirmed` : ''
  return `${fmtInt(active)} named${tail}`
}

/** Why this subject's share is not being shown. Null when it is.
 *
 *  THREE DIFFERENT SILENCES AND THEY READ DIFFERENTLY. "Not counted yet" is
 *  about the CONSENT — the subject is named and nobody has confirmed it, so
 *  nothing has ever looked. "Calibrating" is about the MEASUREMENT — nobody
 *  has checked how often the judge is right, so the number exists and may not
 *  be printed. "No reading yet" is about the RECORD — the month holds no row.
 *  Collapsing them into one sentence was how the old product told a client its
 *  data was missing when its method was. */
export function railNote(
  calibration: SubjectCalibration,
  read: boolean,
  status: Subject['status'] = 'active',
): string | null {
  if (status === 'proposed') return 'not counted yet — confirm it and counting starts with the next update'
  if (calibration === 'calibrating') return 'still checking how often we get this right'
  if (!read) return 'no reading yet'
  return null
}

/** Which subject the page is about: the one asked for, else the first
 *  confirmed one, else nothing. A subject that is not this tenant's, or is
 *  retired, is not selected by a URL — it simply is not in the list. */
export function selectSubject(rail: readonly { id: string }[], asked: string | undefined): string | null {
  if (asked && rail.some((r) => r.id === asked)) return asked
  return rail[0]?.id ?? null
}

/**
 * Six voices, drawn round-robin across the audiences.
 *
 * The order inside one audience is the caller's (relevance rank); the order
 * ACROSS them is one each in turn, so a category audience with four hundred
 * citations cannot silence your own audience's two. `perAudience` caps any one
 * side, and the total cap is what actually stops the list.
 */
export function voicesAcross<T>(
  pools: readonly { audience: string; items: readonly T[] }[],
  total: number = VOICES_SHOWN,
  perAudience: number = VOICES_PER_AUDIENCE,
): T[] {
  const out: T[] = []
  const taken = new Map<string, number>()
  for (let round = 0; round < perAudience; round++) {
    for (const pool of pools) {
      if (out.length >= total) return out
      const at = taken.get(pool.audience) ?? 0
      if (at >= perAudience || at >= pool.items.length) continue
      out.push(pool.items[at])
      taken.set(pool.audience, at + 1)
    }
  }
  return out
}

/** The voices block's meta line. Where the pool was capped it says so rather
 *  than printing a denominator nobody counted. */
export function voicesMeta(shown: number, from: number, sampled: boolean): string {
  const tail = 'original first, English beneath when translated'
  return sampled
    ? `${fmtInt(shown)} shown, drawn from a sample of what was said on this subject · ${tail}`
    : `${fmtInt(shown)} of ${fmtInt(from)} · ${tail}`
}

/** Where a voice was heard, in the reader's words — never an audience key. */
export function voiceFrom(audience: string): string {
  if (audience === CLIENT_AUDIENCE) return 'under a post of yours'
  if (audience === INDUSTRY_AUDIENCE) return 'under a category video'
  const name = audience.startsWith('competitor:') ? audience.slice('competitor:'.length) : audience
  return `under a ${name} video`
}

/** Words worth matching on: lower-cased, accent-folded, three letters or more,
 *  stop words dropped. Small on purpose — this decides whether one of your
 *  posts TOUCHED a question, and a generous matcher that calls everything
 *  answered is the failure mode that matters (it hides the gap). */
const STOP = new Set([
  'the', 'and', 'for', 'with', 'you', 'your', 'our', 'are', 'was', 'were', 'will', 'can', 'does', 'did',
  'this', 'that', 'these', 'those', 'from', 'about', 'into', 'have', 'has', 'had', 'but', 'not', 'any',
  'all', 'how', 'why', 'what', 'when', 'where', 'who', 'its', 'it’s', 'there', 'them', 'they',
])

/** The combining marks NFD splits an accent into, as escapes rather than as
 *  invisible characters in the source — a literal combining mark in a regex
 *  class is a character nobody can see in a diff. */
const COMBINING = new RegExp('[\\u0300-\\u036f]', 'g')

export function matchWords(text: string): string[] {
  const folded = text.normalize('NFD').replace(COMBINING, '').toLowerCase()
  const words = folded.split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    // ONE PIECE OF STEMMING, AND ONLY ONE. "zips failing after a year" against
    // a claim about "ten years" shares one word and reads as unanswered — a
    // question you HAVE answered, printed as a gap, which is the direction of
    // failure that embarrasses a client in front of their own posts. A trailing
    // `s` on a word of four letters or more is dropped and nothing else is; a
    // real stemmer would start matching things that are not the same thing.
    .map((w) => (w.length >= 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
  return [...new Set(words)]
}

/**
 * Did any of your own posts touch this question?
 *
 * Two content words in common, not one: one shared word is "bag" and calls
 * every question about a bag answered. `haystack` is your posts' topics and
 * claims, already folded.
 */
export function answeredBy(label: string, haystack: readonly string[]): boolean {
  const want = matchWords(label)
  if (want.length === 0) return false
  const pool = new Set(haystack.flatMap(matchWords))
  const hits = want.filter((w) => pool.has(w)).length
  return hits >= Math.min(2, want.length)
}

/**
 * SU3's sentence, in the design's own shape minus the share.
 *
 * "Questions grouped as X came up in N of the videos we have read — none of
 * your M posts touched it."
 *
 * TWO DEPARTURES FROM THE DESIGN'S EXAMPLE SENTENCE, both forced by what the
 * label actually is. The share is absent because the k is taken from the
 * current analysis and every other n on this page is comment-dated, and this
 * product does not print a fraction whose two halves are dated two ways. And
 * the verb is "grouped as" rather than "the category asked", because the label
 * is the CLUSTERING's summary of a set of questions, not a question anybody
 * typed — measured on production, one of Össur's largest groups of question
 * insights sits under a theme the model called "Praise for prosthetic look",
 * and "the category asked 'Praise for prosthetic look'" is a sentence that is
 * simply not true. A verbatim question belongs to 31b's evidence freeze, not
 * to a label.
 */
export function unansweredLead(
  rows: readonly UnansweredRow[],
  yourPosts: number,
  period: string,
): string | null {
  const top = rows.find((r) => !r.answered)
  if (!top) return null
  const posts = yourPosts > 0
    ? `none of your ${fmtInt(yourPosts)} post${yourPosts === 1 ? '' : 's'} ${period} touched it`
    : `you published nothing ${period}`
  return `Questions grouped as “${top.label}” came up in ${fmtInt(top.videos)} of the videos we have read — ${posts}.`
}

/**
 * The period the reader chose, in the reader's words, inside a sentence.
 *
 * NOT THE MONTH'S NAME. The lead sentence counted your posts over the whole
 * HORIZON and labelled them with the current month — "none of your 900
 * September posts" on Last 12 months — while the block's own meta line said
 * "in this window" about the same number. One number, two statements, one of
 * them false. The control's own words are the words: it is the only period the
 * reader has been shown.
 */
export function periodPhrase(horizon: Horizon, month: string): string {
  if (horizon === 'this_month') return `in ${monthName(month).split(' ')[0]}`
  if (horizon === 'since_start') return 'since we started'
  return `in the ${HORIZON_LABEL[horizon].toLowerCase()}`
}

/** The words above the axis about which lines carry an n (design §3 SU2's
 *  gate, and the mock's own sentence). ONE sentence for a run of lines, never
 *  one per line. */
export function axisNote(sides: readonly SubjectSide[], floorN: number): string | null {
  const hollow = sides.filter((s) => s.observed && (s.n ?? 0) < floorN)
  const names = (of: readonly SubjectSide[]) => of.map((s) => s.label).join(' and ')
  const parts: string[] = []
  if (hollow.length > 0) {
    parts.push(
      `${names(hollow)} carried too few videos this month to compare ` +
      `(${hollow.map((s) => `${fmtInt(s.n ?? 0)}`).join(', ')}) — drawn hollow, with a level and no change.`,
    )
  }
  // TWO SILENCES, TWO SENTENCES. An audience we never read is "not tracked";
  // an audience we read that carried nothing on this subject has "no reading
  // yet", and the second is the one a newly confirmed subject is in on the
  // client's OWN side.
  const noReading = sides.filter((s) => s.silence === 'no_reading')
  const notTracked = sides.filter((s) => s.silence === 'not_tracked')
  if (noReading.length > 0) parts.push(`${names(noReading)} — no reading yet on this subject.`)
  if (notTracked.length > 0) parts.push(`${names(notTracked)} — not tracked.`)
  return parts.length > 0 ? parts.join(' ') : null
}

/**
 * The caveats a subject reading may carry.
 *
 * NOT THE CLUSTERING'S. `buildSeries` labels a run of months whose clustering
 * key is unrecorded, because two of a THEME's months either side of a
 * re-clustering are not the same object. A subject is not a theme: its
 * membership is a judge's answer, pinned by `JUDGE_VERSION`, and `buildSides`
 * says so in its own arithmetic (`regime: 'n/a'` on every point). Printing
 * "We did not record how themes were grouped for Apr 2021 to Sep 2026" under a
 * subject's axis is the page refusing a caveat in its numbers and printing it
 * in its prose — which is what BOTH tenants read at every horizon.
 *
 * And the notes come from the SUBJECT'S series or from nowhere. They used to
 * fall back to `history`, which spans 2019-01-01 to now for the axis
 * arithmetic, so a page drawing one month named sixty.
 */
export function subjectNotes(notes: readonly MonthLabel[] | null | undefined): MonthLabel[] {
  return (notes ?? []).filter((n) => n.kind !== 'clustering_changed')
}

/** The day this month stops moving, off the reading layer's own rule. */
export function freezesOn(month: string): string {
  return freezeBoundary(month).slice(0, 10)
}

// ---- the rows the loader reads -------------------------------------------------

interface RunRow {
  id: string
  started_at: string
}

/** A stored `month_kind_readings` row, as the side builder takes it. Exported
 *  for the fixture — a block test has to be able to build one. */
export type StoredKindRow = {
  month: string
  audience: string
  kind: string
  videos: number
  comments: number
  platform_mix: Record<string, number> | null
}

interface MembershipRow {
  audience_insight_id: string
}

interface InsightRow {
  id: string
  category: string
  theme: string | null
  source_video_id: string | null
}

interface ThemeRow {
  registry_id: string | null
  label: string | null
  supporting_insight_ids: string[] | null
}

interface VideoRow {
  id: string
  platform: string | null
  is_client: boolean | null
  is_competitor: boolean | null
  competitor_name: string | null
  topics: string[] | null
  upload_date: string | null
}

/** Ids per `.in()` chunk. 120 uuids is ~4.4 KB of request line, half of
 *  PostgREST's usual 8 KiB cap — the size lib/quotes.ts and lib/pages/voice.ts
 *  already use for the same shape. */
const ID_CHUNK = 120

/**
 * An id-set read that may not be a sample.
 *
 * `.in('id', ids.slice(0, 1000))` was a silent truncation: the ids arrive in
 * uuid order, which is arbitrary, so past the cap every number computed off
 * them — the gate, the question-video count, each row's count — was computed
 * over ~1,000 arbitrary insights and printed as the whole. Össur carries 3,129
 * live insights today and Sealand 2,872, so a subject that is a third of the
 * corpus is already there. Chunks are disjoint by id and read in parallel, the
 * way the quote layer reads its own.
 */
async function readByIds<T>(
  ids: readonly string[],
  fetch: (part: string[]) => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }> },
): Promise<T[]> {
  if (ids.length === 0) return []
  const pages = await Promise.all(chunk([...ids], ID_CHUNK).map((part) => selectAll<T>(() => fetch(part))))
  return pages.flat()
}

/** A stored month table, read straight. Null — never [] — when the migration
 *  that creates it has not been applied here (the WP11 precedent). */
async function readStoredMonths<T>(
  client: SupabaseClient,
  table: string,
  clientId: string,
  months: readonly string[],
  order: readonly string[],
  missing: (error: unknown) => boolean,
): Promise<T[] | null> {
  if (months.length === 0) return []
  try {
    return await selectAll<T>(() => {
      let q = client
        .from(table)
        .select('*')
        .eq('client_id', clientId)
        .gte('month', months[0])
        .lte('month', months[months.length - 1])
      for (const col of order) q = q.order(col, { ascending: true })
      return q
    })
  } catch (error) {
    if (missing(error) || isMissingMonthTable(error)) return null
    throw error
  }
}

/** The tenant's subjects, or null where M4 is not applied here. */
async function loadSubjectRows(supabase: SupabaseClient, clientId: string): Promise<Subject[] | null> {
  try {
    return await selectAll<Subject>(() =>
      supabase
        .from(TABLE_SUBJECTS)
        .select('*')
        .eq('client_id', clientId)
        .neq('status', 'retired')
        .order('named_at', { ascending: true })
        .order('id', { ascending: true }),
    )
  } catch (error) {
    if (isMissingSubjects(error)) return null
    throw error
  }
}

/** Every move this tenant has declared on a subject. Null where M4 is absent. */
async function loadSubjectMoves(supabase: SupabaseClient, clientId: string): Promise<Move[] | null> {
  try {
    return await selectAll<Move>(() =>
      supabase
        .from(TABLE_MOVES)
        .select('*')
        .eq('client_id', clientId)
        .eq('kind', 'subject')
        .order('declared_at', { ascending: false })
        .order('id', { ascending: true }),
    )
  } catch (error) {
    if (isMissingSubjects(error)) return null
    throw error
  }
}

/** The member insight ids of one subject, at any judge version. Id-set lookups
 *  stay on the base tables (AGENTS.md): a membership row cascades with its
 *  insight, so an id that resolves is an insight that is still live. */
async function loadMemberInsightIds(
  supabase: SupabaseClient,
  clientId: string,
  subjectId: string,
): Promise<string[] | null> {
  try {
    const rowsOut = await selectAll<MembershipRow>(() =>
      supabase
        .from(TABLE_SUBJECT_MEMBERSHIPS)
        .select('audience_insight_id')
        .eq('client_id', clientId)
        .eq('subject_id', subjectId)
        .eq('member', true)
        .order('audience_insight_id', { ascending: true }),
    )
    return [...new Set(rowsOut.map((r) => r.audience_insight_id))]
  } catch (error) {
    if (isMissingSubjects(error)) return null
    throw error
  }
}

// ---- the loader ---------------------------------------------------------------

/**
 * The Subjects page, for one tenant, one horizon and one selected subject.
 *
 * Null is the first-run empty state: a tenant with no delivered update has no
 * reading of anything.
 */
export async function loadSubjectsPage(scope: Scope): Promise<SubjectsData | null> {
  const supabase = scope.supabase as SupabaseClient
  const { clientId, params } = scope
  const reading: ReadingHandle = scope.reading
  const readingAt = new Date().toISOString()
  const horizon = parseHorizon(params.horizon)

  const [clientRes, runsRaw, runningIds, rivals, subjectRows, moveRows] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    selectAll<RunRow>(() =>
      supabase.from('pipeline_runs').select('id, started_at')
        .eq('client_id', clientId).in('status', ['completed', 'partial'])
        .order('started_at', { ascending: true }),
    ),
    fetchRunningRunIds(supabase, clientId, 'subjects'),
    loadTrackedRivals(supabase, clientId),
    loadSubjectRows(supabase, clientId),
    loadSubjectMoves(supabase, clientId),
  ])
  const brand = (clientRes.data as { company_name?: string | null } | null)?.company_name ?? 'Your brand'
  if (runsRaw.length === 0) return null

  const updatesByMonth: Record<string, number> = {}
  for (const r of runsRaw) {
    const m = monthStartOf(r.started_at)
    updatesByMonth[m] = (updatesByMonth[m] ?? 0) + 1
  }
  const firstRunMonth = monthStartOf(runsRaw[0].started_at)

  // The whole denominator history decides the axis — `sinceStart` is what
  // "since we started" means (decision M) and the horizon is computed from it.
  const history = await loadMonthSeries(reading.client, clientId, {
    from: '2019-01-01',
    to: readingAt,
    updatesByMonth,
    firstRunMonth,
  })
  const started = sinceStart(history.denominators.map((d) => ({ month: d.month, videos: d.videos })))
  const window = horizonWindow(horizon, readingAt, started.from)
  const axis = window.months
  const month = axis[axis.length - 1]
  // The page reads one month wider than it draws: "this month" is a one-month
  // axis, and the comparison is the calendar's, not the horizon's (OV0's rule).
  const prevMonth = previousMonthOf(month)
  const readAxis = axis[0] <= prevMonth ? axis : [prevMonth, ...axis]
  const monthStatus = freezeStateFor(month, readingAt)

  const perAudience = new Map<string, number>()
  const denominatorByMonth = new Map<string, number>()
  for (const d of history.denominators) {
    perAudience.set(`${monthStartOf(d.month)}|${d.audience}`, d.videos)
    denominatorByMonth.set(d.month, (denominatorByMonth.get(d.month) ?? 0) + d.videos)
  }

  // A thin month suppresses every band on the page, exactly as it does on
  // Overview — one gate, one answer for the builders.
  const historyMonths = [...denominatorByMonth.keys()].sort()
  const trailing = historyMonths.filter((m) => m < month && m >= firstRunMonth).slice(-12)
    .map((m) => denominatorByMonth.get(m) ?? null)
  const thin = thinMonth(
    { month, videos: denominatorByMonth.get(month) ?? null, k: null },
    trailing,
    { updates: updatesByMonth[month] ?? 0, firstRunMonth },
  )

  const active = (subjectRows ?? []).filter((s) => s.status === 'active')
  const proposed = (subjectRows ?? []).filter((s) => s.status === 'proposed')

  // ── SU2 · the selected subject's months ───────────────────────────────
  const leadRival = rivals.find((r) => !r.retiredAt) ?? rivals[0] ?? null
  const audiences = [CLIENT_AUDIENCE, ...rivals.map((r) => rivalKey(r.name)), INDUSTRY_AUDIENCE]
  const selectedId = selectSubject(active, params.item)

  const [subjectSet, kindRows] = await Promise.all([
    selectedId
      ? loadMonthSeries(reading.client, clientId, {
          from: readAxis[0],
          to: month,
          audiences,
          objectKind: 'subject',
          objectIds: active.map((s) => s.id),
          updatesByMonth,
          firstRunMonth,
          changeLogFrom: history.changeLogFrom,
        })
      : Promise.resolve(null),
    readStoredMonths<StoredKindRow>(
      reading.client, 'month_kind_readings', clientId, readAxis,
      ['month', 'audience', 'kind'], isMissingKindMoodAttention,
    ),
  ])

  const seriesFor = (subjectId: string, audience: string): MonthSeries | null =>
    subjectSet?.series.find((s) => s.objectId === subjectId && s.audience === audience) ?? null

  // CONFIRMED FIRST, THEN NAMED-BUT-NOT-CONFIRMED, and both in the ONE list.
  // A proposed subject was kept out of the rail at first and listed underneath
  // as prose, which left the only control that can start it counting — Confirm
  // — on a row a client could not reach. The editor is the whole live set; the
  // row says which of the two it is.
  const rail: SubjectRail[] = [...active, ...proposed].slice(0, RAIL_MAX).map((s) => {
    const calibration = subjectCalibration(s)
    const own = seriesFor(s.id, CLIENT_AUDIENCE)
    const point = own ? pointsByMonth(own).get(month) ?? null : null
    const read = s.status === 'active' && point != null && point.k != null && point.videos != null
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      origin: s.origin,
      namedAt: s.named_at,
      status: s.status,
      calibration,
      level: read && calibration === 'ready'
        ? { k: point!.k!, n: point!.videos!, pct: pctOf(point!.k, point!.videos) }
        : null,
      note: railNote(calibration, read, s.status),
      selected: s.id === selectedId,
      href: s.status === 'active' ? `/dashboard/subjects?item=${encodeURIComponent(s.id)}` : '',
    }
  })

  const list: SubjectListBlock = {
    rows: rail,
    proposed: proposed.map((s) => ({ id: s.id, name: s.name, because: originLine(s.origin) })),
    rule: SUPERSEDE_RULE,
    notRecorded: subjectRows == null
      ? 'Your subjects are not recorded for this workspace yet.'
      : null,
    setLine: setLine(active.length, proposed.length),
  }

  let selected: SubjectPane | null = null
  const subject = selectedId ? active.find((s) => s.id === selectedId) ?? null : null
  if (subject) {
    const sides = buildSides({
      subject,
      rivals,
      leadRival,
      month,
      prevMonth,
      axis: readAxis,
      perAudience,
      kindRows,
      seriesFor,
      thin,
    })
    const series = sides.map((side) => seriesFor(subject.id, side.audience)).filter((s): s is MonthSeries => s != null)

    const themedRunId = await fetchThemedRunId(supabase, clientId, runningIds, 'subjects')
    const memberIds = await loadMemberInsightIds(supabase, clientId, subject.id)
    const [voices, unanswered] = await Promise.all([
      loadVoices(supabase, clientId, memberIds ?? []),
      loadUnanswered(supabase, clientId, memberIds ?? [], {
        window: { from: window.from, to: window.to },
        population: perAudience.get(`${month}|${INDUSTRY_AUDIENCE}`) ?? null,
        period: periodPhrase(horizon, month),
        themedRunId,
      }),
    ])

    const move = (moveRows ?? []).find((m) => m.subject_id === subject.id) ?? null
    const own = sides.find((s) => s.kind === 'you') ?? null
    selected = {
      id: subject.id,
      name: subject.name,
      description: subject.description,
      namedAt: subject.named_at,
      origin: subject.origin,
      calibration: subjectCalibration(subject),
      index: active.findIndex((s) => s.id === subject.id) + 1,
      of: active.length,
      sides,
      series,
      voices: voices.voices,
      voicesFrom: voices.from,
      voicesSampled: voices.sampled,
      unanswered,
      move: move
        ? { id: move.id, title: move.title, declaredAt: move.declared_at, status: move.status }
        : null,
      behind: own && own.k != null && own.k > 0
        ? { videos: own.k, href: `/dashboard/videos?subject=${encodeURIComponent(subject.id)}` }
        : null,
      axisNote: axisNote(sides, FLOOR_N),
      notRecorded: subjectSet?.numeratorSubstrate === 'missing'
        ? 'This subject has no monthly reading recorded for this workspace yet.'
        : null,
    }
  }

  // ── the record ────────────────────────────────────────────────────────
  const pageVerdicts = (selected?.sides ?? []).map((s) => s.verdict).filter((v): v is Verdict => v != null)
  const recordInputs = await loadRecordInputs(
    reading.client,
    clientId,
    monthRecordWindow(month, readingAt),
    { comparisonsRefused: countRefused(pageVerdicts), refusals: refusals(pageVerdicts), now: readingAt },
  )

  return {
    brand,
    month,
    monthStatus,
    readingAt,
    horizon,
    window,
    axis,
    substrate: subjectSet?.numeratorSubstrate ?? history.substrate,
    notes: subjectNotes(subjectSet?.notes),
    list,
    selected,
    record: {
      line: howSoundLine(recordInputs),
      lines: recordLines(recordInputs),
      href: '/dashboard/settings',
      freezesOn: freezesOn(month),
    },
  }
}

/** The denominator floor a side is called hollow against: the band's own, so
 *  the sentence above the axis cannot disagree with the verdicts drawn beside
 *  it the day the band moves. (The design's "30" at final-v3.md:271 is
 *  superseded — research/bands-horizon-direction.md:882 pins minN = 100.) */
const FLOOR_N = SHARE_BAND.minN

function previousMonthOf(month: string): string {
  const d = new Date(`${monthStartOf(month)}T00:00:00.000Z`)
  d.setUTCMonth(d.getUTCMonth() - 1)
  return d.toISOString().slice(0, 10)
}

interface SidesInput {
  subject: Subject
  rivals: readonly TrackedRival[]
  leadRival: TrackedRival | null
  month: string
  prevMonth: string
  axis: readonly string[]
  perAudience: Map<string, number>
  kindRows: StoredKindRow[] | null
  seriesFor: (subjectId: string, audience: string) => MonthSeries | null
  thin: boolean
}

/**
 * You, each rival and the category, as the three sides of one subject.
 *
 * WHAT A SIDE MAY CARRY IS DECIDED BY ITS OWN n, NOT BY THE PAGE'S. On the
 * paying tenant your own audience carries 84 videos in a month and the category
 * 1,388, so the category is the only side of the three that can carry a monthly
 * change — and a page that printed the same verdict shape on all three would
 * print "too little data" on two of them for ever without saying why. The level
 * is real on every side and is always shown; the CHANGE is drawn where the band
 * can be, and `axisNote` says in one sentence which lines those are.
 */
export function buildSides(input: SidesInput): SubjectSide[] {
  const { subject, month, prevMonth, axis, perAudience, thin } = input
  const sides: { audience: string; label: string; kind: SubjectSide['kind']; color: string }[] = [
    { audience: CLIENT_AUDIENCE, label: 'You', kind: 'you', color: 'var(--you)' },
    ...input.rivals.map((r) => ({
      audience: rivalKey(r.name),
      label: r.retiredAt ? `${r.name} — stopped` : r.name,
      kind: 'rival' as const,
      color: 'var(--comp)',
    })),
    { audience: INDUSTRY_AUDIENCE, label: audienceLabel(INDUSTRY_AUDIENCE), kind: 'category', color: 'var(--cat)' },
  ]

  const kindsFor = (audience: string): { kinds: KindShare[]; reddit: RedditRead | null } => {
    if (input.kindRows == null) return { kinds: [], reddit: null }
    const n = perAudience.get(`${month}|${audience}`) ?? null
    const rowsHere = input.kindRows.filter((r) => monthStartOf(r.month) === month && r.audience === audience)
    if (n == null || rowsHere.length === 0) return { kinds: [], reddit: null }
    const asRows = rowsHere.map((r) => ({
      kind: r.kind,
      videos: r.videos,
      comments: r.comments,
      platform_mix: r.platform_mix ?? {},
    }))
    // `redditRead` takes the STORED rows, not the shares: a `KindShare` has
    // already collapsed the platform mix to one reddit count and dropped the
    // rest, so handing it shares gives a pooled read of nothing at all
    // (lib/reading/kinds.ts, and lib/pages/overview.ts does the same).
    return { kinds: kindShares(asRows, n), reddit: redditRead(asRows) }
  }

  return sides.map((s) => {
    const series = input.seriesFor(subject.id, s.audience)
    const byMonth = series ? pointsByMonth(series) : new Map()
    const here = byMonth.get(month) ?? null
    const before = byMonth.get(prevMonth) ?? null
    const n = perAudience.get(`${month}|${s.audience}`) ?? null
    const k = here?.k ?? null
    const observed = n != null && k != null
    const silence: SubjectSide['silence'] = n == null ? 'not_tracked' : k == null ? 'no_reading' : null

    const point = (m: string): SeriesPoint => {
      const p = byMonth.get(m) ?? null
      return {
        month: m,
        videos: perAudience.get(`${m}|${s.audience}`) ?? null,
        k: p?.k ?? null,
        audience: s.audience,
        // A subject's membership is not a clustering artefact, so its months
        // are comparable across a boundary a theme's are not.
        regime: 'n/a',
      }
    }
    const verdict = thin || !observed
      ? null
      : monthChange({
          object: { kind: 'subject', id: subject.id, label: subject.name },
          audience: s.audience,
          curr: point(month),
          prev: point(prevMonth),
        })
    const { kinds, reddit } = kindsFor(s.audience)
    return {
      audience: s.audience,
      label: s.label,
      kind: s.kind,
      color: s.color,
      k,
      n,
      pct: pctOf(k, n),
      observed,
      silence,
      verdict,
      direction: thin ? null : directionWord(axis.map(point)),
      previous: before ? { month: prevMonth, pct: pctOf(before.k, before.videos) } : null,
      kinds,
      reddit,
    }
  })
}

// ---- SU2's voices --------------------------------------------------------------

/**
 * Six voices on the subject, across the audiences.
 *
 * The same gate Overview's two voices pass (`readsAsHeroQuote`, item 8): a
 * quote that cannot be read is not evidence, and the cache's own language
 * answer decides rather than a guess about the alphabet. The words themselves
 * are resolved at render — a snapshot keeps the ref and empties the text
 * (lib/renderables/quotes-freeze.ts).
 */
async function loadVoices(
  supabase: SupabaseClient,
  clientId: string,
  insightIds: readonly string[],
): Promise<{ voices: SubjectVoice[]; from: number; sampled: boolean }> {
  if (insightIds.length === 0) return { voices: [], from: 0, sampled: false }
  const ids = [...insightIds].slice(0, VOICES_POOL_INSIGHTS)
  const citations = await fetchQuoteCitationsByAudience(supabase, ids)

  const pool: QuoteCitation[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    for (const c of (citations.get(id) ?? []).sort((a, b) => a.rank - b.rank)) {
      const text = cleanQuote(c.quote)
      const key = text.toLowerCase()
      if (!text || seen.has(key)) continue
      if (!readsAsHeroQuote(text, c)) continue
      seen.add(key)
      pool.push({ ...c, quote: text })
    }
  }
  if (pool.length === 0) return { voices: [], from: 0, sampled: false }

  // WHAT WAS LOOKED AT, AND WHETHER THAT WAS ALL OF IT. Both caps are the
  // block's to say: past either one the six are drawn from a sample and the
  // meta line stops claiming a denominator.
  const sampled = insightIds.length > VOICES_POOL_INSIGHTS || pool.length > VOICES_POOL_CITATIONS
  const considered = pool.slice(0, VOICES_POOL_CITATIONS)
  const commentIds = considered.map((c) => c.commentId).filter((id): id is string => Boolean(id))
  type CommentMeta = { platform: string | null; comment_date: string | null; video_id: string | null; comment_id: string | null }
  const meta = new Map<string, CommentMeta>()
  if (commentIds.length > 0) {
    const read = await readByIds<CommentMeta & { id: string }>(commentIds, (part) =>
      supabase
        .from('comments')
        .select('id, platform, comment_date, video_id, comment_id')
        .eq('client_id', clientId)
        .in('id', part)
        .order('id', { ascending: true }),
    )
    for (const c of read) meta.set(c.id, c)
  }

  const nativeIds = [...new Set([...meta.values()].map((m) => m.video_id).filter((v): v is string => Boolean(v)))]
  const urlByKey = new Map<string, string>()
  const audienceByKey = new Map<string, string>()
  if (nativeIds.length > 0) {
    type V = { platform: string | null; video_id: string | null; video_url: string | null; is_client: boolean | null; is_competitor: boolean | null; competitor_name: string | null }
    const read = await readByIds<V>(nativeIds, (part) =>
      supabase
        .from('videos')
        .select('platform, video_id, video_url, is_client, is_competitor, competitor_name')
        .eq('client_id', clientId)
        .in('video_id', part)
        .order('video_id', { ascending: true }),
    )
    for (const v of read) {
      if (!v.video_id) continue
      const key = `${v.platform}::${v.video_id}`
      if (v.video_url) urlByKey.set(key, v.video_url)
      audienceByKey.set(
        key,
        v.is_client ? CLIENT_AUDIENCE : v.is_competitor ? rivalKey(v.competitor_name ?? 'unknown') : INDUSTRY_AUDIENCE,
      )
    }
  }

  // Grouped by the audience the quote was HEARD in, then drawn round-robin so
  // one loud side cannot fill the list.
  const byAudience = new Map<string, QuoteCitation[]>()
  for (const c of considered) {
    const m = c.commentId ? meta.get(c.commentId) : undefined
    const key = m?.platform && m.video_id ? `${m.platform}::${m.video_id}` : null
    const audience = (key ? audienceByKey.get(key) : null) ?? INDUSTRY_AUDIENCE
    byAudience.set(audience, [...(byAudience.get(audience) ?? []), c])
  }
  const order = [CLIENT_AUDIENCE, ...[...byAudience.keys()].filter((a) => a !== CLIENT_AUDIENCE && a !== INDUSTRY_AUDIENCE).sort(), INDUSTRY_AUDIENCE]
  const shown = voicesAcross(
    order.filter((a) => byAudience.has(a)).map((a) => ({ audience: a, items: byAudience.get(a) ?? [] })),
  )

  const voices = shown.map((c) => {
    const m = c.commentId ? meta.get(c.commentId) : undefined
    const key = m?.platform && m.video_id ? `${m.platform}::${m.video_id}` : null
    const audience = (key ? audienceByKey.get(key) : null) ?? INDUSTRY_AUDIENCE
    const from = voiceFrom(audience)
    const cite = [m?.platform ?? null, m?.comment_date ? shortDate(m.comment_date) : null, from]
      .filter(Boolean).join(' · ')
    const url = key ? urlByKey.get(key) ?? null : null
    return {
      quote: {
        ref: quoteRef.evidence(c.evidenceId),
        text: c.quote,
        ...(c.lang != null ? { lang: c.lang, english: c.english ?? null } : {}),
      } as Quote,
      cite,
      href: citationLink(m?.platform ?? null, url, m?.comment_id ?? null).href,
      from,
    }
  })
  return { voices, from: considered.length, sampled }
}

// ---- SU3 -----------------------------------------------------------------------

interface UnansweredInput {
  /** The period the reader chose, as half-open instants. Both halves of SU3
   *  are read inside it: the question videos AND your own posts. */
  window: { from: string; to: string }
  population: number | null
  /** The period the reader chose, as `periodPhrase` words it. */
  period: string
  /** The update whose clustering names the questions. Null where no update has
   *  produced themes — then there is nothing to group by and the block says so
   *  rather than printing pipeline slugs. */
  themedRunId: string | null
}

/**
 * Questions the category asks on this subject that your posts never answer.
 *
 * COUNTS, NOT SHARES, and the reason is on the module header: the k here is
 * taken from the current analysis and every other n on this page is
 * comment-dated. The gate is the design's — fewer than ten question videos on
 * the subject IN THE PERIOD SHOWN and the block says so rather than ranking
 * noise.
 *
 * THE QUESTION IS NAMED BY THE CLUSTERING, NOT BY THE INSIGHT. The obvious key
 * is `audience_insights.theme`, and it is wrong twice over: it is a snake_case
 * machine slug ("prosthetic_functionality", "product_availability"), which is
 * pipeline vocabulary in front of a client, and it is nearly unique — measured
 * read-only on 2026-09-16, Össur's 696 live question insights carry 547
 * distinct values over 553 videos, so grouping by it is barely grouping at all.
 * The clustering's own label is a sentence a person wrote the product's way
 * ("Which backpack should I choose", "Questions about prosthetic function"),
 * and every one of both tenants' live question insights is reachable from the
 * newest themed update's `supporting_insight_ids` — 696 of 696 and 567 of 567.
 * So the key is the REGISTRY id (labels churn ~88% run to run, AGENTS.md) and
 * the words are the registry's canonical label.
 */
async function loadUnanswered(
  supabase: SupabaseClient,
  clientId: string,
  insightIds: readonly string[],
  input: UnansweredInput,
): Promise<UnansweredBlock> {
  const empty: UnansweredBlock = {
    rows: [], questionVideos: 0, population: input.population, yourPosts: 0,
    lead: null, basis: UNANSWERED_BASIS, claims: UNANSWERED_CLAIMS_UNREADABLE,
    reddit: null, refusal: null,
  }
  if (insightIds.length === 0) {
    return { ...empty, refusal: 'Nothing has been matched to this subject yet.' }
  }

  // Id-set lookup on the base table: a membership row cascades with its
  // insight, so every id that resolves is live (AGENTS.md). Every id, in
  // chunks — a slice of them is a sample, and every number below is computed
  // off this read.
  const insights = await readByIds<InsightRow>(insightIds, (part) =>
    supabase
      .from('audience_insights')
      .select('id, category, theme, source_video_id')
      .eq('client_id', clientId)
      .eq('category', 'question')
      .in('id', part)
      .order('id', { ascending: true }),
  )
  const videoIds = [...new Set(insights.map((i) => i.source_video_id).filter((v): v is string => Boolean(v)))]
  if (videoIds.length === 0) {
    return { ...empty, refusal: 'Nobody has asked a question about this subject in the videos we have read.' }
  }

  // THE QUESTION VIDEOS ARE THE ONES IN THE PERIOD SHOWN. The design gates on
  // "≥ 10 question videos on the subject IN THE WINDOW" and its example says
  // "this quarter"; both the gate and every row's count were whole-corpus, so
  // the horizon control moved the post count and nothing else. A video is
  // placed by the day it was posted — the one date this read has — and both
  // tenants' videos carry one (0 undated of 4,450 and 3,927, measured
  // read-only 2026-09-16).
  const videos = await readByIds<VideoRow>(videoIds, (part) =>
    supabase
      .from('videos')
      .select('id, platform, is_client, is_competitor, competitor_name, topics, upload_date')
      .eq('client_id', clientId)
      .in('id', part)
      .gte('upload_date', input.window.from.slice(0, 10))
      .lt('upload_date', input.window.to.slice(0, 10))
      .order('id', { ascending: true }),
  )
  const byId = new Map(videos.map((v) => [v.id, v]))

  // Your own posts in the drawn window, and what they are about.
  const ownVideos = await selectAll<VideoRow>(() =>
    supabase
      .from('videos')
      .select('id, platform, is_client, is_competitor, competitor_name, topics, upload_date')
      .eq('client_id', clientId)
      .eq('is_client', true)
      .gte('upload_date', input.window.from.slice(0, 10))
      .lt('upload_date', input.window.to.slice(0, 10))
      .order('id', { ascending: true }),
  )
  // WHAT YOUR POSTS ARE ABOUT, AND NOT WHAT THEY CLAIM. The obvious second
  // half of this haystack is `video_claims` — and `video_claims` carries RLS
  // with NO tenant SELECT policy until M8 (WP16), verified on production
  // 2026-09-16: relrowsecurity true, zero policies. A signed-in member's read
  // of it returns zero rows and NO error, so the claims half was silently
  // empty on every page a client will ever open, and a question one of your
  // posts did answer printed as a gap. The OV4 precedent is the answer: the
  // half we cannot read is named rather than pretended (OWN_POSTS_UNREADABLE),
  // and it arrives the day M8 does. Reading it on the service role instead
  // would work and is refused: `reading.client` is the month tables' client,
  // and "one careless `reading.client.from('<not a month table>')` away from an
  // RLS bypass" is the rule that file states about itself.
  const haystack = ownVideos.flatMap((v) => v.topics ?? [])

  const nonOwned = new Set<string>()
  const questionInsights: InsightRow[] = []
  for (const i of insights) {
    const v = i.source_video_id ? byId.get(i.source_video_id) : null
    if (!v || v.is_client) continue
    nonOwned.add(v.id)
    questionInsights.push(i)
  }

  const questionVideos = nonOwned.size
  if (questionVideos === 0) {
    return {
      ...empty,
      yourPosts: ownVideos.length,
      refusal: 'Nobody has asked a question about this subject in the videos we have read over this period.',
    }
  }
  if (questionVideos < UNANSWERED_GATE) {
    return {
      ...empty,
      questionVideos,
      yourPosts: ownVideos.length,
      refusal:
        `${fmtInt(questionVideos)} video${questionVideos === 1 ? '' : 's'} asked something about this subject — ` +
        `we do not rank a gap under ${fmtInt(UNANSWERED_GATE)}.`,
    }
  }

  const named = await nameQuestions(supabase, clientId, input.themedRunId, questionInsights.map((i) => i.id))
  if (named.size === 0) {
    return {
      ...empty,
      questionVideos,
      yourPosts: ownVideos.length,
      refusal:
        `${fmtInt(questionVideos)} videos asked something about this subject, and no update has grouped those ` +
        'questions yet — they are counted here and named with the next update.',
    }
  }

  const groups = new Map<string, { label: string; videos: Set<string>; reddit: Set<string> }>()
  for (const i of questionInsights) {
    const at = named.get(i.id)
    if (!at) continue
    const v = i.source_video_id ? byId.get(i.source_video_id) : null
    if (!v) continue
    const g = groups.get(at.registryId) ?? { label: at.label, videos: new Set<string>(), reddit: new Set<string>() }
    g.videos.add(v.id)
    if ((v.platform ?? '').toLowerCase() === 'reddit') g.reddit.add(v.id)
    groups.set(at.registryId, g)
  }

  const ranked = [...groups.entries()]
    .sort((a, b) => b[1].videos.size - a[1].videos.size || a[1].label.localeCompare(b[1].label))
    .map(([registryId, g]) => ({
      id: registryId,
      label: g.label,
      videos: g.videos.size,
      reddit: g.reddit.size,
      answered: answeredBy(g.label, haystack),
      // Onward to the theme in full, which is where the comments are (VO3).
      href: `/dashboard/voice?themes=${encodeURIComponent(registryId)}`,
    }))
  const shown = ranked.filter((r) => !r.answered).slice(0, UNANSWERED_SHOWN)
  const redditVideos = [...groups.values()].reduce((n, g) => n + g.reddit.size, 0)

  return {
    rows: shown,
    questionVideos,
    population: input.population,
    yourPosts: ownVideos.length,
    lead: unansweredLead(shown, ownVideos.length, input.period),
    basis: UNANSWERED_BASIS,
    claims: UNANSWERED_CLAIMS_UNREADABLE,
    reddit: redditVideos > 0 ? REDDIT_THREAD_CAP : null,
    refusal: shown.length === 0
      ? 'Your posts touch every question the category asks on this subject.'
      : null,
  }
}

/**
 * Which grouped question each insight belongs to, in the reader's words.
 *
 * `themes.supporting_insight_ids` is the durable link — the one WP2's research
 * settled on for the same reason, and the one measured at 100% coverage of both
 * tenants' live question insights. The registry id is the KEY and the
 * registry's canonical label is the words; the run's own label is the fallback,
 * because a registry row can be newer than its canonical label.
 */
async function nameQuestions(
  supabase: SupabaseClient,
  clientId: string,
  themedRunId: string | null,
  insightIds: readonly string[],
): Promise<Map<string, { registryId: string; label: string }>> {
  const out = new Map<string, { registryId: string; label: string }>()
  if (!themedRunId || insightIds.length === 0) return out

  const themes = await selectAll<ThemeRow>(() =>
    supabase
      .from('themes')
      .select('registry_id, label, supporting_insight_ids')
      .eq('client_id', clientId)
      .eq('run_id', themedRunId)
      .not('registry_id', 'is', null)
      .order('id', { ascending: true }),
  )
  const wanted = new Set(insightIds)
  const labelOf = new Map<string, string>()
  for (const t of themes) {
    if (!t.registry_id) continue
    labelOf.set(t.registry_id, t.label ?? '')
    for (const id of t.supporting_insight_ids ?? []) {
      // FIRST THEME WINS. One insight can support two themes in one run, and a
      // reader counting a video under two questions would see the same video
      // twice in one list. The rows are ordered by id, so the choice is stable
      // across two renders of the same reading.
      if (wanted.has(id) && !out.has(id)) out.set(id, { registryId: t.registry_id, label: t.label ?? '' })
    }
  }
  if (out.size === 0) return out

  // The registry's own words where it has them — the run's label churns ~88%
  // run to run and the registry is what VO3 and the ledger name (AGENTS.md).
  const registryIds = [...new Set([...out.values()].map((v) => v.registryId))]
  const canonical = new Map<string, string>()
  try {
    const registry = await readByIds<{ id: string; canonical_label: string | null }>(registryIds, (part) =>
      supabase
        .from('theme_registry')
        .select('id, canonical_label')
        .eq('client_id', clientId)
        .in('id', part)
        .order('id', { ascending: true }),
    )
    for (const r of registry) {
      if (r.canonical_label) canonical.set(r.id, r.canonical_label)
    }
  } catch {
    // The run's own labels stand. A registry that cannot be read costs the
    // canonical wording, never the rows.
  }
  for (const [id, at] of out) {
    const label = canonical.get(at.registryId) ?? labelOf.get(at.registryId) ?? at.label
    if (label) out.set(id, { registryId: at.registryId, label })
  }
  return out
}

// ---- what the blocks declare ----------------------------------------------------

/** The figures the selected subject's hero prints, by token. */
export function sideFigures(pane: SubjectPane | null): FigureTable {
  const out: FigureTable = {}
  if (!pane) return out
  for (const s of pane.sides) {
    if (s.pct == null || s.k == null || s.n == null) continue
    const token = `subject_${s.kind}_${s.audience.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`
    const whose = sideWhose(s)
    out[`${token}_share`] = { value: s.pct, unit: 'pct', label: `${pane.name}, ${whose} share this month` }
    out[`${token}_videos`] = { value: s.k, unit: 'videos', label: `${pane.name}, ${whose} videos this month` }
  }
  return out
}

/** Whose figure this is, in a label a reader and the cover prompt both see.
 *  Your own side is "your", never "You's"; a name that already ends in s takes
 *  the bare apostrophe. */
export function sideWhose(side: Pick<SubjectSide, 'kind' | 'label'>): string {
  if (side.kind === 'you') return 'your'
  return side.label.endsWith('s') ? `${side.label}’` : `${side.label}’s`
}
