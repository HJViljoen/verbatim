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
//
// NONE OF THE SIX DECLARES A `question` (Block D wave 3).
//
// `BlockFrame` prints `Block.question` under the heading in EVERY mode, on a
// docblock claim that it is "the mock's own device — every artboard prints
// one". Counted, every PRINTED artboard prints zero: MarketingBrief 0,
// SalesBrief 0, ContentBrief 0, LeadershipBrief 0, WeeklyReport 0,
// MonthlyReport 0, QuarterlyReview 0 — against Ask 6, Competitive 7, ThisWeek
// 5, Voice 4. The device belongs to an app page's tiles, where a reader is
// choosing what to look at; this artefact arrives in an inbox already opened
// to one thing.
//
// SO IT IS DECLARED NOWHERE RATHER THAN SUPPRESSED PER MODE. The shared frame
// gains a print/email arm in its own group's package, which would still leave
// the question on the SHARE PAGE — `components/share/weekly-share-shell.tsx`
// renders these six in 'app' mode, and that page is this artefact on the web,
// not a dashboard. A weekly report prints no question in any of the three
// places it is read, which is one rule rather than a mode table.
//
// It cost a row of the artboard's density on every section: six extra lines of
// 12.5px narrator over the eyebrow, on the artefact mock-gap §7 calls "the
// single most repeated extra", against design-system.md §0 rule 8, "no
// explanatory micro-copy inside a tile". `Block.question` is optional and the
// field is simply absent; `Block.title` stays, because registries, deck slide
// headings and schedule rows name a section by it.

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
