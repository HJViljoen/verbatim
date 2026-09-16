import type { Block } from '@/lib/blocks/types'
import type { QuarterlyData } from '@/lib/pages/quarterly'
import { QUARTERLY_BLOCK_KEYS, type QuarterlyBlockKey } from '@/lib/reports/quarterly'
import { quarterlyCover } from './cover'
import { quarterlyRead } from './read'
import { quarterlySubjects } from './subjects'
import { quarterlyCategory } from './category'
import { quarterlyRivals } from './rivals'
import { quarterlyMoves } from './moves'
import { quarterlyMethod } from './method'
import { quarterlyUnsettled } from './unsettled'

// The quarterly review's eight pages, in the design's order (Phase 1 WP20).
//
// ARRANGED OVER BLOCK KEYS, and the keys are the arrangement — the shape WP17
// settled for the weekly report. `QUARTERLY_BLOCK_KEYS` is the stored order,
// this map is what each key renders, and the deck walks the first through the
// second, dropping any key this build no longer knows.

export const QUARTERLY_BLOCKS: Record<QuarterlyBlockKey, Block<QuarterlyData>> = {
  'quarterly.cover': quarterlyCover,
  'quarterly.read': quarterlyRead,
  'quarterly.subjects': quarterlySubjects,
  'quarterly.category': quarterlyCategory,
  'quarterly.rivals': quarterlyRivals,
  'quarterly.moves': quarterlyMoves,
  'quarterly.method': quarterlyMethod,
  'quarterly.unsettled': quarterlyUnsettled,
}

/** The blocks an arrangement names, in ITS order. A key this build no longer
 *  knows degrades the artefact rather than breaking it — the same rule a
 *  report's section keys and the weekly report's block keys follow. */
export function quarterlyBlocksFor(keys: readonly string[] = QUARTERLY_BLOCK_KEYS): Block<QuarterlyData>[] {
  return keys.flatMap((k) => {
    const block = QUARTERLY_BLOCKS[k as QuarterlyBlockKey]
    return block ? [block] : []
  })
}

export {
  quarterlyCover,
  quarterlyRead,
  quarterlySubjects,
  quarterlyCategory,
  quarterlyRivals,
  quarterlyMoves,
  quarterlyMethod,
  quarterlyUnsettled,
}
