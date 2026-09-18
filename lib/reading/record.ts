import type { SupabaseClient } from '@supabase/supabase-js'

import { CONFIG_CHANGES_TABLE, isMissingConfigLog, type ConfigChange } from '../config-log'
import { GATE_APPEALS_TABLE, isMissingGateAppeals, type GateAccess } from '../gate-record'
import { GATE_DEFAULT_REASONS } from '../gather/gate-verdicts'
import { fmtInt, fmtPct, fullDate, shortDate } from '../format'
import { selectAll } from '../supabase-admin'

import { memoRead } from './memo'

import { isMissingMonthlyReading, monthStartOf, nextMonth } from './monthly'
import { loadWindowReading } from './read'
import { TABLE_DENOMINATORS, type PlatformMix } from './types'
import { isAnswer, type RefusedReason, type Verdict, type VerdictState } from './verdicts'

// Item 7 — the record, and the one line on every page that opens it.
//
// WHY THIS IS A LOADER AND NOT A PAGE. Almost everything the record line names
// is already computed somewhere and printed nowhere a client can reach:
// `videos.analyzed_with_transcript` / `_translation` / `_ocr` — the product's
// stated differentiator — has exactly one non-pipeline reader in the whole
// repo, the operator readiness page; `transcript_lang` has none; `gate_verdicts`
// is superadmin-only. The record is those numbers, gathered once, in one
// shape, so the "how sound is this" line and the OV6 paragraph are pure
// composers over it rather than eight page-specific queries.
//
// WHY IT LIVES BESIDE read.ts RATHER THAN INSIDE IT. The reading layer's I/O is
// one file by decision N, and that rule is about the MONTH TABLES: one place
// decides what `substrate` is and how a silence is told apart from a zero. The
// record reads five tables that are nobody's reading — `videos`,
// `gate_verdicts`, `pipeline_runs`, `config_changes`, `theme_observations` —
// and folding them into read.ts would make it the product's loader rather than
// the reading's. It takes the same handle, reads read-only, and asks read.ts
// for anything that comes off a month table.
//
// EVERY FIGURE CARRIES ITS BASIS. Three clocks meet here and a line that pools
// them lies. The window figures are comment-dated (the product's one clock);
// the delivery and discard records are run-dated, because a run is when
// something was looked at; and how much of each video was read is a fact about
// the corpus, not about a month, because a video has no date of its own. Each
// group says which it is, and the composers print it.

/** The window a record is read over. The same half-open shape the reading
 *  layer's SQL windows take. */
export interface RecordWindow {
  kind: 'month' | 'quarter' | 'week' | 'since'
  /** `YYYY-MM-DD`, inclusive. */
  from: string
  /** `YYYY-MM-DD`, inclusive. */
  to: string
}

/**
 * The record window for ONE month, as every page composes it.
 *
 * `to` is INCLUSIVE and is the month's last day, or today while the month is
 * still filling. Not the first of the next month: `loadRecordInputs` compares
 * `monthStartOf(from)` with `monthStartOf(to)` and refuses a window that
 * straddles two months, and `loadFrozenAt` does `.lte('month',
 * monthStartOf(w.to))`, which would pull the NEXT month's denominator row into
 * this month's record.
 *
 * It lives here, beside the type whose contract it keeps, because two pages
 * had written it and one of them had written it differently — with a test
 * pinning the off-by-one month as correct.
 */
export function monthRecordWindow(month: string, readingAt: string): RecordWindow {
  const start = monthStartOf(month)
  const lastDay = new Date(Date.parse(`${nextMonth(start)}T00:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10)
  const at = readingAt.slice(0, 10)
  return { kind: 'month', from: start, to: at < lastDay ? at : lastDay }
}

/** What was delivered, on the run clock. Never a period key for anything else
 *  (AGENTS.md) — it is the record OF the deliveries, which is the one thing a
 *  run's own date is the honest index for. */
export interface DeliveryRecord {
  delivered: number
  /** Start dates of the delivered updates, oldest first, `YYYY-MM-DD`. */
  dates: string[]
  longestGapDays: number | null
  /** Updates that ran inside the window and ended in failure — `status` neither
   *  `completed` nor `partial`. In production that means exactly `failed`: 20
   *  rows, every one of them with a `completed_at`. They SETTLED; they settled
   *  badly. An update that started and never settled is
   *  `pipeline_runs.stalled`, a different column, and nothing here reads it
   *  yet. Not printed by any composer — it is carried for whichever surface
   *  first wants "and two of them failed", and a field waiting to be printed
   *  is the worst place for a wrong name. */
  failed: number
  basis: 'run_clock'
}

/** How much conversation the window held, comment-dated, per audience. */
export interface CoverageRecord {
  audience: string
  videos: number
  comments: number
  platformMix: PlatformMix
  dualMention: number
  excludedUndated: number
}

/** How much of each video the product managed to read. A corpus fact: a video
 *  belongs to a month through its comments, and `analyzed_with_*` is about the
 *  video, so this is all-time and says so. Reddit is excluded by construction —
 *  a Reddit post has no audio and no cover frame, and `analyzed_with_transcript`
 *  is nonetheless true on 207 of them, because a post's selftext is stored in
 *  the transcript column on purpose. Counting those would claim the product
 *  listened to audio on Reddit. */
export interface ReadDepthRecord {
  analysed: number
  speech: number
  translated: number
  onScreenText: number
  /** Read before the product recorded which of the three it managed. */
  unflagged: number
  basis: 'all_time_non_reddit'
}

/** The share not in English — three numbers, not one. 30.8% of Össur's
 *  analysed non-Reddit videos have no language recorded at all, and unknown is
 *  not non-English. */
export interface LanguageRecord {
  analysed: number
  unknown: number
  english: number
  notEnglish: number
  /** `video_speech` until a comment-level language exists (item 8's cache). The
   *  line prints which it is, because "27% not in English" is a statement about
   *  what was SAID in videos, not about the quotes a reader sees. */
  basis: 'video_speech' | 'comment'
}

/** What was looked at and set aside. Run-dated, and the record starts late:
 *  23 Aug on Össur against a first run of 6 Apr, 9 Sep on Sealand against
 *  28 Jun. No month before that can show a discard share at all. */
export interface DiscardRecord {
  /** Whether this CLIENT can read the gate's record at all. False on a tenant
   *  session until M8 is applied: the read comes back empty rather than
   *  forbidden (lib/gate-record.ts), and "we do not show you this yet" and
   *  "nothing was ever judged" are different sentences. Every figure below is
   *  a zero that means nothing when this is false. */
  readable: boolean
  judged: number
  kept: number
  setAside: number
  /** The first verdict ever recorded for this tenant, `YYYY-MM-DD`. Null when
   *  none is: then the share is not unknown, it is unrecorded. */
  recordedFrom: string | null
  /** Cleared by the cheap check and never put to the model — the heuristic
   *  found no reason to drop it (`method: 'heuristic'`). A DECISION, not a
   *  defect, and by far the commonest of the three `source: 'default'` cases:
   *  all 295 production rows are this one.
   *
   *  NULL RATHER THAN ZERO on a tenant session. These three are counted by
   *  `reason`, and `reason` is one of the three columns M8 withholds from
   *  `authenticated` — a filter on it is refused, not emptied. A reader that
   *  printed 0 there would be reporting "no video was cleared by the quick
   *  check" about a column it is not allowed to look at. */
  clearedByHeuristic: number | null
  /** Judged while the gate was switched off for the gather. Null where
   *  `reason` is not readable. */
  gateOff: number | null
  /** Judged without a judgement — the gate ran, returned nothing for this
   *  video, and it entered unjudged. The real fail-open, and the only one of
   *  the three that is a defect. Counted by `reason`, never by `source`:
   *  `source: 'default'` covers all three and separates none of them. Null
   *  where `reason` is not readable. */
  failedOpen: number | null
  basis: 'run_clock'
}

/** The instrument-stability figure: themes attached per analysed video. When it
 *  moves, every page says so — so it has to be computed, and before this
 *  nothing in the product computed it. */
export interface InstrumentRecord {
  /** Themes attached per analysed video, or null when it cannot be computed. */
  themesPerVideo: number | null
  themeAttachments: number
  analysedVideos: number
  /** The run it was measured on. A bookkeeping key, never a period. */
  runId: string | null
}

/** What changed under the reading, and where the record of changes begins. */
export interface ChangeRecord {
  /** Logged changes inside the window. */
  inWindow: number
  /** The first REAL entry: a reconstructed row is inference from what an update
   *  searched, and dating the boundary from one would say the log begins before
   *  anything was written down. */
  loggedFrom: string | null
  /** Rows reconstructed rather than recorded at the time. */
  reconstructed: number
}

export interface RecordInputs {
  window: RecordWindow
  delivery: DeliveryRecord
  /** Per audience, comment-dated. Null when the month tables are not applied;
   *  empty when this tenant has never been read. */
  coverage: CoverageRecord[] | null
  readDepth: ReadDepthRecord
  language: LanguageRecord
  discard: DiscardRecord
  instrument: InstrumentRecord
  changes: ChangeRecord
  /** Comparisons this render asked for and did not draw. Counted by the
   *  caller, because it is a property of what a page chose to show, not of the
   *  corpus: the same month refuses three comparisons on Overview and none on a
   *  tile that only prints levels. `countRefused` does the counting. */
  comparisonsRefused: number | null
  /** The same comparisons, with the reason each was not drawn — so the record
   *  can print the reasons rather than promise them. */
  refusals: Refusal[]
  /** "Reading as at" — the instant the page was built. */
  readingAt: string
  /** The newest freeze in the window, or null while every month in it is still
   *  filling. */
  frozenAt: string | null
}

/** Comparisons a render asked for and did not draw. A refusal and a thin
 *  reading are both "no answer", and the record counts them together because
 *  that is the number a reader needs: how often the product declined to say. */
export function countRefused(verdicts: readonly Verdict[]): number {
  return verdicts.filter((v) => !isAnswer(v.state)).length
}

/** One comparison a render asked for and did not draw, as TOKENS. The words
 *  are the surface's (components/delta-badge.tsx holds the product's movement
 *  vocabulary); this is the record of what to say them about. */
export interface Refusal {
  state: VerdictState
  reason: RefusedReason | null
}

/** Every comparison a render declined, in the order it asked them, so a
 *  surface that promises "each with its reason beside it" can print the
 *  reasons instead of hiding them in a hover title. */
export function refusals(verdicts: readonly Verdict[]): Refusal[] {
  return verdicts
    .filter((v) => !isAnswer(v.state))
    .map((v) => ({ state: v.state, reason: v.refusedReason ?? null }))
}

/**
 * Why a comparison that could be drawn is not being drawn, in the reader's
 * words. Shared with the badge (components/delta-badge.tsx), which prints the
 * same sentence as its `title`, so the hover and the record cannot come to say
 * different things about one refusal.
 */
export const REFUSAL_WHY: Record<RefusedReason, string> = {
  unlogged_era: 'this window reaches back before we were recording what changed',
  tracking_change: 'what we track changed inside this window',
  clustering_changed: 'the two sides were grouped differently',
  rename: 'the two sides are two names for one rival',
}

/** The other ways a comparison goes undrawn. Not refusals of the record —
 *  one is about this reading's thinness and one resolves on the calendar
 *  (lib/reading/verdicts.ts) — but a reader owed a reason is owed one for all
 *  three, including the refusal that carries no reason at all.
 *
 *  EXPORTED SO THERE IS ONE TABLE. A per-item copy of it in
 *  `lib/reports/documents/figures.ts` held two of the three keys, so a refused
 *  verdict with a null reason fell past both arms onto `unlogged_era` and the
 *  brief asserted a specific cause the record does not have — while the
 *  record's own sentence, built from this table, said something else about the
 *  same row. */
export const NOT_DRAWN_WHY: Record<string, string> = {
  too_little_data: 'too little was read on one side or both',
  baseline_forming: 'there are not enough months behind it yet',
  refused: 'our record of what changed does not reach across it',
}

/**
 * "3 comparisons were refused on this page: 2 because … and 1 because …"
 *
 * THE REASON IS PRINTED, NOT PROMISED. The line said "N comparisons on this
 * page could not be drawn and say why in their place" while the why reached
 * the page only as the badge's `title` — a hover tooltip, invisible in print,
 * and dropped altogether by the email arm, which prints the word alone. So the
 * sentence was true on screen for a mouse user and false on paper and in the
 * inbox, on the block that is the page's guarantee. The design asks OV6 for
 * "comparisons refused this month and why"; this is the why.
 */
export function refusedSentence(refusals: readonly Refusal[]): string {
  if (refusals.length === 0) return 'Every comparison this page asked for was drawn.'
  const counts = new Map<string, number>()
  for (const r of refusals) {
    const why = (r.state === 'refused' && r.reason ? REFUSAL_WHY[r.reason] : NOT_DRAWN_WHY[r.state]) ?? NOT_DRAWN_WHY.refused
    counts.set(why, (counts.get(why) ?? 0) + 1)
  }
  const head =
    refusals.length === 1
      ? '1 comparison was refused on this page'
      : `${fmtInt(refusals.length)} comparisons were refused on this page`
  const reasons = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  if (reasons.length === 1 && refusals.length === 1) return `${head}, because ${reasons[0][0]}.`
  const parts = reasons.map(([why, n]) => `${fmtInt(n)} because ${why}`)
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return `${head}: ${list}.`
}

export interface RecordOptions {
  /** The render's own refusal counter. */
  comparisonsRefused?: number | null
  /** The render's own refusals, with their reasons. */
  refusals?: readonly Refusal[]
  /** Overridable for tests and for a snapshot that re-renders as at its own
   *  reading date rather than as at now. */
  now?: string
  /** Which client this is running on, for the one table whose answer depends on
   *  it (lib/gate-record.ts). Defaults to 'service' because every caller before
   *  Settings › The record was the service role; a page reading on
   *  `session.supabase` MUST say 'tenant', or the discard line states a
   *  falsehood to the workspace it is about. */
  gate?: GateAccess
}

/**
 * Every input the record line and the record page need, for one tenant and one
 * window, read-only.
 *
 * Nothing here throws on a table that does not exist yet: the month tables, the
 * change log and the theme-observation columns each land in their own window,
 * and a record that takes the page down because a migration is a day behind is
 * worse than a record that says "not recorded yet". The readiness page's own
 * precedent, and the reason every group carries a null or a zero it can explain.
 */
export async function loadRecordInputs(
  client: SupabaseClient,
  clientId: string,
  window: RecordWindow,
  options: RecordOptions = {},
): Promise<RecordInputs> {
  const readingAt = options.now ?? new Date().toISOString()

  const [delivery, coverage, readDepth, language, discard, instrument, changes, frozenAt] = await Promise.all([
    loadDelivery(client, clientId, window),
    loadCoverage(client, clientId, window),
    loadReadDepth(client, clientId),
    loadLanguage(client, clientId),
    loadDiscard(client, clientId, window, options.gate ?? 'service'),
    loadInstrument(client, clientId),
    loadChanges(client, clientId, window),
    loadFrozenAt(client, clientId, window),
  ])

  return {
    window,
    delivery,
    coverage,
    readDepth,
    language,
    discard,
    instrument,
    changes,
    comparisonsRefused: options.comparisonsRefused ?? null,
    refusals: [...(options.refusals ?? [])],
    readingAt,
    frozenAt,
  }
}

// ---- the reads ---------------------------------------------------------------

const dayStart = (day: string): string => `${day}T00:00:00.000Z`
const dayEnd = (day: string): string => `${day}T23:59:59.999Z`

/**
 * A record window as the windowed SQL functions take it: half-open instants.
 *
 * `RecordWindow.to` is an INCLUSIVE `YYYY-MM-DD` — every other reader in this
 * file wraps it in `dayEnd` or compares against it as a day — but
 * `window_denominators(p_from, p_to)` is `comment_date >= p_from and
 * comment_date < p_to`. Handing it `w.to` unchanged read September as 1–29
 * September: videos, comments, platform mix and dual mentions all a day short,
 * printed as if they were the month. It was invisible only because M3 is
 * unapplied and the single-month fallback was the live path, so the two halves
 * of `loadCoverage` would have started disagreeing by a day the moment it
 * landed.
 *
 * The instants are explicit and UTC, as `monthWindow()` builds them for every
 * other caller, rather than bare date strings the server casts.
 *
 * AND IT REFUSES AN INSTANT. `horizonWindow` — the intended producer of a
 * page's window — emits HALF-OPEN instants (`to: monthEndInstant(last)`), so a
 * caller handing one of those in gets the opposite off-by-one: a whole extra
 * month, silently. A record window is a pair of days; anything else is a
 * caller's mistake and says so here rather than in the numbers.
 */
export function halfOpenInstants(w: RecordWindow): { from: string; to: string } {
  for (const [name, day] of [['from', w.from], ['to', w.to]] as const) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new Error(`record window ${name} must be an inclusive YYYY-MM-DD day, not ${day}`)
    }
  }
  const dayAfter = new Date(new Date(`${w.to}T00:00:00.000Z`).getTime() + 86_400_000)
  return { from: `${w.from}T00:00:00.000Z`, to: dayAfter.toISOString() }
}


async function loadDelivery(client: SupabaseClient, clientId: string, w: RecordWindow): Promise<DeliveryRecord> {
  const runs = await selectAll<{ started_at: string | null; completed_at: string | null; status: string }>(() =>
    client
      .from('pipeline_runs')
      .select('id, started_at, completed_at, status')
      .eq('client_id', clientId)
      .gte('started_at', dayStart(w.from))
      .lte('started_at', dayEnd(w.to))
      .order('started_at', { ascending: true })
      .order('id', { ascending: true }),
  )
  const delivered = runs.filter((r) => (r.status === 'completed' || r.status === 'partial') && r.started_at)
  const dates = delivered.map((r) => (r.started_at as string).slice(0, 10))
  return {
    delivered: delivered.length,
    dates,
    longestGapDays: longestGapDays(delivered.map((r) => r.started_at as string)),
    failed: runs.filter((r) => r.status !== 'completed' && r.status !== 'partial').length,
    basis: 'run_clock',
  }
}

/** The longest stretch between two deliveries, in whole days. Null under two —
 *  one update has no gap, and printing 0 would read as "never late". */
export function longestGapDays(startedAt: readonly string[]): number | null {
  const times = startedAt.map((t) => Date.parse(t)).filter(Number.isFinite).sort((a, b) => a - b)
  if (times.length < 2) return null
  let longest = 0
  for (let n = 1; n < times.length; n++) longest = Math.max(longest, times[n] - times[n - 1])
  return Math.round(longest / 86_400_000)
}

/**
 * The window's conversation, per audience.
 *
 * Through the windowed SQL function, never by summing month rows: `videos` is a
 * count of DISTINCT videos and a video whose thread spans two months belongs to
 * both months' sets, so the sum overstates Össur's own brand by 38.7% over
 * twelve months. Comments do sum; videos never will.
 */
async function loadCoverage(client: SupabaseClient, clientId: string, w: RecordWindow): Promise<CoverageRecord[] | null> {
  const reading = await loadWindowReading(client, clientId, halfOpenInstants(w))
  if (reading.denominators) {
    return reading.denominators.map((d) => ({
      audience: d.audience,
      videos: d.videos,
      comments: d.comments,
      platformMix: d.platform_mix ?? {},
      dualMention: d.dual_mention ?? 0,
      excludedUndated: d.excluded_undated ?? 0,
    }))
  }
  // The windowed function lands in its own migration and a deploy can precede
  // it. A SINGLE MONTH can still be answered off the stored row, exactly, and
  // the record's commonest window is one month — so it is, and any wider window
  // says "not recorded yet" rather than summing month rows into a video count
  // that is 38.7% too high over twelve months.
  if (monthStartOf(w.from) !== monthStartOf(w.to)) return null
  return await loadStoredMonth(client, clientId, monthStartOf(w.from))
}

type StoredDenominator = {
  audience: string
  videos: number | null
  comments: number | null
  platform_mix: PlatformMix | null
  dual_mention: number | null
  excluded_undated: number | null
}

async function loadStoredMonth(client: SupabaseClient, clientId: string, month: string): Promise<CoverageRecord[] | null> {
  try {
    const rows = await selectAll<StoredDenominator>(() =>
      client
        .from(TABLE_DENOMINATORS)
        .select('*')
        .eq('client_id', clientId)
        .eq('month', month)
        .order('audience', { ascending: true }),
    )
    return rows.map((d) => ({
      audience: d.audience,
      videos: d.videos ?? 0,
      comments: d.comments ?? 0,
      platformMix: d.platform_mix ?? {},
      dualMention: d.dual_mention ?? 0,
      excludedUndated: d.excluded_undated ?? 0,
    }))
  } catch (error) {
    if (isMissingMonthlyReading(error)) return null
    throw error
  }
}

/**
 * The analysed corpus, read ONCE for the two records drawn off it.
 *
 * WHY ONE READ. `loadReadDepth` asked five `count: exact` head queries and
 * `loadLanguage` then paged the same rows for `transcript_lang` — seven round
 * trips over one population. Measured against production on 16 September, that
 * was 7.2 s of Össur's Overview and 4.8 s of Sealand's, and every one of the
 * five counts was the same index scan over the same 1,596 rows with a different
 * filter on top (`explain analyze`: Index Scan using videos_analyzed_run_idx,
 * 990 ms each, all buffers already in cache — the instance's cost is per
 * STATEMENT, not per row). One paged read of five small columns answers both
 * records off the same rows, and the arithmetic is the arithmetic the counts
 * were doing.
 *
 * Five columns, not `*`: `videos` carries transcripts and OCR text, and the two
 * records need a language tag and three booleans.
 *
 * Memoised per request: Overview loads the record once, but a report builds
 * several artefacts through one client and each wants the same corpus.
 */
interface CorpusRow {
  transcript_lang: string | null
  analyzed_with_transcript: boolean | null
  analyzed_with_translation: boolean | null
  analyzed_with_ocr: boolean | null
}

function loadCorpus(client: SupabaseClient, clientId: string): Promise<CorpusRow[]> {
  return memoRead(client, `record:corpus:${clientId}`, () =>
    selectAll<CorpusRow>(() =>
      client
        .from('videos')
        .select('id, transcript_lang, analyzed_with_transcript, analyzed_with_translation, analyzed_with_ocr')
        .eq('client_id', clientId)
        .not('analyzed_run_id', 'is', null)
        .neq('platform', 'reddit')
        // ORDERED BY `id`, WHICH NEVER CHANGES. `selectAll` ranges over this
        // read in 1,000-row pages, and what range paging needs of its order key
        // is not that it is UNIQUE but that it is IMMUTABLE while the pages are
        // being fetched: a row that moves in the sort between page 1 and page 2
        // is read twice or not at all. This was briefly ordered by
        // `(analyzed_run_id, id)` to match M10's key — a unique pair, but
        // `analyzed_run_id` is exactly the column incremental Pass A stamps one
        // video at a time as it goes (lib/pipeline/pass-a.ts updateBookkeeping,
        // both lanes), and these pages are expected to load while a run is in
        // flight. One video re-stamped mid-read moves to a new random uuid and
        // lands anywhere in the order; the counts below then silently count it
        // twice or not at all. `id` is the primary key and is never rewritten.
        //
        // It costs a sort, and not the index: with M10 applied the plan is an
        // Index Only Scan over the matching rows (Heap Fetches 0) feeding a
        // top-N heapsort — 49 buffers a page against 1,520 without the index,
        // measured on the local cluster this package's migration was verified
        // on. The heap, not the sort, was the cost this read had.
        .order('id', { ascending: true }),
    ),
  )
}

/** `.eq(col, true)` counts rows where the column IS true; `.is(col, null)`
 *  counts rows where it is null. Neither counts a stored `false`, and the
 *  difference is the whole of the `unflagged` figure — so the predicates are
 *  written out rather than folded into a truthiness test. */
export function readDepthOf(rows: readonly CorpusRow[]): ReadDepthRecord {
  let speech = 0
  let translated = 0
  let onScreenText = 0
  let unflagged = 0
  for (const row of rows) {
    if (row.analyzed_with_transcript === true) speech += 1
    if (row.analyzed_with_translation === true) translated += 1
    if (row.analyzed_with_ocr === true) onScreenText += 1
    if (row.analyzed_with_transcript === null || row.analyzed_with_transcript === undefined) unflagged += 1
  }
  return { analysed: rows.length, speech, translated, onScreenText, unflagged, basis: 'all_time_non_reddit' }
}

async function loadReadDepth(client: SupabaseClient, clientId: string): Promise<ReadDepthRecord> {
  return readDepthOf(await loadCorpus(client, clientId))
}

/** English, by the pipeline's own normaliser's rule — `en`, `english`, `en-*`,
 *  case-insensitively. The column is not a clean vocabulary (ISO codes beside
 *  `punjabi`, `nynorsk`, `javanese`), which is why only the English/not-English
 *  split is drawn and a per-language breakdown is not. */
export function isEnglishTag(lang: string | null | undefined): boolean {
  const t = (lang ?? '').trim().toLowerCase()
  return t === 'en' || t === 'english' || /^en[-_]/.test(t)
}

export function languageOf(rows: readonly { transcript_lang: string | null }[]): LanguageRecord {
  let unknown = 0
  let english = 0
  let notEnglish = 0
  for (const row of rows) {
    const tag = (row.transcript_lang ?? '').trim()
    if (!tag) unknown += 1
    else if (isEnglishTag(tag)) english += 1
    else notEnglish += 1
  }
  return { analysed: rows.length, unknown, english, notEnglish, basis: 'video_speech' }
}

async function loadLanguage(client: SupabaseClient, clientId: string): Promise<LanguageRecord> {
  return languageOf(await loadCorpus(client, clientId))
}

/** Nothing readable: the shape a tenant session gets until M8 is applied. Every
 *  count is a zero that means nothing, and `readable` is what the composer
 *  reads before any of them. */
const noDiscard: DiscardRecord = {
  readable: false,
  judged: 0,
  kept: 0,
  setAside: 0,
  recordedFrom: null,
  clearedByHeuristic: null,
  gateOff: null,
  failedOpen: null,
  basis: 'run_clock',
}

/** The three columns the discard counts are drawn from. */
interface GateRow {
  kept: boolean | null
  source: string | null
  reason?: string | null
}

/**
 * What was looked at and set aside, in whichever of the gate's two regimes this
 * client is in (lib/gate-record.ts).
 *
 * On a tenant session the three `reason` counts are NOT asked for at all: M8
 * withholds `reason` from `authenticated`, and a select naming a column a role
 * has no grant on is refused against the table, which would take the page down
 * with it. They come back null, and the caveat they feed is simply not said.
 */
async function loadDiscard(
  client: SupabaseClient,
  clientId: string,
  w: RecordWindow,
  access: GateAccess,
): Promise<DiscardRecord> {
  if (access === 'tenant') {
    // The appeals table is M8's own object, and its absence is the only signal
    // that the verdict counts about to be read are RLS-emptied rather than
    // empty.
    const probe = await client.from(GATE_APPEALS_TABLE).select('id').limit(1)
    if (isMissingGateAppeals(probe.error)) return noDiscard
    if (probe.error) throw probe.error
  }
  // ONE READ, NOT FIVE COUNTS. This was five `count: exact` head queries over
  // the same window with a different filter on each — and `explain analyze`
  // against production says every one of them is the SAME Seq Scan on
  // gate_verdicts (no index leads with client_id and created_at; M10 adds one),
  // so the window was scanned five times to answer five questions about the
  // same rows. Sealand's September window is 2,777 rows of three narrow
  // columns; reading them once and counting in TypeScript is the same answer
  // for a third of the statements.
  //
  // `reason` is still only asked for on the service path: M8 grants
  // `authenticated` nine columns and `reason` is not one of them, and a select
  // naming it is refused against the TABLE, which would take the page down
  // rather than thin the caveat.
  //
  // AND IT IS WIDER ON THE ONE ROLE THAT HAS A TIMEOUT. `access: 'tenant'` is
  // the settings page's default (lib/settings/record-load.ts), and there the
  // client is the SESSION client: `authenticated`, which carries
  // statement_timeout = 8s where `service_role` carries none. Two head counts
  // that transferred no rows became up to three paged 1,000-row reads of the
  // same window, over what is still a Seq Scan until M10 is applied. The
  // measured statement is ~235 ms for Sealand's 2,777-row September, so this is
  // headroom and not a bug — but it is headroom that shrinks as a tenant's
  // window grows, and the index that removes the scan is the unapplied half of
  // this package. If this ever times out before M10 lands, the window is the
  // thing to narrow.
  const byReason = access === 'service'
  // Two spellings written out, because the select string is a TYPE here (the
  // PostgREST client parses it) and a ternary over two literals is what keeps
  // both parseable.
  const window = () =>
    client
      .from('gate_verdicts')
      .select(byReason ? 'id, kept, source, reason' : 'id, kept, source')
      .eq('client_id', clientId)
      .gte('created_at', dayStart(w.from))
      .lte('created_at', dayEnd(w.to))
      .order('id', { ascending: true }) as unknown as {
      range: (from: number, to: number) => PromiseLike<{ data: GateRow[] | null; error: unknown }>
    }
  const [rows, first] = await Promise.all([
    selectAll<GateRow>(window),
    client
      .from('gate_verdicts')
      .select('created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])
  if (first.error) throw new Error(`gate_verdicts first: ${first.error.message}`)
  const recordedFrom = (first.data as { created_at?: string } | null)?.created_at ?? null
  return {
    ...discardCounts(rows, byReason),
    readable: true,
    recordedFrom: recordedFrom ? recordedFrom.slice(0, 10) : null,
    basis: 'run_clock',
  }
}

/**
 * The five counts the five head queries used to ask, off the window's rows.
 *
 * The three `reason` counts carry `source = 'default'` as they always did — a
 * verdict reached by a rule the operator wrote is not the default gate's doing,
 * and the caveat is about the default gate. `null` where the column was not
 * asked for, which is "nobody could look", not "none".
 */
export function discardCounts(
  rows: readonly GateRow[],
  byReason: boolean,
): Pick<DiscardRecord, 'judged' | 'kept' | 'setAside' | 'clearedByHeuristic' | 'gateOff' | 'failedOpen'> {
  let kept = 0
  let clearedByHeuristic = 0
  let gateOff = 0
  let failedOpen = 0
  for (const row of rows) {
    if (row.kept === true) kept += 1
    if (!byReason || row.source !== 'default') continue
    if (row.reason === GATE_DEFAULT_REASONS.undecided) clearedByHeuristic += 1
    else if (row.reason === GATE_DEFAULT_REASONS.off) gateOff += 1
    else if (row.reason === GATE_DEFAULT_REASONS.failedOpen) failedOpen += 1
  }
  return {
    judged: rows.length,
    kept,
    setAside: rows.length - kept,
    clearedByHeuristic: byReason ? clearedByHeuristic : null,
    gateOff: byReason ? gateOff : null,
    failedOpen: byReason ? failedOpen : null,
  }
}

/**
 * Themes attached per analysed video, on the newest run that produced any.
 *
 * Counted off `theme_observations.member_video_ids` (M2) — the durable member
 * set — and off NOTHING ELSE. `member_insight_ids` is the obvious fallback and
 * it is a trap: an insight id belongs to one insight, so the attachments and
 * the distinct members are the same number and the figure comes back as
 * exactly 1.00 on both tenants, every run, whatever the instrument did. Null
 * rather than a figure that cannot move: "nobody has measured this" and "the
 * instrument attached one theme per video" are different answers, and this one
 * is the first until M2 is applied and a run has written the column.
 *
 * Two columns, not `*`: the newest run carries ~1,346 observations on Össur,
 * and once M2 lands each of those rows carries a `member_video_ids` array
 * beside everything else the table holds. One array column is what this reads,
 * so one array column is what it asks for.
 */
async function loadInstrument(client: SupabaseClient, clientId: string): Promise<InstrumentRecord> {
  const none: InstrumentRecord = { themesPerVideo: null, themeAttachments: 0, analysedVideos: 0, runId: null }
  let rows: { run_id: string | null; member_video_ids?: string[] | null }[] = []
  try {
    const newest = await client
      .from('theme_observations')
      .select('run_id, run_date')
      .eq('client_id', clientId)
      .order('run_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (newest.error) throw newest.error
    const runId = (newest.data as { run_id?: string | null } | null)?.run_id ?? null
    if (!runId) return none
    rows = await selectAll(() =>
      client
        .from('theme_observations')
        .select('run_id, member_video_ids')
        .eq('client_id', clientId)
        .eq('run_id', runId)
        .order('id', { ascending: true }),
    )
    if (rows.length === 0) return none
    const videos = new Set<string>()
    let attachments = 0
    for (const row of rows) {
      const members = row.member_video_ids ?? null
      if (members == null) continue
      attachments += members.length
      for (const id of members) videos.add(id)
    }
    if (videos.size === 0) return { ...none, runId }
    return {
      themesPerVideo: Number((attachments / videos.size).toFixed(2)),
      themeAttachments: attachments,
      analysedVideos: videos.size,
      runId,
    }
  } catch (error) {
    // ONLY the one error this answer is true for. `member_video_ids` arrives
    // with M2 and is absent until it is applied, and the record's honest answer
    // to that is "not recorded yet". A permission error, a dropped connection
    // or a bug in the query above is a different fact and printing the same
    // sentence for it would hide a broken read behind a true-sounding one —
    // every other loader in this file narrows the same way.
    if (isMissingThemeMembers(error)) return none
    throw error
  }
}

/** The error a read of `theme_observations.member_video_ids` gets before M2 is
 *  applied. Same shape as `isMissingMonthlyReading` / `isMissingConfigLog`:
 *  PostgREST's schema-cache codes and Postgres's own, and the object has to be
 *  named in the message before any of them counts. */
export function isMissingThemeMembers(error: unknown): boolean {
  if (!error) return false
  const { code, message } = (typeof error === 'object' ? error : {}) as { code?: string; message?: string }
  const text = message ?? (error instanceof Error ? error.message : String(error))
  if (!/member_video_ids|theme_observations/.test(text)) return false
  if (code && ['PGRST204', 'PGRST205', '42P01', '42703'].includes(code)) return true
  return /in the schema cache/i.test(text) || /does not exist/i.test(text)
}

async function loadChanges(client: SupabaseClient, clientId: string, w: RecordWindow): Promise<ChangeRecord> {
  let all: ConfigChange[] = []
  try {
    all = await selectAll<ConfigChange>(() =>
      client
        .from(CONFIG_CHANGES_TABLE)
        .select('*')
        .eq('client_id', clientId)
        .order('changed_at', { ascending: true })
        .order('id', { ascending: true }),
    )
  } catch (error) {
    if (!isMissingConfigLog(error)) throw error
    return { inWindow: 0, loggedFrom: null, reconstructed: 0 }
  }
  const from = dayStart(w.from)
  const to = dayEnd(w.to)
  const logged = all.filter((c) => c.source !== 'reconstructed')
  return {
    inWindow: all.filter((c) => c.changed_at >= from && c.changed_at <= to).length,
    loggedFrom: logged[0] ? fullDate(logged[0].changed_at) : null,
    reconstructed: all.length - logged.length,
  }
}

/** The newest freeze among the window's months. Null while every month in it is
 *  still filling — which is the honest answer for the current month and stays
 *  the honest answer until 30 days after it ends. */
async function loadFrozenAt(client: SupabaseClient, clientId: string, w: RecordWindow): Promise<string | null> {
  try {
    const { data, error } = await client
      .from(TABLE_DENOMINATORS)
      .select('frozen_at')
      .eq('client_id', clientId)
      .gte('month', monthStartOf(w.from))
      .lte('month', monthStartOf(w.to))
      .not('frozen_at', 'is', null)
      .order('frozen_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return (data as { frozen_at?: string | null } | null)?.frozen_at ?? null
  } catch (error) {
    if (isMissingMonthlyReading(error)) return null
    throw error
  }
}

// ---- the composers -----------------------------------------------------------

/** Videos in the window, across every audience. Distinct per audience and
 *  summed across them, which is exact: an audience is a partition of the
 *  corpus (client, else `competitor:<name>`, else the category), so no video is
 *  in two of them. */
export function totalVideos(coverage: readonly CoverageRecord[]): number {
  return coverage.reduce((n, c) => n + c.videos, 0)
}

/** The platform mix of every denominator, pooled the same way. */
export function totalPlatformMix(coverage: readonly CoverageRecord[]): PlatformMix {
  const out: PlatformMix = {}
  for (const c of coverage) for (const [platform, n] of Object.entries(c.platformMix)) out[platform] = (out[platform] ?? 0) + n
  return out
}

const PLATFORM_LABEL: Record<string, string> = {
  tiktok: 'TikTok',
  youtube: 'YouTube',
  instagram: 'Instagram',
  reddit: 'Reddit',
}

/** "TikTok 163 · YouTube 212 · Instagram 82 · Reddit 12". Largest first, every
 *  platform named: no platform is pooled silently. */
export function platformMixLine(mix: PlatformMix): string {
  return Object.entries(mix)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([platform, n]) => `${PLATFORM_LABEL[platform] ?? platform} ${fmtInt(n)}`)
    .join(' · ')
}

const share = (k: number, n: number): string => (n > 0 ? fmtPct((k / n) * 100, 0) : '—')

const plural = (n: number, word: string): string => `${fmtInt(n)} ${word}${n === 1 ? '' : 's'}`

/**
 * The one "how sound is this" line, in the page bar.
 *
 * One sentence on screen and no other method text on the page. It is printed
 * in full, in the open, under the bar — the mock's band (`Main.dc.html`) — and
 * beside it a link opens the record, where everything the sentence cannot say
 * is said. The words "the record" are that link's, not this sentence's: a line
 * that ends "→ the record" reads as an instruction wherever it is printed
 * without one, which is what the record page itself did.
 */
export function howSoundLine(input: RecordInputs): string {
  const parts: string[] = []
  parts.push(plural(input.delivery.delivered, 'update'))

  if (input.coverage == null) parts.push('coverage not recorded yet')
  else if (input.coverage.length === 0) parts.push('nothing read in this window')
  else {
    const videos = totalVideos(input.coverage)
    const mix = platformMixLine(totalPlatformMix(input.coverage))
    parts.push(mix ? `${plural(videos, 'video')} (${mix})` : plural(videos, 'video'))
  }

  const lang = input.language
  if (lang.analysed > 0) {
    const known = lang.english + lang.notEnglish
    parts.push(
      known > 0
        ? `${share(lang.notEnglish, known)} of what was said on camera was not in English`
        : 'no language recorded on what was said on camera',
    )
  }

  if (input.changes.inWindow > 0) parts.push(plural(input.changes.inWindow, 'tracking change'))
  return parts.join(' · ')
}

/**
 * What to say about the videos nothing judged. Three different facts wear one
 * `source` value, and the record said the worst of the three about all of
 * them: "97 videos entered without a judgement" was printed for 295 rows whose
 * reason is "no off-market signal in metadata" — the cheap check cleared them
 * and the model was never asked, which is the gate working. A record that
 * reports a defect where there is none is worse than one that says nothing.
 */
export function discardCaveat(g: DiscardRecord): string {
  const parts: string[] = []
  // Null is not zero: the three come off `reason`, which a tenant session may
  // not read at all, and a caveat left unsaid is the honest answer there.
  if ((g.clearedByHeuristic ?? 0) > 0) parts.push(`${plural(g.clearedByHeuristic ?? 0, 'video')} passed the quick check and were never looked at more closely`)
  if ((g.gateOff ?? 0) > 0) parts.push(`${plural(g.gateOff ?? 0, 'video')} came in while the check was switched off`)
  if ((g.failedOpen ?? 0) > 0) parts.push(`${plural(g.failedOpen ?? 0, 'video')} entered without a judgement because the check itself returned none`)
  return parts.length === 0 ? '' : `; ${parts.join(', and ')}`
}

/**
 * The record itself, as lines (OV6 and the record page). Each line is one fact
 * with its basis; a fact nothing has recorded says so rather than printing a
 * zero.
 *
 * AND THE DATES ARE IN THE READER'S FORM. `delivery.dates` are
 * `started_at.slice(0, 10)`, so the delivery line read "3 updates delivered,
 * 2026-09-06 to 2026-09-13" beside a masthead saying "reading as at 18 Sep
 * 2026" — on the monthly report's section 8 and on the quarterly review's
 * method page, which reads the same `RecordInputs`. Block B named it on the
 * weekly masthead and fixed it there; this is the same defect one line over.
 * The last date carries its year, because a record window may cross one and
 * "6 Jan to 13 Jan" beside a December report is two different Januaries. The
 * discard record's `recordedFrom` and the change log's `loggedFrom` were raw in
 * the same way and are dated the same way now; one test asserts no line of the
 * record holds an ISO day.
 */
export function recordLines(input: RecordInputs): string[] {
  const lines: string[] = []
  const d = input.delivery
  lines.push(
    d.delivered === 0
      ? 'No update was delivered in this window.'
      : `${plural(d.delivered, 'update')} delivered${d.dates.length ? `, ${shortDate(d.dates[0])} to ${fullDate(d.dates[d.dates.length - 1])}` : ''}${d.longestGapDays != null ? `, longest gap ${plural(d.longestGapDays, 'day')}` : ''}.`,
  )

  if (input.coverage == null) lines.push('The month-by-month reading has not been recorded for this workspace yet.')
  else if (input.coverage.length > 0) {
    const videos = totalVideos(input.coverage)
    const mix = platformMixLine(totalPlatformMix(input.coverage))
    lines.push(`${plural(videos, 'video')} carried conversation in this window${mix ? ` — ${mix}` : ''}.`)
    const dual = input.coverage.reduce((n, c) => n + c.dualMention, 0)
    if (dual > 0) lines.push(`${plural(dual, 'video')} of your own named a tracked rival as well as you.`)
    const undated = input.coverage.reduce((n, c) => n + c.excludedUndated, 0)
    if (undated > 0) lines.push(`${plural(undated, 'comment')} carried no date and are in no month.`)
  }

  const r = input.readDepth
  if (r.analysed > 0) {
    lines.push(
      // THE BASIS IS STATED, BECAUSE IT IS NOT THIS WINDOW'S. `ReadDepthRecord
      // .basis` is 'all_time_non_reddit' and the type says so; the sentence did
      // not, and it is printed between two lines that both end "in this window"
      // ("2 updates delivered, 6 Sep to 13 Sep 2026" and "449 videos carried
      // conversation in this window"). The three shares are internally
      // consistent — all three numerators are head counts over the same
      // `analysed` denominator — so this was a basis that was not stated rather
      // than a share that was wrong.
      `Of everything we have ever read for you, not just this window, speech was read on ${share(r.speech, r.analysed)}, translated on ${share(r.translated, r.analysed)}, and on-screen text read on ${share(r.onScreenText, r.analysed)} — Reddit excluded, which has neither audio nor a cover frame.`,
    )
    if (r.unflagged > 0) lines.push(`${plural(r.unflagged, 'video')} were read before the product recorded which of the three it managed.`)
  }

  const lang = input.language
  const known = lang.english + lang.notEnglish
  if (lang.analysed > 0) {
    lines.push(
      known === 0
        ? 'No language was recorded for any video, so the share not in English cannot be drawn.'
        : `${share(lang.notEnglish, known)} of the videos whose language we know were not in English${lang.unknown > 0 ? `, and ${plural(lang.unknown, 'video')} have no language recorded at all` : ''}. This is what was said in videos; the comments have no language of their own recorded yet.`,
    )
  }

  const g = input.discard
  lines.push(
    // READABILITY FIRST, and it is not the same question as recordedFrom.
    // "Nothing was ever judged" is a fact about the workspace; "we do not show
    // you this yet" is a fact about the product, and before M8 a tenant session
    // reads the second as the first — the falsehood this line was printing to
    // both live tenants, each with more than a thousand verdicts.
    !g.readable
      ? 'What we looked at and set aside is recorded, and we do not yet show it to you, so the share left out is not drawn here.'
      : g.recordedFrom == null
      ? 'What was looked at and set aside is not recorded at all, so the share left out cannot be drawn for any month.'
      : g.judged === 0
        ? `Nothing was looked at and set aside in this window — the record of it begins ${fullDate(g.recordedFrom)}.`
        : `${share(g.setAside, g.judged)} of what was looked at was set aside, recorded only from ${fullDate(g.recordedFrom)}, so no month before that can show it${discardCaveat(g)}.`,
  )

  const i = input.instrument
  lines.push(
    i.themesPerVideo == null
      ? 'How many themes attach to each video has not been recorded yet.'
      // `themesPerVideo` is Number(x.toFixed(2)), so an exact 1.00 prints as a
      // bare `1` — one theme per video on a thin update, not a contrived input —
      // and the noun beside it was hard-coded plural.
      : `${i.themesPerVideo} ${i.themesPerVideo === 1 ? 'theme' : 'themes'} attached per analysed video on the most recent update.`,
  )

  const c = input.changes
  lines.push(
    // NOT "fell inside this window". `fell` is a direction word to the block
    // copy contract (rule (c): no direction word outside a verdict), the record
    // is prose and not a verdict, and WP9/WP10 render it into a block — so the
    // sentence would land as a red build. The idiom is also the one
    // copy-contract deliberately keeps bare `fall` out of the list for.
    c.inWindow === 0
      ? 'Nothing about what we track changed in this window.'
      : `${plural(c.inWindow, 'change')} to what we track ${c.inWindow === 1 ? 'was' : 'were'} made inside this window.`,
  )
  lines.push(
    c.loggedFrom == null
      ? 'No change to what we track has been recorded yet, so no comparison can be checked against one.'
      : `No change record before ${fullDate(c.loggedFrom)}${c.reconstructed > 0 ? `, though ${fmtInt(c.reconstructed)} ${c.reconstructed === 1 ? 'entry was' : 'entries were'} reconstructed from what each update searched` : ''}.`,
  )

  if (input.comparisonsRefused != null) lines.push(refusedSentence(input.refusals))

  lines.push(`Reading as at ${fullDate(input.readingAt)}.`)
  lines.push(input.frozenAt == null ? 'No month in this window has been frozen yet — they are still filling.' : `The newest month here was frozen ${fullDate(input.frozenAt)}.`)
  return lines
}
