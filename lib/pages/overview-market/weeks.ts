import type { SupabaseClient } from '@supabase/supabase-js'

import type { OurChange } from '../../reading/comparability'
import type { ReadingMonth } from '../../reading/reading-month'
import { pointOfStored, readOfStored, TABLE_WEEK_LINE_POINTS, TABLE_WEEK_LINE_READS } from '../../reading/week-keep'
import {
  buildWeekLine, dueHasPassed, passedBeforeOf, pendingWeekLine, pooledWeekPoints, withChartCadence, type ChartRun, type WeekLineBlock, type WeekLineObject, type WeekPoint,
  type WeekRead,
} from '../../reading/week-line'
import { pooledWeekVolumes, weekAxis, weekRules, weeksSinceOurChanges, type MarketWeekRow, type WeekVolumesBlock } from '../../reading/weeks'
import { subjectCalibration } from '../../subjects/calibration-state'
import { selectAll } from '../../supabase-admin'
import type { WeekLineConfig } from '../../week-line-config'

// Week by week's builder (market-first decision M; WP2.9 `lib/pages/overview-market/weeks.ts`).
//
// ONE BUILDER, TWO PAGES. Your market renders the block inside "With this
// update" (`overview.arrivals`, WP2.7; no key of its own on the front page, 25
// Sep rulings) and This week renders it as `week.weeks`. Both hand the same
// reads to this function, so the two pages cannot draw two different weeks.
//
// PURE, AND THE READS ARE THE LOADER'S. The loader reads `market_week_volumes`
// (MF4, one read over the axis), the updates and the change log it already
// holds, and, once the line prints, the kept `week_line_reads` and
// `week_line_points`. The wiring (the OverviewData and This week fields, the
// arrivals render, `week.weeks` in the registry) is the component step, after
// WP2.7's arrivals block; this file is its pure interface. It joins
// lib/pages/overview-market/index.ts with that step. The one exception is the
// kept line's read, `loadKeptWeekLine` below (WP3.13 part B): the loaders call
// it and hand its `line` to `weekVolumesBlock`.

/** The block's empty state: no week on the axis has a dated comment. */
export const WEEKS_EMPTY = 'No week has comments yet.'

export interface WeekVolumesInput {
  reading: Pick<ReadingMonth, 'month'>
  now: string
  /** Finish instants of completed or partial runs. */
  updates: readonly string[]
  rows: readonly MarketWeekRow[]
  rivalAudiences: readonly string[]
  /** `changesFromLog`'s changes of ours. */
  changes: readonly OurChange[]
  /** The tenant's `WEEK_LINE` entry, or null (no same-age row at all). */
  cfg: WeekLineConfig | null
  /** The kept reads and points, once the line prints (`cfg.print`). */
  line?: { reads: readonly WeekRead[]; points: readonly WeekPoint[]; objects?: readonly WeekLineObject[] } | null
  nextUpdateAfter?: ((instant: string) => string | null) | null
  /** Every run, any status, with its errors (`loadCadenceRuns`), for the
   *  bars' cadence test (`chartCadenceBroken`). Absent: no week is cut for
   *  cadence (a fixture). */
  runs?: readonly ChartRun[] | null
}

/**
 * The weeks on the axis as counts, our changes on their weeks, and the
 * same-age line: its block when Heinrich has said print and points are kept,
 * its pending state until then, and nothing for a tenant with no entry.
 */
export function weekVolumesBlock(input: WeekVolumesInput): WeekVolumesBlock {
  const axis = weekAxis(input.reading, input.now)
  const pooled = pooledWeekVolumes(input.rows, input.rivalAudiences, axis, { now: input.now, updates: input.updates })
  const weeks = input.runs ? withChartCadence(pooled, input.runs, input.now) : pooled
  const rules = weekRules(input.changes, axis)
  const cfg = input.cfg
  const line = !cfg
    ? null
    : cfg.print && input.line
      ? keptLineAsAt(
          buildWeekLine(input.line.reads, input.line.points, input.changes, cfg, { objects: input.line.objects, axis, nextUpdateAfter: input.nextUpdateAfter }),
          latestUpdate(input.updates, input.now),
          input.now,
        )
      : pendingWeekLine(cfg, axis, input.nextUpdateAfter)
  return { weeks, rules, line }
}

/** The latest update on or before `now` (a finish instant), or null. */
const latestUpdate = (updates: readonly string[], now: string): string | null => {
  const nowMs = Date.parse(now)
  return updates.filter((u) => !(Date.parse(u) > nowMs)).sort().pop() ?? null
}

/**
 * The printed line as at the page's clock (WP3.13 display): a week whose due
 * date has passed is no longer "due" (the deploy-3 review's rule for the
 * pending row, `passedBeforeOf`: the latest update's day, or two days before
 * the clock). It is either kept, or it was not kept at its age, and the strip
 * says "not kept" in its slot: a missed capture is a gap for good.
 */
export function keptLineAsAt(line: WeekLineBlock, latest: string | null, now: string): WeekLineBlock {
  const passedBefore = passedBeforeOf(latest, now)
  return { ...line, due: line.due.filter((d) => !dueHasPassed(d.date, passedBefore)) }
}

/** Does the block have nothing to draw (every week none gathered)? */
export const weekVolumesEmpty = (b: WeekVolumesBlock | null | undefined): boolean =>
  !b || b.weeks.every((w) => w.state === 'none_gathered')

/**
 * The block as the bars draw it (T0a, mechanism 3): only the weeks read one
 * way since our latest search or relevance change (`weeksSinceOurChanges`),
 * and no marks, key or "Our changes" row. Every renderer reads the block
 * through this, so a stored copy obeys it too.
 */
export const weekBarsBlock = (b: WeekVolumesBlock): WeekVolumesBlock => ({ ...b, weeks: weeksSinceOurChanges(b.weeks, b.rules), rules: [] })

/** Something was gathered, but no week is left to draw one way: the chart is
 *  omitted, never placeholdered ("No week has comments yet" would be false). */
export const weekBarsOmitted = (b: WeekVolumesBlock | null | undefined): boolean =>
  b != null && !weekVolumesEmpty(b) && weekBarsBlock(b).weeks.length === 0

// ---- The kept line's read (WP3.13 part B) ------------------------------------------------------

/** What the loader read of the kept same-age line. */
export interface KeptWeekLine {
  /** The weeks kept at the tenant's age and method (`week_line_reads`),
   *  oldest first: what the pending row names as kept. */
  weeks: string[]
  /** `weekVolumesBlock`'s `line` input, and only when `WEEK_LINE.print` is
   *  true: the kept reads, and their `week_line_points` pooled over the market
   *  (the category and the tracked rivals, decision E). Null while the line
   *  is kept and not shown. */
  line: { reads: WeekRead[]; points: WeekPoint[]; objects?: WeekLineObject[] } | null
}

const READ_COLUMNS = 'week, age_days, captured_before, read_through_run, conditions, method_version, computed_at'
const POINT_COLUMNS = 'week, age_days, method_version, audience, object_kind, object_id, depth_band, k, n'

/**
 * The kept line, for the page loaders (Your market's "Read at the same age",
 * Subjects' week strip; wired by wave 2 into `lib/pages/week.ts`
 * `loadWeekVolumes` and `lib/pages/subjects.ts`).
 *
 *   - No `WEEK_LINE` entry (Össur): null, and nothing is read. The block then
 *     carries no same-age row at all.
 *   - Kept, not printed (`print` false, until Heinrich's word after the Mon
 *     26 Oct check): ONE read, `week_line_reads`, for the kept weeks the
 *     pending row names. No point is read: the line stays pending, with its
 *     due dates, whatever is kept.
 *   - Printed: that read, then `week_line_points` for the kept weeks (paged),
 *     and, when the caller holds no subject names and a subject has points,
 *     `subjects` for their names and calibration (decision C), so a subject
 *     row is never named by its id. `weekVolumesBlock` builds the
 *     `WeekLineBlock` from `line`.
 *   - `kindsOnly` (Your market, whose rows are the six kinds: WP3.13's "six
 *     kind rows"; a subject's weeks are Subjects' strip, §2.3 S6): the subject
 *     points are dropped, so no subject is read.
 * NULL where `week_line_reads` cannot be read (MF4 not applied, or an error):
 * the page says nothing of kept weeks it cannot know.
 */
export async function loadKeptWeekLine(client: SupabaseClient, input: {
  clientId: string
  cfg: WeekLineConfig | null
  rivalAudiences: readonly string[]
  objects?: readonly WeekLineObject[]
  kindsOnly?: boolean
}): Promise<KeptWeekLine | null> {
  const { cfg, clientId } = input
  if (!cfg) return null
  let reads: WeekRead[]
  try {
    const rows = await selectAll<Parameters<typeof readOfStored>[0]>(() =>
      client.from(TABLE_WEEK_LINE_READS).select(READ_COLUMNS)
        .eq('client_id', clientId).eq('method_version', cfg.methodVersion).eq('age_days', cfg.ageDays)
        .order('week').order('computed_at'))
    reads = rows.map(readOfStored)
  } catch (e) {
    console.error(`[pages] ${TABLE_WEEK_LINE_READS}: ${e instanceof Error ? e.message : String(e)}; no week read as kept`)
    return null
  }
  const weeks = [...new Set(reads.map((r) => r.week))].sort()
  if (!cfg.print) return { weeks, line: null }
  if (weeks.length === 0) return { weeks, line: { reads, points: [], ...(input.objects ? { objects: [...input.objects] } : {}) } }

  let points: WeekPoint[]
  try {
    const rows = await selectAll<Parameters<typeof pointOfStored>[0]>(() =>
      client.from(TABLE_WEEK_LINE_POINTS).select(POINT_COLUMNS)
        .eq('client_id', clientId).eq('method_version', cfg.methodVersion).eq('age_days', cfg.ageDays).in('week', weeks)
        .order('week').order('audience').order('object_kind').order('object_id').order('depth_band'))
    points = pooledWeekPoints(rows.map(pointOfStored), input.rivalAudiences)
    if (input.kindsOnly) points = points.filter((p) => p.objectKind === 'kind')
  } catch (e) {
    console.error(`[pages] ${TABLE_WEEK_LINE_POINTS}: ${e instanceof Error ? e.message : String(e)}; the line is not drawn`)
    return { weeks, line: null }
  }

  let objects = input.objects ? [...input.objects] : undefined
  if (!objects && points.some((p) => p.objectKind === 'subject')) {
    const { data, error } = await client.from('subjects')
      .select('id, name, status, calibrated_at, calibration_precision, calibration_n, calibration_judge_version')
      .eq('client_id', clientId)
    if (error) console.error(`[pages] subjects: ${error.message}; the week line draws its kinds alone`)
    type SubjectRow = Parameters<typeof subjectCalibration>[0] & { id: string; name: string; status: string }
    const named = ((data ?? []) as SubjectRow[]).filter((s) => s.status !== 'retired')
    objects = named.map((s) => ({ objectKind: 'subject' as const, objectId: s.id, label: s.name, calibration: subjectCalibration(s) }))
    // A subject with points and no name (read failed, or retired since) is not drawn.
    const known = new Set(named.map((s) => s.id))
    points = points.filter((p) => p.objectKind === 'kind' || known.has(p.objectId))
  }
  return { weeks, line: { reads, points, ...(objects ? { objects } : {}) } }
}

// ---- Subjects' week strip (WP3.13 display, §2.3 S6) ---------------------------------------

/**
 * The same-age line on Subjects: the selected subject's row, on the page's own
 * week axis (the weeks WP2.9's bars would draw for the month read: `weekAxis`),
 * never on the month axis. Stored on the pane (optional; a pane stored before
 * it has none and draws no strip).
 */
export interface WeekStrip {
  /** The strip's week axis: the Mondays, oldest first. */
  axis: string[]
  /** The line with the selected subject's row alone (none where it does not
   *  clear 10 videos in both weeks of a pair: "too few videos a week to
   *  read"), or every kept read with no row where the line holds none yet. */
  line: WeekLineBlock
}

/** The words Subjects prints for a subject with no row on the line (§2.3 S6). */
export const WEEK_STRIP_TOO_FEW = 'Too few videos a week to read.'

/**
 * The kept line for Subjects' strip, read once `WEEK_LINE` says print and
 * never before (deploy 3 draws no strip, §2.3 S6): `loadKeptWeekLine` (the kept
 * reads and their points, pooled over the market), built on the page's week
 * axis with the subjects' names and calibrations the page already holds, so no
 * subject read is added. Null for a tenant with no entry (Össur), while the
 * line is kept and not shown, or where the kept tables cannot be read.
 */
export async function loadWeekStrip(client: SupabaseClient, input: {
  clientId: string
  cfg: WeekLineConfig | null
  reading: Pick<ReadingMonth, 'month'>
  now: string
  /** The latest update on or before the clock (`ReadingMonth.asAt`). */
  asAt: string | null
  rivalAudiences: readonly string[]
  changes: readonly OurChange[]
  /** Every subject the page may select, with its name and calibration. */
  objects: readonly WeekLineObject[]
  nextUpdateAfter?: ((instant: string) => string | null) | null
}): Promise<WeekStrip | null> {
  const { cfg } = input
  if (!cfg || !cfg.print) return null
  const kept = await loadKeptWeekLine(client, { clientId: input.clientId, cfg, rivalAudiences: input.rivalAudiences, objects: input.objects })
  if (!kept?.line) return null
  const axis = weekAxis(input.reading, input.now)
  const line = buildWeekLine(kept.line.reads, kept.line.points, input.changes, cfg, { objects: input.objects, axis, nextUpdateAfter: input.nextUpdateAfter })
  return { axis, line: keptLineAsAt(line, input.asAt, input.now) }
}

/** The strip for one subject: its row alone, the line's reads and due weeks kept. */
export function weekStripFor(strip: WeekStrip | null | undefined, subjectId: string): WeekStrip | null {
  if (!strip) return null
  return { axis: strip.axis, line: { ...strip.line, rows: strip.line.rows.filter((r) => r.objectKind === 'subject' && r.objectId === subjectId) } }
}
