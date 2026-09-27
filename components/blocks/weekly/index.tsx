import type { WeeklyData } from '@/lib/pages/weekly'
import { WEEKLY_BLOCK_KEYS, type WeeklyBlockKey } from '@/lib/reports/weekly'
import type { WeeklyBlock } from './section'
import { forSales } from './sales'
import { weeklyWeek } from './week'
import { weeklyCameIn } from './came-in'
import { weeklySubjects } from './subjects'
import { weeklyThemes } from './themes'
import { weeklyContent } from './content'
import { weeklyChange } from './change'

// "Your market this week": the weekly report's seven sections, by key
// (market-first WP3.7, plan §2.9; the approved preview's WeeklyReport).
//
// ARRANGED OVER BLOCK KEYS, and the keys are the arrangement:
// `WEEKLY_BLOCK_KEYS` is the stored order, this map is what each key renders,
// and the documents walk the first through the second. A key this build no
// longer knows (`WEEKLY_RETIRED_KEYS`) is dropped, as a report's is; a stored
// version 2 row prints the stale line before any block is asked for.
//
// NONE DECLARES A `question`: an artefact that arrives in an inbox already
// opened to one thing prints no narrator over its sections.

export const WEEKLY_BLOCKS: Record<WeeklyBlockKey, WeeklyBlock> = {
  'weekly.week': weeklyWeek,
  'weekly.came-in': weeklyCameIn,
  'weekly.subjects': weeklySubjects,
  'weekly.themes': weeklyThemes,
  'weekly.sales': forSales as unknown as WeeklyBlock,
  'weekly.content': weeklyContent,
  'weekly.change': weeklyChange,
}

/** The blocks an arrangement names, in ITS order, dropping any key this build
 *  no longer knows. */
export function weeklyBlocksFor(keys: readonly string[] = WEEKLY_BLOCK_KEYS): WeeklyBlock[] {
  return keys.flatMap((k) => {
    const block = WEEKLY_BLOCKS[k as WeeklyBlockKey]
    return block ? [block] : []
  })
}

/** Every block, in the preview's order. */
export const ALL_WEEKLY_BLOCKS: WeeklyBlock[] = weeklyBlocksFor(WEEKLY_BLOCK_KEYS)

export type { WeeklyData }
export { weeklyWeek, weeklyCameIn, weeklySubjects, weeklyThemes, weeklyContent, weeklyChange, forSales }
