import type { OurChange } from '../../reading/comparability'
import type { ReadingMonth } from '../../reading/reading-month'
import { buildWeekLine, pendingWeekLine, type WeekLineObject, type WeekPoint, type WeekRead } from '../../reading/week-line'
import { pooledWeekVolumes, weekAxis, weekRules, type MarketWeekRow, type WeekVolumesBlock } from '../../reading/weeks'
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
// lib/pages/overview-market/index.ts with that step.

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
