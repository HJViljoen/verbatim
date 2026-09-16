import type { Block } from '@/lib/blocks/types'
import type { WeeklyData } from '@/lib/pages/weekly'
import { WEEKLY_BLOCK_KEYS, type WeeklyBlockKey } from '@/lib/reports/weekly'
import { forSales } from './sales'
import { weeklyWeek } from './week'
import { weeklySubjects } from './subjects'
import { weeklyIncoming } from './incoming'
import { weeklyContent } from './content'
import { weeklyCoverage } from './coverage'

// The weekly report's six blocks, in the design's order (Phase 1 WP17).
//
// ARRANGED OVER BLOCK KEYS, and the keys are the arrangement: `WEEKLY_BLOCK_KEYS`
// is the stored order, this map is what each key renders, and the document walks
// the first through the second. A schedule that stores an order therefore stores
// key strings, exactly as a report's sections do — which is what makes the
// migrate-schedule-keys script a migration rather than a rename.

export const WEEKLY_BLOCKS: Record<WeeklyBlockKey, Block<WeeklyData>> = {
  'weekly.week': weeklyWeek,
  'weekly.subjects': weeklySubjects,
  'weekly.incoming': weeklyIncoming,
  'weekly.sales': forSales,
  'weekly.content': weeklyContent,
  'weekly.coverage': weeklyCoverage,
}

/** The blocks an arrangement names, in ITS order, dropping any key this build
 *  no longer knows — the same degradation a report's section keys get, for the
 *  same reason: a renamed tile degrades an artefact rather than breaking it. */
export function weeklyBlocksFor(keys: readonly string[] = WEEKLY_BLOCK_KEYS): Block<WeeklyData>[] {
  return keys.flatMap((k) => {
    const block = WEEKLY_BLOCKS[k as WeeklyBlockKey]
    return block ? [block] : []
  })
}

export { weeklyWeek, weeklySubjects, weeklyIncoming, weeklyContent, weeklyCoverage, forSales }
