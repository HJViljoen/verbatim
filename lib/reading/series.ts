import { thinMonth } from './bands'
import { rangeCoversMonth } from '../config-affects'
import { changeLogBoundary } from '../config-log'
import { fullDate, monthName } from '../format'
import { clusteringBoundaries, type ClusteringBoundary } from '../pipeline/clustering'
import { SHARE_BAND, type BandOptions } from '../report-bands'
import { renameLabel, stitchRenames, type RenameRecord } from '../rivals'
import { freezeBoundary, monthEndInstant, monthStartOf, monthsBetween, nextMonth } from './monthly'
import type { MonthOrigin, MonthStatus } from './types'

// One object, one audience, month by month — the series every chart and every
// comparison in Phase 1 is drawn from (design items 1, 2 and 6, decisions L–M).
//
// WHY THIS IS NOT "THE ROWS, SORTED". Three things make a stored month series
// unsafe to plot as it comes.
//
// A MONTH WITH NO ROW IS THREE DIFFERENT FACTS. `month_denominators` has no row
// for an audience-month that carried no conversation, so an absent row means
// "nothing happened", "this tenant has never been seeded", or "the migration
// that makes the table exist has not been applied" — and only the first is a
// zero. The readiness page already refuses to guess between them
// (lib/readiness/compute.ts prints "Not seeded yet" rather than 0); every
// reading surface now inherits that. `substrate` is the caller's answer, taken
// once at the read, and it decides which of `missing` / `not_seeded` / `hollow`
// a gap is.
//
// HOLLOW MONTHS ARE THE NORMAL CASE, NOT THE EDGE. Measured on production:
// Össur's own brand has conversation in 44 of the 49 months it spans, Ottobock
// in 20 of 36, the category in 55 of 72; Sealand's own brand has a row in 1 of
// the trailing 12 and Rareform has never had a month at all. Both line charts
// in the codebase are index-spaced, so a hollow month silently closes up and
// the line lies about when things happened. The axis is therefore GENERATED
// (`monthAxis`) and the rows are left-joined onto it, so a gap stays a gap.
//
// THE FLOOR IS PART OF THE PICTURE. `SHARE_BAND.minN` is 100 videos, and on
// today's corpus every own-brand and every rival audience clears it in zero
// months — Össur's category clears it in 4 and Sealand's in 2. A month below
// the floor has a real number and no comparison, which is a third chart token
// and not an absence.
//
// WHAT THE LABELS ARE FOR. A reading carries its own caveats or a reader
// supplies their own, and theirs are wrong. Seven kinds, each tied to something
// the schema actually records — never inferred, never a guess:
//   read_back_at_setup      origin = 'back_read'
//   still_filling           the ROW's status, with the date its line falls
//   thin                    lib/reading/bands.ts thinMonth, on this same series
//   clustering_changed      pipeline_runs.clustering_key changed between months
//   tracking_change         a config_changes row whose affects_months covers it
//   renamed                 a rival_rename row, drawn where the key changes
//   no_change_record_before the series-level line for the unlogged era
//
// "STILL FILLING" IS THE ROW'S STATUS, NOT THE CLOCK'S. `monthsToRefresh` keeps
// visiting a month whose stored row is `filling` after its 30-day line has
// passed — that visit is what freezes it — so `status = 'filling'` and
// `freezeStateFor(month, now) = 'frozen'` disagree by design for as long as it
// takes the next run to arrive. The schema's meaning wins: the row says whether
// it may still be rewritten. The 30-day line is printed beside it so a reader
// can see both.

export type MonthState = 'frozen' | 'filling' | 'hollow' | 'below_floor' | 'missing' | 'not_seeded'

/** What the caller found when it went to read. `missing` = the tables or
 *  functions are not there (`isMissingMonthlyReading`); `not_seeded` = they are
 *  there and this tenant has no month rows at all; `seeded` = it has rows, so a
 *  month without one is a genuine zero. */
export type Substrate = 'missing' | 'not_seeded' | 'seeded'

export type MonthLabelKind =
  | 'read_back_at_setup'
  | 'no_change_record_before'
  | 'still_filling'
  | 'thin'
  | 'clustering_changed'
  | 'tracking_change'
  | 'renamed'
  | 'split_keys'

/** One caveat, in the words a client reads. `kind` is the token a surface
 *  styles by (a dated rule, a hatched bar, a faint band); `text` is the
 *  sentence, assigned here so the chart, the export and the email cannot
 *  word it three ways. */
export interface MonthLabel {
  kind: MonthLabelKind
  text: string
  /** The months this caveat covers, on a SERIES note that names a stretch.
   *  `mergeSeriesNotes` unions them so twenty themes present in different
   *  months produce one sentence and not twenty — the text names the span, so
   *  de-duplicating on text alone cannot collapse them. Absent on a point
   *  label, which is already about one month. */
  months?: readonly string[]
}

/** A stored `month_denominators` row, as much of it as a series needs. */
export interface DenominatorPoint {
  month: string
  audience: string
  videos: number
  comments: number
  status: MonthStatus
  origin: MonthOrigin
  read_at: string
  run_id: string | null
  frozen_at?: string | null
  clustering_key?: string | null
}

/** A stored numerator row — `month_theme_readings` today, and the subject and
 *  kind tables of M4/M5, which carry the same five columns. */
export interface NumeratorPoint {
  month: string
  audience: string
  videos: number
  comments: number
  run_id?: string | null
  clustering_key?: string | null
}

/** A `config_changes` row as the reader needs it. `months` is the stored
 *  `affects_months` daterange — the months the change MOVED, which is rarely
 *  the month it was made in. */
export interface SeriesChange {
  changed_at: string
  surface: string
  note: string | null
  months: string | null
  source?: string | null
}

export interface MonthPoint {
  /** First day of the month, `YYYY-MM-DD`, UTC. */
  month: string
  state: MonthState
  /** The audience's videos and comments in this month. Null where there is no
   *  denominator row — never coerced to 0, which is a different fact. */
  videos: number | null
  comments: number | null
  /** The object's videos and comments in this month. Null on a
   *  denominator-only series, and null where the audience itself has no row;
   *  0 where the audience has a row and the object does not appear in it,
   *  because that IS zero for this clustering. */
  k: number | null
  kComments: number | null
  /** k as a percentage of videos, one decimal. Null unless both sides are
   *  present and the denominator is greater than zero. */
  pct: number | null
  /** The audience key this month's row was filed under. One line can carry two
   *  of them when a rival was renamed, and a direction word may not cross that
   *  (lib/reading/bands.ts). */
  audience: string | null
  status: MonthStatus | null
  origin: MonthOrigin | null
  readAt: string | null
  runId: string | null
  frozenAt: string | null
  clusteringKey: string | null
  labels: MonthLabel[]
}

export interface MonthSeries {
  /** The key the line is drawn under — the newest name in a rename chain. */
  audience: string
  /** Every key this line has carried, oldest first. One entry unless a rival
   *  was renamed. */
  names: string[]
  objectId: string | null
  objectLabel: string | null
  points: MonthPoint[]
  /** Caveats about the series as a whole rather than about one month. */
  notes: MonthLabel[]
  /** The first month on the axis whose denominator clears the floor — the month
   *  a comparison could start from. Null when none does. */
  firstReadable: string | null
  substrate: Substrate
}

/**
 * Every calendar month from `from` to `to` INCLUSIVE, ascending.
 *
 * The axis a chart is drawn on, and it is generated rather than read: a month
 * with no row has to occupy its own slot or the line closes the gap up and
 * misdates everything after it. Inclusive of `to`'s month, which is the
 * difference from `monthsBetween` — a horizon that ends in the current month
 * means to draw the current month, still filling and all.
 */
export function monthAxis(from: string, to: string): string[] {
  const start = monthStartOf(from)
  const end = monthStartOf(to)
  if (end < start) return []
  return monthsBetween(start, monthEndInstant(end))
}

/** How far back the thin rule's median looks. A year, so a seasonal tenant is
 *  compared with its own year rather than with its busiest quarter. */
export const THIN_TRAILING_MONTHS = 12

const round1 = (n: number): number => Math.round(n * 10) / 10

function fillingLabel(month: string): MonthLabel {
  return {
    kind: 'still_filling',
    text: `Still filling — this month is still taking comments, and settles on ${fullDate(freezeBoundary(month))}.`,
  }
}

const BACK_READ: MonthLabel = {
  kind: 'read_back_at_setup',
  text:
    'Read back at setup — this month had already closed when we started, so this is what it reads today, ' +
    'not what we would have reported at the time.',
}

/**
 * The caveat for a stretch of months nobody recorded a grouping for.
 *
 * Every month frozen before the clustering fingerprint shipped carries no key,
 * and two unknowns are deliberately not equal (`sameRegime`), so a five-month
 * back-read yields four `unknown` boundaries. Printing one per month would put
 * a dated rule on every bar of the history the trial is sold on. A run of them
 * is one statement about the stretch instead — the same shape as "no change was
 * recorded before {date}", which is also one line and not a badge per row.
 */
function unknownRegimeNote(months: readonly string[]): MonthLabel {
  // ONE MONTH IS NOT "THOSE MONTHS". `spanList` handles a single span
  // correctly and the sentence around it did not: Ossur's Overview and Voice
  // read "We did not record how themes were grouped for Sep 2026, so those
  // months are not strictly comparable with the ones after them" - one month,
  // "those months", and "the ones after them" about the month currently
  // filling, which has none after it.
  const distinct = [...new Set(months.map(monthStartOf))].sort()
  return {
    kind: 'clustering_changed',
    text: distinct.length === 1
      ? `We did not record how themes were grouped for ${spanList(months)}, so it is not strictly comparable with the months around it.`
      : `We did not record how themes were grouped for ${spanList(months)}, so those months are not strictly comparable with the ones around them.`,
    months: distinct,
  }
}

/** "June", "June to August", "June to August and November". Consecutive months
 *  are one span; a union of several series' stretches need not be contiguous. */
function spanList(months: readonly string[]): string {
  const sorted = [...new Set(months.map(monthStartOf))].sort()
  const runs: string[][] = []
  for (const month of sorted) {
    const held = runs[runs.length - 1]
    if (held && nextMonth(held[held.length - 1]) === month) held.push(month)
    else runs.push([month])
  }
  const spans = runs.map((r) => (r.length === 1 ? monthName(r[0]) : `${monthName(r[0])} to ${monthName(r[r.length - 1])}`))
  if (spans.length <= 1) return spans[0] ?? ''
  return `${spans.slice(0, -1).join(', ')} and ${spans[spans.length - 1]}`
}

export interface BuildSeriesInput {
  /** The months to draw, inclusive. Generated by `monthAxis` from the horizon. */
  axis: readonly string[]
  /** Stored denominator rows for this audience — or for every key of a renamed
   *  rival, which are stitched into one line. */
  denominators: readonly DenominatorPoint[]
  /** Stored numerator rows for the one object. Omit for a denominator-only
   *  series (an audience's own share of the whole). */
  readings?: readonly NumeratorPoint[]
  changes?: readonly SeriesChange[]
  renames?: readonly RenameRecord[]
  /** Where the clustering changed. Computed from the rows' own
   *  `clustering_key` when not given, which is what every caller wants — the
   *  boundaries of a series are a property of the series. */
  regimes?: readonly ClusteringBoundary[]
  /** The audience this series is about, as the reader asked for it. A rename
   *  may move the line to a newer key; `names` keeps both. */
  audience: string
  objectId?: string | null
  objectLabel?: string | null
  substrate?: Substrate
  /** `min(config_changes.changed_at)` excluding reconstructed rows — the date
   *  before which nothing was recorded. Null prints the "nothing recorded yet"
   *  branch, which is true today. */
  changeLogFrom?: string | null
  /** The denominator floor a month is called `below_floor` against.
   *  `SHARE_BAND` — 100 videos — unless a caller has a measured reason. */
  floor?: BandOptions
  /** Updates that ran in each month, keyed by month start, from
   *  `pipeline_runs.started_at`. Only the thin rule reads it, and only for
   *  months from `firstRunMonth` on — a run count is a run-indexed number and
   *  is never a period key for anything else (AGENTS.md). */
  updatesByMonth?: Readonly<Record<string, number>>
  /** The month of this tenant's first run ever. Before it, a month with no
   *  updates is read back at setup, not thin. */
  firstRunMonth?: string | null
}

/**
 * The axis, the rows and the caveats, folded into one line.
 *
 * Pure. Every input is something a loader has already read; nothing here goes
 * near a database, a clock or a model.
 */
/**
 * How many updates were delivered in this month, as decision M's first arm
 * means the question.
 *
 * `loadUpdates` keys `byMonth` only for months that HAVE a delivered run, and
 * `thinMonth` gates its updates arm on `updates != null`, whose documented
 * meaning is "nobody has counted". So a month inside the run era with ZERO
 * delivered updates used to arrive as null and could never be marked thin —
 * the arm could only ever fire for a month with exactly one update, and the
 * case it exists for, a month the pipeline did not run in, was drawn as an
 * ordinary month. Sealand's tracking_configs.report_period already reads
 * `paused`, so its first paused month is the first month that gets it wrong.
 *
 * A missing key is 0 only where someone counted (`byMonth` present) and the
 * month is inside the run era; before the first delivered run a month is read
 * back at setup, not thin, and that is thinMonth's own gate.
 */
function updatesFor(
  month: string,
  byMonth: Record<string, number> | undefined,
  firstRunMonth: string | null | undefined,
): number | null {
  const counted = byMonth?.[month]
  if (counted != null) return counted
  if (!byMonth || !firstRunMonth) return null
  return monthStartOf(month) >= monthStartOf(firstRunMonth) ? 0 : null
}

export function buildSeries(input: BuildSeriesInput): MonthSeries {
  const floor = input.floor ?? SHARE_BAND
  const substrate = input.substrate ?? 'seeded'
  const axis = input.axis.map(monthStartOf)
  const onAxis = new Set(axis)

  // A renamed rival is one line with the rules drawn on it. stitchRenames finds
  // the keys one rival has worn as a component rather than a chain, so a merge
  // (A→C and B→C) and a swap (A→B→A) come out as one line too.
  const stitched = stitchRenames(input.denominators, input.renames ?? [])
  const mine =
    stitched.find((s) => s.audience === input.audience || s.names.includes(input.audience)) ??
    ({ audience: input.audience, names: [input.audience], points: [] as DenominatorPoint[], breaks: [] } as const)
  const names = [...mine.names]
  const mineKeys = new Set(names)

  // ONE ROW PER MONTH, AND A SECOND ONE IS NOT SUMMED AND NOT SWALLOWED.
  // A renamed rival's months arrive from ALL its keys, so a month carrying a
  // row under two of them would, with a bare `Map.set`, keep whichever came
  // last and drop the other with no signal — the month's videos and k then a
  // fraction of the truth, drawn as fact. Summing is not the answer either:
  // `videos` is a count of DISTINCT videos and the two rows' sets overlap, so
  // the sum overstates (the same arithmetic that makes a wider window a SQL
  // call rather than a sum of months). So the FIRST row wins — the reads are
  // ordered month, audience, so that is deterministic — and the month carries
  // a caveat saying part of it is filed elsewhere.
  //
  // I could not construct this state from the shipped writers (mergeMonthRows
  // deletes the stale filling row when the key changes, and frozen months are
  // never rewritten), so this is defence in depth. It is also the one shape in
  // this layer that could not tell one row from two.
  const splitMonths = new Set<string>()
  const denomByMonth = new Map<string, DenominatorPoint>()
  for (const row of mine.points) {
    const month = monthStartOf(row.month)
    if (!onAxis.has(month)) continue
    if (denomByMonth.has(month)) { splitMonths.add(month); continue }
    denomByMonth.set(month, { ...row, month })
  }

  const readingByMonth = new Map<string, NumeratorPoint>()
  for (const row of input.readings ?? []) {
    const month = monthStartOf(row.month)
    // A numerator row belongs to this line only if its audience is one of the
    // names the line has worn: a theme can hold rows in several audiences.
    if (!onAxis.has(month) || !mineKeys.has(row.audience)) continue
    if (readingByMonth.has(month)) { splitMonths.add(month); continue }
    readingByMonth.set(month, { ...row, month })
  }

  const hasReadings = input.readings != null

  // Boundaries come off the rows that carry a clustering: the numerators when
  // there are any (a denominator does not depend on the clustering at all, so
  // its key is bookkeeping rather than a caveat), the denominators otherwise.
  const regimeRows = (hasReadings ? [...readingByMonth.values()] : [...denomByMonth.values()]).map((r) => ({
    month: r.month,
    clustering_key: r.clustering_key ?? null,
  }))
  const regimes = input.regimes ?? clusteringBoundaries(regimeRows)
  const changedAt = new Map(regimes.filter((b) => b.kind === 'changed').map((b) => [monthStartOf(b.month), b]))
  const unknownAt = new Set(regimes.filter((b) => b.kind === 'unknown').map((b) => monthStartOf(b.month)))

  const renamedAt = new Map(mine.breaks.map((b) => [monthStartOf(b.month), b]))

  // The trailing series the thin rule takes its median from: the months BEFORE
  // each one on this axis, up to a year of them, and only the months that have
  // a row — a month with no row is hollow and has its own token, and counting
  // it as a zero would drag the median down until a normal month read thin.
  const videosOnAxis = axis.map((m) => denomByMonth.get(m)?.videos ?? null)

  const points: MonthPoint[] = axis.map((month, index) => {
    const den = denomByMonth.get(month)
    const num = readingByMonth.get(month)
    const labels: MonthLabel[] = []

    let state: MonthState
    if (substrate === 'missing') state = 'missing'
    else if (substrate === 'not_seeded') state = 'not_seeded'
    else if (!den) state = 'hollow'
    else if (den.videos < floor.minN) state = 'below_floor'
    else state = den.status === 'frozen' ? 'frozen' : 'filling'

    if (den) {
      if (den.origin === 'back_read') labels.push(BACK_READ)
      if (den.status === 'filling') labels.push(fillingLabel(month))
    }

    const changed = changedAt.get(month)
    if (changed) {
      labels.push({
        kind: 'clustering_changed',
        text: 'Themes were re-grouped from this month, so a comparison across it is not like for like.',
      })
    }

    if (splitMonths.has(month)) {
      labels.push({
        kind: 'split_keys',
        text: 'Part of this month is filed under another name for this one, so the figure here is only part of it.',
      })
    }

    const renamed = renamedAt.get(month)
    if (renamed) labels.push({ kind: 'renamed', text: renamed.label ?? renameLabel(renamed.from, renamed.to) })

    // ONE SENTENCE PER THING SAID, not one per covering change.
    // `loadMonthSeries` passes EVERY change the tenant has ever logged, so a
    // month covered by several bands collected several labels — and every one
    // whose `note` is null carries the SAME default sentence, so a month could
    // carry N identical caveats. The same "one caveat per bar" shape as the
    // unrecorded-grouping note, in the label list rather than in the notes.
    const saidHere = new Set<string>()
    for (const change of input.changes ?? []) {
      if (!rangeCoversMonth(change.months, month)) continue
      const text = change.note ?? 'What this workspace tracks changed, and it moved this month.'
      if (saidHere.has(text)) continue
      saidHere.add(text)
      labels.push({ kind: 'tracking_change', text })
    }

    if (
      den &&
      thinMonth(
        { month, videos: den.videos, k: null },
        videosOnAxis.slice(Math.max(0, index - THIN_TRAILING_MONTHS), index),
        { updates: updatesFor(month, input.updatesByMonth, input.firstRunMonth), firstRunMonth: input.firstRunMonth ?? null },
      )
    ) {
      labels.push({
        kind: 'thin',
        // VIDEOS, because videos are what the rule measures. thinMonth compares
        // `point.videos` against the trailing median of videosOnAxis, and its
        // other arm counts delivered updates; nothing in the computation
        // touches a comment count. Naming conversations broke the
        // copy-matches-code rule in the direction a reader cannot detect — and
        // "videos" is the word the new reading surfaces say anyway.
        text: 'Thin month — far fewer videos than usual, so a share moves on very little here.',
      })
    }

    const videos = den ? den.videos : null
    const comments = den ? den.comments : null
    const k = hasReadings ? (den ? (num?.videos ?? 0) : null) : null
    const kComments = hasReadings ? (den ? (num?.comments ?? 0) : null) : null

    return {
      month,
      state,
      videos,
      comments,
      k,
      kComments,
      pct: k != null && videos != null && videos > 0 ? round1((k / videos) * 100) : null,
      audience: den?.audience ?? null,
      status: den?.status ?? null,
      origin: den?.origin ?? null,
      readAt: den?.read_at ?? null,
      runId: den?.run_id ?? null,
      frozenAt: den?.frozen_at ?? null,
      clusteringKey: (hasReadings ? num?.clustering_key : den?.clustering_key) ?? null,
      labels,
    }
  })

  const notes: MonthLabel[] = []
  if (substrate === 'seeded') notes.push({ kind: 'no_change_record_before', text: changeLogBoundary(input.changeLogFrom) })

  // Consecutive unknown boundaries collapse into one statement about the
  // stretch; an isolated one still gets its own.
  let run: string[] = []
  for (const month of axis) {
    if (unknownAt.has(month)) {
      run.push(month)
      continue
    }
    if (run.length > 0) notes.push(unknownRegimeNote(run))
    run = []
  }
  if (run.length > 0) notes.push(unknownRegimeNote(run))

  const firstReadable = points.find((p) => p.state === 'frozen' || p.state === 'filling')?.month ?? null

  return {
    audience: mine.audience,
    names,
    objectId: input.objectId ?? null,
    objectLabel: input.objectLabel ?? null,
    points,
    notes,
    firstReadable,
    substrate,
  }
}

/**
 * The notes of several series, said once.
 *
 * `buildSeries` puts the change-log boundary and the unrecorded-grouping
 * stretches on EVERY series it builds, because a caller drawing one line has to
 * be told; three audiences by twenty themes is sixty copies of the same
 * sentence for a surface to de-duplicate. A reader of a whole set prints these
 * instead, and the per-series notes stay where they are for a reader of one
 * line. Identical text is one note, and the first occurrence keeps its place.
 */
export function mergeSeriesNotes(series: readonly MonthSeries[]): MonthLabel[] {
  return mergeNotes(series.map((s) => s.notes))
}

/**
 * The same merge over lists of notes rather than over series.
 *
 * A surface that reads TWO sets — a page's themes and, beside them, an
 * artefact's own movers — holds two already-merged lists and must still say one
 * caveat. Merging merged lists is the same operation: concatenating them by
 * hand is how a reader ends up with two unrecorded-grouping sentences naming
 * overlapping spans, which is exactly what the merge exists to prevent.
 */
export function mergeNotes(lists: readonly (readonly MonthLabel[])[]): MonthLabel[] {
  const seen = new Set<string>()
  const out: MonthLabel[] = []
  // THE ONE CAVEAT SENTENCE, not one per series. An unrecorded-grouping note
  // names the span it covers, and a theme series' stretch is computed off the
  // months THAT THEME has rows in — so two themes present in different months
  // produce two differently-worded sentences that de-duplicating on text cannot
  // collapse. The convention handed to Block B is one sentence for a run of
  // months, never one per bar; these merge by the union of their months and are
  // re-worded from it, keeping the first one's place.
  const unknownMonths: string[] = []
  let unknownSlot = -1
  for (const notes of lists) {
    for (const note of notes) {
      if (note.months && note.months.length > 0) {
        unknownMonths.push(...note.months)
        if (unknownSlot < 0) { unknownSlot = out.length; out.push(note) }
        continue
      }
      const key = `${note.kind}\u0000${note.text}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(note)
    }
  }
  if (unknownSlot >= 0) out[unknownSlot] = unknownRegimeNote(unknownMonths)
  return out
}

/** One object's weight on one audience's axis, for ranking only. */
export interface ObjectWeight {
  audience: string
  objectId: string
  /** Comments summed over the months read. */
  comments: number
  /** How many months of the axis the object appears in. */
  months: number
}

/**
 * The biggest objects on each audience's axis, by comments.
 *
 * BY COMMENTS, AND ONLY BY COMMENTS. A comment carries one date and lands in
 * one month, so summing month rows gives the window's comment count exactly;
 * videos do NOT sum, because a video whose thread spans two months is a member
 * of both months' sets (+38.7% on Össur's own brand over twelve months). This
 * is a ranking, not a figure: whoever prints a number for one of these objects
 * reads it from `loadWindowReading`, which counts distinct videos over the
 * whole window in one pass.
 *
 * Ties break on the object id, so the same corpus always ranks the same way.
 */
export function rankObjects(rows: readonly ObjectWeight[], limit: number): ObjectWeight[] {
  const byAudience = new Map<string, ObjectWeight[]>()
  for (const row of rows) byAudience.set(row.audience, [...(byAudience.get(row.audience) ?? []), row])
  const out: ObjectWeight[] = []
  for (const audience of [...byAudience.keys()].sort()) {
    const ranked = [...(byAudience.get(audience) ?? [])].sort(
      (a, b) => b.comments - a.comments || a.objectId.localeCompare(b.objectId),
    )
    out.push(...ranked.slice(0, Math.max(0, limit)))
  }
  return out
}

/** Index the points of a series by month, for a caller that needs to reach one
 *  without walking the axis. */
export function pointsByMonth(series: MonthSeries): Map<string, MonthPoint> {
  return new Map(series.points.map((p) => [p.month, p]))
}

/** Is this month one a comparison may be drawn on at all? A hollow month, a
 *  month below the floor, an unseeded tenant and an unapplied migration are all
 *  no — for four different reasons, which is why `MonthState` has six values
 *  and not two. */
export function isReadable(point: MonthPoint): boolean {
  return point.state === 'frozen' || point.state === 'filling'
}

