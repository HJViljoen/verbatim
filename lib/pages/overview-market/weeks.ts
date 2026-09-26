import type { SupabaseClient } from '@supabase/supabase-js'

import type { OurChange } from '../../reading/comparability'
import type { ReadingMonth } from '../../reading/reading-month'
import { pointOfStored, readOfStored, TABLE_WEEK_LINE_POINTS, TABLE_WEEK_LINE_READS } from '../../reading/week-keep'
import {
  buildWeekLine, pendingWeekLine, pooledWeekPoints, type WeekLineObject, type WeekPoint, type WeekRead,
} from '../../reading/week-line'
import { pooledWeekVolumes, weekAxis, weekRules, type MarketWeekRow, type WeekVolumesBlock } from '../../reading/weeks'
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
}

/**
 * The weeks on the axis as counts, our changes on their weeks, and the
 * same-age line: its block when Heinrich has said print and points are kept,
 * its pending state until then, and nothing for a tenant with no entry.
 */
export function weekVolumesBlock(input: WeekVolumesInput): WeekVolumesBlock {
  const axis = weekAxis(input.reading, input.now)
  const weeks = pooledWeekVolumes(input.rows, input.rivalAudiences, axis, { now: input.now, updates: input.updates })
  const rules = weekRules(input.changes, axis)
  const cfg = input.cfg
  const line = !cfg
    ? null
    : cfg.print && input.line
      ? buildWeekLine(input.line.reads, input.line.points, input.changes, cfg, { objects: input.line.objects, axis, nextUpdateAfter: input.nextUpdateAfter })
      : pendingWeekLine(cfg, axis, input.nextUpdateAfter)
  return { weeks, rules, line }
}

/** Does the block have nothing to draw (every week none gathered)? */
export const weekVolumesEmpty = (b: WeekVolumesBlock | null | undefined): boolean =>
  !b || b.weeks.every((w) => w.state === 'none_gathered')

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
 * NULL where `week_line_reads` cannot be read (MF4 not applied, or an error):
 * the page says nothing of kept weeks it cannot know.
 */
export async function loadKeptWeekLine(client: SupabaseClient, input: {
  clientId: string
  cfg: WeekLineConfig | null
  rivalAudiences: readonly string[]
  objects?: readonly WeekLineObject[]
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
