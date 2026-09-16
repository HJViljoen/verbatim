import type { Block } from '@/lib/blocks/types'
import { MONTHLY_BLOCK_KEYS, type MonthlyBlockKey } from '@/lib/reports/monthly'
import type { MonthlyData } from '@/lib/pages/monthly'
import { overviewSubjects } from '@/components/pages/overview/subjects'
import { overviewRivals } from '@/components/pages/overview/rivals'
import { overviewMoves } from '@/components/pages/overview/moves'
import { overviewRecord } from '@/components/pages/overview/record'
import { fromOverview } from './adapt'
import { monthlyMonth } from './month'
import { monthlyMovers } from './movers'
import { monthlyVoices } from './voices'
import { monthlyDecide } from './decide'

/**
 * The monthly report's eight blocks, by key (Phase 1 WP18).
 *
 * FIVE ARE OVERVIEW'S, THREE ARE THIS ARTEFACT'S. The five are adapted rather
 * than copied (`fromOverview`), so the report and the page cannot print one
 * month two ways; the three are the ones the page has no equivalent of — the
 * month's own opening, ten movers with a line each, one voice per subject and
 * the labelled decision.
 *
 * `MONTHLY_BLOCKS` is a RECORD and not an array, because a stored arrangement
 * is a list of keys and a build must be able to resolve one without scanning.
 */
export const MONTHLY_BLOCKS: Record<MonthlyBlockKey, Block<MonthlyData>> = {
  'monthly.month': monthlyMonth,
  // OV2, under the mock's own heading. The page asks how we are seen; the
  // artefact is read once a month and says which month it is about.
  'monthly.subjects': fromOverview('monthly.subjects', overviewSubjects, { title: 'Your subjects this month' }),
  'monthly.movers': monthlyMovers,
  'monthly.rivals': fromOverview('monthly.rivals', overviewRivals, { title: 'The rivals’ month' }),
  'monthly.moves': fromOverview('monthly.moves', overviewMoves),
  'monthly.voices': monthlyVoices,
  'monthly.decide': monthlyDecide,
  'monthly.sound': fromOverview('monthly.sound', overviewRecord),
}

/**
 * The blocks a stored arrangement names, in its order.
 *
 * A KEY THIS BUILD NO LONGER KNOWS IS DROPPED, exactly as a report section's is
 * — an artefact stored a year ago must still render, minus whatever has since
 * retired, rather than throwing. An arrangement that names NONE of them comes
 * back empty and the deck says so on its own sheet; it does not silently
 * become the full report.
 */
export function monthlyBlocksFor(keys: readonly string[]): Block<MonthlyData>[] {
  return keys
    .filter((k): k is MonthlyBlockKey => (MONTHLY_BLOCK_KEYS as readonly string[]).includes(k))
    .map((k) => MONTHLY_BLOCKS[k])
}

/** Every block, in the design's order — what a build with no stored
 *  arrangement renders. */
export const ALL_MONTHLY_BLOCKS: Block<MonthlyData>[] = monthlyBlocksFor(MONTHLY_BLOCK_KEYS)
